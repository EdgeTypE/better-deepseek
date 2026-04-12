/**
 * Sanitized display — hide original message, show clean text.
 */

import { getOrCreateHost } from "./host.js";

/**
 * Apply sanitized display: hide the original message node and show clean text.
 */
export function applySanitizedDisplay(node, visibleText, role) {
  if (role !== "assistant") {
    return;
  }

  const text = String(visibleText || "").trim();

  const host = getOrCreateHost(node, "bds-sanitized-host");
  host.textContent = text;
  node.dataset.bdsHiddenByTags = "1";
  node.style.display = "none";

  node.dataset.bdsSanitizedText = text;
}

/**
 * Restore original message display (undo sanitized display).
 */
export function restoreSanitizedDisplay(node) {
  delete node.dataset.bdsHiddenByTags;
  delete node.dataset.bdsSanitizedText;

  if (node.dataset.bdsHidden !== "1") {
    node.style.display = "";
  }

  const wrapper = node.nextElementSibling;
  if (
    !wrapper ||
    !wrapper.classList ||
    !wrapper.classList.contains("bds-host-wrapper")
  ) {
    return;
  }

  const sanitizedHost = wrapper.querySelector(".bds-sanitized-host");
  if (sanitizedHost) {
    sanitizedHost.remove();
  }

  if (!wrapper.children.length) {
    wrapper.remove();
  }
}
