/**
 * All payload mutation logic for intercepted API requests.
 *
 * This is the CORE of the injection system — it injects the system prompt,
 * skills, memory context, and office document library references into DeepSeek's API payload.
 */

import { buildOfficeSkillsBlock } from "../lib/office-skills/index.js";
import { searchActiveProjectRAG, formatRagInjections } from "../lib/rag-engine.js";

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

      window.dispatchEvent(new CustomEvent("bds:mutation-applied", {
        detail: JSON.stringify({ conversationId, injectedText: prefix || "", userPrompt: cleanText })
      }));

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
    window.dispatchEvent(new CustomEvent("bds:mutation-applied", {
      detail: JSON.stringify({ conversationId, injectedText: prefix || "", userPrompt: cleanText })
    }));

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

  const deepResearchBlock = buildDeepResearchPlanningBlock(
    userPrompt,
    conversationId,
    state
  );
  if (deepResearchBlock) {
    blocks.push(deepResearchBlock);
  }

  const entries = state.config.systemPromptEntries || [];
  if (entries.length > 0) {
    const userMsgCount = state.sessionUserMsgCounts[conversationId] || 1;
    for (const entry of entries) {
      if (!entry.content.trim()) continue;
      if (evaluateEntrySchedule(entry, userMsgCount, conversationId, state)) {
        blocks.push(`<BetterDeepSeek>\n${entry.content.trim()}\n</BetterDeepSeek>`);
        if (state.markEntryInjected) {
          state.markEntryInjected(conversationId, entry.id);
        }
      }
    }
  } else {
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
  }

  // Inject skills if it's the first turn OR if skills have changed
  const currentSkillsFingerprint = getSkillsFingerprint(state.config.skills);
  let lastSkillsFingerprint = null;
  if (!forceSystemPrompt && messages) {
    lastSkillsFingerprint = getLastSkillsFingerprintInHistory(messages, excludeTarget);
  }

  if (forceSystemPrompt || (currentSkillsFingerprint && currentSkillsFingerprint !== lastSkillsFingerprint)) {
    const skillsBlock = buildSkillsBlock(state);
    if (skillsBlock) {
      blocks.push(skillsBlock);
    }
  }

  const memoryBlock = buildMemoryCallsBlock(userPrompt, state, messages);
  if (memoryBlock) {
    blocks.push(memoryBlock);
  }

  const officeBlock = buildOfficeSkillsBlock(userPrompt);
  if (officeBlock) {
    blocks.push(officeBlock);
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

  // Inject project context if first turn OR if project changed
  const project = state.config && state.config.activeProject;
  if (project) {
    let lastProjectName = null;
    if (!forceSystemPrompt && messages) {
      lastProjectName = getLastProjectNameInHistory(messages, excludeTarget);
    }

    if (forceSystemPrompt || !lastProjectName || lastProjectName !== project.name) {
      const projectBlock = buildProjectBlock(state);
      if (projectBlock) {
        blocks.push(projectBlock);
      }
    }

    // Inject RAG context dynamically based on user prompt if RAG is enabled
    if (state.config.projectRagEnabled && Array.isArray(project.files) && project.files.length > 0) {
      const limit = Number(state.config.projectRagLimit) || 5;
      const matchedChunks = searchActiveProjectRAG(userPrompt, project.files, limit);
      if (matchedChunks && matchedChunks.length > 0) {
        const ragBlock = formatRagInjections(matchedChunks, project.name);
        if (ragBlock) {
          blocks.push(ragBlock);
        }
      }
    }
  }

  if (forceSystemPrompt) {
    const userDataBlock = buildUserDataBlock(state);
    if (userDataBlock) {
      blocks.push(userDataBlock);
    }
  }

  const mcpBlock = buildMcpBlock(state);
  if (mcpBlock) {
    blocks.push(mcpBlock);
  }

  return blocks.join("\n\n");
}

function buildDeepResearchPlanningBlock(userPrompt, conversationId, state) {
  const config = state.config?.deepResearch;
  if (!config?.enabled || !config.runId) {
    return "";
  }

  config.enabled = false;
  emitDeepResearchStarted(config.runId, conversationId, userPrompt);

  return [
    `<BetterDeepSeek>`,
    `[BDS:DEEP_RESEARCH] The DeepResearch toggle is enabled. Treat this exactly as the user asking: "Perform Deep Research on the following request."`,
    `Run ID: ${config.runId}`,
    ``,
    `CRITICAL: In this first turn, you must ONLY produce a research plan. Do NOT browse or search. Do NOT produce an ordinary answer. Do NOT produce a direct report.`,
    `Output ONLY a plan using: <BDS:DEEP_RESEARCH_PLAN runId="${config.runId}">JSON</BDS:DEEP_RESEARCH_PLAN>`,
    `After this turn, BDS will execute steps one-by-one. After each step result is provided, analyze it before continuing. Do NOT skip ahead to the final report until BDS tells you all steps are complete.`,
    ``,
    `The JSON plan must include:`,
    `- "title": A short descriptive title for the research`,
    `- "steps": An array of research steps, each with:`,
    `  - "id": step number`,
    `  - "action": "search" or "fetch"`,
    `  - "query": a specific search query or URL to fetch`,
    `  - "purpose": why this step is needed`,
    `  - "sourceType": for search steps, one of "general", "docs", "news", "reviews", "academic", or "commerce"`,
    ``,
    `Search steps must use narrow queries with named entities, constraints, dates or locations, product or version names, and clear source intent.`,
    ``,
    `User research question: ${userPrompt}`,
    `</BetterDeepSeek>`,
  ].join("\n");
}

function emitDeepResearchStarted(runId, conversationId, userPrompt) {
  if (typeof window === "undefined" || !window.dispatchEvent) {
    return;
  }
  window.dispatchEvent(new CustomEvent("bds:deep-research-started", {
    detail: JSON.stringify({
      runId,
      conversationId,
      userPrompt,
      timestamp: Date.now(),
    }),
  }));
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

  return `<BetterDeepSeek> <BDS:SKILLS fingerprint="${getSkillsFingerprint(state.config.skills)}">\n${skillsText}\n</BDS:SKILLS> </BetterDeepSeek>`;
}

/**
 * Generate a semi-stable fingerprint for a set of skills to detect changes.
 */
export function getSkillsFingerprint(skills) {
  if (!Array.isArray(skills) || !skills.length) {
    return "";
  }
  // Use name + content length as a simple heuristic for "same skill version"
  return skills
    .map((s) => `${s.name}:${(s.content || "").length}`)
    .sort()
    .join("|");
}

/**
 * Build the <BDS:memory_calls> block based on importance and keyword matching.
 */
export function findLastAssistantMessage(messages) {
  if (!Array.isArray(messages)) return null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const item = messages[i];
    if (!item || typeof item !== "object") continue;
    const role = String(item.role || item.author || "").toLowerCase();
    if (role === "user" || role === "human") continue;
    if (role === "assistant" || role === "ai" || role === "bot") {
      return item;
    }
  }
  return null;
}

export function tokenize(str) {
  if (!str || typeof str !== "string") return [];
  return str
    .split(/[_-]|\s+|(?<=[a-z])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/)
    .map(t => t.toLowerCase().replace(/[^a-z0-9]/g, ""))
    .filter(t => t.length > 0);
}

export function computeTokenOverlap(uniqueKeyTokens, messageTokens) {
  if (!uniqueKeyTokens.length || !messageTokens.length) return 0;
  const uniqueMsgTokens = new Set(messageTokens);
  let matchCount = 0;
  for (const token of uniqueKeyTokens) {
    if (uniqueMsgTokens.has(token)) matchCount++;
  }
  return matchCount / uniqueKeyTokens.length;
}

function isCalledByOverlap(overlap, keyTokenCount) {
  if (keyTokenCount === 1) return overlap >= 1;
  return overlap >= 0.5;
}

export function buildMemoryCallsBlock(userPrompt, state, messages) {
  if (state.config.disableMemory || !state.config.memories.length) {
    return "";
  }

  const lastAiMsg = messages ? findLastAssistantMessage(messages) : null;
  const lastAiText = lastAiMsg ? extractMessageText(lastAiMsg) : "";
  const matchTarget = [userPrompt, lastAiText].filter(Boolean).join(" ");
  const matchTokens = tokenize(matchTarget);

  const selected = [];

  for (const item of state.config.memories) {
    if (item.importance === "always") {
      selected.push(item);
      continue;
    }

    if (!item.key) continue;

    const keyTokens = tokenize(item.key);
    if (!keyTokens.length) {
      if (matchTarget.toLowerCase().includes(item.key.toLowerCase())) {
        selected.push(item);
      }
      continue;
    }

    const uniqueKeyTokens = [...new Set(keyTokens)];
    const overlap = computeTokenOverlap(uniqueKeyTokens, matchTokens);
    if (isCalledByOverlap(overlap, uniqueKeyTokens.length)) {
      selected.push(item);
    } else if (matchTarget.toLowerCase().includes(item.key.toLowerCase())) {
      selected.push(item);
    }
  }

  if (!selected.length) {
    return "";
  }

  const blocks = selected
    .map((item) => `<BDS:memory_calls importance="${item.importance}">${item.key}: ${sanitizeMemoryValue(item.value)}</BDS:memory_calls>`)
    .join("\n");
  return `<BetterDeepSeek>\n${blocks}\n</BetterDeepSeek>`;
}

function sanitizeMemoryValue(value) {
  return String(value).replace(/<\//g, '<\\/').trim();
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

  if (state.config.injectSystemDateTime !== false) {
    const now = new Date();
    blocks.push(`User's System Date & Time: ${now.toLocaleString()}`);
  }

  const lang = state.config.preferredLang;
  if (lang && lang.trim()) {
    blocks.push(`Always respond in ${lang.trim()}.`);
  }

  if (blocks.length === 0) return "";
  return `<BetterDeepSeek>\n${blocks.join("\n")}\n</BetterDeepSeek>`;
}

/**
 * Build the MCP tool schemas block so the AI knows what external tools are available.
 */
export function buildMcpBlock(state) {
  const schemas = state.config?.mcpToolSchemas;
  if (!Array.isArray(schemas) || !schemas.length) return "";
  const lines = schemas.map(s =>
    `- Server: ${s.serverName} (${s.serverUrl || s.serverName}) | Tool: ${s.toolName}${s.description ? ` | Description: ${s.description}` : ""}`
  );
  return [
    `<BetterDeepSeek>`,
    `You have access to the following MCP (Model Context Protocol) tools via remote servers.`,
    `To invoke them, use: <BDS:AUTO:MCP url="SERVER_NAME_OR_URL" tool="TOOL_NAME" args='{"key":"value"}'>`,
    `The extension will call the tool and inject the result.`,
    ``,
    `Available tools:`,
    ...lines,
    `</BetterDeepSeek>`,
  ].join("\n");
}

/**
 * Evaluate whether a specific system prompt entry should be injected
 * based on its schedule and injection history.
 */
export function evaluateEntrySchedule(entry, userMsgCount, conversationId, state) {
  const injectedIds = state.getInjectedEntries ? state.getInjectedEntries(conversationId) : [];
  const alreadyInjected = injectedIds.includes(entry.id);

  switch (entry.schedule.type) {
    case "first":
      return !alreadyInjected;
    case "always":
      return true;
    case "interval": {
      const interval = entry.schedule.everyNTurns || 3;
      if (!alreadyInjected) return true;
      return (userMsgCount - 1) % interval === 0;
    }
    default:
      return false;
  }
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
 * Scan history backwards to find the fingerprint of the last injected skills.
 */
export function getLastSkillsFingerprintInHistory(messages, excludeTarget = null) {
  if (!Array.isArray(messages)) return null;

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg === excludeTarget) continue;

    const text = extractMessageText(msg);
    const match = text.match(/<BDS:SKILLS fingerprint="(.*?)">/);
    if (match && match[1]) {
      return match[1];
    }
  }
  return null;
}

/**
 * Scan history backwards to find the name of the last injected project.
 */
export function getLastProjectNameInHistory(messages, excludeTarget = null) {
  if (!Array.isArray(messages)) return null;

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg === excludeTarget) continue;

    const text = extractMessageText(msg);
    const match = text.match(/<BDS:PROJECT name="(.*?)">/);
    if (match && match[1]) {
      return match[1];
    }
  }
  return null;
}

/**
 * Strip previously injected BDS blocks from text to avoid duplication.
 */
export function stripInjectedBlocks(text) {
  let output = String(text || "");
  
  // Strip hidden prompt/context blocks unless they are explicit tool-control messages
  // that the model must see as the user's next instruction.
  output = output.replace(
    /<BetterDeepSeek>([\s\S]*?)<\/BetterDeepSeek>/gi,
    (match, content) => {
      if (
        content.includes("[BDS:AUTO]") ||
        content.includes("[BDS:DEEP_RESEARCH]") ||
        /<BDS:memory_calls[\s>]/i.test(content)
      ) {
        return match;
      }
      return "";
    }
  );

  output = output.replace(/<BDS:SKILLS>[\s\S]*?<\/BDS:SKILLS>/gi, "");
  output = output.replace(
    /<BDS:memory_calls[^>]*>[\s\S]*?<\/BDS:memory_calls>/gi,
    ""
  );
  output = output.replace(/<BDS:RP>[\s\S]*?<\/BDS:RP>/gi, "");
  output = output.replace(/<BDS:PROJECT[^>]*>[\s\S]*?<\/BDS:PROJECT>/gi, "");
  output = output.replace(/<BDS:PROJECT_CONTEXT>[\s\S]*?<\/BDS:PROJECT_CONTEXT>/gi, "");
  return output.trim();
}
