/**
 * Bridge between content script (ISOLATED world) and injected script (MAIN world).
 */

import state from "./state.js";
import { BRIDGE_EVENTS, DEFAULT_SYSTEM_PROMPT } from "../lib/constants.js";
import { findLatestAssistantMessageNode, collectMessageNodes, scheduleScan } from "./scanner.js";
import { finalizeLongWork } from "./files/long-work.js";
import { getActiveProject, getActiveFiles, getFilesForProject } from "./project-manager.js";
import { getDirectoryFiles } from "../lib/local-directory-source.js";
import { discoverTags } from "./tags/tag-manager.js";
import { recordOutgoingContext, recordServerUsage } from "./context-budget.js";
import { retainOnlyHistorySession } from "./load-all-history.js";

/**
 * Extract the current conversation ID from the URL for budget tracking.
 * Mirrors deep-research.js getCurrentConversationId() to avoid circular imports.
 */
function getCurrentConversationIdForBudget() {
  const match = String(location.href || "").match(/\/chat\/s\/([^/?#]+)/);
  return match ? match[1] : null;
}

let _bridgeCleanup = null;
let _bridgeGen = 0;

/**
 * Set up listeners for bridge events from the injected script.
 * Idempotent — subsequent calls return the same cleanup handle.
 * Returns a cleanup function that removes all registered listeners
 * and permits a later fresh setup via another `setupBridgeEvents()` call.
 * A stale cleanup from a prior generation does not clear the current one.
 *
 * @returns {() => void}
 */
export function setupBridgeEvents() {
  if (_bridgeCleanup) return _bridgeCleanup;

  const handlers = {};

  handlers[BRIDGE_EVENTS.requestConfig] = () => {
    pushConfigToPage();
  };
  window.addEventListener(BRIDGE_EVENTS.requestConfig, handlers[BRIDGE_EVENTS.requestConfig]);

  handlers[BRIDGE_EVENTS.networkState] = (event) => {
    let detail = event && event.detail ? event.detail : {};
    if (typeof detail === "string") {
      try { detail = JSON.parse(detail); } catch (e) {
        console.error("[BDS] Failed to parse networkState detail:", e);
      }
    }
    handleNetworkState(detail);
  };
  window.addEventListener(BRIDGE_EVENTS.networkState, handlers[BRIDGE_EVENTS.networkState]);

  handlers["bds:session-data"] = (event) => {
    let data = event.detail;
    if (typeof data === "string") {
      try { data = JSON.parse(data); } catch (e) { return; }
    }
    handleSessionData(data);
  };
  window.addEventListener("bds:session-data", handlers["bds:session-data"]);

  handlers["bds:history-msgs"] = (event) => {
    let data = event.detail;
    if (typeof data === "string") {
      try { data = JSON.parse(data); } catch (e) { return; }
    }
    handleHistoryMessages(data);
  };
  window.addEventListener("bds:history-msgs", handlers["bds:history-msgs"]);

  handlers["bds:token-usage"] = (event) => {
    let data = event.detail;
    if (typeof data === "string") {
      try { data = JSON.parse(data); } catch (e) { return; }
    }
    if (data && data.modelName) {
      state.pricing.modelName = data.modelName;
    }
    if (data && state.settings.deepResearchContextGuardEnabled) {
      const conversationId = getCurrentConversationIdForBudget();
      if (conversationId) {
        recordServerUsage({
          conversationId,
          inputTokens: Number(data.inputTokens) || 0,
          outputTokens: Number(data.outputTokens) || 0,
          modelName: data.modelName || null,
        });
      }
    }
  };
  window.addEventListener("bds:token-usage", handlers["bds:token-usage"]);

  handlers["bds:mutation-applied"] = (event) => {
    let data = event.detail;
    if (typeof data === "string") {
      try { data = JSON.parse(data); } catch (e) { return; }
    }
    if (data && data.conversationId && data.userPrompt !== undefined) {
      state.pricing.pendingInjections.set(data.conversationId, {
        injectedText: data.injectedText || "",
        userPrompt: data.userPrompt
      });
      if (state.settings.deepResearchContextGuardEnabled && data.injectedText) {
        recordOutgoingContext({
          conversationId: data.conversationId,
          text: [data.injectedText, data.userPrompt || ""].filter(Boolean).join("\n\n"),
          label: "Hidden prompt injection",
        });
      }
    }
  };
  window.addEventListener("bds:mutation-applied", handlers["bds:mutation-applied"]);

  handlers["bds:network-error"] = (event) => {
    let detail = event.detail;
    if (typeof detail === "string") {
      try { detail = JSON.parse(detail); } catch (e) { return; }
    }
    console.warn("[BDS] Network error detected:", detail);
    import("./status-monitor.js").then(m => m.fetchServerStatus());
  };
  window.addEventListener("bds:network-error", handlers["bds:network-error"]);

  _bridgeGen += 1;
  const gen = _bridgeGen;

  _bridgeCleanup = () => {
    // Only clear if this is still the current generation.
    // A stale cleanup from a prior install must not null the current one.
    if (_bridgeGen !== gen) return;
    for (const [event, handler] of Object.entries(handlers)) {
      window.removeEventListener(event, handler);
    }
    _bridgeCleanup = null;
  };

  return _bridgeCleanup;
}

/**
 * Update global state with session data from API.
 */
const MAX_CHAT_SESSIONS_FLOOR = 10;
let MAX_CHAT_SESSIONS = 500;

/**
 * Update the session-list cap. Called by the storage layer on initial load
 * and when the user saves a new value via the Settings panel.
 */
export function setMaxChatSessions(value) {
  const raw = Number(value);
  if (!Number.isFinite(raw) || raw <= 0) return;
  MAX_CHAT_SESSIONS = Math.max(MAX_CHAT_SESSIONS_FLOOR, Math.floor(raw));
}

function handleSessionData(data) {
  const sessions = data?.data?.biz_data?.chat_sessions;
  if (!Array.isArray(sessions)) return;

  const currentIds = new Set(state.chatSessions.map(s => s.id));
  for (const session of sessions) {
    if (session.id && session.title) {
      discoverTags(session.id, session.title);
    }
    if (!currentIds.has(session.id)) {
      state.chatSessions.push({
        id: session.id,
        title: session.title,
        updatedAt: session.updated_at
      });
    }
  }
  // Simple FIFO eviction to prevent unbounded growth - keep most recent MAX_CHAT_SESSIONS sessions
  if (state.chatSessions.length > MAX_CHAT_SESSIONS) {
    state.chatSessions.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    state.chatSessions.length = MAX_CHAT_SESSIONS;
  }

  // Trigger UI update if needed
  window.dispatchEvent(new CustomEvent("bds:sessions-updated"));
}

/**
 * Handle history messages data from the API.
 * Stores messages in state keyed by session ID and notifies waiters.
 */
function handleHistoryMessages(data) {
  const bizData = data?.data?.biz_data;
  if (!bizData) return;

  const sessionId = bizData.chat_session?.id;
  if (!sessionId) return;

  // Require exact match with current URL session — ignore stale responses
  const match = String(location.href || "").match(/\/chat\/s\/([^/?#]+)/);
  const currentSessionId = match ? match[1] : null;
  if (!currentSessionId || sessionId !== currentSessionId) return;

  // Reject malformed payloads — only arrays (including empty) are valid.
  // Non-array chat_messages cannot complete a request; a later valid
  // response must still be accepted.
  const incomingMessages = bizData.chat_messages;
  if (!Array.isArray(incomingMessages)) return;

  // Validate every entry before mutating cache state.
  // Reject the entire payload if any entry is not a non-null object with
  // a non-empty message_id. A later valid response remains accepted.
  for (const msg of incomingMessages) {
    if (
      !msg ||
      typeof msg !== "object" ||
      Array.isArray(msg) ||
      Object.getPrototypeOf(msg) !== Object.prototype ||
      typeof msg.message_id !== "string" ||
      !msg.message_id.trim()
    ) {
      return;
    }
  }

  // Enforce current-session-only invariant before storing
  retainOnlyHistorySession(currentSessionId);

  const cacheControl = bizData.cache_control || "APPEND";

  if (!state.chatMessagesBySession.has(sessionId) || cacheControl === "REPLACE") {
    state.chatMessagesBySession.set(sessionId, []);
  }

  const existing = state.chatMessagesBySession.get(sessionId);
  const existingIds = new Set(existing.map(m => m.message_id));

  for (const msg of incomingMessages) {
    if (!existingIds.has(msg.message_id)) {
      existing.push(msg);
      existingIds.add(msg.message_id);
    }
  }

  // Notify explicit full-history requests — including empty arrays so
  // waiters resolve promptly without hitting the 10 s timeout.
  if (data.__bdsExplicit) {
    window.dispatchEvent(new CustomEvent("bds:history-msgs-loaded", {
      detail: JSON.stringify({ sessionId, count: existing.length })
    }));
  }

  // Trigger page rescan to inject precise timestamps from API — only when
  // timestamp rendering is enabled, since that is the primary consumer.
  // Explicit export/select waiters still resolve via the event above.
  if (state.settings.showTimestamps) {
    scheduleScan();
  }
}

/**
 * Push current config (system prompt, skills, memories) to the MAIN world.
 */
export async function pushConfigToPage() {
  try {
    const activeProject = getActiveProject();
    let activeSystemPrompt;
    if (!state.settings.activeSystemPromptId || state.settings.activeSystemPromptId === "default") {
      activeSystemPrompt = DEFAULT_SYSTEM_PROMPT;
    } else if (Array.isArray(state.settings.customSystemPrompts)) {
      const custom = state.settings.customSystemPrompts.find(p => p.id === state.settings.activeSystemPromptId);
      activeSystemPrompt = custom ? custom.content : DEFAULT_SYSTEM_PROMPT;
    } else {
      activeSystemPrompt = DEFAULT_SYSTEM_PROMPT;
    }

    const projectRagEnabled = Boolean(state.settings.projectRagEnabled);
    const activeProjectFiles = activeProject
      ? (projectRagEnabled ? getFilesForProject(activeProject.id) : getActiveFiles())
      : [];

    let localDirFiles = [];
    if (activeProject && activeProject.linkedDirId) {
      try {
        const dirFiles = await getDirectoryFiles(activeProject.id);
        if (dirFiles) {
          localDirFiles = dirFiles;
        }
      } catch (e) {
        console.warn("[BDS] Failed to read linked directory:", e);
      }
    }

    const allFiles = [...activeProjectFiles, ...localDirFiles];

    const mcpSchemas = await discoverMcpToolSchemas();

    const detail = {
      mcpToolSchemas: mcpSchemas,
      systemPrompt: String(activeSystemPrompt),
      systemPromptEntries: state.settings.systemPromptMultiMode
        ? (Array.isArray(state.settings.systemPromptEntries) ? state.settings.systemPromptEntries : [])
            .filter(e => e.enabled && e.content && e.content.trim())
            .map(e => ({
              id: e.id,
              content: e.content,
              schedule: e.schedule || { type: "first", everyNTurns: 1 },
            }))
        : [],
      skills: state.skills
        .filter((skill) => skill.active)
        .map((skill) => ({ name: skill.name, content: skill.content })),
      memories: Object.entries(state.memories).map(([key, item]) => ({
        key,
        value: item.value,
        importance: item.importance,
      })),
      activeCharacter: state.characters.find(c => c.active) || null,
      preferredLang: String(state.settings.preferredLang || ""),
      disableSystemPrompt: Boolean(state.settings.disableSystemPrompt),
      disableMemory: Boolean(state.settings.disableMemory),
      systemPromptInjectionFrequency: String(state.settings.systemPromptInjectionFrequency || "first"),
      systemPromptInjectionInterval: Number(state.settings.systemPromptInjectionInterval || 3),
      projectRagEnabled,
      projectRagLimit: Number(state.settings.projectRagLimit || 5),
      injectSystemDateTime: Boolean(state.settings.injectSystemDateTime),
      deepResearch: {
        enabled: Boolean(state.deepResearch.enabled && state.deepResearch.pendingRun),
        runId: state.deepResearch.pendingRun?.id || "",
      },
      activeProject: activeProject
        ? {
          name: activeProject.name,
          instructions: activeProject.customInstructions,
          files: allFiles.map((f) => ({ name: f.name, content: f.content })),
        }
        : null,
    };

    window.dispatchEvent(
      new CustomEvent(BRIDGE_EVENTS.configUpdate, {
        detail: JSON.stringify(detail)
      })
    );
  } catch (e) {
    console.warn("[BDS] pushConfigToPage failed:", e);
  }
}

/**
 * Handle network state updates from the injected script.
 */
export function handleNetworkState(detail) {
  const activeCompletionRequests = Math.max(
    0,
    Number(
      detail && detail.activeCompletionRequests
        ? detail.activeCompletionRequests
        : 0
    )
  );

  state.network.activeCompletionRequests = activeCompletionRequests;
  state.network.lastEventAt = Date.now();

  if (activeCompletionRequests > 0) {
    if (state.longWork.active) {
      state.longWork.lastActivityAt = Date.now();
    }
    return;
  }

  if (state.ui) {
    state.ui.showLongWorkOverlay(false);
  }

  if (!state.longWork.active) {
    return;
  }

  const pendingFiles = state.longWork.files.size;
  if (pendingFiles > 0) {
    const latestAssistant = findLatestAssistantMessageNode();
    if (
      latestAssistant &&
      latestAssistant.dataset.bdsLongWorkClosed !== "1"
    ) {
      latestAssistant.dataset.bdsLongWorkClosed = "1";
      finalizeLongWork(latestAssistant);
      return;
    }
  }

  state.longWork.active = false;
  state.longWork.lastActivityAt = 0;
  state.longWork.files.clear();
  if (state.ui) {
    state.ui.showToast("LONG_WORK closed because API response ended.");
  }
}

/**
 * Discover MCP tool schemas by querying all enabled servers in parallel.
 * Populates state.mcpToolSchemas for use by payload-mutator.js.
 */
export async function discoverMcpToolSchemas() {
  const enabledServers = state.mcpServers.filter(s => s.enabled);
  if (!enabledServers.length) {
    state.mcpToolSchemas = [];
    return [];
  }

  const results = await Promise.allSettled(
    enabledServers.map(server =>
      new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          { type: "bds-mcp-list-tools", serverUrl: server.serverUrl, apiKey: server.apiKey || "" },
          (response) => {
            if (response?.ok) resolve({ serverName: server.name, serverUrl: server.serverUrl, tools: response.tools });
            else reject(new Error(response?.error || "Failed to list tools"));
          }
        );
      })
    )
  );

  const schemas = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      const { serverName, serverUrl, tools } = result.value;
      const toolList = Array.isArray(tools) ? tools : (tools?.tools || []);
      for (const tool of toolList) {
        schemas.push({
          serverName,
          serverUrl,
          toolName: tool.name,
          description: tool.description || "",
          inputSchema: tool.inputSchema || {},
        });
      }
    } else {
      console.warn(`[BDS] MCP discovery failed: ${result.reason?.message || "unknown error"}`);
    }
  }

  state.mcpToolSchemas = schemas;
  return schemas;
}

/**
 * Inject the MAIN-world hook script.
 */
export function injectHookScript() {
  if (document.getElementById("bds-injected-hook")) {
    return;
  }

  const script = document.createElement("script");
  script.id = "bds-injected-hook";
  script.src = chrome.runtime.getURL("injected.js");
  script.async = false;
  script.onload = () => {
    script.remove();
  };

  (document.head || document.documentElement).appendChild(script);
}
