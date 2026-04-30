/**
 * Bridge between content script (ISOLATED world) and injected script (MAIN world).
 */

import state from "./state.js";
import { BRIDGE_EVENTS } from "../lib/constants.js";
import { findLatestAssistantMessageNode, collectMessageNodes } from "./scanner.js";
import { finalizeLongWork } from "./files/long-work.js";
import { getActiveProject, getActiveFiles } from "./project-manager.js";

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
}

/**
 * Push current config (system prompt, skills, memories) to the MAIN world.
 */
export function pushConfigToPage() {
  const activeProject = getActiveProject();
  const detail = {
    systemPrompt: String(state.settings.systemPrompt || ""),
    skills: state.skills
      .filter((skill) => skill.active)
      .map((skill) => ({ name: skill.name, content: skill.content })),
    memories: Object.entries(state.memories).map(([key, item]) => ({
      key,
      value: item.value,
      importance: item.importance,
    })),
    activeCharacter: state.characters.find(c => c.active) || null,
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
function handleNetworkState(detail) {
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
