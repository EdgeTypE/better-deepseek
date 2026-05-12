/**
 * Tag Manager — CRUD operations for chat session tags.
 *
 * Tags are stored in chrome.storage.local and synced to DeepSeek's
 * title via the update_title API. No tokens are stored — the content
 * script's fetch sends page cookies automatically via host_permissions.
 */

import state from "../state.js";
import { STORAGE_KEYS } from "../../lib/constants.js";

// ── Tag pattern in titles ──
// Tags are appended as: "Base Title <tag1> <tag2>"
const TAG_SUFFIX_REGEX = /(\s+<[^<>]+>)+\s*$/;
const SINGLE_TAG_REGEX = /<([^<>]+)>/g;

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

  if (cleaned.length === 0) {
    delete state.chatTags[sessionId];
  } else {
    state.chatTags[sessionId] = cleaned;
  }

  await persistTags();
  await syncTitleWithTags(sessionId);
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
 * Read the current title from the sidebar DOM, strip old tags,
 * append current tags, and push to DeepSeek's API.
 */
export async function syncTitleWithTags(sessionId) {
  const tags = getTags(sessionId);

  // Try to get the current title from sidebar DOM
  const currentTitle = getTitleFromSidebar(sessionId) || getTitleFromState(sessionId);
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
    updateTitleInSidebar(sessionId, newTitle);
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

  // The title element uses class .c08e6e93
  const titleEl = item.querySelector(".c08e6e93");
  if (!titleEl) return null;

  // Read the original title from data attribute if we've stored it,
  // otherwise read from textContent
  return titleEl.getAttribute("data-bds-full-title") || titleEl.textContent;
}

/**
 * Try to get title from the cached session state.
 */
function getTitleFromState(sessionId) {
  const session = state.chatSessions.find((s) => s.id === sessionId);
  return session ? session.title : null;
}

/**
 * Update the title text in the sidebar DOM after an API sync.
 */
function updateTitleInSidebar(sessionId, newTitle) {
  const item = findSidebarItem(sessionId);
  if (!item) return;

  const titleEl = item.querySelector(".c08e6e93");
  if (!titleEl) return;

  titleEl.setAttribute("data-bds-full-title", newTitle);
  // The tag-hider will strip tags from display on next scan
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
 */
export async function discoverTags(sessionId, fullTitle) {
  if (!sessionId || !fullTitle) return;

  const tagsFromTitle = extractTagsFromTitle(fullTitle);
  if (tagsFromTitle.length === 0) return;

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
