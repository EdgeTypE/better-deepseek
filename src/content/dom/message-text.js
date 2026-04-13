/**
 * Extract raw text from a message DOM node using the best available source.
 */

import { stripMarkdownViewerControls } from "../parser/tag-parser.js";

/**
 * Extract the raw text from a message node, choosing the best source.
 */
export function extractMessageRawText(node) {
  return parseNodeWithBestTextSource(node);
}

function parseNodeWithBestTextSource(node) {
  const candidates = getNodeTextCandidates(node);
  if (!candidates.length) {
    return "";
  }

  const tagCandidates = candidates.filter((value) =>
    /<BDS:|<BetterDeepSeek>/i.test(value)
  );
  const pool = tagCandidates.length ? tagCandidates : candidates;

  const selected =
    pool.sort(
      (a, b) => scoreRawTextCandidate(b) - scoreRawTextCandidate(a)
    )[0] || "";
  return stripMarkdownViewerControls(selected);
}

function getNodeTextCandidates(node) {
  // Instead of innerText (which fails on detached clones), 
  // we'll filter out thinking blocks and then use textContent.
  
  const clone = node.cloneNode(true);
  
  // Remove Thinking blocks from the clone to exclude them from text extraction
  const thinkingElements = clone.querySelectorAll('.ds-think-content, [class*="think"]');
  thinkingElements.forEach(el => el.remove());

  // decodeNodeHtmlText already uses textContent internally but handles line breaks
  const htmlDecoded = decodeNodeHtmlText(clone.innerHTML || "");
  const textContent = String(clone.textContent || "");

  return [htmlDecoded, textContent].filter(
    (value) => value && value.trim()
  );
}

function decodeNodeHtmlText(html) {
  const htmlWithBreaks = String(html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|pre|code|blockquote|h[1-6])>/gi, "\n");

  const container = document.createElement("div");
  container.innerHTML = htmlWithBreaks;
  return String(container.textContent || "");
}

function scoreRawTextCandidate(value) {
  const text = String(value || "");
  const lineBreakCount = (text.match(/\n/g) || []).length;
  const tagCount = (text.match(/<BDS:|<BetterDeepSeek>/gi) || []).length;
  return tagCount * 10000 + lineBreakCount * 100 + text.length;
}
