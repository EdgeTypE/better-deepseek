/**
 * The block that was just sent from this page.
 *
 * DeepSeek writes its history cache when it loads a session, not after every
 * turn, so the copy of the message that carries a transfer block shows up in
 * IndexedDB only on the next load — which is why the card used to appear after
 * a refresh and never right after the send. The sender already holds the block
 * it put in the request, so it parks it here and the card mounts from that copy
 * until the cache catches up.
 *
 * Page-scoped on purpose: a reload clears it and the history path takes over.
 */

import { parseConfigBlocks } from "../../lib/config-sync.js";
import { getSessionIdFromUrl } from "../tools/history-cache.js";

/** @type {{ block: object, sessionId: string|null, visibleText: string }|null} */
let liveBlock = null;

/**
 * Park a block that has just been sent.
 *
 * @param {string} blockText serialized `<BDS:CONFIG …>` element
 * @param {{ visibleText?: string }} [options] text the message shows, used to
 *   recognise the message in the DOM
 */
export function rememberSentConfigBlock(blockText, options = {}) {
  const blocks = parseConfigBlocks(String(blockText || ""));
  if (!blocks.length) return;

  liveBlock = {
    // A message that carries several backups is ambiguous; the last one is the
    // one that was just sent.
    block: blocks[blocks.length - 1],
    // Usually null: a new chat only gets its id after the first message, so
    // the id is pinned on the first scan that has one.
    sessionId: getSessionIdFromUrl(),
    visibleText: String(options.visibleText || ""),
  };
}

/**
 * The parked block, if it belongs to `sessionId`.
 *
 * Pins the session id the first time it is known, and drops the block when it
 * belongs to a conversation the user has since left.
 *
 * @param {string} sessionId
 * @returns {{ block: object, visibleText: string }|null}
 */
export function takeLiveBlockFor(sessionId) {
  if (!liveBlock) return null;

  if (liveBlock.sessionId == null) {
    liveBlock.sessionId = sessionId;
  } else if (liveBlock.sessionId !== sessionId) {
    liveBlock = null;
    return null;
  }

  return { block: liveBlock.block, visibleText: liveBlock.visibleText };
}

/** Drop the parked block once a card is on the page. */
export function clearLiveBlock() {
  liveBlock = null;
}

/** Test seam. */
export function resetLiveBlock() {
  liveBlock = null;
}
