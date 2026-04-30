/**
 * DOM observation and page scanning.
 */

import state from "./state.js";
import { LONG_WORK_STALE_MS } from "../lib/constants.js";
import { processMessageNode } from "./message-processor.svelte.js";
import { enhanceCodeBlockDownloads } from "./files/code-blocks.js";
import { mount } from "svelte";
import AttachMenu from "./ui/AttachMenu.svelte";
import { checkPendingExport } from "./tools/pending-export.js";

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
 * Check if a node is the absolute last message in the entire chat.
 */
export function isAbsoluteLastMessage(node) {
  const nodes = collectMessageNodes();
  return nodes[nodes.length - 1] === node;
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

  linkifyLogo();
  linkifyNewChatButton();
  scanInputArea();
}

/**
 * Scan for the chat text input area to inject custom attachment menu
 */
function scanInputArea() {
  const fileInput = document.querySelector('input[type="file"][multiple]');
  if (!fileInput) return;

  const wrapper = fileInput.parentElement;
  if (!wrapper || wrapper.hasAttribute("data-bds-attach-menu-mounted")) {
    return;
  }

  const prevSibling = fileInput.previousElementSibling;
  let nativeButton = null;
  if (prevSibling && prevSibling.getAttribute("role") === "button") {
    nativeButton = prevSibling;
  } else {
    nativeButton = wrapper.querySelector('div[role="button"][tabindex="0"]');
  }

  if (nativeButton) {
    nativeButton.style.setProperty("display", "none", "important");
  }

  const mountPoint = document.createElement("div");
  wrapper.insertBefore(mountPoint, fileInput);

  mount(AttachMenu, {
    target: mountPoint,
    props: {
      nativeInput: fileInput
    }
  });

  wrapper.setAttribute("data-bds-attach-menu-mounted", "true");
}

/**
 * Transforms the logo div into a real <a> tag to support "Open in new tab".
 */
function linkifyLogo() {
  // Look for the DeepSeek logo SVG
  const logoSvg = document.querySelector('svg[viewBox="0 0 143 23"]');
  if (!logoSvg) return;

  // The clickable container is usually a few levels up
  // Based on user snippet: svg -> div (logo container) -> div (outer container)
  const container = logoSvg.closest('div');
  if (!container || container.tagName === 'A' || container.parentElement?.tagName === 'A') {
    return;
  }

  // Find the highest div that is still part of the "logo" area before hitting the nav/header
  // In the snippet, _262baab seems like the main clickable block.
  let target = container;
  if (target.parentElement && target.parentElement.classList.contains('_262baab')) {
     target = target.parentElement;
  }

  if (target.tagName === 'A') return;

  // Wrap it in an anchor
  const link = document.createElement('a');
  link.href = '/';
  link.className = 'bds-logo-link';
  
  link.addEventListener('click', (e) => {
    if (e.button === 0 && !e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
    }
  });

  // Copy some essential layout classes if needed, but mostly we want to wrap it
  target.parentNode.insertBefore(link, target);
  link.appendChild(target);
  
  // Prevent the link from being processed multiple times
  link.setAttribute('data-bds-linkified', 'true');
}

/**
 * Transforms the "New Chat" div button into a real <a> tag.
 */
function linkifyNewChatButton() {
  // Look for the "Yeni sohbet" or "New chat" text
  // Since text might change with language, we use the SVG path or class if observed.
  // The SVG path provided by the user is quite unique: starts with M8 0.599609
  const allSvgs = document.querySelectorAll('svg');
  let newChatSvg = null;
  for (const svg of allSvgs) {
    if (svg.querySelector('path[d*="M8 0.599609"]')) {
      newChatSvg = svg;
      break;
    }
  }

  if (!newChatSvg) return;

  const container = newChatSvg.closest('div[tabindex="0"]');
  if (!container || container.tagName === 'A' || container.parentElement?.tagName === 'A') {
    return;
  }

  if (container.hasAttribute('data-bds-linkified')) return;

  // Wrap it in an anchor
  const link = document.createElement('a');
  link.href = '/';
  link.className = 'bds-logo-link'; // Reuse the same CSS for pass-through styling
  link.setAttribute('data-bds-linkified', 'true');
  
  link.addEventListener('click', (e) => {
    if (e.button === 0 && !e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
    }
  });
  
  container.parentNode.insertBefore(link, container);
  link.appendChild(container);
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
    window.dispatchEvent(new CustomEvent("bds:urlChanged"));

    state.longWork.active = false;
    state.longWork.files.clear();
    state.longWork.lastActivityAt = 0;
    if (state.ui) {
      state.ui.showLongWorkOverlay(false);
    }
    scheduleScan();
    checkPendingExport();
  }, 1000);

  // Focus/Visibility triggers to handle background-to-foreground transitions
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      scheduleScan();
    }
  });

  window.addEventListener("focus", () => {
    scheduleScan();
  });
}

