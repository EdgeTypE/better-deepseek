/**
 * Tag Hider — strips <tag> suffixes from sidebar titles.
 *
 * Called during every scanPage() cycle. Finds all chat title elements
 * in the sidebar and hides the <tag1> <tag2> portions so they are
 * invisible to the user while remaining in the actual title data.
 */

import state from "../state.js";
import {
  extractBaseTitle,
  discoverTags,
  extractSessionId,
  getCurrentSessionId,
} from "./tag-manager.js";

// Tag suffix pattern: one or more <word> at end of string
const TAG_SUFFIX_REGEX = /(\s+<[^<>]+>)+\s*$/;

/**
 * Process all visible sidebar titles and hide tag suffixes.
 * This is idempotent — safe to call repeatedly.
 */
export function hideTagsInSidebar() {
  const titleElements = document.querySelectorAll(".c08e6e93");

  for (const el of titleElements) {
    const fullText = el.textContent || "";

    // Discovery: if title has tags, ensure they are in our state
    const link = el.closest('a[href*="/chat/s/"]');
    if (link) {
      const sessionId = extractSessionId(link.href);
      if (sessionId) {
        discoverTags(sessionId, fullText);
      }
    }

    // Skip if no tags in the text
    if (!TAG_SUFFIX_REGEX.test(fullText)) {
      // If we previously stored a full title, check if the element was
      // re-rendered by React with the full title visible again
      const stored = el.getAttribute("data-bds-full-title");
      if (stored && TAG_SUFFIX_REGEX.test(stored) && fullText === stored) {
        // React re-rendered with full title, need to strip again
        el.textContent = extractBaseTitle(stored);
      }
      continue;
    }

    // Store the full title for later retrieval
    el.setAttribute("data-bds-full-title", fullText);

    // Replace visible text with base title only
    const baseTitle = extractBaseTitle(fullText);
    el.textContent = baseTitle;
  }
}

/**
 * Also hide tags from the main chat header area (the title shown
 * at the top of the current conversation).
 */
export function hideTagsInHeader() {
  // DeepSeek's chat header title — may use a different selector
  const headerTitle = document.querySelector("._7436101");
  if (!headerTitle) return;

  const text = headerTitle.textContent || "";

  // Discovery for header title
  const sessionId = getCurrentSessionId();
  if (sessionId) {
    discoverTags(sessionId, text);
  }

  if (!TAG_SUFFIX_REGEX.test(text)) return;

  headerTitle.setAttribute("data-bds-full-title", text);
  headerTitle.textContent = extractBaseTitle(text);
}

/**
 * Clean <BetterDeepSeek> and <BDS:...> tags from strings (handles raw and HTML-encoded forms).
 */
export function cleanBdsString(text) {
  if (!text) return "";
  let s = String(text);

  // 1. Full/Closed <BetterDeepSeek>...</BetterDeepSeek> or <BDS:...>...</BDS:...>
  s = s.replace(/(?:<|&lt;)BetterDeepSeek(?:>|&gt;)[\s\S]*?(?:<|&lt;)\/BetterDeepSeek(?:>|&gt;)/gi, "");
  s = s.replace(/(?:<|&lt;)BDS:([A-Za-z0-9_:]+)[^>&]*?(?:>|&gt;)[\s\S]*?(?:<|&lt;)\/BDS:\1(?:>|&gt;)/gi, "");

  // 2. Unclosed <BetterDeepSeek>... or <BDS:...>... (e.g. truncated preview strings)
  s = s.replace(/(?:<|&lt;)BetterDeepSeek(?:>|&gt;)[\s\S]*/gi, "");
  s = s.replace(/(?:<|&lt;)BDS:[A-Za-z0-9_:]+[^>&]*?(?:>|&gt;)[\s\S]*/gi, "");

  // 3. Any stray closing or opening tags
  s = s.replace(/(?:<|&lt;)\/?BetterDeepSeek(?:>|&gt;)/gi, "");
  s = s.replace(/(?:<|&lt;)\/?BDS:[A-Za-z0-9_:]+[^>&]*?(?:>|&gt;)/gi, "");

  return s.trim();
}

/**
 * Scan DOM for popovers, virtual lists, version history items, and message summaries,
 * stripping <BetterDeepSeek> and <BDS:...> tags so they are invisible to users.
 */
export function hideBdsTagsInPopovers() {
  const candidates = document.querySelectorAll(
    '._72b6158, .ds-virtual-list-visible-items div, .ds-popover div, .ds-dropdown div, [class*="version"], [class*="branch"], [class*="history"], [class*="summary"]'
  );

  for (const el of candidates) {
    if (el.closest("#bds-root")) continue;
    if (el.classList?.contains("ds-markdown") || el.classList?.contains("fbb737a4")) continue;
    if (el.children && el.children.length > 0) continue;

    const text = el.textContent || "";
    if (!/BetterDeepSeek|BDS:/i.test(text)) continue;

    const stored = el.getAttribute("data-bds-clean-text");
    if (stored === text) continue;

    const cleaned = cleanBdsString(text);

    el.setAttribute("data-bds-clean-text", cleaned);
    el.textContent = cleaned;
  }
}

