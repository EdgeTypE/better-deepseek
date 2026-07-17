/**
 * Load All History — intercepts DeepSeek's `/api/v0/chat/history_messages`
 * API call (via the injected script's fetch/XHR patch) to obtain every message
 * in the session along with accurate `accumulated_token_usage`.
 *
 * Default: off (opt-in via settings.loadAllHistoryOnSession).
 * When enabled, runs automatically on session open AND on-demand before
 * export / select-all / price recalculation.
 */

import state from "./state.js";
import { scheduleScan } from "./scanner.js";

const HISTORY_MSGS_TIMEOUT = 10000;

/**
 * Per-session pending records: { promise, cancel }.
 * Cancel removes the event listener, clears the timeout, and resolves
 * the wait once with `false` so the load path can clean up.
 *
 * @type {Map<string, {promise: Promise<?Array>, cancel: () => void}>}
 */
const pendingBySession = new Map();
const _fullHistoryLoaded = new Set();

export function isLoadInProgress() {
  // A session is "in progress" if it has an unresolved pending record
  for (const [, rec] of pendingBySession) {
    // We can't inspect promise state synchronously, but if the map is
    // non-empty, at least one load hasn't been finally-cleaned yet.
    return true;
  }
  return false;
}

/**
 * Get the current session ID from the URL.
 * @returns {string|null}
 */
function getSessionId() {
  const match = String(location.href || "").match(/\/chat\/s\/([^/?#]+)/);
  return match ? match[1] : null;
}

/**
 * Evict every session's cached messages except the given one.
 * Cancels pending loads for evicted sessions.
 * Pass `null` to clear everything.
 *
 * @param {string|null} sessionId
 */
export function retainOnlyHistorySession(sessionId) {
  // Cancel and remove stale pending records
  for (const [key, rec] of pendingBySession) {
    if (key !== sessionId) {
      rec.cancel();
      pendingBySession.delete(key);
    }
  }

  // Evict cached messages for other sessions
  for (const key of state.chatMessagesBySession.keys()) {
    if (key !== sessionId) {
      state.chatMessagesBySession.delete(key);
    }
  }
  for (const key of _fullHistoryLoaded) {
    if (key !== sessionId) {
      _fullHistoryLoaded.delete(key);
    }
  }

  if (sessionId === null) {
    state.chatMessagesBySession.clear();
    _fullHistoryLoaded.clear();
    pendingBySession.clear();
  }
}

/**
 * Wait for the `bds:history-msgs-loaded` event.
 * Returns a promise and a cancel function.
 *
 * @param {string} sessionId
 * @returns {{promise: Promise<boolean>, cancel: () => void}}
 */
function waitForHistoryData(sessionId) {
  let timeoutId;
  let handler;

  const promise = new Promise((resolve) => {
    let settled = false;

    const finalize = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      window.removeEventListener("bds:history-msgs-loaded", handler);
      resolve(value);
    };

    handler = (event) => {
      let detail = event.detail;
      if (typeof detail === "string") {
        try { detail = JSON.parse(detail); } catch { return; }
      }
      // Ignore responses for sessions other than the one we're waiting on
      if (detail?.sessionId !== sessionId) return;
      finalize(true);
    };

    window.addEventListener("bds:history-msgs-loaded", handler);
    timeoutId = setTimeout(() => finalize(false), HISTORY_MSGS_TIMEOUT);
  });

  const cancel = () => {
    clearTimeout(timeoutId);
    window.removeEventListener("bds:history-msgs-loaded", handler);
  };

  return { promise, cancel };
}

/**
 * Load all messages for the current session via the history_messages API.
 *
 * Returns an array of API message objects (or null if unavailable):
 *   { message_id, role, fragments, accumulated_token_usage, ... }
 *
 * Callers can pass these to `collectMessagesFromApi()` in exporter.js.
 */
export async function loadAllHistory() {
  const sessionId = getSessionId();
  if (!sessionId) {
    return null;
  }

  // Check per-session pending — never block on a different session's load
  const existing = pendingBySession.get(sessionId);
  if (existing) {
    return existing.promise;
  }

  // Only trust cache if a full explicit load was previously completed
  if (_fullHistoryLoaded.has(sessionId)) {
    const messages = state.chatMessagesBySession.get(sessionId);
    return messages && messages.length > 0 ? messages : null;
  }

  const { promise, cancel } = waitForHistoryData(sessionId);
  const record = { promise: null, cancel };

  const loadPromise = (async () => {
    window.dispatchEvent(new CustomEvent("bds:request-history-msgs", {
      detail: JSON.stringify({ sessionId })
    }));

    const loaded = await promise;

    // Verify this record is still the current one for this session
    if (pendingBySession.get(sessionId) !== record) {
      // A newer request replaced us — discard
      return null;
    }

    if (loaded && state.chatMessagesBySession.has(sessionId)) {
      const messages = state.chatMessagesBySession.get(sessionId);
      _fullHistoryLoaded.add(sessionId);
      if (messages.length > 0) return messages;
    }

    // loaded but no messages cached (e.g. empty explicit response)
    // Treat as completed: cache the empty result so we don't re-request
    if (loaded && !state.chatMessagesBySession.has(sessionId)) {
      _fullHistoryLoaded.add(sessionId);
    }

    return null;
  })();

  record.promise = loadPromise;
  pendingBySession.set(sessionId, record);

  try {
    return await loadPromise;
  } finally {
    // Only delete if this exact record is still in the map
    if (pendingBySession.get(sessionId) === record) {
      pendingBySession.delete(sessionId);
    }
  }
}
