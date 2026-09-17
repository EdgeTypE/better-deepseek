import { scanBdsTagOpenings } from "./tag-parser.js";

const FENCE_LINE_RE = /^ {0,3}(`{3,})(.*)$/;

function fenceLine(line) {
  const match = FENCE_LINE_RE.exec(line);
  if (!match) return null;
  return { length: match[1].length, info: match[2].trim() };
}

/**
 * Drop fence lines that no other fence line pairs with.
 *
 * Removing a `<BDS:…>…</BDS:…>` span can cut a code fence in half: the span
 * takes the opening fence and leaves the closing one behind, which then renders
 * as a stray ``` at the end of the message and breaks the Markdown export
 * (issue #120). The reconstruction that produced the fences is itself balanced,
 * so the damage is done here, by the removal — and repairing it here needs no
 * knowledge of how the renderer paired the fences upstream. A dangling fence is
 * simply a fence line that nothing closes or opens.
 *
 * The pass is a no-op unless the text already has an unpaired fence, so a
 * message with well-formed code blocks is untouched.
 */
function dropUnpairedFences(text) {
  const lines = text.split("\n");
  const fences = lines.map(fenceLine);
  if (!fences.some(Boolean)) return text;

  // A fence line inside a block is content — a README's ```bash sample, say —
  // not a delimiter. Only lines that no completed block covers are dangling.
  const covered = new Array(lines.length).fill(false);
  let openIndex = -1;

  for (let i = 0; i < lines.length; i += 1) {
    const info = fences[i];
    if (!info) continue;

    if (openIndex === -1) {
      openIndex = i;
      continue;
    }
    // A closing fence carries no info string and is at least as long.
    if (info.info === "" && info.length >= fences[openIndex].length) {
      for (let j = openIndex; j <= i; j += 1) covered[j] = true;
      openIndex = -1;
    }
  }

  if (!fences.some((info, i) => info && !covered[i])) return text;

  return lines.filter((_, i) => !fences[i] || covered[i]).join("\n");
}

/**
 * Remove every stray BDS opening tag, closed or self-closing.
 *
 * Tags are located with the quote-aware scanner rather than a `[^>]*` capture.
 * A `>` inside a quoted attribute value (`args="a > b"`, `content="if (a > b) {}"`)
 * ends a `[^>]*` capture early, so the strip used to cut the tag in half and
 * leave the tail visible to the user — `content="if (a > b) {}"` rendered as
 * `b) {}"/>`.
 */
function stripStrayOpenings(text) {
  let output = "";
  let cursor = 0;

  for (const tag of scanBdsTagOpenings(text, "*")) {
    // An unterminated `<BDS:foo` at EOF has no closing bracket to strip.
    if (!tag.closed) continue;
    output += text.slice(cursor, tag.index);
    cursor = tag.openEnd;
  }

  return output + text.slice(cursor);
}

/**
 * Sanitize visible text by removing all BDS control tags.
 */
export function sanitizeVisibleText(text) {
  let output = String(text || "");

  output = output.replace(
    /<BetterDeepSeek>[\s\S]*?<\/BetterDeepSeek>/gi,
    ""
  );
  output = output.replace(/<BDS:SKILLS>[\s\S]*?<\/BDS:SKILLS>/gi, "");
  // The `[^>]*` in the two paired strips below is deliberate and safe: the
  // removal region runs from the opening tag to the matching `</BDS:...>` close
  // tag, so a capture truncated at a quoted `>` still removes the same span.
  // Only self-contained strips (one tag, no close-tag anchor) need the scanner.
  output = output.replace(
    /<BDS:memory_calls[^>]*>[\s\S]*?<\/BDS:memory_calls>/gi,
    ""
  );
  output = output.replace(
    /<BDS:([A-Za-z0-9_:]+)[^>]*>[\s\S]*?<\/BDS:\1>/gi,
    ""
  );
  // Clean up any stray or unclosed tags. Self-closing tags (`<BDS:create_file … />`)
  // are covered here too, so they need no separate pass.
  output = stripStrayOpenings(output);
  output = output.replace(/<\/BDS:[A-Za-z0-9_:]+>/gi, "");
  output = output.replace(/<BetterDeepSeek>|<\/BetterDeepSeek>/gi, "");

  output = output.replace(/<\/?BDS:LONG_WORK>/gi, "");
  output = output.replace(/Bds create file>[^\n]*/gi, "");

  output = dropUnpairedFences(output);

  return output.replace(/\n{3,}/g, "\n\n").trim();
}
