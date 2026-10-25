/**
 * Finds settings-transfer blocks in the conversation history and mounts a card
 * next to the user message that carried them.
 *
 * The block is not in the DOM: it is injected into the request body, so the
 * message the page renders only holds the short visible text. The raw stored
 * text lives in DeepSeek's own IndexedDB history cache, which is why the card
 * is anchored by ordinal position — the Nth user message in the cached branch
 * is the Nth user message in the DOM.
 *
 * That cache is written on session load, so a block sent in this page is not in
 * it yet; `live.js` holds the block the sender just put in the request and the
 * card mounts from that copy first.
 */

import { mount, unmount } from "svelte";
import ConfigSyncCard from "../ui/ConfigSyncCard.svelte";
import { getSessionIdFromUrl, readCachedMessages } from "../tools/history-cache.js";
import { parseConfigBlocks, rawMessageText } from "../../lib/config-sync.js";
import { collectMessageNodes, detectMessageRole } from "../scanner.js";
import { getOrCreateHost } from "../dom/host.js";
import { devLog } from "../../lib/dev-log.js";
import { clearLiveBlock, takeLiveBlockFor } from "./live.js";

const HOST_CLASS = "bds-config-sync-host";
/** Dedupe key for the block the sender parked in `live.js`. */
const LIVE_KEY = "live";
/** Characters of the sent text used to recognise its message in the DOM. */
const LIVE_TEXT_PROBE = 24;
/**
 * The cache is written after a turn completes, so a freshly sent block is not
 * in it yet. Retry for a few seconds, then go quiet until the message count
 * changes again — otherwise every conversation would poll IndexedDB forever.
 */
const RETRY_INTERVAL_MS = 1500;
const MAX_ATTEMPTS_PER_COUNT = 6;

/** @type {string|null} */
let sessionId = null;
/** @type {Promise<void>|null} */
let loading = null;
let lastAttemptAt = 0;
let lastNodeCount = -1;
let attempts = 0;

/** @type {Array<{ key: string, userIndex: number, messageId: string|null, block: object }>} */
let records = [];

/** @type {Map<Element, { component: object, host: Element, key: string }>} */
const mountedCards = new Map();
/** @type {Set<string>} */
const mountedKeys = new Set();

function unmountCard(node) {
  const entry = mountedCards.get(node);
  if (!entry) return;
  try {
    unmount(entry.component);
  } catch {
    /* already gone */
  }
  mountedCards.delete(node);
  mountedKeys.delete(entry.key);
  try {
    entry.host.remove();
  } catch {
    /* host already detached */
  }
}

function resetCards() {
  for (const node of [...mountedCards.keys()]) unmountCard(node);
  records = [];
  mountedKeys.clear();
  lastAttemptAt = 0;
  lastNodeCount = -1;
  attempts = 0;
}

/**
 * Index every transfer block in a stored message list.
 *
 * `userIndex` counts user messages only, because that is the only anchor the
 * DOM can offer: the block itself is injected into the request body and never
 * reaches the rendered text.
 *
 * @param {Array} chatMessages oldest-first branch from the history cache
 * @returns {Array<{ key: string, userIndex: number, messageId: string|null, block: object }>}
 */
export function indexConfigBlocks(chatMessages) {
  if (!Array.isArray(chatMessages)) return [];

  const found = [];
  let userIndex = -1;

  for (const message of chatMessages) {
    const role = String(message?.role || "").toLowerCase();
    if (role === "user") userIndex += 1;
    if (role !== "user") continue;

    const blocks = parseConfigBlocks(rawMessageText(message));
    if (!blocks.length) continue;

    const messageId = message?.message_id != null ? String(message.message_id) : null;
    found.push({
      key: messageId != null ? messageId : `idx:${userIndex}`,
      userIndex,
      messageId,
      // A message that carries several backups is ambiguous; the newest one
      // (last in the text) is the one the user just sent.
      block: blocks[blocks.length - 1],
    });
  }

  return found;
}

/**
 * Read the stored history and index every transfer block it holds.
 *
 * @param {string} id
 */
async function loadRecords(id) {
  const result = await readCachedMessages(id);
  if (result.status !== "hit") return;

  const found = indexConfigBlocks(result.chatMessages);

  // The cache now holds the block the sender parked: the card can survive on
  // the history path alone, and a stale live copy must not re-mount elsewhere.
  const live = takeLiveBlockFor(id);
  if (live && found.some((record) => sameBlock(record.block, live.block))) {
    clearLiveBlock();
  }

  if (!found.length) return;

  records = found;
  devLog("ConfigSync", `found ${found.length} transfer block(s) in session ${id}`);
}

/**
 * Are these two blocks the same backup? The body is the encoded payload, so it
 * differs between exports; the checksum only guards against a truncated one.
 */
function sameBlock(a, b) {
  if (!a || !b || a.body !== b.body) return false;
  return String(a.attrs?.sum || "") === String(b.attrs?.sum || "");
}

/**
 * Mount one card inside a message node.
 *
 * One card per message: a second block for the same message would be a copy of
 * the first, so an existing host is left alone.
 *
 * @param {Element} node user message node
 * @param {object} block parsed transfer block
 * @param {string|null} messageId
 * @param {string} key dedupe key
 * @returns {boolean} true when a card was mounted
 */
function mountCard(node, block, messageId, key) {
  if (mountedCards.has(node)) return false;

  const host = getOrCreateHost(node, HOST_CLASS);
  const component = mount(ConfigSyncCard, {
    target: host,
    props: { block, messageId },
  });
  mountedCards.set(node, { component, host, key });
  mountedKeys.add(key);
  return true;
}

function mountPending() {
  const pending = records.filter((record) => !mountedKeys.has(record.key));
  if (!pending.length) return;

  try {
    const userNodes = collectMessageNodes().filter(
      (node) => detectMessageRole(node) === "user",
    );
    if (!userNodes.length) return;

    for (const record of pending) {
      const node = userNodes[record.userIndex];
      if (!node) continue;

      // The live copy usually got there first; the record then confirms a card
      // that is already on screen, so only the key needs recording.
      if (mountedCards.has(node)) {
        mountedKeys.add(record.key);
        continue;
      }

      mountCard(node, record.block, record.messageId, record.key);
    }
  } catch (error) {
    // A card that cannot be placed must never take the scan loop down with it.
    devLog("ConfigSync", `mount failed: ${error?.message || error}`);
  }
}

/**
 * Mount the block that was just sent, on the newest user message.
 *
 * The message may not be in the DOM yet when the send returns, and the newest
 * user message at that moment is the previous one — mounting there would put
 * the card on the wrong turn. The sent text is the only handle available, so
 * the last user message has to show it before the card is placed.
 *
 * @param {string} id current session id
 * @returns {boolean} true when a card is on the page
 */
function mountLive(id) {
  const live = takeLiveBlockFor(id);
  if (!live) return false;

  try {
    const userNodes = collectMessageNodes().filter(
      (node) => detectMessageRole(node) === "user",
    );
    const node = userNodes[userNodes.length - 1];
    if (!node) return false;

    if (!nodeShowsText(node, live.visibleText)) return false;

    // One card per message: a re-render that kept the node needs nothing.
    if (mountedCards.has(node)) return true;

    if (!mountCard(node, live.block, null, LIVE_KEY)) return false;
    devLog("ConfigSync", "mounted the block that was just sent");
    return true;
  } catch (error) {
    devLog("ConfigSync", `live mount failed: ${error?.message || error}`);
    return false;
  }
}

/**
 * Does this message node show the text that was sent?
 *
 * Compares a short prefix of the whitespace-collapsed text: enough to tell two
 * turns apart, short enough to survive the client's own formatting.
 *
 * @param {Element} node
 * @param {string} text
 */
function nodeShowsText(node, text) {
  const probe = collapse(text).slice(0, LIVE_TEXT_PROBE);
  if (!probe) return false;
  return collapse(node.textContent || "").includes(probe);
}

function collapse(value) {
  return String(value || "")
    // Bidi marks are layout, not text: a right-to-left message that renders
    // with them would otherwise never match the string that was sent.
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Idempotent: called after every scan. Loads the history once per session,
 * mounts any card that is not on the page yet, and drops cards whose message
 * was removed.
 *
 * @param {number} [nodeCount] message count the scanner already knows about,
 *   used to decide whether a new turn might have brought a block with it.
 */
export function ensureConfigSyncCards(nodeCount = 0) {
  const id = getSessionIdFromUrl();
  if (!id) {
    if (sessionId !== null) resetCards();
    sessionId = null;
    return;
  }

  if (id !== sessionId) {
    resetCards();
    sessionId = id;
  }

  for (const node of [...mountedCards.keys()]) {
    if (!document.contains(node)) unmountCard(node);
  }

  // The block sent from this page comes first: the history cache only has it
  // after the next load, so waiting for the cache would leave the sender
  // looking at a message with no card until they refresh.
  mountLive(id);

  if (records.length) mountPending();
  if (loading) return;

  if (nodeCount !== lastNodeCount) {
    lastNodeCount = nodeCount;
    attempts = 0;
  }

  // Without a block yet, the cache may simply not be written: retry for a few
  // seconds. With a card already on screen, a shorter window is enough — the
  // user may have exported again into the same conversation.
  const maxAttempts = records.length ? 3 : MAX_ATTEMPTS_PER_COUNT;
  if (attempts >= maxAttempts) return;
  if (attempts > 0 && Date.now() - lastAttemptAt < RETRY_INTERVAL_MS) return;

  attempts += 1;
  lastAttemptAt = Date.now();
  loading = loadRecords(id)
    .catch((error) => {
      devLog("ConfigSync", `history read failed: ${error?.message || error}`);
    })
    .finally(() => {
      loading = null;
    });
}

/** Test seam: forget everything (session change, or between unit tests). */
export function resetConfigSyncCards() {
  resetCards();
  clearLiveBlock();
  sessionId = null;
  loading = null;
}
