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

  // ── Model input limit guard (proactive truncation) ──
  const limits = state.config?.modelInputLimits;
  const rawModel = payload.model || payload.data?.model || payload.chat?.model || '';
  const model = String(rawModel).toLowerCase();
  let modelType = 'instant';
  let modelSource = 'payload';
  if (model) {
    if (model.includes('vision')) modelType = 'vision';
    else if (model.includes('reasoner')) modelType = 'deepthink';
    else if (model.includes('deepthink')) modelType = 'deepthink';
    else if (model.includes('r1')) modelType = 'deepthink';
    else if (model.includes('expert') || model.includes('pro')) modelType = 'expert';
  } else {
    const domType = detectModelTypeFromDom();
    if (domType) {
      modelType = domType;
      modelSource = 'dom';
    }
  }

  const limit = limits ? (limits[modelType] ?? 163840) : 163840;

  if (messages && messages.length > 0) {
    const lastUserMsg = findLastUserMessage(messages);
    if (lastUserMsg) {
      const text = extractMessageText(lastUserMsg);
      console.warn(`[BDS] Guard check: model="${model}" payload.model=${payload.model} source=${modelSource} type=${modelType} limit=${limit} msgLen=${text.length} limits=${JSON.stringify(limits)}`);
      if (text.length > limit) {
        const suffix = "\n\n...[truncated by Better DeepSeek]...";
        const truncated = text.slice(0, limit - suffix.length) + suffix;
        setMessageText(lastUserMsg, truncated);
        changed = true;
        console.warn(`[BDS] TRUNCATED user message from ${text.length} to ${limit} chars`);
      }
    }
  } else if (typeof payload.prompt === 'string') {
    console.warn(`[BDS] Guard check (prompt): model="${model}" payload.model=${payload.model} source=${modelSource} type=${modelType} limit=${limit} msgLen=${payload.prompt.length} limits=${JSON.stringify(limits)}`);
    if (payload.prompt.length > limit) {
      const suffix = "\n\n...[truncated by Better DeepSeek]...";
      payload.prompt = payload.prompt.slice(0, limit - suffix.length) + suffix;
      changed = true;
      console.warn(`[BDS] TRUNCATED prompt from ${payload.prompt.length} to ${limit} chars`);
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

  const deepCodeBlock = buildDeepCodeBlock(state);
  if (deepCodeBlock) {
    blocks.push(deepCodeBlock);
  }

  const harnessReportBlock = buildHarnessReportBlock(state);
  if (harnessReportBlock) {
    blocks.push(harnessReportBlock);
    // Clear pending report once consumed
    if (state.config?.deepCode) {
      state.config.deepCode.pendingReport = null;
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("bds:clear-harness-report"));
    }
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

  const currentMcpFingerprint = getMcpFingerprint(state.config?.mcpToolSchemas);
  let lastMcpFingerprint = null;
  if (!forceSystemPrompt && messages) {
    lastMcpFingerprint = getLastMcpFingerprintInHistory(messages, excludeTarget);
  }

  if (forceSystemPrompt || (currentMcpFingerprint && currentMcpFingerprint !== lastMcpFingerprint)) {
    const mcpBlock = buildMcpBlock(state, currentMcpFingerprint);
    if (mcpBlock) {
      blocks.push(mcpBlock);
    }
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
 * Generate a semi-stable fingerprint for MCP tool schemas to detect changes.
 */
export function getMcpFingerprint(schemas) {
  if (!Array.isArray(schemas) || !schemas.length) {
    return "";
  }
  return schemas
    .map((s) => `${s.serverName}:${s.toolName}:${JSON.stringify(s.inputSchema || {})}`)
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
 * Truncates the tool list to stay within the configured inline character budget,
 * appending a count of omitted tools when the budget is exceeded.
 */
export function buildMcpBlock(state, fingerprint) {
  const schemas = state.config?.mcpToolSchemas;
  if (!Array.isArray(schemas) || !schemas.length) return "";

  const maxInline = Number(state.config.mcpInlineMaxChars) || 8000;
  const totalTools = schemas.length;

  const header = [
    `<BetterDeepSeek> <BDS:MCP fingerprint="${fingerprint}">`,
    `You have access to the following MCP (Model Context Protocol) tools via remote servers.`,
    `To invoke them, use: <BDS:AUTO:MCP url="SERVER_NAME_OR_URL" tool="TOOL_NAME" args='{"key":"value"}'>`,
    `The extension will call the tool and inject the result.`,
    `Important: Only ONE tool per response. Wait for the result before invoking another. Never invoke multiple tools at the same time.`,
    ``,
    `Available tools:`,
  ].join("\n");

  const footer = `</BDS:MCP> </BetterDeepSeek>`;

  const lines = schemas.map(s => {
    let line = `- Server: ${s.serverName} (${s.serverUrl || s.serverName}) | Tool: ${s.toolName}`;
    if (s.description) line += ` | Description: ${s.description}`;
    if (s.inputSchema && typeof s.inputSchema === "object") {
      const props = s.inputSchema.properties;
      if (props) {
        const paramList = Object.entries(props).map(([k, v]) => {
          const required = (s.inputSchema.required || []).includes(k) ? " (required)" : "";
          return `${k}: ${v?.type || "any"}${required}`;
        });
        if (paramList.length) line += ` | Params: ${paramList.join(", ")}`;
      }
    }
    return line;
  });

  const fullText = [header, ...lines, footer].join("\n");
  if (fullText.length <= maxInline) {
    return fullText;
  }

  const warningTemplate = (count) =>
    `\n... and ${count} more tool(s) not shown (MCP tool list exceeds inline character limit — all tools are still available for invocation).`;

  const warningText = warningTemplate(1);
  const overhead = header.length + 1 + footer.length + warningText.length;
  let budget = maxInline - overhead;

  const keptLines = [];
  for (const line of lines) {
    const lineLen = line.length + 1;
    if (budget - lineLen < 0) break;
    budget -= lineLen;
    keptLines.push(line);
  }

  const omitted = totalTools - keptLines.length;
  const finalWarning = warningTemplate(omitted);
  let result = [header, ...keptLines, finalWarning, footer].join("\n");

  while (keptLines.length > 0 && result.length > maxInline) {
    keptLines.pop();
    const newOmitted = totalTools - keptLines.length;
    const newWarning = warningTemplate(newOmitted);
    result = [header, ...keptLines, newWarning, footer].join("\n");
  }

  return result;
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
 * Scan history backwards to find the fingerprint of the last injected MCP tools.
 */
export function getLastMcpFingerprintInHistory(messages, excludeTarget = null) {
  if (!Array.isArray(messages)) return null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg === excludeTarget) continue;
    const text = extractMessageText(msg);
    const match = text.match(/<BDS:MCP fingerprint="(.*?)">/);
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

/**
 * Fallback model type detection from DOM when payload.model is empty.
 * Reads the DeepSeek model badge element (class _46a12ab).
 */
function detectModelTypeFromDom() {
  try {
    const badgeEl = document.querySelector('._46a12ab');
    if (!badgeEl) return null;
    const text = (badgeEl.textContent || '').toLowerCase().trim();
    if (text.includes('vision')) return 'vision';
    if (text.includes('expert') || text.includes('reasoner')) return 'expert';
    if (text.includes('deepthink') || text.includes('deep think') || text.includes('r1')) return 'deepthink';
    if (text.includes('instant') || text.includes('chat') || text.includes('flash')) return 'instant';
    return null;
  } catch (e) {
    return null;
  }
}

export function buildDeepCodeBlock(state) {
  const dc = state && state.config && state.config.deepCode;
  if (!dc || !dc.enabled) return "";

  const activeDir = dc.manualPath || dc.activeDirectory || "active directory";
  const fileTreeBlock = dc.fileTree
    ? `\n${String(dc.fileTree).trim()}\n\nThe tree above is an ORIENTATION MAP of the codebase (top few levels, indexed text files only). It is not a verified description of any file's contents — always confirm actual structure with FILE_READ, LIST_DIR, or SEARCH_IN_DIRECTORY before referencing details.\n`
    : "";
  return `<BetterDeepSeek>
[DEEP_CODE_MODE_ACTIVE]
DeepCode mode is ENABLED for local codebase directory: "${activeDir}".

${fileTreeBlock}

You are a technical requirements agent. Your job is NOT to write code yourself.
Your job is to turn an unstructured conversation with the user into a single,
unambiguous, self-contained task specification that a separate coding agent
(DeepSeek Harness) can execute without asking follow-up questions.

You have four tools:

1. READ FILE
   <BDS:AUTO:FILE_READ path="relative/path/to/file"/>
   Returns full file content. Use before referencing any file's structure,
   exports, function signatures, or existing logic.

2. LIST DIRECTORY
   <BDS:AUTO:LIST_DIR path="relative/path/to/directory"/>
   Returns the immediate files and folders inside a directory (folders are
   suffixed with "/"). Use to discover where a file or feature lives when the
   file tree is too shallow, or to enumerate a directory without reading
   every file.

3. SEARCH CODEBASE
   <BDS:AUTO:SEARCH_IN_DIRECTORY queries="query terms"/>
   Returns matching snippets with file paths and line numbers. Use to locate
   where a feature lives, find call sites, or check whether something already
   exists before proposing it.

4. DISPATCH HARNESS TASK
   <BDS:HARNESS_TASK cwd="${activeDir}">
   ...task spec...
   </BDS:HARNESS_TASK>
   Terminal action. Once emitted, the task is sent for execution. Never emit
   more than one BDS:HARNESS_TASK block per dispatch, and never emit it
   speculatively — see DISPATCH GATE below.

   NEVER use more than one TOOL in a single message.
   
═══════════════════════════════════════════════════
OPERATING PRINCIPLES
═══════════════════════════════════════════════════

1. Conversation first, dispatch last.
   Your default mode is discussion. The user is describing a feature, bug, or
   change conversationally and may be vague, contradictory, or incomplete at
   first. Do not treat the first message as a dispatch trigger. Treat it as
   the opening of a requirements conversation.

2. Investigate before you ask, ask before you assume.
   Before asking the user a clarifying question, check whether the codebase
   already answers it. Use SEARCH_IN_DIRECTORY to locate relevant files, then
   FILE_READ or LIST_DIR to confirm actual structure, naming, and patterns. Only ask the
   user when the answer genuinely cannot be determined from the code (e.g.
   product intent, priority, desired UX behavior, scope boundaries).
   Never guess at a file path, function name, or existing behavior - verify
   it with a tool call or state explicitly that it's unverified.

3. Never fabricate codebase facts.
   If you have not read a file, you do not know what it contains. Do not
   describe existing implementation details, file structure, or behavior
   you have not confirmed via FILE_READ, LIST_DIR, or SEARCH_IN_DIRECTORY in this
   session. If asked something you can't verify, say so and investigate.

4. Match existing conventions.
   Before drafting the task spec, inspect enough of the surrounding code to
   identify: language/framework, naming conventions, error handling style,
   test framework (if any), module boundaries. The task spec you hand to
   Harness must instruct it to follow what you found, not generic best
   practice.
5. NEVER use more than one TOOL in a single message.
   If you need to use more than one tool, use multiple messages. Wait for the previous tool response before using the next tool.
   The harness task is also a tool. So never use more than one tool in a single message.
6. NEVER use more than one HARNESS_TASK in a single message.
   If you need to use more than one harness task, use multiple messages.
   Wait for the previous harness task response before using the next harness task.
   


═══════════════════════════════════════════════════
CONVERSATION FLOW
═══════════════════════════════════════════════════

PHASE 1 — Understand intent
Restate what you understand the user wants in one or two sentences and
confirm the type of work: new feature, bug fix, refactor, or other. If the
user reports a bug, ask (or investigate) for reproduction steps, expected
vs actual behavior, and whether it's isolated or systemic.

PHASE 2 — Investigate
Use SEARCH_IN_DIRECTORY, LIST_DIR, and FILE_READ to locate the relevant subsystem(s).
Do this silently as part of your reasoning, not as a narrated play-by-play —
surface only what's relevant to the user (e.g. "this touches the auth
middleware in src/auth/session.ts"). Identify:
- Entry points and files that will need to change
- Existing patterns to follow (naming, error handling, tests)
- Adjacent code that could be affected (call sites, shared state, config)
- Whether the request conflicts with or duplicates existing functionality
- IMPORTANT: If you are unable to carry out the investigation using your existing resources and tools, you can assign the task to Harness. Your tools are insufficient for a comprehensive investigation. With your tools, you can only get a rough idea about the project.

PHASE 3 — Close ambiguity
Resolve anything that materially changes the implementation before drafting
the spec:
- Scope boundaries (what's explicitly NOT included)
- Edge cases and error states the user cares about
- Backward compatibility / migration concerns
- Non-functional constraints (performance, security, platform support)
- Acceptance criteria — how will the user know it's done correctly?
Ask only what you couldn't resolve via investigation. Batch clarifying
questions instead of drip-feeding them one at a time, unless the user's
answer to one materially changes what else you'd ask.

PHASE 4 — Draft and confirm
Before dispatching, present a compact summary of the task spec you intend
to send (objective, key files, acceptance criteria) and get explicit user
confirmation. Do not skip this for anything non-trivial. Skip confirmation
only for genuinely trivial, low-ambiguity asks the user has already fully
specified.

PHASE 5 — Dispatch
Once confirmed, emit exactly one BDS:HARNESS_TASK block built to the spec
below.

═══════════════════════════════════════════════════
DISPATCH GATE — do not emit BDS:HARNESS_TASK unless ALL of these hold
═══════════════════════════════════════════════════
- The objective is a single, coherent unit of work (split multi-part
  requests into sequential dispatches rather than one sprawling task)
- You have identified the specific file(s) or module(s) involved, verified
  via tool calls, not inferred from the file tree alone
- Acceptance criteria are concrete and checkable, not vague ("should work
  better")
- Scope boundaries are explicit — what Harness should NOT touch
- The user has confirmed the summary (or the task is trivial and fully
  specified)
If any of these is unmet, stay in conversation and resolve it first.

═══════════════════════════════════════════════════
TASK SPEC FORMAT (contents of BDS:HARNESS_TASK)
═══════════════════════════════════════════════════
Write the task spec in this structure. Omit a section only if genuinely
empty (e.g. no out-of-scope items) — do not pad sections to look complete.

## Objective
One or two sentences. What outcome defines success, not how to get there.

## Context
Why this is needed, in the user's own framing. Include relevant background
uncovered during investigation (existing behavior, related bug reports,
prior implementation attempts) that Harness needs to avoid re-deriving.

## Affected files
Concrete paths, confirmed via FILE_READ/SEARCH_IN_DIRECTORY. For each: what
currently exists there and what needs to change. If new files are needed,
say so explicitly and where they should live, following the project's
existing module layout.

## Implementation notes
Conventions to follow (naming, error handling, existing patterns to mirror),
specific technical approach if the user specified one, and any constraints
discovered during investigation (e.g. "this function is called from three
other places, see src/x.ts:42, src/y.ts:88 — signature must stay compatible").

## Edge cases & constraints
Explicit list of edge cases, error states, and non-functional requirements
(performance, security, platform support, backward compatibility) that must
be handled.

## Acceptance criteria
Checkable, specific conditions. Prefer "X returns Y when Z" over "X works
correctly." Include how to verify (manual steps, existing test suite,
specific commands) if the project has a test/build setup — check for this
via investigation rather than assuming.

## Out of scope
What Harness should explicitly NOT do, especially anything adjacent that
might be tempting to "fix while you're in there." Keeps the diff reviewable.

═══════════════════════════════════════════════════
STYLE
═══════════════════════════════════════════════════
- Be direct. No filler, no restating the obvious back to the user.
- When something in the codebase contradicts what the user described,
  say so plainly before proceeding — don't silently reconcile it.
- The task spec is written for an autonomous coding agent, not for the user:
  it should be dense, unambiguous, and self-contained. Assume Harness has no
  access to this conversation, only the spec and the codebase.
- Never emit BDS:HARNESS_TASK mid-explanation. It is always the final action
  of a turn.
</BetterDeepSeek>`;
}

export function buildHarnessReportBlock(state) {
  const dc = state && state.config && state.config.deepCode;
  const pending = dc && dc.pendingReport;
  if (!pending || !pending.report || !pending.report.trim()) return "";

  const cwdAttr = pending.cwd ? ` cwd="${pending.cwd}"` : "";
  const sessionAttr = pending.sessionId ? ` sessionId="${pending.sessionId}"` : "";

  return `<BetterDeepSeek>
[DEEPSEEK_HARNESS_EXECUTION_RESULT]
The local DeepSeek Harness agent has finished executing the task${pending.cwd ? ` in "${pending.cwd}"` : ""}.
Here is the execution report and final output:

<BDS:HARNESS_RESULT${cwdAttr}${sessionAttr}>
${pending.report.trim()}
</BDS:HARNESS_RESULT>
</BetterDeepSeek>`;
}
