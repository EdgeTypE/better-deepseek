/**
 * Normalize the text of an `ask_question` entry before it is displayed.
 *
 * `question` and `options` come straight out of model output, and models
 * sometimes put markup there instead of prose. The common case (issue #209)
 * is a whole KaTeX rendering pasted into the JSON string:
 *
 *   <span class="katex">…<annotation encoding="application/x-tex">abcd</annotation>…
 *
 * The question panel renders those strings as text, so the markup was shown
 * verbatim. Rendering real math would need a TeX engine in the bundle (KaTeX
 * plus its fonts), and the page's own instance is bundled as a module, not a
 * global — so the panel gets the next best thing: the string is reduced to
 * what a reader needs, the TeX source of each formula with no HTML around it.
 */

/**
 * Tag names that show up in model output when it decides to speak HTML.
 * Restricting the match to known names keeps math prose like `x < 5` out of
 * the markup path.
 */
const TAG_NAMES = [
  "a", "annotation", "b", "br", "code", "del", "div", "em", "g", "h1", "h2",
  "h3", "h4", "h5", "h6", "i", "img", "kbd", "li", "mark", "math", "mfrac",
  "mi", "mn", "mo", "mover", "mrow", "mspace", "msqrt", "mstyle", "msub",
  "msubsup", "msup", "mtable", "mtd", "mtext", "mtr", "ol", "p", "path",
  "pre", "s", "semantics", "span", "strong", "sub", "sup", "svg", "table",
  "tbody", "td", "th", "thead", "tr", "u", "ul",
];

const TAG_RE = new RegExp(`<\\/?(${TAG_NAMES.join("|")})\\b`, "i");
const ATTRIBUTE_OR_CLOSE_RE = /<\/|[\w-]+\s*=\s*["']/;
const TEX_ANNOTATION_SELECTOR = 'annotation[encoding="application/x-tex"]';
const MATH_SELECTOR = ".katex, .katex-display, math";
const BLOCK_SELECTOR = "p, div, li, tr, h1, h2, h3, h4, h5, h6, pre";

/**
 * @param {string} text
 * @returns {boolean} true when the string carries HTML markup rather than prose
 */
function looksLikeMarkup(text) {
  if (!TAG_RE.test(text)) return false;
  // A lone `<b>` in prose ("a<b>c") is a typo or a comparison, not a tag.
  // Markup produced here always carries an attribute or a closing tag.
  return ATTRIBUTE_OR_CLOSE_RE.test(text);
}

/**
 * Text of a math subtree that has no TeX annotation: keep the MathML tokens,
 * drop the visual layer (`.katex-html` repeats every glyph) and the annotation
 * (it would print the source next to the result).
 */
function mathFallbackText(element) {
  const clone = element.cloneNode(true);
  clone
    .querySelectorAll(`.katex-html, ${TEX_ANNOTATION_SELECTOR}`)
    .forEach((node) => node.remove());
  return (clone.textContent || "").replace(/\s+/g, " ").trim();
}

/**
 * Replace every math subtree with its TeX source, outermost first so the
 * duplicate layers inside one KaTeX root are not visited twice.
 */
function replaceMathWithTex(doc) {
  for (const element of doc.querySelectorAll(MATH_SELECTOR)) {
    if (element.parentElement?.closest(MATH_SELECTOR)) continue;
    const tex = element.querySelector(TEX_ANNOTATION_SELECTOR)?.textContent?.trim();
    element.replaceWith(doc.createTextNode(tex || mathFallbackText(element)));
  }
}

function collapseWhitespace(text) {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Index just past the element that starts at `startIndex`, or -1 when it never
 * closes. Only same-name nesting is counted, which is all the KaTeX output
 * needs (`<span>` inside `<span>`).
 */
function findElementEnd(text, startIndex, tagName) {
  const tagRe = new RegExp(`<(/?)${tagName}\\b[^>]*>`, "gi");
  tagRe.lastIndex = startIndex;
  let depth = 0;
  let match;
  while ((match = tagRe.exec(text)) !== null) {
    if (match[1]) {
      depth -= 1;
      if (depth === 0) return tagRe.lastIndex;
    } else if (!match[0].endsWith("/>")) {
      depth += 1;
    }
  }
  return -1;
}

/** Strip markup without a DOM, for non-browser callers and unit tests. */
function stripMarkupWithoutDom(text) {
  const rootRe = /<(span|math)\b[^>]*>/gi;
  let out = "";
  let index = 0;

  for (;;) {
    rootRe.lastIndex = index;
    const root = rootRe.exec(text);
    if (!root) {
      out += text.slice(index);
      break;
    }

    const isMathRoot =
      root[1].toLowerCase() === "math" || /class\s*=\s*["'][^"']*katex/i.test(root[0]);
    if (!isMathRoot) {
      out += text.slice(index, rootRe.lastIndex);
      index = rootRe.lastIndex;
      continue;
    }

    const end = findElementEnd(text, root.index, root[1]);
    if (end < 0) {
      out += text.slice(index);
      break;
    }

    const subtree = text.slice(root.index, end);
    const tex = /<annotation[^>]*application\/x-tex[^>]*>([\s\S]*?)<\/annotation>/i.exec(subtree);
    out += text.slice(index, root.index);
    // Without a TeX annotation the MathML tokens are the readable form, so the
    // visual layer (always the last child of a KaTeX root) is cut away first.
    out += tex
      ? tex[1]
      : subtree.replace(/<span[^>]*katex-html[\s\S]*$/i, "");
    index = end;
  }

  return out.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "");
}

function stripMarkup(text) {
  if (typeof DOMParser === "undefined") return stripMarkupWithoutDom(text);

  const doc = new DOMParser().parseFromString(
    `<!doctype html><html><body>${text}</body></html>`,
    "text/html",
  );
  const body = doc.body;
  if (!body) return stripMarkupWithoutDom(text);

  body.querySelectorAll("script, style, template").forEach((node) => node.remove());
  replaceMathWithTex(doc);
  body.querySelectorAll("br").forEach((node) => node.replaceWith(doc.createTextNode("\n")));
  for (const block of body.querySelectorAll(BLOCK_SELECTOR)) {
    block.append(doc.createTextNode("\n"));
  }

  return body.textContent || "";
}

/**
 * `\(…\)` and `\[…\]` are unambiguous math delimiters, so they are dropped and
 * the TeX is left readable. `$…$` is left alone on purpose: stripping it would
 * mangle prices ("$5 and $10"), and as text it still reads as math.
 *
 * @param {string} text
 */
function unwrapMathDelimiters(text) {
  return text
    .replace(/\\\(([\s\S]*?)\\\)/g, "$1")
    .replace(/\\\[([\s\S]*?)\\\]/g, "$1");
}

/**
 * @param {unknown} value
 * @returns {string} display-safe text for a question or an option
 */
export function normalizeQuestionText(value) {
  const text = typeof value === "string" ? value : value == null ? "" : String(value);
  if (!text) return "";

  const withoutMarkup = looksLikeMarkup(text) ? stripMarkup(text) : text;
  return collapseWhitespace(unwrapMathDelimiters(withoutMarkup));
}

/**
 * Normalize a parsed `ask_question` array. Every field other than `question`
 * and `options` is carried through untouched, because the panel and the answer
 * payload both key off `id` / `type` / `allowCustom`.
 *
 * @param {unknown} questions
 * @returns {Array<Record<string, any>>}
 */
export function normalizeQuestions(questions) {
  if (!Array.isArray(questions)) return [];

  return questions
    .filter((question) => question && typeof question === "object")
    .map((question) => {
      const next = { ...question };
      if (typeof question.question === "string") {
        next.question = normalizeQuestionText(question.question);
      }
      if (Array.isArray(question.options)) {
        next.options = question.options.map((option) =>
          typeof option === "string" ? normalizeQuestionText(option) : option,
        );
      }
      return next;
    });
}
