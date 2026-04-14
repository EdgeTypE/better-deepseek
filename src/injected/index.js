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

  function getInjectedChats() {
    try { return JSON.parse(localStorage.getItem('bds_injected_chats') || '[]'); } catch { return []; }
  }
  function addInjectedChat(id) {
    const chats = getInjectedChats();
    if (!chats.includes(id)) {
      chats.push(id);
      if (chats.length > 50) chats.shift();
      localStorage.setItem('bds_injected_chats', JSON.stringify(chats));
    }
  }
  function getInjectedCharacters() {
    try { return JSON.parse(localStorage.getItem('bds_injected_chars') || '{}'); } catch { return {}; }
  }
  function setInjectedCharacter(id, name) {
    const chars = getInjectedCharacters();
    chars[id] = name;
    const keys = Object.keys(chars);
    if (keys.length > 50) delete chars[keys[0]];
    localStorage.setItem('bds_injected_chars', JSON.stringify(chars));
  }

  const state = {
    config: {
      systemPrompt: "",
      skills: [],
      memories: [],
      activeCharacter: null,
    },
    hasInjected: (id) => getInjectedChats().includes(id),
    markInjected: (id) => addInjectedChat(id),
    getLastChar: (id) => getInjectedCharacters()[id] || null,
    setLastChar: (id, name) => setInjectedCharacter(id, name),
    currentSessionChar: null, // memory cache for default ID transition
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
    const s = String(url || "");
    return s.includes("/api/v0/chat/completion") || s.includes("/api/v0/chat/edit_message");
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
