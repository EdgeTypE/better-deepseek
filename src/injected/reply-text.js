/**
 * Rebuild a streamed reply from its raw SSE body.
 *
 * The DOM is a lossy copy of what the model wrote: by the time a reply is
 * rendered, CommonMark has already eaten escapes like `\\/`, and KaTeX has
 * rewritten anything between two `$`. Reading the stream is the only place the
 * original bytes still exist.
 *
 * DeepSeek streams the reply as a series of APPEND operations targeting
 * `response/fragments/-1/content`, after an opening frame that carries the
 * message id and the first fragment's text.
 */

/** The field every streamed content chunk appends to. */
const CONTENT_PATH = "response/fragments/-1/content";

/**
 * Pull the reply text and message id out of a raw SSE response body.
 *
 * @param {string} text the full response body, already decoded
 * @returns {{ messageId: string|null, content: string }}
 */
export function extractReplyTextFromSse(text) {
  const source = String(text || "");
  let messageId = null;
  const parts = [];

  for (const line of source.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data: ")) continue;

    const payload = trimmed.slice(6).trim();
    if (!payload || payload === "[DONE]") continue;

    let chunk;
    try {
      chunk = JSON.parse(payload);
    } catch {
      // Comments, heartbeats and other non-JSON frames carry no reply text.
      continue;
    }
    if (!chunk || typeof chunk !== "object") continue;

    if (!messageId) {
      const found = findResponseMessageId(chunk);
      if (found) messageId = found;
    }

    // Two shapes carry reply text: the opening frame's fragment list, and the
    // incremental APPEND operations that follow it.
    if (chunk.p === CONTENT_PATH && typeof chunk.v === "string") {
      parts.push(chunk.v);
      continue;
    }

    const fragment = chunk.v?.response?.fragments?.[0]?.content;
    if (typeof fragment === "string") {
      parts.push(fragment);
    }
  }

  return { messageId, content: parts.join("") };
}

/** The id of the reply this stream is producing, if the frame reports it. */
function findResponseMessageId(chunk) {
  const response = chunk.v?.response;
  if (!response) return null;
  const id = response.message_id ?? response.msg_id ?? null;
  if (id === null || id === undefined) return null;
  const normalised = String(id).trim();
  return normalised || null;
}
