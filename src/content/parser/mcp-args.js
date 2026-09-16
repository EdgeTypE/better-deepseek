/**
 * MCP tag argument extraction.
 *
 * `BDS:AUTO:MCP` carries a JSON object inside an attribute. That payload
 * routinely contains the very characters used to delimit the attribute —
 * apostrophes in prose (`it's`), `>` in arrows and markup, `=` in comparisons —
 * so a quote-delimited attribute regex cannot capture it. The previous pattern
 * (`'[^']*'`) failed to match such tags at all, which dropped the tool call
 * silently: no card, no error, no result (issue #149).
 *
 * Tags are located with a quote-aware scanner instead, and a `base64Args`
 * transport is accepted for payloads that must survive byte-for-byte.
 */

import { closesAttributeValue } from "./tag-parser.js";
import { parseLooseJson } from "./json-repair.js";

const OPEN_TAG = "<BDS:AUTO:MCP";
const CLOSE_TAG = "</BDS:AUTO:MCP>";

/**
 * Find the `>` that terminates the opening tag, skipping any `>` that sits
 * inside a quoted attribute value.
 *
 * @param {string} source
 * @param {number} from Index just past the tag name.
 * @returns {number} Index of the terminating `>`, or -1 when unterminated.
 */
function findOpeningTagEnd(source, from) {
  let quote = null;

  for (let i = from; i < source.length; i++) {
    const char = source[i];

    if (quote) {
      if (char === "\\" && source[i + 1] === quote) {
        i++;
        continue;
      }
      if (char === quote && closesAttributeValue(source, i + 1)) quote = null;
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
 * Locate every `<BDS:AUTO:MCP ...>` tag in a message, in document order.
 *
 * @param {string} text
 * @returns {Array<{attrsRaw: string, body: string, index: number, endIndex: number}>}
 */
export function scanMcpTags(text) {
  const source = String(text || "");
  const haystack = source.toLowerCase();
  const openToken = OPEN_TAG.toLowerCase();
  const closeToken = CLOSE_TAG.toLowerCase();
  const tags = [];
  let cursor = 0;

  while (cursor < source.length) {
    const start = haystack.indexOf(openToken, cursor);
    if (start === -1) break;

    const attrsStart = start + OPEN_TAG.length;
    const openEnd = findOpeningTagEnd(source, attrsStart);

    // An unterminated opening tag means no unquoted `>` remains anywhere after
    // it, so no later tag can be well formed either.
    if (openEnd === -1) break;

    const bodyStart = openEnd + 1;
    const closeIndex = haystack.indexOf(closeToken, bodyStart);
    const hasClose = closeIndex !== -1;

    tags.push({
      attrsRaw: source.slice(attrsStart, openEnd),
      body: hasClose ? source.slice(bodyStart, closeIndex) : "",
      index: start,
      endIndex: hasClose ? closeIndex + CLOSE_TAG.length : bodyStart,
    });

    cursor = hasClose ? closeIndex + CLOSE_TAG.length : bodyStart;
  }

  return tags;
}

/**
 * Decode a URL-safe, unpadded base64 payload (the `base64Args` transport).
 *
 * @param {string} value
 * @returns {string|null} Decoded UTF-8 text, or null when undecodable.
 */
export function decodeBase64Args(value) {
  const normalized = String(value || "")
    .trim()
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  if (!normalized) return null;

  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);

  try {
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Resolve the arguments object for one MCP call.
 *
 * Precedence: `base64Args` (verbatim) → `args` attribute → tag body. Both plain
 * paths go through `parseLooseJson`, so a trailing comma or an unescaped inner
 * quote is repaired rather than collapsing the call into `{ _raw }` — which
 * servers reject as an unexpected keyword argument (issue #127).
 *
 * @param {Record<string, string>} [attrs] Parsed tag attributes.
 * @param {string} [body] Tag body, used when no `args` attribute is present.
 * @returns {Record<string, unknown>}
 */
export function resolveMcpArgs(attrs = {}, body = "") {
  const encoded = attrs.base64Args || attrs.base64args || "";

  if (encoded) {
    const decoded = decodeBase64Args(encoded);
    if (decoded !== null) {
      const parsed = parseLooseJson(decoded);
      if (isPlainObject(parsed.value)) return parsed.value;
    }
  }

  const raw = String(attrs.args || body || "").trim();

  // A tool with no parameters takes `{}`, which is what the system prompt
  // documents. The old fallback produced `{ _raw: "" }` here.
  if (!raw) return {};

  const parsed = parseLooseJson(raw);
  if (isPlainObject(parsed.value)) return parsed.value;

  return { _raw: raw };
}
