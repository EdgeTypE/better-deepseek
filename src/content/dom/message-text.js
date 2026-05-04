/**
 * Extract raw text from a message DOM node using the best available source.
 */
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
  return selected;
}

function getNodeTextCandidates(node) {
  // Instead of innerText (which fails on detached clones), 
  // we'll filter out thinking blocks and then use textContent.

  const clone = node.cloneNode(true);

  // Remove Thinking blocks, UI elements, and code block banners
  const selectorsToRemove = [
    ".ds-think-content",
    "[class*=\"think\"]",
    "._5255ff8", // "Thought for X seconds"
    "._60aa7fb", // "Found X web pages"
    ".e4c3fd02", // "Read X pages" list
    "._74c0879", // Collapsible area title
    ".ds-icon",
    ".ds-icon-button",
    "div[role=\"button\"]",
    // Code block banners contain "Run Python", "Copy", "Download" button text
    ".md-code-block-banner",
    ".md-code-block-banner-wrap",
    "[class*=\"code-block-banner\"]",
    // BDS injected run buttons
    ".bds-run-btn"
  ];

  for (const selector of selectorsToRemove) {
    clone.querySelectorAll(selector).forEach(el => el.remove());
  }

  // INDENTATION FIX: Extract code from <pre><code> elements BEFORE text
  // extraction. DeepSeek renders markdown code fences as <pre><code> with
  // preserved whitespace, but when the surrounding BDS tags are treated as
  // unknown HTML elements, re-parsing or textContent can collapse whitespace.
  // By replacing each <pre> with a text node containing the verbatim code,
  // we guarantee indentation survives into the final extracted text.
  // INDENTATION & UI FIX: Replace the entire markdown code block container with its 
  // raw indented code text. DeepSeek's markdown renderer puts code in .md-code-block,
  // which contains a banner (with "Copy", "Download", etc.) and a <pre><code> block.
  // By replacing the whole .md-code-block with the text from <pre><code>, we:
  // 1. Preserve the whitespace perfectly.
  // 2. Completely eliminate the banner UI text from leaking into the extracted content.
  // 3. We re-wrap the code in ``` backticks so the parser can consistently unwrap it.
  const mdCodeBlocks = clone.querySelectorAll(".md-code-block");
  for (const block of mdCodeBlocks) {
    const codeEl = block.querySelector("pre code") || block.querySelector("pre");
    if (codeEl) {
      const codeText = codeEl.textContent || "";
      const textNode = clone.ownerDocument.createTextNode(`\n\`\`\`\n${codeText}\n\`\`\`\n`);
      block.replaceWith(textNode);
    }
  }

  // Catch any stray <pre> elements that aren't inside .md-code-block
  const strayPres = clone.querySelectorAll("pre");
  for (const pre of strayPres) {
    const codeEl = pre.querySelector("code");
    const codeText = (codeEl || pre).textContent || "";
    const textNode = clone.ownerDocument.createTextNode(`\n\`\`\`\n${codeText}\n\`\`\`\n`);
    pre.replaceWith(textNode);
  }

  // decodeNodeHtmlText already uses textContent internally but handles line breaks
  const htmlDecoded = decodeNodeHtmlText(clone.innerHTML || "");
  const textContent = String(clone.textContent || "");
  const markdownReconstructed = extractMessageMarkdown(clone);

  return [htmlDecoded, textContent, markdownReconstructed].filter(
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

  // Bonus points for structured markdown syntax to ensure markdownReconstructed wins
  // matches headings (# ), bullets (- , * , 1. ), and table pipes (|...|)
  const mdBonus = (text.match(/(?:^|\n)(?:#+ |\* |- |\d+\. |\|.*\|)/g) || []).length * 100;

  return tagCount * 10000 + mdBonus + lineBreakCount * 50 + text.length;
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

const HTML_TO_MARKDOWN_MAX_DEPTH_FLOOR = 10;
let HTML_TO_MARKDOWN_MAX_DEPTH = 200;

/**
 * Update the depth cap used by htmlToMarkdown. Called by the storage layer
 * on initial settings load and whenever the user saves a new value via the
 * Settings panel. Clamped to a sane floor.
 */
export function setHtmlToMarkdownMaxDepth(value) {
  const raw = Number(value);
  if (!Number.isFinite(raw) || raw <= 0) return;
  HTML_TO_MARKDOWN_MAX_DEPTH = Math.max(HTML_TO_MARKDOWN_MAX_DEPTH_FLOOR, Math.floor(raw));
}

function htmlToMarkdown(element, depth = 0) {
  // Hard depth cap so deeply-nested DOM (nested lists/blockquotes/KaTeX,
  // streamed long messages) cannot blow V8's stack. Falls back to plain text.
  if (depth > HTML_TO_MARKDOWN_MAX_DEPTH) {
    return element.textContent || "";
  }

  let markdown = "";

  for (const child of element.childNodes) {
    if (child.nodeType === 3) { // TEXT_NODE
      markdown += child.textContent;
    } else if (child.nodeType === 1) { // ELEMENT_NODE
      const tag = child.tagName.toLowerCase();
      const content = htmlToMarkdown(child, depth + 1);

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
        case "li":
          const isOrdered = child.parentElement?.tagName.toLowerCase() === "ol";
          const prefix = isOrdered ? "1. " : "- ";
          markdown += `\n${prefix}${content.trim()}`;
          break;
        case "blockquote": markdown += `\n> ${content.trim()}\n`; break;
        case "a": markdown += `[${content}](${child.getAttribute("href") || "#"})`; break;
        case "br": markdown += `\n`; break;
        case "table": markdown += `\n\n${content}\n`; break;
        case "thead":
        case "tbody":
          markdown += content;
          break;
        case "tr":
          markdown += `|${content}\n`;
          if (
            child.parentElement?.tagName.toLowerCase() === "thead" ||
            (child.parentElement?.tagName.toLowerCase() === "table" && child === child.parentElement.firstElementChild)
          ) {
            const cellCount = child.querySelectorAll("th, td").length;
            markdown += `|${Array(cellCount).fill("---").join("|")}|\n`;
          }
          break;
        case "th":
        case "td":
          markdown += ` ${content.trim().replace(/\n/g, " ")} |`;
          break;
        default: markdown += content;
      }
    }
  }

  // Clean up excessive newlines
  return markdown.replace(/\n{3,}/g, "\n\n");
}
