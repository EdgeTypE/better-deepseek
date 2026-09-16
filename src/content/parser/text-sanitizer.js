import { scanBdsTagOpenings } from "./tag-parser.js";

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

  return output.replace(/\n{3,}/g, "\n\n").trim();
}
