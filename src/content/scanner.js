/**
 * DOM observation and page scanning.
 */

import state from "./state.js";
import { LONG_WORK_STALE_MS } from "../lib/constants.js";
import { processMessageNode } from "./message-processor.js";
import { enhanceCodeBlockDownloads } from "./files/code-blocks.js";

/**
 * Collect all message nodes from the chat DOM.
 */
export function collectMessageNodes() {
  const set = new Set();

  for (const node of document.querySelectorAll("div.ds-message._63c77b1")) {
    set.add(node);
  }

  if (!set.size) {
    for (const node of document.querySelectorAll("div.ds-message")) {
      set.add(node);
    }
  }

  return Array.from(set);
}

/**
 * Find the latest assistant message node.
 */
export function findLatestAssistantMessageNode() {
  const nodes = collectMessageNodes();
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const candidate = nodes[index];
    if (!candidate || candidate.closest("#bds-root")) {
      continue;
    }

    if (detectMessageRole(candidate) === "assistant") {
      return candidate;
    }
  }

  return null;
}

/**
 * Detect the role of a message DOM node.
 */
export function detectMessageRole(node) {
  if (node.classList && node.classList.contains("d29f3d7d")) {
    return "user";
  }

  if (node.closest("div._4f9bf79._43c05b5")) {
    return "assistant";
  }

  if (node.closest("div._9663006")) {
    return "user";
  }

  if (node.classList && node.classList.contains("ds-message")) {
    return "assistant";
  }

  const roleAttr = node.getAttribute("data-message-author-role");
  if (roleAttr) {
    return String(roleAttr).toLowerCase();
  }

  return "unknown";
}

/**
 * Check if a node is the latest assistant message.
 */
export function isLatestAssistantMessage(node) {
  return findLatestAssistantMessageNode() === node;
}

/**
 * Set up a MutationObserver on the document body.
 */
export function observeChatDom() {
  if (state.observer || !document.body) {
    return;
  }

  state.observer = new MutationObserver(() => {
    scheduleScan();
  });

  state.observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
  });
}

/**
 * Debounced page scan scheduler.
 */
export function scheduleScan() {
  if (state.scanTimer) {
    return;
  }

  state.scanTimer = window.setTimeout(() => {
    state.scanTimer = 0;
    scanPage();
  }, 140);
}

/**
 * Full page scan — process all message nodes.
 */
function scanPage() {
  enhanceCodeBlockDownloads();

  if (
    state.longWork.active &&
    Date.now() - state.longWork.lastActivityAt > LONG_WORK_STALE_MS
  ) {
    state.longWork.active = false;
    state.longWork.files.clear();
    if (state.ui) {
      state.ui.showLongWorkOverlay(false);
      state.ui.showToast("LONG_WORK timeout cleared.");
    }
  }

  const nodes = collectMessageNodes();
  for (const node of nodes) {
    processMessageNode(node);
  }
}

/**
 * Watch for URL changes (SPA navigation).
 */
export function startUrlWatcher() {
  if (state.urlWatchTimer) {
    return;
  }

  state.urlWatchTimer = window.setInterval(() => {
    if (location.href === state.lastUrl) {
      return;
    }

    state.lastUrl = location.href;
    state.longWork.active = false;
    state.longWork.files.clear();
    state.longWork.lastActivityAt = 0;
    if (state.ui) {
      state.ui.showLongWorkOverlay(false);
    }
    scheduleScan();
  }, 1000);
}
