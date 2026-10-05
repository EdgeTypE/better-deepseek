/**
 * Identify the message a streamed reply became.
 *
 * DeepSeek's own "Read aloud" button addresses messages by `message_id`, and
 * that is also what BDS's native voice stream needs. The completion stream is
 * the cheapest place to learn it: the response body is already read for token
 * usage, so pulling the id from the same chunks costs no extra request and
 * cannot be a stale snapshot (unlike the history API, which is only fetched on
 * demand).
 *
 * The payload shape is undocumented, so instead of hard-coding one path the
 * chunk is walked for a `message_id`-shaped key.
 */

/**
 * Keys that plausibly carry the id of the message being generated.
 *
 * Bare `id` and `chat_session_id` deliberately do not match — they are far too
 * generic to trust as "the id of this reply", and picking one of those would
 * make auto-read speak the wrong message.
 */
const MESSAGE_ID_KEY = /^(message_id|msg_id|response_message_id)$/i;

/** Give up rather than recurse through an absurdly deep payload. */
const MAX_ID_SEARCH_DEPTH = 5;

/**
 * Whether a response body can tell us about the reply being generated.
 *
 * Only the completion endpoints qualify. The history and session endpoints carry
 * `message_id` fields for *every* message in the session, so extracting from
 * those would report an arbitrary — usually the oldest — message as the reply
 * that was just written.
 */
export function isReplyStreamUrl(url) {
  const s = String(url || "");
  return s.includes("/api/v0/chat/completion") || s.includes("/api/v0/chat/edit_message");
}

/**
 * Find a message id anywhere inside a completion chunk.
 *
 * Exported for tests: this walks an undocumented payload shape, so the search
 * rules are worth pinning down.
 *
 * @returns {string|null}
 */
export function findMessageId(value, depth = 0) {
  if (!value || typeof value !== "object" || depth > MAX_ID_SEARCH_DEPTH) return null;

  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findMessageId(entry, depth + 1);
      if (found) return found;
    }
    return null;
  }

  for (const [key, entry] of Object.entries(value)) {
    if (MESSAGE_ID_KEY.test(key) && (typeof entry === "string" || typeof entry === "number")) {
      const id = String(entry).trim();
      if (id) return id;
    }
  }
  for (const entry of Object.values(value)) {
    const found = findMessageId(entry, depth + 1);
    if (found) return found;
  }
  return null;
}

/** The session the page is currently showing, or null. */
export function currentSessionIdFromUrl() {
  const match = String(location.href || "").match(/\/chat\/s\/([^/?#]+)/);
  return match ? match[1] : null;
}

/**
 * Tell the content script which message the reply it just streamed became.
 */
export function emitAssistantMessageId(messageId) {
  window.dispatchEvent(new CustomEvent("bds:assistant-message-id", {
    detail: JSON.stringify({
      messageId,
      sessionId: currentSessionIdFromUrl(),
      timestamp: Date.now(),
    }),
  }));
}

/**
 * Scan raw SSE text for the id of the reply being generated.
 *
 * Later matches win: the finished message is addressed by the last id the
 * stream reported for it.
 *
 * @returns {string|null}
 */
export function findMessageIdInSse(text) {
  let messageId = null;
  for (const line of String(text || "").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data: ")) continue;
    const jsonStr = trimmed.slice(6).trim();
    if (jsonStr === "[DONE]") continue;
    try {
      const found = findMessageId(JSON.parse(jsonStr));
      if (found) messageId = found;
    } catch (e) { /* not JSON — ignore */ }
  }
  return messageId;
}
