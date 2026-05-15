/**
 * Bridge between content script (ISOLATED world) and injected script (MAIN world).
 */

import state from "./state.js";
import { BRIDGE_EVENTS } from "../lib/constants.js";
import { findLatestAssistantMessageNode, collectMessageNodes } from "./scanner.js";
import { finalizeLongWork } from "./files/long-work.js";
import { getActiveProject, getActiveFiles } from "./project-manager.js";
import { discoverTags } from "./tags/tag-manager.js";

/**
 * Set up listeners for bridge events from the injected script.
 */
export function setupBridgeEvents() {
  window.addEventListener(BRIDGE_EVENTS.requestConfig, () => {
    pushConfigToPage();
  });

  window.addEventListener(BRIDGE_EVENTS.networkState, (event) => {
    let detail = event && event.detail ? event.detail : {};
    // Handle stringified detail (Firefox Xray Vision fix)
    if (typeof detail === "string") {
      try {
        detail = JSON.parse(detail);
      } catch (e) {
        console.error("[BDS] Failed to parse networkState detail:", e);
      }
    }
    handleNetworkState(detail);
  });

  window.addEventListener("bds:session-data", (event) => {
    let data = event.detail;
    if (typeof data === "string") {
      try { data = JSON.parse(data); } catch (e) { return; }
    }
    handleSessionData(data);
  });

  window.addEventListener("bds:token-usage", (event) => {
    let data = event.detail;
    if (typeof data === "string") {
      try { data = JSON.parse(data); } catch (e) { return; }
    }
    if (data && data.modelName) {
      state.pricing.modelName = data.modelName;
    }
  });

  window.addEventListener("bds:mutation-applied", (event) => {
    let data = event.detail;
    if (typeof data === "string") {
      try { data = JSON.parse(data); } catch (e) { return; }
    }
    if (data && data.conversationId && data.userPrompt !== undefined) {
      state.pricing.pendingInjections.set(data.conversationId, {
        injectedText: data.injectedText || "",
        userPrompt: data.userPrompt
      });
    }
  });

  window.addEventListener("bds:network-error", (event) => {
    let detail = event.detail;
    if (typeof detail === "string") {
      try { detail = JSON.parse(detail); } catch (e) { return; }
    }
    console.warn("[BDS] Network error detected:", detail);

    // Trigger immediate status check
    import("./status-monitor.js").then(m => m.fetchServerStatus());
  });
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
 * Push current config (system prompt, skills, memories) to the MAIN world.
 */
export function pushConfigToPage() {
  const activeProject = getActiveProject();
  let activeSystemPrompt = state.settings.systemPrompt || "";
  if (state.settings.activeSystemPromptId && 
      state.settings.activeSystemPromptId !== "default" && 
      Array.isArray(state.settings.customSystemPrompts)) {
    const custom = state.settings.customSystemPrompts.find(p => p.id === state.settings.activeSystemPromptId);
    if (custom) {
      activeSystemPrompt = custom.content;
    }
  }

  const detail = {
    systemPrompt: String(activeSystemPrompt),
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
    activeProject: activeProject
      ? {
        name: activeProject.name,
        instructions: activeProject.customInstructions,
        files: getActiveFiles().map((f) => ({ name: f.name, content: f.content })),
      }
      : null,
  };

  window.dispatchEvent(
    new CustomEvent(BRIDGE_EVENTS.configUpdate, {
      // Stringify detail to cross the boundary in Firefox without Xray Vision issues
      detail: JSON.stringify(detail)
    })
  );
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
