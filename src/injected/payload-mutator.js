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
      const prefix = buildHiddenPrefix(cleanText, conversationId, state);
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
    const prefix = buildHiddenPrefix(cleanText, conversationId, state);
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
 * Build the hidden prefix that gets prepended to the user message.
 * Contains: system prompt (first message only), skills, and memory calls.
 */
export function buildHiddenPrefix(userPrompt, conversationId, state) {
  const blocks = [];

  if (
    !state.initializedConversations.has(conversationId) &&
    state.config.systemPrompt.trim()
  ) {
    blocks.push(
      `<BetterDeepSeek>\n${state.config.systemPrompt.trim()}\n</BetterDeepSeek>`
    );
    state.initializedConversations.add(conversationId);
  }

  const skillsBlock = buildSkillsBlock(state);
  if (skillsBlock) {
    blocks.push(skillsBlock);
  }

  const memoryBlock = buildMemoryCallsBlock(userPrompt, state);
  if (memoryBlock) {
    blocks.push(memoryBlock);
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

  return `<BDS:SKILLS>\n${skillsText}\n</BDS:SKILLS>`;
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
  return output.trim();
}
