/**
 * All payload mutation logic for intercepted API requests.
 *
 * This is the CORE of the injection system — it injects the system prompt,
 * skills, and memory context into DeepSeek's API payload.
 */

/**
 * @param {object} payload - The parsed JSON request body
 * @param {object} state - The injected script state
 * @returns {{ changed: boolean, payload: object }}
 */
export function mutatePayload(payload, state) {
  if (!state.sessionUserMsgCounts) state.sessionUserMsgCounts = {};

  const messages = resolveMessageArray(payload);
  const conversationId = resolveConversationId(payload);
  
  let userMsgCount = 1;
  if (messages && messages.length > 0) {
    userMsgCount = messages.filter(m => {
      const role = String(m.role || m.author || "").toLowerCase();
      return role === "user" || role === "human";
    }).length;
    state.sessionUserMsgCounts[conversationId] = userMsgCount;
  } else if (typeof payload.prompt === "string") {
    const isFirstMessageEdit = payload.message_id === 1 || payload.parent_message_id == null;
    if (isFirstMessageEdit) {
      userMsgCount = 1;
    } else {
      userMsgCount = (state.sessionUserMsgCounts[conversationId] || 0) + 1;
    }
    state.sessionUserMsgCounts[conversationId] = userMsgCount;
  }

  let changed = false;
  let target = null;

  if (messages && messages.length > 0) {
    target = findLastUserMessage(messages) || messages[messages.length - 1];
    const currentText = extractMessageText(target);

    if (currentText) {
      const cleanText = stripInjectedBlocks(currentText);

      // If we are about to check if we need to inject the system prompt,
      // we check if it already exists in the history (excluding the target if we just cleaned it).
      const historyHasPrompt = hasSystemPromptInHistory(messages, target);
      let forceSystemPrompt = false;
      
      const freq = state.config.systemPromptInjectionFrequency || "first";

      if (freq === "always") {
        forceSystemPrompt = true;
      } else if (freq === "every_x") {
        const interval = state.config.systemPromptInjectionInterval || 3;
        
        if ((userMsgCount - 1) % interval === 0) {
          forceSystemPrompt = true;
        } else if (!historyHasPrompt) {
          // Fallback if somehow there is no prompt in history at all
          forceSystemPrompt = true;
        }
      } else {
        // "first" - DO NOT inject system prompt or skills mid-conversation in existing chats!
        forceSystemPrompt = !historyHasPrompt;
        if (messages.length > 1) {
          forceSystemPrompt = false;
        } else if (state.hasInjected && state.hasInjected(conversationId)) {
          // Fallback for length == 1 (e.g., F5 then sending first message)
          forceSystemPrompt = false;
        }
      }

      const prefix = buildHiddenPrefix(
        cleanText,
        conversationId,
        state,
        forceSystemPrompt,
        messages,
        target
      );

      if (prefix) {
        setMessageText(target, `${prefix}\n\n${cleanText}`);
        changed = true;
      } else if (cleanText !== currentText) {
        setMessageText(target, cleanText);
        changed = true;
      }
    }
  } else if (typeof payload.prompt === "string") {
    const cleanText = stripInjectedBlocks(payload.prompt);
    
    // For single prompt requests (like edits or standalone calls):
    const isFirstMessageEdit = payload.message_id === 1 || payload.parent_message_id == null;
    const freq = state.config.systemPromptInjectionFrequency || "first";
    
    let forceSystemPrompt = false;
    if (freq === "always") {
      forceSystemPrompt = true;
    } else if (freq === "every_x") {
      const interval = state.config.systemPromptInjectionInterval || 3;
      if (isFirstMessageEdit) {
        forceSystemPrompt = true;
      } else if ((userMsgCount - 1) % interval === 0) {
        forceSystemPrompt = true;
      }
    } else {
      forceSystemPrompt = isFirstMessageEdit;
    }
    
    const prefix = buildHiddenPrefix(cleanText, conversationId, state, forceSystemPrompt, null, null);
    if (prefix) {
      payload.prompt = `${prefix}\n\n${cleanText}`;
      changed = true;
    } else if (cleanText !== payload.prompt) {
      payload.prompt = cleanText;
      changed = true;
    }
  }

  return { changed, payload };
}

/**
 * Resolve the messages array from various payload structures.
 */
export function resolveMessageArray(payload) {
  if (Array.isArray(payload.messages)) {
    return payload.messages;
  }

  if (payload.data && Array.isArray(payload.data.messages)) {
    return payload.data.messages;
  }

  if (payload.chat && Array.isArray(payload.chat.messages)) {
    return payload.chat.messages;
  }

  return null;
}

/**
 * Extract conversation ID from various payload fields.
 */
export function resolveConversationId(payload) {
  return String(
    payload.conversation_id ||
      payload.conversationId ||
      payload.chat_session_id ||
      payload.chat_id ||
      payload.id ||
      "default"
  );
}

/**
 * Find the last message with role "user" or "human".
 */
export function findLastUserMessage(messages) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const item = messages[index];
    if (!item || typeof item !== "object") {
      continue;
    }

    const role = String(item.role || item.author || "").toLowerCase();
    if (role === "user" || role === "human") {
      return item;
    }
  }

  return null;
}

/**
 * Extract text content from a message object.
 */
export function extractMessageText(message) {
  if (!message) {
    return "";
  }

  if (typeof message.content === "string") {
    return message.content;
  }

  if (Array.isArray(message.content)) {
    return message.content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }
        if (part && typeof part.text === "string") {
          return part.text;
        }
        return "";
      })
      .join("\n");
  }

  if (typeof message.prompt === "string") {
    return message.prompt;
  }

  return "";
}

/**
 * Set text content on a message object.
 */
export function setMessageText(message, text) {
  if (!message) {
    return;
  }

  if (typeof message.content === "string" || message.content == null) {
    message.content = text;
    return;
  }

  if (Array.isArray(message.content)) {
    message.content = [{ type: "text", text }];
    return;
  }

  if (typeof message.prompt === "string") {
    message.prompt = text;
    return;
  }

  message.content = text;
}

/**
 * Check if the BetterDeepSeek system prompt tag exists in any message in the history.
 */
export function hasSystemPromptInHistory(messages, excludeTarget = null) {
  if (!Array.isArray(messages)) return false;

  for (const msg of messages) {
    if (msg === excludeTarget) continue;
    const text = extractMessageText(msg);
    if (text.includes("<BetterDeepSeek>")) {
      return true;
    }
  }
  return false;
}

/**
 * Build the hidden prefix that gets prepended to the user message.
 * Contains: system prompt (if missing or session start), skills, and memory calls.
 */
export function buildHiddenPrefix(
  userPrompt,
  conversationId,
  state,
  forceSystemPrompt = false,
  messages = null,
  excludeTarget = null
) {
  const blocks = [];

  const shouldInjectSystemPrompt =
    forceSystemPrompt && 
    state.config.systemPrompt.trim() && 
    !state.config.disableSystemPrompt;

  if (shouldInjectSystemPrompt) {
    blocks.push(
      `<BetterDeepSeek>\n${state.config.systemPrompt.trim()}\n</BetterDeepSeek>`
    );
    if (state.markInjected) {
      state.markInjected(conversationId);
    }
  }

  // Only inject static skills on the first turn to prevent context bloat on every message
  if (forceSystemPrompt) {
    const skillsBlock = buildSkillsBlock(state);
    if (skillsBlock) {
      blocks.push(skillsBlock);
    }
  }

  const memoryBlock = buildMemoryCallsBlock(userPrompt, state);
  if (memoryBlock) {
    blocks.push(memoryBlock);
  }

  const activeChar = state.config.activeCharacter;
  if (activeChar) {
    let lastCharName = messages ? getLastCharacterInHistory(messages, excludeTarget) : null;
    
    // Fail-safe lookup from persistent state if not found in history
    if (!lastCharName && state.getLastChar) {
      lastCharName = state.getLastChar(conversationId);
    }

    // In-memory cache fallback for the transition from "default" to the real unique ID
    if (!lastCharName && state.currentSessionChar && messages?.length > 1) {
      lastCharName = state.currentSessionChar;
    }
    
    // Only inject if it's an injection turn (forceSystemPrompt), the first persona, OR the character has changed
    if (forceSystemPrompt || !lastCharName || lastCharName !== activeChar.name) {
      const characterBlock = buildCharacterBlock(state);
      if (characterBlock) {
        blocks.push(characterBlock);
        if (state.setLastChar) {
          state.setLastChar(conversationId, activeChar.name);
        }
        state.currentSessionChar = activeChar.name;
      }
    }
  }
  
  if (state.isNextVoiceMessage) {
    blocks.push(`<BetterDeepSeek>User send this message using voice recorder tool.</BetterDeepSeek>`);
    state.isNextVoiceMessage = false;
  }

  if (forceSystemPrompt) {
    const projectBlock = buildProjectBlock(state);
    if (projectBlock) {
      blocks.push(projectBlock);
    }

    const userDataBlock = buildUserDataBlock(state);
    if (userDataBlock) {
      blocks.push(userDataBlock);
    }
  }

  return blocks.join("\n\n");
}

/**
 * Build the <BDS:SKILLS> block from active skills.
 */
export function buildSkillsBlock(state) {
  if (!state.config.skills.length) {
    return "";
  }

  const skillsText = state.config.skills
    .map((skill) => `## ${skill.name}\n${skill.content.trim()}`)
    .join("\n\n");

  return `<BetterDeepSeek> <BDS:SKILLS>\n${skillsText}\n</BDS:SKILLS> </BetterDeepSeek>`;
}

/**
 * Build the <BDS:memory_calls> block based on importance and keyword matching.
 */
export function buildMemoryCallsBlock(userPrompt, state) {
  if (!state.config.memories.length) {
    return "";
  }

  const lowerPrompt = String(userPrompt || "").toLowerCase();
  const selected = [];

  for (const item of state.config.memories) {
    if (item.importance === "always") {
      selected.push(item);
      continue;
    }

    if (item.key && lowerPrompt.includes(item.key.toLowerCase())) {
      selected.push(item);
    }
  }

  if (!selected.length) {
    return "";
  }

  const text = selected
    .map((item) => `${item.key}: ${item.value}`)
    .join(". ");
  return `<BetterDeepSeek> <BDS:memory_calls>${text}</BDS:memory_calls> </BetterDeepSeek>`;
}

/**
 * Build the project context block from the active project config.
 */
export function buildProjectBlock(state) {
  const project = state.config && state.config.activeProject;
  if (!project) return "";

  let inner = "";
  if (project.instructions && project.instructions.trim()) {
    inner += project.instructions.trim() + "\n";
  }

  return `<BetterDeepSeek>\n<BDS:PROJECT name="${project.name}">\n${inner}</BDS:PROJECT>\n</BetterDeepSeek>`;
}

/**
 * Build the <BDS:RP> block from the active character.
 */
export function buildCharacterBlock(state) {
  const char = state.config.activeCharacter;
  if (!char || !char.content) {
    return "";
  }

  let text = `Character Name: ${char.name}\n`;
  if (char.usage) {
    text += `Usage Domain: ${char.usage}\n`;
  }
  text += `---\n${char.content.trim()}`;

  return `<BetterDeepSeek> <BDS:RP>\n${text}\n</BDS:RP> </BetterDeepSeek>`;
}

/**
 * Build the user-specific data block (time, language preference, etc).
 */
export function buildUserDataBlock(state) {
  const blocks = [];
  
  const now = new Date();
  blocks.push(`User's System Date & Time: ${now.toLocaleString()}`);

  const lang = state.config.preferredLang;
  if (lang && lang.trim()) {
    blocks.push(`Always respond in ${lang.trim()}.`);
  }

  return `<BetterDeepSeek>\n${blocks.join("\n")}\n</BetterDeepSeek>`;
}

/**
 * Scan history backwards to find the name of the last injected character.
 */
export function getLastCharacterInHistory(messages, excludeTarget = null) {
  if (!Array.isArray(messages)) return null;

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg === excludeTarget) continue;

    const text = extractMessageText(msg);
    if (!text.includes("<BDS:RP>")) continue;

    const match = text.match(/Character Name:\s*(.*?)\n/);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  return null;
}

/**
 * Strip previously injected BDS blocks from text to avoid duplication.
 */
export function stripInjectedBlocks(text) {
  let output = String(text || "");
  
  // Strip <BetterDeepSeek> blocks UNLESS they contain [BDS:AUTO] markers or memory calls
  output = output.replace(
    /<BetterDeepSeek>([\s\S]*?)<\/BetterDeepSeek>/gi,
    (match, content) => {
      if (content.includes("[BDS:AUTO]") || content.includes("<BDS:memory_calls>")) {
        return match;
      }
      return "";
    }
  );

  output = output.replace(/<BDS:SKILLS>[\s\S]*?<\/BDS:SKILLS>/gi, "");
  output = output.replace(
    /<BDS:memory_calls>[\s\S]*?<\/BDS:memory_calls>/gi,
    ""
  );
  output = output.replace(/<BDS:RP>[\s\S]*?<\/BDS:RP>/gi, "");
  output = output.replace(/<BDS:PROJECT[^>]*>[\s\S]*?<\/BDS:PROJECT>/gi, "");
  return output.trim();
}
