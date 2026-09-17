import { isAutoLinkArtifact } from "../parser/link-artifacts.js";
import { scanBdsTagOpenings } from "../parser/tag-parser.js";

/**
 * Selectors for elements that are already-rendered rich output rather than
 * markdown source. Flattening them to text corrupts the message:
 *
 *  - KaTeX renders every formula three times over — the MathML token text, the
 *    LaTeX source inside <annotation>, and the visual glyphs in .katex-html.
 *    Serializing the subtree as text therefore yields
 *    `a2+b2=c2a^2 + b^2 = c^2a2+b2=c2`.
 *  - Mermaid's viewer injects a <style> into its SVG; walking into the SVG
 *    dumps those CSS rules into the message body as literal prose.
 *
 * See issues #169 and #170.
 */
const RICH_HTML_SELECTOR = [
  ".katex-display",
  ".katex",
  ".mermaid",
  'svg[id^="mermaid-svg-"]',
].join(", ");

/** Mermaid-only subset of RICH_HTML_SELECTOR, used by the text flattening pass. */
const MERMAID_SELECTOR = '.mermaid, svg[id^="mermaid-svg-"]';

/** Elements that never carry user-visible message content. */
const NON_CONTENT_SELECTOR = "style, script, link, meta, noscript, template";
const NON_CONTENT_TAGS = new Set([
  "style",
  "script",
  "link",
  "meta",
  "noscript",
  "template",
]);

function isKatexElement(el) {
  const cls = el.classList;
  return Boolean(cls && (cls.contains("katex") || cls.contains("katex-display")));
}

function isMermaidSvg(el) {
  return (
    String(el.tagName || "").toLowerCase() === "svg" &&
    String(el.id || "").startsWith("mermaid-svg-")
  );
}

/** Is this <pre> the ```mermaid source of a diagram that was rendered in place? */
function isMermaidSourceFence(pre) {
  const code = pre.querySelector("code");
  return Boolean(code && /language-mermaid\b/.test(code.className || ""));
}

/**
 * Is this element already-rendered rich output that must not be flattened?
 * @param {Element} el
 */
function isRichHtmlElement(el) {
  if (!el || el.nodeType !== 1) return false;
  if (isKatexElement(el)) return true;
  if (el.classList && el.classList.contains("mermaid")) return true;
  return isMermaidSvg(el);
}

/**
 * Recover the LaTeX source of a KaTeX subtree. KaTeX always emits the original
 * source in <annotation encoding="application/x-tex">.
 */
function extractKatexSource(el) {
  const annotation = el.querySelector('annotation[encoding="application/x-tex"]');
  return annotation ? String(annotation.textContent || "").trim() : "";
}

/** Render a KaTeX subtree as markdown text (no markup). */
function katexToMarkdown(el) {
  const tex = extractKatexSource(el);
  if (tex) {
    return el.classList.contains("katex-display") ? `\n$$${tex}$$\n` : `$${tex}$`;
  }

  // No LaTeX source to recover: emit the MathML token text as plain text rather
  // than wrapping a garbled formula in math delimiters.
  const math = el.querySelector("math");
  return math ? String(math.textContent || "").trim() : "";
}

/** Marker kept so a diagram-only message is not dropped as empty content. */
const MERMAID_PLACEHOLDER = "<!-- mermaid diagram -->";

/**
 * Render a rich element as faithful markdown text (no markup).
 * Used by the plain/export path and by the text-based candidates.
 */
function richElementToMarkdown(el) {
  if (isKatexElement(el)) return katexToMarkdown(el);

  // A rendered mermaid diagram cannot be rebuilt from its SVG. When the renderer
  // kept the ```mermaid source beside the SVG, the normal <pre> handling emits
  // it — emitting a fence here as well produced the block twice. Only fall back
  // to a marker when there is no source to recover, so that a message whose
  // entire body is a diagram is not treated as empty by the exporters.
  const hasSource = Boolean(
    el.closest?.(".md-code-block")?.querySelector("pre code"),
  );
  return hasSource ? "" : MERMAID_PLACEHOLDER;
}

/**
 * Collapse already-rendered rich output into a single textual form so that the
 * text-based candidates (textContent / htmlDecoded) cannot triple a formula or
 * leak a stylesheet. Mutates the passed clone.
 */
function flattenRichContentForText(root) {
  const doc = root.ownerDocument;
  root.querySelectorAll(NON_CONTENT_SELECTOR).forEach((el) => el.remove());

  // Innermost-first is unnecessary: replacing an ancestor detaches its
  // descendants, and detached nodes are skipped by the parentNode guard below.
  root.querySelectorAll(".katex-display, .katex").forEach((el) => {
    if (!el.parentNode) return;
    el.replaceWith(doc.createTextNode(katexToMarkdown(el)));
  });

  root.querySelectorAll(MERMAID_SELECTOR).forEach((el) => {
    if (!el.parentNode) return;
    const container = isMermaidSvg(el) ? el.closest?.(".mermaid") || el : el;
    // Unrendered mermaid blocks still hold their source as text — keep it.
    const rendered = isMermaidSvg(container) || Boolean(container.querySelector("svg"));
    if (!rendered) return;
    container.remove();
  });
}

/** Strip chrome (thinking blocks, buttons, banners) from a message clone. */
function stripMessageNoise(root) {
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
    // BDS injected elements inside node
    ".bds-host-wrapper",
    ".bds-selection-checkbox-container",
    ".bds-bookmark-btn",
    ".bds-price-bubble",
    ".bds-run-btn"
  ];

  for (const selector of selectorsToRemove) {
    root.querySelectorAll(selector).forEach((el) => el.remove());
  }
}

/**
 * Does this text hold a BDS closing tag whose opening lies outside it?
 *
 * The page renderer can swallow a message's tail into its last code block: when
 * a file body is wrapped in its own fence and itself contains fenced blocks,
 * markdown re-pairs the fences, the outermost one is left open, and everything
 * after it — `</BDS:create_file>`, `</BDS:LONG_WORK>` and the trailing prose —
 * lands inside that block.
 *
 * Fencing such a block puts one fence *inside* the tag pair and one *outside*
 * it, so removing the pair later orphans a fence, which survives into the
 * visible text as a stray ``` (issue #120).
 *
 * Only a *dangling close* counts — a close seen before its opening. That is the
 * renderer's signature: a swallowed tail starts with the closings. A block that
 * merely holds an unmatched *opening* is the opposite case — a model showing a
 * tag inside a fence — and stays fenced, so its tag is still escaped and never
 * executed. Widening this to any imbalance made such an example go live and
 * swallow the surrounding prose as the new file's content.
 */
function hasDanglingBdsClose(text) {
  const source = String(text || "");
  const depth = new Map();

  const events = [
    ...scanBdsTagOpenings(source, "*")
      .filter((tag) => !tag.selfClosing)
      .map((tag) => ({ index: tag.index, name: tag.name, delta: 1 })),
    ...Array.from(source.matchAll(/<\/BDS:([A-Za-z0-9_:]+)>/gi)).map((match) => ({
      index: match.index,
      name: match[1].toLowerCase(),
      delta: -1,
    })),
  ].sort((a, b) => a.index - b.index);

  for (const event of events) {
    const next = (depth.get(event.name) || 0) + event.delta;
    if (next < 0) return true;
    depth.set(event.name, next);
  }

  return false;
}

/**
 * Replace markdown code blocks with fenced text so whitespace and banner UI
 * cannot corrupt the extracted content.
 *
 * Blocks that contain already-rendered rich output (a KaTeX formula or a
 * mermaid diagram) are left untouched — replacing them would destroy the
 * rendered result that the overlay is about to re-display.
 *
 * A block that carries a dangling BDS close is emitted as plain text instead,
 * so no fence ends up straddling the tag pair (see `hasDanglingBdsClose`).
 */
function replaceCodeBlocksWithFences(root) {
  const doc = root.ownerDocument;

  const asText = (codeText) =>
    hasDanglingBdsClose(codeText)
      ? `\n${codeText}\n`
      : `\n\`\`\`\n${codeText}\n\`\`\`\n`;

  const mdCodeBlocks = root.querySelectorAll(".md-code-block");
  for (const block of mdCodeBlocks) {
    if (block.querySelector(RICH_HTML_SELECTOR)) continue;
    const codeEl = block.querySelector("pre code") || block.querySelector("pre");
    if (codeEl) {
      const codeText = codeEl.textContent || "";
      const textNode = doc.createTextNode(asText(codeText));
      block.replaceWith(textNode);
    }
  }

  // Catch any stray <pre> elements that aren't inside .md-code-block
  const strayPres = root.querySelectorAll("pre");
  for (const pre of strayPres) {
    if (pre.querySelector(RICH_HTML_SELECTOR)) continue;
    const codeEl = pre.querySelector("code");
    const codeText = (codeEl || pre).textContent || "";
    const textNode = doc.createTextNode(asText(codeText));
    pre.replaceWith(textNode);
  }
}

/**
 * Extract raw text from a message DOM node using the best available source.
 *
 * @param {Node} node
 * @param {{ preserveRichHtml?: boolean }} [options] Pass `preserveRichHtml` to
 *   keep KaTeX/mermaid markup intact so the caller can re-display the rendered
 *   formula or diagram. Omit it for plain-text consumers (exports, bookmarks).
 */
export function extractMessageRawText(node, options = {}) {
  const sets = buildCandidateSets(node);
  return pickBestCandidate(options.preserveRichHtml ? sets.rich : sets.plain);
}

/**
 * Extract a message in both flavours from a single DOM pass.
 *
 * `plain` is markup-free and must drive everything that measures or speaks the
 * text: change hashing, RTL detection, token accounting and read-aloud. `rich`
 * carries live KaTeX/mermaid markup and is meant only for the message overlay,
 * which re-renders it. Letting `rich` reach the measuring consumers inflated
 * token counts by the size of the markup, and made read-aloud output recite
 * KaTeX internals plus mermaid's stylesheet.
 *
 * @param {Node} node
 * @returns {{ plain: string, rich: string }}
 */
export function extractMessageTexts(node) {
  const sets = buildCandidateSets(node);
  return {
    plain: pickBestCandidate(sets.plain),
    rich: pickBestCandidate(sets.rich),
  };
}

function pickBestCandidate(candidates) {
  if (!candidates.length) {
    return "";
  }

  const tagCandidates = candidates.filter((c) =>
    /<BDS:|<BetterDeepSeek>/i.test(c.value)
  );
  const pool = tagCandidates.length ? tagCandidates : candidates;

  const selected = [...pool].sort(
    (a, b) => scoreRawTextCandidate(b) - scoreRawTextCandidate(a)
  )[0];
  return selected ? selected.value : "";
}

/**
 * Build the candidate texts once, in both flavours.
 *
 * `htmlToMarkdown` is read-only, so the plain and rich markdown variants share
 * a single prepared clone rather than paying for an extra cloneNode each.
 */
function buildCandidateSets(node) {
  // Instead of innerText (which fails on detached clones), 
  // we'll filter out thinking blocks and then use textContent.

  const clone = node.cloneNode(true);
  stripMessageNoise(clone);
  replaceCodeBlocksWithFences(clone);

  // The text-based candidates cannot carry markup, so collapse already-rendered
  // rich output (KaTeX, mermaid) to a single textual form first. Without this
  // every formula would appear three times over and mermaid's viewer stylesheet
  // would surface as literal text (issues #169, #170).
  const textClone = clone.cloneNode(true);
  flattenRichContentForText(textClone);

  // decodeNodeHtmlText already uses textContent internally but handles line breaks
  const shared = [
    { type: "htmlDecoded", value: decodeNodeHtmlText(textClone.innerHTML || "") },
    { type: "textContent", value: String(textClone.textContent || "") },
  ].filter((c) => c.value && c.value.trim());

  const container = clone.querySelector(".ds-markdown") || clone;

  const withMarkdown = (preserveRichHtml) =>
    [
      ...shared,
      {
        type: "markdownReconstructed",
        value: renderMarkdown(container, preserveRichHtml),
      },
    ].filter((c) => c.value && c.value.trim());

  return { plain: withMarkdown(false), rich: withMarkdown(true) };
}

/** Render an already-prepared message container to markdown. */
function renderMarkdown(container, preserveRichHtml) {
  return htmlToMarkdown(container, 0, Boolean(preserveRichHtml)).trim();
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

function decodeNodeHtmlText(html) {
  const htmlWithBreaks = String(html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|pre|code|blockquote|h[1-6])>/gi, "\n");

  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlWithBreaks, "text/html");
  return String(doc.body.textContent || "");
}

function scoreRawTextCandidate(candidate) {
  const text = String(candidate.value || "");
  const lineBreakCount = (text.match(/\n/g) || []).length;
  const tagCount = (text.match(/<BDS:|<BetterDeepSeek>/gi) || []).length;

  // Bonus points for structured markdown syntax to ensure markdownReconstructed wins
  // matches headings (# ), bullets (- , * , 1. ), and table pipes (|...|), blockquotes (> ), horizontal rules (---)
  const mdBonus = (text.match(/(?:^|\n)(?:#+ |\* |- |\d+\. |\|.*\||> |---)/g) || []).length * 100;

  // Reconstructed markdown is much higher fidelity than raw browser text/decoded html
  const typeBonus = candidate.type === "markdownReconstructed" ? 15000 : 0;

  return tagCount * 10000 + mdBonus + typeBonus + lineBreakCount * 50 + text.length;
}

/**
 * Reconstruct markdown from a rendered message node.
 * This is used for exporting when the original markdown source is not available.
 *
 * @param {Node} node
 * @param {{ preserveRichHtml?: boolean }} [options] When `preserveRichHtml` is
 *   set, already-rendered KaTeX and mermaid markup is emitted verbatim so the
 *   caller can re-display the real formula/diagram (used by the message
 *   overlay). Otherwise those subtrees are collapsed to plain markdown, which
 *   is what exports and bookmarks want.
 */
export function extractMessageMarkdown(node, options = {}) {
  if (!node) return "";

  const clone = node.cloneNode(true);

  // Remove noise first
  stripMessageNoise(clone);

  // Find the markdown container
  const container = clone.querySelector(".ds-markdown") || clone;
  return renderMarkdown(container, options.preserveRichHtml);
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

/**
 * Text-only fallback used past the recursion cap. Non-content elements are
 * dropped so their payload (e.g. a stylesheet) cannot reach the message body.
 */
function fallbackText(element) {
  if (!element.querySelector(NON_CONTENT_SELECTOR)) {
    return element.textContent || "";
  }
  const clone = element.cloneNode(true);
  clone.querySelectorAll(NON_CONTENT_SELECTOR).forEach((el) => el.remove());
  return clone.textContent || "";
}

function htmlToMarkdown(element, depth = 0, preserveRichHtml = false) {
  // Hard depth cap so deeply-nested DOM (nested lists/blockquotes/KaTeX,
  // streamed long messages) cannot blow V8's stack. The fallback still has to
  // drop non-content elements, otherwise a stylesheet nested deeper than the
  // cap leaks back into the message as prose.
  if (depth > HTML_TO_MARKDOWN_MAX_DEPTH) {
    return fallbackText(element);
  }

  let markdown = "";

  for (const child of element.childNodes) {
    if (child.nodeType === 3) { // TEXT_NODE
      markdown += child.textContent;
    } else if (child.nodeType === 1) { // ELEMENT_NODE
      const tag = child.tagName.toLowerCase();

      // Never serialize non-content elements. Mermaid's viewer injects a
      // <style> into its SVG; emitting it dumped the CSS rules into the
      // message body as literal prose (issue #169).
      if (NON_CONTENT_TAGS.has(tag)) continue;

      // Already-rendered rich output. Walking into a KaTeX subtree would emit
      // the formula three times over (MathML tokens + LaTeX annotation +
      // .katex-html glyphs), so the subtree is treated as an opaque unit.
      if (isRichHtmlElement(child)) {
        markdown += preserveRichHtml
          ? child.outerHTML
          : richElementToMarkdown(child);
        continue;
      }

      // When the rendered diagram is kept, drop the ```mermaid source sitting
      // beside it so the overlay does not show the same diagram twice.
      if (
        preserveRichHtml &&
        tag === "pre" &&
        isMermaidSourceFence(child) &&
        child.closest(".md-code-block")?.querySelector(MERMAID_SELECTOR)
      ) {
        continue;
      }

      const content = htmlToMarkdown(child, depth + 1, preserveRichHtml);

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
          const lang = child.querySelector("code")?.className?.match(/language-([\w-]+)/)?.[1] || "";
          markdown += `\n\`\`\`${lang}\n${child.textContent.trim()}\n\`\`\`\n`;
          break;
        case "p": markdown += `\n${content}\n`; break;
        case "ul": markdown += `\n${content}\n`; break;
        case "ol": markdown += `\n${content}\n`; break;
        case "li": {
          const parent = child.parentElement;
          const isOrdered = parent?.tagName.toLowerCase() === "ol";
          if (isOrdered) {
            const siblings = Array.from(parent.children);
            const index = siblings.indexOf(child);
            const startAttr = parseInt(parent.getAttribute("start"), 10) || 1;
            const itemNumber = startAttr + index;
            markdown += `\n${itemNumber}. ${content.trim()}`;
          } else {
            markdown += `\n- ${content.trim()}`;
          }
          break;
        }
        case "blockquote": {
          const lines = content.trim().split("\n").map(line => `> ${line}`).join("\n");
          markdown += `\n${lines}\n`;
          break;
        }
        case "hr": markdown += `\n---\n`; break;
        case "a":
          const href = child.getAttribute("href") || "#";
          // DeepSeek autolinks bare tokens like "main.rs" into <a> elements.
          // Reconstruct those as plain text so BDS tag attributes
          // (fileName="src/main.rs"), AUTO paths, and file trees survive intact.
          if (isAutoLinkArtifact(content, href)) {
            markdown += content;
          } else {
            markdown += `[${content}](${href})`;
          }
          break;
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
