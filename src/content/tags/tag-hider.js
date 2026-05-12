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
