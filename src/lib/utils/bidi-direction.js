/**
 * Per-block text direction (issue #181).
 *
 * Direction used to be decided once for the whole message by counting RTL
 * characters against a 0.3 threshold and then forcing `dir="rtl"` onto the
 * message container. Character counting weights a long Latin token like
 * `authentication` as heavily as several Persian words, so the ratio crossed
 * the threshold in both directions:
 *
 *  - a mostly-English reply with a Persian paragraph turned every English
 *    paragraph right-aligned;
 *  - a Persian reply containing an English code block fell under the threshold
 *    and was rendered LTR.
 *
 * Each block now decides for itself, using the Unicode Bidi Algorithm's
 * first-strong rule — the same rule the browser applies for `dir="auto"`:
 * leading bullets (`-`, `•`), ordered-list numbers (`1.`) and punctuation are
 * directionally neutral, so they are skipped and a line starting with `1.` is
 * not mistaken for English.
 *
 * The resolution is done here rather than delegated to `dir="auto"` because a
 * browser resolves `auto` from an element's own text only: as soon as a
 * descendant carries a `dir` attribute it is treated as a bidi isolate and the
 * parent falls back to LTR. That silently broke exactly the containers that
 * matter — a `<ul>` around `<li>`s, a `<table>` around cells, a `<blockquote>`
 * around its paragraphs. Computing the first strong character from
 * `textContent` (which ignores attributes) is stable for both leaves and
 * containers.
 */

/**
 * Unicode blocks whose letters are right-to-left.
 * Not exhaustive (CJK, Cyrillic, Greek, Latin and friends are all LTR), but it
 * covers every script the extension is likely to meet in practice.
 */
const RTL_RANGES = [
  [0x0590, 0x05ff], // Hebrew
  [0x0600, 0x06ff], // Arabic
  [0x0700, 0x074f], // Syriac
  [0x0750, 0x077f], // Arabic Supplement
  [0x0780, 0x07bf], // Thaana
  [0x07c0, 0x07ff], // NKo
  [0x0800, 0x085f], // Samaritan + Mandaic
  [0x0860, 0x086f], // Syriac Supplement
  [0x0870, 0x089f], // Arabic Extended-B
  [0x08a0, 0x08ff], // Arabic Extended-A
  [0xfb1d, 0xfb4f], // Hebrew Presentation Forms
  [0xfb50, 0xfdff], // Arabic Presentation Forms-A
  [0xfe70, 0xfeff], // Arabic Presentation Forms-B
  [0x10d00, 0x10d3f], // Hanifi Rohingya
  [0x1ee00, 0x1eeff], // Arabic Mathematical Alphabetic Symbols
];

/** Invisible marks that carry a direction without being letters. */
const RTL_MARKS = new Set([0x061c /* ALM */, 0x200f /* RLM */]);
const LTR_MARKS = new Set([0x200e /* LRM */]);

/**
 * Block-level elements that carry their own paragraph direction. Inline
 * elements are deliberately absent: they must follow the paragraph they sit in.
 */
const BLOCK_SELECTOR = [
  "p",
  "li",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "blockquote",
  "td",
  "th",
  "ul",
  "ol",
  "table",
].join(", ");

/**
 * Code, formulas and diagrams are never reordered: a Persian comment inside a
 * fenced block must not drag the block itself into RTL.
 */
const LTR_ONLY_SELECTOR = "pre, code, .md-code-block, .katex, .mermaid, svg";

/** Subtrees rendered by the extension itself (or another one) are left alone. */
const HOST_SELECTOR = "#bds-root, .bds-host-wrapper";

/** Marks a block this module resolved to RTL, so the stylesheet can mirror its list padding / quote border. */
export const RTL_BLOCK_CLASS = "bds-dir-rtl";

const STRONG_LETTER = /\p{L}/u;

function isRtlChar(code) {
  return RTL_RANGES.some(([start, end]) => code >= start && code <= end);
}

/**
 * Direction of the first strong character. Digits, punctuation and symbols are
 * neutral and skipped; a string with no strong character at all defaults to LTR.
 *
 * @param {string} text
 * @returns {"rtl" | "ltr"}
 */
export function firstStrongDirection(text) {
  for (const char of String(text ?? "")) {
    const code = char.codePointAt(0);
    if (RTL_MARKS.has(code)) return "rtl";
    if (LTR_MARKS.has(code)) return "ltr";
    if (!STRONG_LETTER.test(char)) continue;
    return isRtlChar(code) ? "rtl" : "ltr";
  }
  return "ltr";
}

/**
 * Give every block inside `root` its own direction and tag the RTL ones.
 *
 * A `dir` that is already present is never overwritten, so a page that sets its
 * own direction — or a third-party extension that resolves direction per line —
 * keeps working.
 *
 * @param {ParentNode | null | undefined} root Content container (`.ds-markdown`
 *   or the overlay's rendered markdown), never a host wrapper.
 */
export function applyAutoDirection(root) {
  if (!root || typeof root.setAttribute !== "function") return;

  const blocks = root.querySelectorAll(BLOCK_SELECTOR);

  // A container holding no block at all carries its text directly; there the
  // container is the paragraph, so it has to resolve the direction itself.
  // When blocks exist the container is left untouched — letting it decide would
  // re-introduce the message-level flip this function exists to remove.
  if (blocks.length === 0) {
    if (!root.hasAttribute("dir")) applyBlockDirection(root);
    return;
  }

  for (const el of blocks) {
    if (el.hasAttribute("dir")) continue;
    if (el.closest(LTR_ONLY_SELECTOR)) continue;

    // A BDS host *inside* this container renders its own content; an ancestor
    // host (the overlay being processed from within itself) must not disqualify
    // the blocks we were asked to handle.
    const host = el.closest(HOST_SELECTOR);
    if (host && root.contains(host)) continue;

    applyBlockDirection(el);
  }
}

/**
 * Resolve and stamp the direction of a single block.
 *
 * A container has no text of its own beyond whitespace, so it resolves from the
 * text of its descendants — `textContent` walks them regardless of any `dir`
 * attribute they may carry. The class is the stylesheet hook for the physical
 * properties that must be mirrored (list padding, quote border), keyed on our
 * own class so no unrelated `[dir]` on the page is affected.
 */
function applyBlockDirection(el) {
  const direction = firstStrongDirection(el.textContent);

  el.setAttribute("dir", direction);
  el.classList.toggle(RTL_BLOCK_CLASS, direction === "rtl");
}
