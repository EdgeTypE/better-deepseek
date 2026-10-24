/**
 * Which DOM selections may become "added context".
 *
 * Kept apart from the Svelte component so the gate can be tested against real
 * message markup without mounting the whole UI.
 */

import { detectMessageRole } from "../scanner.js";
import { normalizeQuoteText } from "../../lib/quote-context.js";

/**
 * Selections inside our own chrome or inside a text field must never open the
 * quote popup: the drawer, the settings panel and the composer all sit in the
 * same document.
 */
const EXCLUDED_ANCESTORS = [
  "#bds-root",
  "textarea",
  "input",
  "select",
  "[role='textbox']",
  "[contenteditable='true']",
  "[contenteditable='']",
  "[contenteditable='plaintext-only']",
].join(", ");

/**
 * True when the element is part of an assistant answer.
 * @param {Element | null | undefined} element
 */
export function isQuotableElement(element) {
  if (!element) return false;
  if (element.closest?.(EXCLUDED_ANCESTORS)) return false;

  const message = element.closest?.("div.ds-message");
  if (!message) return false;

  return detectMessageRole(message) === "assistant";
}

/**
 * Resolve a live selection into a quotable excerpt.
 * @param {Selection | null | undefined} selection
 * @returns {string | null} the normalized excerpt, or null when the selection
 *   is empty or does not belong to an answer.
 */
export function readQuotableSelection(selection) {
  if (!selection || selection.isCollapsed || !selection.rangeCount) return null;

  const anchor = selection.anchorNode;
  const element = anchor?.nodeType === Node.ELEMENT_NODE ? anchor : anchor?.parentElement;
  if (!isQuotableElement(element)) return null;

  return normalizeQuoteText(selection.toString()) || null;
}
