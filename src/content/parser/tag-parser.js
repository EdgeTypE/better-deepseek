import { devLog } from "../../lib/dev-log.js";
import { extractHttpUrl } from "../../lib/utils/url-normalizer.js";
import { stripAutoLinkArtifacts } from "./link-artifacts.js";

/**
 * Attribute-list continuation: the next `name=` pair of the same tag.
 */
const NEXT_ATTRIBUTE_RE = /^\s*[A-Za-z0-9_:-]+\s*=/;

/**
 * Tag terminators: `>`, a self-closing `/>`, or a bare `/` when the caller
 * passes the attribute list without the closing bracket.
 */
const TAG_END_RE = /^\s*(?:\/?>|\/|$)/;

/**
 * True when the text at `index` continues the attribute list — either the tag
 * ends there, or another `name=` pair follows.
 *
 * @param {string} source Attribute string, or a full tag.
 * @param {number} index Position just past a candidate closing quote.
 */
export function closesAttributeValue(source, index) {
  if (index >= source.length) return true;
  const rest = source.slice(index);
  return TAG_END_RE.test(rest) || NEXT_ATTRIBUTE_RE.test(rest);
}

/**
 * Index of the last delimiter that genuinely ends the value, or -1 when there
 * is none.
 *
 * A payload may contain the delimiter character itself — an apostrophe in
 * prose, a nested `"hi"` — so "the first matching quote wins" is wrong. The
 * real delimiter is the last one that still leaves the attribute list valid;
 * anything before it is payload. Truncating at the first match produced invalid
 * JSON that reached MCP servers as `_raw` (issue #149).
 */
function findLastClosingQuote(source, from, quoteChar) {
  let last = -1;

  for (let i = from; i < source.length; i++) {
    if (source[i] === "\\" && source[i + 1] === quoteChar) {
      i++;
      continue;
    }
    if (source[i] === quoteChar && closesAttributeValue(source, i + 1)) last = i;
  }

  return last;
}

/**
 * Characters allowed in a BDS tag name.
 */
const NAME_CHAR_RE = /[A-Za-z0-9_:]/;

/**
 * Index of the `>` that ends the opening tag whose attributes start at `from`,
 * or -1 when the tag is not terminated yet.
 *
 * A delimiter-based pattern (`[^>]*`) stops at the first `>` anywhere in the
 * attribute list, but a `>` inside a quoted value is payload, not a
 * terminator: `caption="a > b"`, a chart title, a mermaid edge. Walking the
 * list and applying the same quote rule as parseTagAttributes keeps the whole
 * value. Quoted values may also contain the delimiter character itself, so a
 * quote only closes where the attribute list is still valid.
 */
function findOpeningTagEnd(source, from) {
  const strict = scanForTagEnd(source, from, true);
  if (strict !== -1) return strict;

  // The strict pass found no `>` at all. That happens when a stray attribute
  // follows the last quoted value — `fileName="x" extra>` — because no closing
  // boundary is ever valid, so the quote never closes. Read it the way
  // parseTagAttributes does: when no valid delimiter exists, the first
  // matching quote is the delimiter.
  return scanForTagEnd(source, from, false);
}

/**
 * @param {boolean} strictQuotes Close a quote only at a valid attribute
 *   boundary. When false, the first matching quote closes.
 */
function scanForTagEnd(source, from, strictQuotes) {
  let quote = null;

  for (let i = from; i < source.length; i++) {
    const char = source[i];

    if (quote) {
      if (char === "\\" && source[i + 1] === quote) {
        i++;
        continue;
      }
      if (char === quote && (!strictQuotes || closesAttributeValue(source, i + 1))) {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (char === ">") return i;
  }

  return -1;
}

/**
 * True when a lowercased tag name is one of `names`.
 *
 * Matching is exact — a tag that legitimately appears both bare and
 * `AUTO:`-prefixed lists both spellings, so no caller silently starts matching
 * tags it used to ignore. `"*"` or a nullish `names` matches any name, for the
 * generic sweeps that walk every tag.
 */
function tagNameMatches(name, names) {
  if (names === undefined || names === null || names === "*") return true;

  const wanted = Array.isArray(names) ? names : [names];

  for (const candidate of wanted) {
    if (name === String(candidate).toLowerCase()) return true;
  }

  return false;
}

/**
 * Locate opening BDS tags without relying on a delimiter-based pattern.
 *
 * Returns one entry per opening tag, in document order:
 *
 *   { name, attrsRaw, index, openEnd, selfClosing, closed, raw }
 *
 * `index` is the `<`, `openEnd` is just past the `>` (or `/>`), `raw` is that
 * whole slice, and `attrsRaw` is the raw attribute list — still unparsed, so
 * callers keep full control over whether an empty list means "no attributes"
 * or "not this tag".
 *
 * Unterminated openings are reported with `closed: false` and `attrsRaw`
 * running to the end of the text. That is what a streaming message looks like
 * mid-tag, and the attributes seen so far are still worth reading.
 *
 * @param {string} text
 * @param {string|string[]} names Tag name(s), case-insensitive.
 */
export function scanBdsTagOpenings(text, names) {
  const source = String(text ?? "");
  const openings = [];
  const prefixRe = /<BDS:/gi;
  let cursor = 0;

  while (cursor < source.length) {
    prefixRe.lastIndex = cursor;
    const prefix = prefixRe.exec(source);
    if (!prefix) break;

    const index = prefix.index;
    let nameEnd = index + 5;
    while (nameEnd < source.length && NAME_CHAR_RE.test(source[nameEnd])) nameEnd++;

    const name = source.slice(index + 5, nameEnd).toLowerCase();
    if (!name || !tagNameMatches(name, names)) {
      cursor = index + 5;
      continue;
    }

    const end = findOpeningTagEnd(source, nameEnd);

    if (end === -1) {
      openings.push({
        name,
        attrsRaw: source.slice(nameEnd),
        index,
        openEnd: source.length,
        selfClosing: false,
        closed: false,
        raw: source.slice(index),
      });
      break;
    }

    const selfClosing = source[end - 1] === "/";
    openings.push({
      name,
      attrsRaw: source.slice(nameEnd, selfClosing ? end - 1 : end),
      index,
      openEnd: end + 1,
      selfClosing,
      closed: true,
      raw: source.slice(index, end + 1),
    });

    cursor = end + 1;
  }

  return openings;
}

/**
 * Locate complete `<BDS:NAME ...>body</BDS:NAME>` spans.
 *
 * Pairing is first-close-wins, matching the lazy `([\s\S]*?)<\/BDS:\1>`
 * pattern this replaces. An opening with no close tag is still returned, with
 * `paired: false` and an empty body, because several callers accept a bare
 * opening and fall back to its attributes.
 *
 * Each entry extends an opening with:
 *
 *   { body, paired, endIndex, raw }
 *
 * Self-closing openings are skipped by default — they have no body, and the
 * callers that sweep every tag would otherwise see one tag twice. Pass
 * `includeSelfClosing` for the tags that legitimately appear in either form
 * (`<BDS:AUTO:FILE_READ path="x"/>` and `<BDS:AUTO:FILE_READ path="x">` both
 * mean the same thing); those entries carry an empty body and `paired: false`.
 *
 * @param {string} text
 * @param {string|string[]} names Tag name(s), case-insensitive.
 * @param {{ includeSelfClosing?: boolean }} [options]
 */
export function scanBdsTagPairs(text, names, options = {}) {
  const source = String(text ?? "");
  const { includeSelfClosing = false } = options;
  const pairs = [];

  for (const opening of scanBdsTagOpenings(source, names)) {
    if (opening.selfClosing) {
      if (includeSelfClosing) {
        pairs.push({ ...opening, body: "", paired: false, endIndex: opening.openEnd, raw: opening.raw });
      }
      continue;
    }

    if (!opening.closed) {
      pairs.push({ ...opening, body: "", paired: false, endIndex: opening.openEnd, raw: source.slice(opening.index) });
      continue;
    }

    // `opening.name` is restricted to [A-Za-z0-9_:], so it needs no escaping.
    const closeRe = new RegExp(`</BDS:${opening.name}>`, "gi");
    closeRe.lastIndex = opening.openEnd;
    const close = closeRe.exec(source);

    if (!close) {
      pairs.push({ ...opening, body: "", paired: false, endIndex: opening.openEnd, raw: source.slice(opening.index, opening.openEnd) });
      continue;
    }

    pairs.push({
      ...opening,
      body: source.slice(opening.openEnd, close.index),
      paired: true,
      endIndex: close.index + close[0].length,
      raw: source.slice(opening.index, close.index + close[0].length),
    });
  }

  return pairs;
}

/**
 * Parse tag attributes from a string like: fileName="test.py" content="..."
 * Handles escaped quotes (\" ) inside attribute values.
 * Only \" is treated as an escape — other \X sequences (e.g. \p, \t)
 * are preserved as-is to avoid corrupting paths.
 */
export function parseTagAttributes(rawAttrs) {
  const attrs = {};
  const keyRegex = /([A-Za-z0-9_:-]+)\s*=\s*/g;

  let match;
  while ((match = keyRegex.exec(rawAttrs)) !== null) {
    const key = String(match[1] || "").trim();
    if (!key) continue;

    const start = keyRegex.lastIndex;
    if (start >= rawAttrs.length) continue;
    const quoteChar = rawAttrs[start];
    if (quoteChar !== '"' && quoteChar !== "'") continue;

    // Walk character-by-character to find the closing quote,
    // respecting escaped quotes: \" and \' only
    const lastClose = findLastClosingQuote(rawAttrs, start + 1, quoteChar);
    let value = "";
    let i = start + 1;
    while (i < rawAttrs.length) {
      const ch = rawAttrs[i];
      if (ch === "\\" && rawAttrs[i + 1] === quoteChar) {
        value += quoteChar;
        i += 2;
        continue;
      }
      if (ch === quoteChar) {
        if (closesAttributeValue(rawAttrs, i + 1) || i >= lastClose) {
          i++;
          break;
        }
        // Inner quote: part of the payload, keep walking.
        value += ch;
        i++;
        continue;
      }
      value += ch;
      i++;
    }

    keyRegex.lastIndex = i;

    if (
      key === "fileName" ||
      key === "filename" ||
      key === "path" ||
      key === "dir" ||
      key === "directory" ||
      key === "filePath" ||
      key === "queries" ||
      key === "query"
    ) {
      // Path-like values never legitimately contain markdown links. DeepSeek's
      // autolinker wraps bare filename tokens (main.rs) into fake <a> links
      // which surface here as [main.rs](https_...). Collapse them back to plain
      // text so tool paths survive intact. Must run before the src/href branch
      // below, otherwise a value that starts with a bare-domain autolink
      // (e.g. queries="[main.rs](https://main.rs)") is URL-extracted instead.
      attrs[key] = stripAutoLinkArtifacts(value);
    } else if (key === "src" || key === "href" || /^\[.*\]\(\s*https?:\/\//i.test(value)) {
      attrs[key] = extractHttpUrl(value) || value;
    } else {
      attrs[key] = value;
    }
  }

  return attrs;
}

/**
 * Normalize content extracted from a BDS tag.
 */
export function normalizeTaggedCodeContent(content, tagName) {
  const name = String(tagName || "").toLowerCase();
  let output = String(content || "");

  if (
    name === "create_file" ||
    name === "run_python_embed" ||
    name === "html" ||
    name === "visualizer" ||
    name === "docx" ||
    name === "pptx" ||
    name === "excel" ||
    name === "character_create" ||
    name === "skill_create" ||
    name === "auto:code_runner" ||
    name === "chart"
  ) {
    output = unwrapMarkdownCodeFence(output);
  }

  if (
    name === "run_python_embed" ||
    name === "html" ||
    name === "docx" ||
    name === "pptx" ||
    name === "excel" ||
    name === "auto:code_runner"
  ) {
    output = stripLeadingChatter(output);
  }

  if (name === "deep_research_report") {
    output = stripLeadingBlankLines(output);
  }

  return output;
}

/**
 * Strips leading/trailing conversational text from a code block.
 * Specifically targets cases where AI ignores markdown fences and writes:
 * "Here is the code: const doc = ..."
 */
function stripLeadingChatter(content) {
  let output = String(content || "").replace(/^(?:[\t ]*\r?\n)+/, "").replace(/(?:\r?\n[\t ]*)+$/, "");

  // If content is wrapped in a code fence (possibly with leading chatter),
  // unwrap it first so the JS-keyword check can work on the actual code.
  const fenceMatch = output.match(/```(?:[a-zA-Z0-9_+.-]*)\s*\r?\n?([\s\S]*?)```\s*$/);
  if (fenceMatch) {
    output = fenceMatch[1].replace(/^(?:[\t ]*\r?\n)+/, "").replace(/(?:\r?\n[\t ]*)+$/, "");
  }

  // If it already looks like it starts with code, leave it
  if (/^(?:const|let|var|function|async|import|export|class|await|\/\/|\/\*)/.test(output)) {
    return output;
  }

  // Look for the first occurrence of a JS keyword at the start of a line
  const jsStartMatch = output.match(/(?:\r?\n|^)\s*(const|let|var|function|async|import|class|await|document)\s+/);
  if (jsStartMatch && jsStartMatch.index > 0) {
    devLog("Parser", `Stripping leading chatter for JS block: "${output.substring(0, 30)}..."`);
    return output.substring(jsStartMatch.index).replace(/^(?:[\t ]*\r?\n)+/, "").replace(/(?:\r?\n[\t ]*)+$/, "");
  }

  return output;
}

/**
 * Unwrap markdown code fences (```lang ... ```) from content.
 * Robust: Handles multiple fences, unclosed fences, and leftover backticks.
 */
export function unwrapMarkdownCodeFence(content) {
  let text = String(content || "");

  // Only unwrap if the ENTIRE content is wrapped in a single outer code fence.
  // This correctly preserves content with multiple inner code fences
  // (e.g., README files, skill instructions with code examples).
  const trimmed = text.replace(/^(?:[\t ]*\r?\n)+/, "").replace(/(?:\r?\n[\t ]*)+$/, "");

  // Match: ```lang\n...\n``` (single outer fence, nothing before/after)
  const singleFenceMatch = trimmed.match(/^```(?:[a-zA-Z0-9_+.-]*)[ \t]*\r?\n?([\s\S]*?)```\s*$/);
  if (singleFenceMatch) {
    return singleFenceMatch[1];
  }

  // Handle unclosed fence: ```lang\n...code... (no closing ```)
  // Use only-leading-whitespace stripped text so trailing \n isn't lost
  const leadTrimmed = text.replace(/^(?:[\t ]*\r?\n)+/, "");
  const unclosedMatch = leadTrimmed.match(/^```(?:[a-zA-Z0-9_+.-]*)[ \t]*\r?\n?([\s\S]+)$/);
  if (unclosedMatch) {
    return unclosedMatch[1];
  }

  // Not wrapped in a single fence — return as-is (preserves multiple nested code blocks)
  return trimmed;
}

function stripLeadingBlankLines(content) {
  return String(content || "").replace(/^(?:[ \t]*\r?\n)+/, "");
}

