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
 * Tags are located with the shared quote-aware scanner in tag-parser.js, and a
 * `base64Args` transport is accepted for payloads that must survive
 * byte-for-byte.
 */

import { scanBdsTagOpenings } from "./tag-parser.js";
import { parseLooseJson } from "./json-repair.js";

const CLOSE_TAG_RE = /<\/BDS:AUTO:MCP>/gi;

/**
 * Locate every `<BDS:AUTO:MCP ...>` tag in a message, in document order.
 *
 * @param {string} text
 * @returns {Array<{attrsRaw: string, body: string, index: number, endIndex: number}>}
 */
export function scanMcpTags(text) {
  const source = String(text || "");
  const tags = [];
  let consumedTo = 0;

  for (const opening of scanBdsTagOpenings(source, ["mcp", "auto:mcp"])) {
    // Skip an opening nested inside a span already claimed by an earlier tag,
    // so a payload that quotes the tag cannot produce a second call.
    if (opening.index < consumedTo) continue;

    // An unterminated opening means the tag is still streaming. No unquoted `>`
    // remains after it, so no later tag can be well formed either, and the
    // attribute list may still be incomplete — do not emit a call for it.
    if (!opening.closed) continue;

    CLOSE_TAG_RE.lastIndex = opening.openEnd;
    const close = CLOSE_TAG_RE.exec(source);

    tags.push({
      attrsRaw: opening.attrsRaw,
      body: close ? source.slice(opening.openEnd, close.index) : "",
      index: opening.index,
      endIndex: close ? close.index + close[0].length : opening.openEnd,
    });

    consumedTo = tags[tags.length - 1].endIndex;
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
