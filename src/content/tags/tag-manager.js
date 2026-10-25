/**
 * Tag Manager — CRUD operations for chat session tags.
 *
 * Tags are stored in chrome.storage.local and mirrored into DeepSeek's title
 * by driving the native rename UI (no tokens are stored, no API shape is
 * assumed). The sidebar keeps the authoritative title in
 * `data-bds-full-title`; `discoverTags` seeds state from titles found on the
 * server, and must never undo a local write — see #213.
 */

import state from "../state.js";
import { STORAGE_KEYS } from "../../lib/constants.js";
import { safeSetTextContent, safeSetAttribute, safeRemoveAttribute } from "../dom/dom-safety.js";

// ── Tag pattern in titles ──
// Tags are appended as: "Base Title <tag1> <tag2>"
const TAG_SUFFIX_REGEX = /(\s+<[^<>]+>)+\s*$/;
const SINGLE_TAG_REGEX = /<([^<>]+)>/g;

const TITLE_SELECTOR = ".c08e6e93";
const FULL_TITLE_ATTR = "data-bds-full-title";

// ── Discovery guards (#213) ──
// `discoverTags` writes into the same store the UI reads, so it must never be
// able to undo a local write. Two guards:
//   pendingWrites   — a setTags() is in flight for this session; the sidebar
//                     still shows the pre-write title, ignore it entirely.
//   lastAppliedTitle— reconcile a given title string only once. The scan runs
//                     on every pass and re-reads the same stale title, which
//                     would otherwise resurrect a just-removed tag forever.
const pendingWrites = new Set();
const lastAppliedTitle = new Map();

// ── Read ──

export function getTags(sessionId) {
  return state.chatTags[sessionId] || [];
}

export function getAllTagsMap() {
  return { ...state.chatTags };
}

/**
 * Return all unique tag names across all sessions (for autocomplete).
 */
export function getUniqueTags() {
  const set = new Set();
  for (const tags of Object.values(state.chatTags)) {
    for (const tag of tags) {
      set.add(tag);
    }
  }
  return Array.from(set).sort();
}

// ── Write ──

export async function setTags(sessionId, tags) {
  const cleaned = tags
    .map((t) => String(t || "").trim())
    .filter((t) => t.length > 0);

  // Snapshot what the sidebar currently shows *before* touching the cache —
  // that is still the title on the server, and it is what we compare against.
  const previousTitle = getTitleFromSidebar(sessionId) || getTitleFromState(sessionId);

  if (cleaned.length === 0) {
    delete state.chatTags[sessionId];
  } else {
    state.chatTags[sessionId] = cleaned;
  }

  pendingWrites.add(sessionId);
  try {
    // Rewrite the title cache synchronously, before any await. The page-wide
    // scan reads `data-bds-full-title` on every pass; while the rename is in
    // flight that cache still carries the removed tags, and `discoverTags`
    // would write them straight back into state — and storage. See #213.
    if (previousTitle) {
      writeTitleCache(sessionId, buildFullTitle(extractBaseTitle(previousTitle), cleaned));
    }

    await persistTags();
    await syncTitleWithTags(sessionId, previousTitle);
  } finally {
    pendingWrites.delete(sessionId);
  }
}

export async function addTag(sessionId, tagName) {
  const tag = String(tagName || "").trim();
  if (!tag) return;

  const current = getTags(sessionId);
  if (current.includes(tag)) return;

  await setTags(sessionId, [...current, tag]);
}

export async function removeTag(sessionId, tagName) {
  const current = getTags(sessionId);
  await setTags(sessionId, current.filter((t) => t !== tagName));
}

// ── Title helpers ──

/**
 * Strip tag suffixes from a full title to get the base title.
 * "Greeting and readiness <RP> <günlük>" → "Greeting and readiness"
 */
export function extractBaseTitle(fullTitle) {
  return String(fullTitle || "").replace(TAG_SUFFIX_REGEX, "").trim();
}

/**
 * Parse tags from a full title string.
 * "Greeting and readiness <RP> <günlük>" → ["RP", "günlük"]
 */
export function extractTagsFromTitle(fullTitle) {
  const suffix = String(fullTitle || "").match(TAG_SUFFIX_REGEX);
  if (!suffix) return [];

  const tags = [];
  let m;
  while ((m = SINGLE_TAG_REGEX.exec(suffix[0])) !== null) {
    tags.push(m[1].trim());
  }
  return tags;
}

/**
 * Build a full title from base title and tags.
 * ("Greeting", ["RP", "günlük"]) → "Greeting <RP> <günlük>"
 */
export function buildFullTitle(baseTitle, tags) {
  const base = String(baseTitle || "").trim();
  if (!tags || tags.length === 0) return base;
  return base + " " + tags.map((t) => `<${t}>`).join(" ");
}

// ── Title sync ──

/**
 * Read the current title from the sidebar DOM, strip old tags, append current
 * tags, and mirror the result into DeepSeek's title via the native rename UI.
 *
 * @param {string} sessionId
 * @param {string} [knownTitle] Title to treat as the server's current title.
 *   Callers that already snapshotted it (see `setTags`) must pass it: by the
 *   time we get here the DOM cache has been rewritten to the *target* title,
 *   so re-reading it would make the rename look like a no-op.
 */
export async function syncTitleWithTags(sessionId, knownTitle) {
  const tags = getTags(sessionId);

  // Try to get the current title from sidebar DOM
  const currentTitle = knownTitle || getTitleFromSidebar(sessionId) || getTitleFromState(sessionId);
  if (!currentTitle) {
    console.warn("[BDS Tags] Cannot find title for session", sessionId);
    return;
  }

  const baseTitle = extractBaseTitle(currentTitle);
  const newTitle = buildFullTitle(baseTitle, tags);

  // Only call API if title actually changed
  if (newTitle === currentTitle) return;

  try {
    await updateSessionTitle(sessionId, newTitle);
    // Update the sidebar DOM immediately
    writeTitleCache(sessionId, newTitle);
  } catch (err) {
    console.error("[BDS Tags] Failed to sync title:", err);
  }
}

// ── DeepSeek API ──

/**
 * Update the session title by automating the native DeepSeek UI.
 * This avoids any need for auth tokens or background API calls.
 */
async function updateSessionTitle(sessionId, newTitle) {
  const item = findSidebarItem(sessionId);
  if (!item) throw new Error("Sidebar item not found");

  // 1. Open the three-dot menu
  const menuBtn = item.querySelector('._2090548');
  if (!menuBtn) throw new Error("Menu button not found");
  menuBtn.click();

  // 2. Wait for dropdown and find "Rename"
  await new Promise(r => setTimeout(r, 100));
  const renameOption = Array.from(document.querySelectorAll('.ds-dropdown-menu-option'))
    .find(el => el.textContent.toLowerCase().includes('rename'));
  
  if (!renameOption) {
    // If not found, menu might not have opened. Try clicking body to close and retry?
    // For now, just throw.
    throw new Error("Rename option not found in menu");
  }
  renameOption.click();

  // 3. Wait for input to appear
  await new Promise(r => setTimeout(r, 150));
  const input = document.querySelector('input.ds-input__input');
  if (!input) throw new Error("Rename input field not found");

  // 4. Set the value using React-safe method
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  nativeInputValueSetter.call(input, newTitle);
  input.dispatchEvent(new Event('input', { bubbles: true }));

  // 5. Submit with Enter key
  input.dispatchEvent(new KeyboardEvent('keydown', { 
    key: 'Enter', 
    code: 'Enter', 
    keyCode: 13, 
    which: 13, 
    bubbles: true 
  }));

  return true;
}

// ── Sidebar DOM helpers ──

/**
 * Extract session ID from a chat URL.
 */
export function extractSessionId(url) {
  const match = String(url || "").match(/\/chat\/s\/([a-f0-9-]+)/);
  return match ? match[1] : null;
}

/**
 * Get the current session ID from the page URL.
 */
export function getCurrentSessionId() {
  return extractSessionId(location.href);
}

/**
 * Find the sidebar <a> element for a given session.
 */
function findSidebarItem(sessionId) {
  const links = document.querySelectorAll('a[href*="/chat/s/"]');
  for (const link of links) {
    if (link.href.includes(sessionId)) {
      return link;
    }
  }
  return null;
}

/**
 * Read the title text from the sidebar DOM for a session.
 */
function getTitleFromSidebar(sessionId) {
  const item = findSidebarItem(sessionId);
  if (!item) return null;

  const titleEl = item.querySelector(TITLE_SELECTOR);
  if (!titleEl) return null;

  // Read the original title from data attribute if we've stored it,
  // otherwise read from textContent
  return titleEl.getAttribute(FULL_TITLE_ATTR) || titleEl.textContent;
}

/**
 * Try to get title from the cached session state.
 */
function getTitleFromState(sessionId) {
  const session = state.chatSessions.find((s) => s.id === sessionId);
  return session ? session.title : null;
}

/**
 * Write the authoritative title into the sidebar DOM: the tag-free text the
 * user sees plus the full title in `data-bds-full-title` for later reads.
 * Called both before a rename (to kill the stale cache) and after it lands.
 *
 * @returns {boolean} false when the sidebar item is not rendered.
 */
function writeTitleCache(sessionId, fullTitle) {
  const item = findSidebarItem(sessionId);
  if (!item) return false;

  const titleEl = item.querySelector(TITLE_SELECTOR);
  if (!titleEl) return false;

  const baseTitle = extractBaseTitle(fullTitle);
  if (baseTitle === fullTitle) {
    safeRemoveAttribute(titleEl, FULL_TITLE_ATTR);
  } else {
    safeSetAttribute(titleEl, FULL_TITLE_ATTR, fullTitle);
  }

  // The tag-hider would do this on its next pass; doing it now keeps the DOM
  // consistent with the cache we just wrote.
  if (titleEl.textContent !== baseTitle) {
    safeSetTextContent(titleEl, baseTitle);
  }

  return true;
}

// ── Persistence ──

async function persistTags() {
  await chrome.storage.local.set({
    [STORAGE_KEYS.chatTags]: state.chatTags,
  });
}
// ── Discovery ──

/**
 * Extract tags from a title string and update local state if they are missing.
 * This is used to "discover" tags that were added on other devices or before
 * the extension's local storage was populated.
 *
 * It does NOT call syncTitleWithTags to avoid redundant API calls.
 *
 * Discovery is deliberately edge-triggered and never overrides a local write
 * in flight — otherwise the stale sidebar title undoes tag removal. See #213.
 */
export async function discoverTags(sessionId, fullTitle) {
  if (!sessionId || !fullTitle) return;

  // A local write owns this session until it settles.
  if (pendingWrites.has(sessionId)) return;

  const tagsFromTitle = extractTagsFromTitle(fullTitle);
  if (tagsFromTitle.length === 0) return;

  // Reconcile each distinct title only once. The scan re-reads the same title
  // on every pass, and until the rename lands it still carries the old tags.
  if (lastAppliedTitle.get(sessionId) === fullTitle) return;
  lastAppliedTitle.set(sessionId, fullTitle);

  const currentTags = getTags(sessionId);

  // Check if they are already the same to avoid redundant storage writes
  if (
    currentTags.length === tagsFromTitle.length &&
    currentTags.every((t, i) => t === tagsFromTitle[i])
  ) {
    return;
  }

  // They differ, update state locally
  state.chatTags[sessionId] = tagsFromTitle;

  // Persist to storage
  await persistTags();

  // If search is active, we might need to refresh the tag chips
  // (SidebarSearch will usually pick this up via storage listener anyway)
}
