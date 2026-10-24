/**
 * Selected-text ("add context") helpers shared by the content UI and the
 * MAIN-world payload mutator.
 *
 * The excerpt never enters the composer textarea: it is shown as a card above
 * the composer and injected as a one-shot hidden block on the next request.
 * That is why the formatting lives here — both sides must agree on the cap and
 * on the wrapper escaping.
 */

/** Upper bound on the excerpt. Long selections are truncated, not rejected. */
export const MAX_QUOTE_CHARS = 1200;

/**
 * Collapse a raw selection into a stable, bounded excerpt.
 * @param {unknown} raw
 * @returns {string}
 */
export function normalizeQuoteText(raw) {
  const text = String(raw ?? "")
    .replace(/\r\n?/g, "\n")
    // Trailing spaces before a newline are invisible in the card but would
    // reach the model.
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (text.length <= MAX_QUOTE_CHARS) return text;
  return `${text.slice(0, MAX_QUOTE_CHARS).trimEnd()}…`;
}

/**
 * Build the hidden block that tells the model what the next message refers to.
 *
 * Returns "" for an empty excerpt so callers can treat it as "nothing pending".
 * @param {string | { text?: string } | null | undefined} quote
 * @returns {string}
 */
export function buildQuoteContextBlock(quote) {
  const source = quote && typeof quote === "object" ? quote.text : quote;
  const text = normalizeQuoteText(source);
  if (!text) return "";

  // An excerpt that closes the wrapper would let the rest of the selection
  // escape the block; the tag parser would then see it as instructions.
  const safe = text.replace(/<\/\s*BetterDeepSeek\s*>/gi, "</ BetterDeepSeek>");

  return [
    "<BetterDeepSeek>",
    "The user selected this excerpt from your previous answer and wants to discuss it:",
    '"""',
    safe,
    '"""',
    "Treat their next message as being about this excerpt.",
    "</BetterDeepSeek>",
  ].join("\n");
}
