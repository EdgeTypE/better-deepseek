/**
 * Injected script — runs in MAIN world to intercept network requests.
 *
 * This script patches window.fetch and XMLHttpRequest to inject the system prompt,
 * skills, and memory context into DeepSeek's chat completion API calls.
 *
 * It communicates with the content script via CustomEvents on window.
 */

import { normalizeConfig } from "./config.js";
import { patchFetch } from "./fetch-patch.js";
import { patchXmlHttpRequest } from "./xhr-patch.js";

(function () {
  "use strict";

  const EVENTS = {
    configUpdate: "bds:config-update",
    requestConfig: "bds:request-config",
    networkState: "bds:network-state",
  };

  const CHAT_COMPLETION_PATH = "/api/v0/chat/completion";

  const state = {
    config: {
      systemPrompt: "",
      skills: [],
      memories: [],
    },
    initializedConversations: new Set(),
    activeCompletionRequests: 0,
  };

  // ── Guard against double-injection ──
  if (window.__bdsNetworkPatched) {
    return;
  }
  window.__bdsNetworkPatched = true;

  // ── Listen for config updates from the content script ──
  window.addEventListener(EVENTS.configUpdate, (event) => {
    const nextConfig = event && event.detail ? event.detail : {};
    state.config = normalizeConfig(nextConfig);
  });

  // ── Request initial config ──
  requestConfigFromContentScript();

  // ── Patch network APIs ──
  patchFetch(state, isChatCompletionUrl, markCompletionRequestStart, markCompletionRequestEnd);
  patchXmlHttpRequest(state, isChatCompletionUrl, markCompletionRequestStart, markCompletionRequestEnd);

  // ── Helpers ──

  function requestConfigFromContentScript() {
    window.dispatchEvent(new CustomEvent(EVENTS.requestConfig));
  }

  function isChatCompletionUrl(url) {
    return String(url || "").includes(CHAT_COMPLETION_PATH);
  }

  function emitNetworkState(status, url) {
    window.dispatchEvent(
      new CustomEvent(EVENTS.networkState, {
        detail: {
          status,
          url: String(url || ""),
          activeCompletionRequests: state.activeCompletionRequests,
          timestamp: Date.now(),
        },
      })
    );
  }

  function markCompletionRequestStart(url) {
    state.activeCompletionRequests += 1;
    emitNetworkState("start", url);
  }

  function markCompletionRequestEnd(url) {
    state.activeCompletionRequests = Math.max(
      0,
      state.activeCompletionRequests - 1
    );
    emitNetworkState("end", url);
  }
})();
