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
  const messages = resolveMessageArray(payload);
  const conversationId = resolveConversationId(payload);

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
      let forceSystemPrompt = !historyHasPrompt;

      // DO NOT inject system prompt or skills mid-conversation in existing chats!
      // If messages.length > 1, the server already has the primary context.
      if (messages.length > 1) {
        forceSystemPrompt = false;
      } else if (state.hasInjected && state.hasInjected(conversationId)) {
        // Fallback for length == 1 (e.g., F5 then sending first message)
        forceSystemPrompt = false;
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
    // If it's an edit of the first message, we force injection.
    // If it's a subsequent message, the server already has the context.
    const isFirstMessageEdit = payload.message_id === 1 || payload.parent_message_id == null;
    const forceSystemPrompt = isFirstMessageEdit;
    
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
    forceSystemPrompt && state.config.systemPrompt.trim();

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
    
    // Only inject if it's the first persona in this context OR the character has changed
    if (!lastCharName || lastCharName !== activeChar.name) {
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
  return `<BDS:memory_calls>${text}</BDS:memory_calls>`;
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
  output = output.replace(
    /<BetterDeepSeek>[\s\S]*?<\/BetterDeepSeek>/gi,
    ""
  );
  output = output.replace(/<BDS:SKILLS>[\s\S]*?<\/BDS:SKILLS>/gi, "");
  output = output.replace(
    /<BDS:memory_calls>[\s\S]*?<\/BDS:memory_calls>/gi,
    ""
  );
  output = output.replace(/<BDS:RP>[\s\S]*?<\/BDS:RP>/gi, "");
  return output.trim();
}
