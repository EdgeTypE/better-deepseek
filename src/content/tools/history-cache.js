/**
 * DeepSeek history cache reader.
 *
 * The chat client caches the current session's last history payload in
 * IndexedDB (db "deepseek-chat", store "history-message", keyed by session
 * id). `data.chat_messages` matches the /history_messages API shape and holds
 * every branch of the conversation; exports follow the active branch from
 * `data.chat_session.current_message_id` through `parent_id`.
 *
 * Read-only and best-effort; problems resolve to "unavailable" so callers keep
 * their DOM fallback.
 */

import { devLog } from "../../lib/dev-log.js";

export const HISTORY_CACHE_DB = "deepseek-chat";
export const HISTORY_CACHE_STORE = "history-message";

const RETRY_INTERVAL_MS = 250;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Session id of a `/chat/s/<id>` URL, or null off-session.
 *
 * Stops at `?`/`#` so the id matches the keys the rest of the extension uses.
 *
 * @param {string} [href]
 * @returns {string|null}
 */
export function getSessionIdFromUrl(href = globalThis.location?.href) {
  const match = String(href || "").match(/\/chat\/s\/([^/?#]+)/);
  return match ? match[1] : null;
}

/**
 * Read the cached history payload for a session.
 *
 * @param {string} sessionId
 * @param {{ waitMs?: number, intervalMs?: number, idb?: IDBFactory|null }} [options]
 *   `waitMs` polls until the record appears (for exports racing page load);
 *   `idb` is injectable for tests.
 * @returns {Promise<{
 *   status: "hit"|"missing"|"unavailable",
 *   chatMessages?: Array,
 *   reason?: string,
 * }>}
 */
export async function readCachedMessages(sessionId, options = {}) {
  const {
    waitMs = 0,
    intervalMs = RETRY_INTERVAL_MS,
    idb = globalThis.indexedDB ?? null,
  } = options;

  if (!sessionId || !idb) return { status: "unavailable" };

  const key = String(sessionId);
  const deadline = Date.now() + Math.max(0, waitMs);

  for (;;) {
    let result;
    try {
      result = await readOnce(idb, key);
    } catch (error) {
      return { status: "unavailable", reason: error?.message || String(error) };
    }

    if (result.status !== "missing") {
      const reason = result.reason ? ` (${result.reason})` : "";
      const count = result.chatMessages ? ` (${result.chatMessages.length} messages)` : "";
      devLog("Export", `history cache ${result.status}${reason}${count} for session ${key}`);
      return result;
    }
    if (Date.now() >= deadline) return result;

    await sleep(Math.min(intervalMs, Math.max(0, deadline - Date.now())));
  }
}

/** Single non-retrying read attempt. */
async function readOnce(idb, sessionId) {
  const db = await openExistingDatabase(idb);
  if (!db) return { status: "unavailable" };

  try {
    if (!storeExists(db)) return { status: "unavailable" };

    const record = await readRecord(db, sessionId);
    if (record == null) return { status: "missing" };

    const parsed = parseCacheRecord(record, sessionId);
    return parsed ? { status: "hit", ...parsed } : { status: "unavailable" };
  } finally {
    try {
      db.close();
    } catch {
      /* ignore */
    }
  }
}

/** Open the existing cache database without creating it. */
function openExistingDatabase(idb) {
  return new Promise((resolve, reject) => {
    let request;
    try {
      request = idb.open(HISTORY_CACHE_DB);
    } catch (error) {
      reject(error);
      return;
    }

    // Abort the upgrade of a missing DB so it isn't created.
    request.onupgradeneeded = () => request.transaction.abort();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("indexedDB.open failed"));
  });
}

function storeExists(db) {
  const names = db.objectStoreNames;
  if (!names) return false;
  return typeof names.contains === "function"
    ? names.contains(HISTORY_CACHE_STORE)
    : Array.from(names).includes(HISTORY_CACHE_STORE);
}

function readRecord(db, sessionId) {
  return new Promise((resolve, reject) => {
    let transaction;
    try {
      transaction = db.transaction(HISTORY_CACHE_STORE, "readonly");
    } catch (error) {
      reject(error);
      return;
    }
    const request = transaction.objectStore(HISTORY_CACHE_STORE).get(sessionId);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error || new Error("history cache read failed"));
  });
}

/**
 * Validate a raw record and extract its message list; null when it doesn't
 * look like a usable history snapshot.
 *
 * @returns {{chatMessages: Array}|null}
 */
function parseCacheRecord(record, sessionId) {
  const data = record?.data;
  if (!data || typeof data !== "object") return null;

  // Reject a record that doesn't belong to the requested session.
  const recordSessionId = data.chat_session?.id;
  if (recordSessionId != null && String(recordSessionId) !== sessionId) return null;

  if (!Array.isArray(data.chat_messages)) return null;

  const chatMessages = selectActiveBranch(data.chat_messages, data.chat_session?.current_message_id);
  return chatMessages ? { chatMessages } : null;
}

/**
 * Reconstruct the active conversation branch, oldest first.
 *
 * `chat_messages` is a tree: regenerated replies to the same message are
 * siblings, and the UI renders only the branch selected in the session.
 * `current_message_id` is that branch's head, and each message points at its
 * predecessor via `parent_id`, so walking the links back yields the visible
 * transcript; messages off the chain stay out of the export.
 *
 * Falls back to the raw list when the record has no head id or no parent
 * links to follow, and returns null when the head isn't part of the snapshot
 * so callers keep their DOM/API fallback instead of exporting a faulty tree.
 *
 * @param {Array} chatMessages
 * @param {string|number|null|undefined} currentMessageId
 * @returns {Array|null}
 */
function selectActiveBranch(chatMessages, currentMessageId) {
  if (currentMessageId == null) return chatMessages;
  if (!chatMessages.some((msg) => msg?.parent_id != null)) return chatMessages;

  const byId = new Map(chatMessages.map((msg) => [String(msg?.message_id), msg]));
  const branch = [];
  const seen = new Set();

  let id = String(currentMessageId);
  while (id && !seen.has(id)) {
    seen.add(id);
    const message = byId.get(id);
    if (!message) break;
    branch.push(message);
    id = message.parent_id != null ? String(message.parent_id) : "";
  }

  return branch.length ? branch.reverse() : null;
}
