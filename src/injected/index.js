/**
 * Injected script — runs in MAIN world to intercept network requests.
 *
 * This script patches window.fetch and XMLHttpRequest to inject the system prompt,
 * skills, and memory context into DeepSeek's chat completion API calls.
 *
 * It communicates with the content script via CustomEvents on window.
 */

import { normalizeConfig, normalizeDeepResearch } from "./config.js";
import { patchFetch } from "./fetch-patch.js";
import { patchXmlHttpRequest } from "./xhr-patch.js";

(function () {
  "use strict";

  const EVENTS = {
    configUpdate: "bds:config-update",
    deepResearchConfigUpdate: "bds:deep-research-config-update",
    requestConfig: "bds:request-config",
    markVoiceMessage: "bds:mark-voice-message",
    sessionData: "bds:session-data",
  };

  const SESSION_FETCH_URL = "/api/v0/chat_session/fetch_page";
  const HISTORY_MSGS_URL = "/api/v0/chat/history_messages";

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

  function getInjectedEntries(convId) {
    try {
      const all = JSON.parse(localStorage.getItem('bds_injected_entries') || '{}');
      return all[convId] || [];
    } catch { return []; }
  }

  function markEntryInjected(convId, entryId) {
    try {
      const all = JSON.parse(localStorage.getItem('bds_injected_entries') || '{}');
      if (!all[convId]) all[convId] = [];
      if (!all[convId].includes(entryId)) all[convId].push(entryId);
      const keys = Object.keys(all);
      if (keys.length > 50) delete all[keys[0]];
      localStorage.setItem('bds_injected_entries', JSON.stringify(all));
    } catch { /* ignore */ }
  }

  function findAuthTokenInStorage() {
    try {
      // 1. Check localStorage keys
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;
        if (/token|auth|session/i.test(key)) {
          const val = localStorage.getItem(key);
          if (!val) continue;
          if (val.trim().startsWith("{")) {
            try {
              const parsed = JSON.parse(val);
              const token = parsed.token || parsed.accessToken || parsed.access_token || parsed.user_token || parsed.user?.token;
              if (token && typeof token === "string") return token;
            } catch {}
          } else if (typeof val === "string" && val.length > 20) {
            let tokenStr = val;
            if (tokenStr.startsWith("Bearer ")) {
              tokenStr = tokenStr.substring(7);
            }
            if (tokenStr.startsWith('"') && tokenStr.endsWith('"')) {
              tokenStr = tokenStr.slice(1, -1);
            }
            return tokenStr;
          }
        }
      }

      // 2. Check cookies
      const cookieToken = document.cookie
        .split("; ")
        .find(row => row.startsWith("user_token=") || row.startsWith("token="))
        ?.split("=")[1];
      if (cookieToken) return decodeURIComponent(cookieToken);
    } catch (e) {
      console.warn("[BDS] Failed to search auth token in storage:", e);
    }
    return null;
  }

  const state = {
    config: {
      systemPrompt: "",
      systemPromptEntries: [],
      skills: [],
      memories: [],
      activeCharacter: null,
      mcpToolSchemas: [],
    },
    hasInjected: (id) => getInjectedChats().includes(id),
    markInjected: (id) => addInjectedChat(id),
    getInjectedEntries: (convId) => getInjectedEntries(convId),
    markEntryInjected: (convId, entryId) => markEntryInjected(convId, entryId),
    getLastChar: (id) => getInjectedCharacters()[id] || null,
    setLastChar: (id, name) => setInjectedCharacter(id, name),
    currentSessionChar: null, // memory cache for default ID transition
    activeCompletionRequests: 0,
    isNextVoiceMessage: false,
    /** @type {string|null} Bearer token captured from API requests */
    authToken: findAuthTokenInStorage(),
    /** @type {function(string): void} Store the Authorization header value */
    setAuthToken: function(token) {
      if (token && token !== this.authToken) {
        this.authToken = token;
      }
    },
  };

  // ── Guard against double-injection ──
  if (window.__bdsNetworkPatched) {
    return;
  }
  window.__bdsNetworkPatched = true;

  // ── Debug API: inspect/override remote config from DevTools ──
  (function() {
    if (window.__BDS_CONFIG__) return;
    let reqId = 0;
    const pending = new Map();

    window.addEventListener("bds:debug-api-response", (e) => {
      let d = e.detail;
      if (typeof d === "string") { try { d = JSON.parse(d); } catch { return; } }
      const cb = pending.get(d.id);
      if (cb) { cb(d.result); pending.delete(d.id); }
    });

    function call(method) {
      return function() {
        const args = Array.from(arguments);
        return new Promise((resolve) => {
          const id = ++reqId;
          pending.set(id, resolve);
          window.dispatchEvent(new CustomEvent("bds:debug-api-request", {
            detail: JSON.stringify({ id, method, args }),
          }));
        });
      };
    }

    window.__BDS_CONFIG__ = {
      raw: call("getRaw"),
      getFlag: call("getFlag"),
      getConfig: call("getConfig"),
      applyRemote: call("applyRemote"),
      replaceRemote: call("replaceRemote"),
      resetToBuiltin: call("resetToBuiltin"),
      detectModel: call("detectModel"),
      toggleDebugPanel: call("toggleDebugPanel"),
    };
  })();

  // ── Listen for config updates from the content script ──
  window.addEventListener(EVENTS.configUpdate, (event) => {
    let nextConfig = event && event.detail ? event.detail : {};
    // Handle stringified detail (Firefox Xray Vision fix)
    if (typeof nextConfig === "string") {
      try {
        nextConfig = JSON.parse(nextConfig);
      } catch (e) {
        console.error("[BDS] Failed to parse configUpdate detail:", e);
      }
    }
    state.config = normalizeConfig(nextConfig || {});
  });

  window.addEventListener(EVENTS.deepResearchConfigUpdate, (event) => {
    let nextConfig = event && event.detail ? event.detail : {};
    if (typeof nextConfig === "string") {
      try {
        nextConfig = JSON.parse(nextConfig);
      } catch (e) {
        console.error("[BDS] Failed to parse deepResearchConfigUpdate detail:", e);
      }
    }
    state.config.deepResearch = normalizeDeepResearch(nextConfig || {});
  });
  
  window.addEventListener(EVENTS.markVoiceMessage, () => {
    state.isNextVoiceMessage = true;
  });

  // ── Listen for on-demand history messages request ──
  window.addEventListener("bds:request-history-msgs", async (event) => {
    let detail = event && event.detail ? event.detail : {};
    if (typeof detail === "string") {
      try { detail = JSON.parse(detail); } catch { return; }
    }
    const sessionId = detail?.sessionId;
    if (!sessionId) return;

    const url = `${HISTORY_MSGS_URL}?chat_session_id=${encodeURIComponent(sessionId)}`;
    const headers = { "Content-Type": "application/json" };
    if (state.authToken) {
      headers["Authorization"] = `Bearer ${state.authToken}`;
    }

    try {
      const response = await _originalFetch(url, { method: "GET", headers, credentials: "include" });
      if (!response.ok) {
        console.warn("[BDS] history_mgs fetch failed:", response.status);
        return;
      }
      const data = await response.json();
      data.__bdsExplicit = true;
      window.dispatchEvent(new CustomEvent("bds:history-msgs", { detail: JSON.stringify(data) }));
    } catch (e) {
      console.warn("[BDS] history_msgs fetch error:", e);
    }
  });

  // ── Request initial config ──
  requestConfigFromContentScript();

  // ── Capture original fetch before patching, for internal use ──
  const _originalFetch = window.fetch.bind(window);

  // ── Patch network APIs ──
  patchFetch(state, isChatCompletionUrl, markCompletionRequestStart, markCompletionRequestEnd);
  patchXmlHttpRequest(state, isChatCompletionUrl, markCompletionRequestStart, markCompletionRequestEnd);

  // ── Helpers ──

  function requestConfigFromContentScript() {
    window.dispatchEvent(new CustomEvent(EVENTS.requestConfig));
  }

  function isChatCompletionUrl(url) {
    const s = String(url || "");
    return s.includes("/api/v0/chat/completion") || s.includes("/api/v0/chat/edit_message") || s.includes(SESSION_FETCH_URL) || s.includes(HISTORY_MSGS_URL);
  }

  function emitNetworkState(status, url) {
    const detail = {
      status,
      url: String(url || ""),
      activeCompletionRequests: state.activeCompletionRequests,
      timestamp: Date.now(),
    };
    
    window.dispatchEvent(
      new CustomEvent(EVENTS.networkState, {
        // Stringify detail to cross the boundary in Firefox
        detail: JSON.stringify(detail),
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
