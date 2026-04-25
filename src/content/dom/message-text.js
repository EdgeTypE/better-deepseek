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

/**
 * Extract code directly from a <pre><code> DOM element inside a message node.
 * This bypasses all text extraction and markdown mangling, giving us the
 * verbatim code content with perfect indentation.
 *
 * DeepSeek's markdown renderer converts ```python...``` into a
 * <pre><code class="language-python"> element. Inside this element,
 * ALL whitespace is preserved exactly as the AI wrote it.
 * This is immune to:
 *  - Indentation stripping (markdown code block syntax)
 *  - __name__ → <strong>name</strong> (markdown bold)
 *  - Copy/Download button text contamination
 */
export function extractCodeFromDomNode(node) {
  if (!node) return "";

  // Prefer a language-tagged code block (from a fenced ```python block)
  const langCode = node.querySelector(
    'pre code[class*="language-python"], pre code[class*="language-py"]'
  );
  if (langCode) {
    return langCode.textContent || "";
  }

  // Fall back to any <pre><code> block that looks substantial
  const allCodeBlocks = node.querySelectorAll("pre code");
  let best = "";
  for (const el of allCodeBlocks) {
    const text = el.textContent || "";
    if (text.trim().length > best.length) {
      best = text;
    }
  }

  return best;
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
  
  // Remove Thinking blocks and other non-content UI elements
  const selectorsToRemove = [
    ".ds-think-content",
    "[class*=\"think\"]",
    "._5255ff8", // "Thought for X seconds"
    "._60aa7fb", // "Found X web pages"
    ".e4c3fd02", // "Read X pages" list
    "._74c0879", // Collapsible area title
    ".ds-icon",
    ".ds-icon-button",
    "div[role=\"button\"]"
  ];

  for (const selector of selectorsToRemove) {
    clone.querySelectorAll(selector).forEach(el => el.remove());
  }

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

  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlWithBreaks, "text/html");
  return String(doc.body.textContent || "");
}

function scoreRawTextCandidate(value) {
  const text = String(value || "");
  const lineBreakCount = (text.match(/\n/g) || []).length;
  const tagCount = (text.match(/<BDS:|<BetterDeepSeek>/gi) || []).length;
  return tagCount * 10000 + lineBreakCount * 100 + text.length;
}

/**
 * Reconstruct markdown from a rendered message node.
 * This is used for exporting when the original markdown source is not available.
 */
export function extractMessageMarkdown(node) {
  if (!node) return "";
  
  const clone = node.cloneNode(true);
  
  // Remove noise first
  const noiseSelectors = [
    ".ds-think-content",
    "[class*=\"think\"]",
    "._5255ff8",
    "._60aa7fb",
    ".e4c3fd02",
    "._74c0879",
    ".ds-icon",
    ".ds-icon-button",
    "div[role=\"button\"]"
  ];
  for (const s of noiseSelectors) {
    clone.querySelectorAll(s).forEach(el => el.remove());
  }

  // Find the markdown container
  const container = clone.querySelector(".ds-markdown") || clone;
  return htmlToMarkdown(container).trim();
}

function htmlToMarkdown(element) {
  let markdown = "";
  
  for (const child of element.childNodes) {
    if (child.nodeType === 3) { // TEXT_NODE
      markdown += child.textContent;
    } else if (child.nodeType === 1) { // ELEMENT_NODE
      const tag = child.tagName.toLowerCase();
      const content = htmlToMarkdown(child);
      
      switch (tag) {
        case "h1": markdown += `\n# ${content}\n`; break;
        case "h2": markdown += `\n## ${content}\n`; break;
        case "h3": markdown += `\n### ${content}\n`; break;
        case "h4": markdown += `\n#### ${content}\n`; break;
        case "h5": markdown += `\n##### ${content}\n`; break;
        case "h6": markdown += `\n###### ${content}\n`; break;
        case "strong": case "b": markdown += `**${content}**`; break;
        case "em": case "i": markdown += `*${content}*`; break;
        case "code": 
          // If it's inside a pre, we handle it in the pre case
          if (child.parentElement?.tagName.toLowerCase() === "pre") {
            markdown += content;
          } else {
            markdown += `\`${content}\``;
          }
          break;
        case "pre": 
          const lang = child.querySelector("code")?.className?.match(/language-(\w+)/)?.[1] || "";
          markdown += `\n\`\`\`${lang}\n${child.textContent.trim()}\n\`\`\`\n`; 
          break;
        case "p": markdown += `\n${content}\n`; break;
        case "ul": markdown += `\n${content}\n`; break;
        case "ol": markdown += `\n${content}\n`; break;
        case "li": markdown += `\n- ${content}`; break;
        case "blockquote": markdown += `\n> ${content.trim()}\n`; break;
        case "a": markdown += `[${content}](${child.getAttribute("href") || "#"})`; break;
        case "br": markdown += `\n`; break;
        default: markdown += content;
      }
    }
  }
  
  // Clean up excessive newlines
  return markdown.replace(/\n{3,}/g, "\n\n");
}
