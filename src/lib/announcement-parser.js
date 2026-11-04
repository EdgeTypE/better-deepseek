/**
 * Safe inline parser for announcement banner messages.
 *
 * Supports:
 * - Inline code: `code` (takes precedence over formatting & links)
 * - Markdown links: [text](https://example.com) (handles spaces, titles, and balanced parens)
 * - Bare URLs: https://example.com (excluding trailing sentence punctuation & backticks)
 * - Bold: **text**
 * - Italic: *text*
 *
 * Safely parses into structured tokens so that Svelte can render them
 * natively without using unsanitized `{@html}` blocks, eliminating XSS risks.
 * Only http/https URLs are permitted.
 */

const TOKEN_REGEX =
  /`([^`]+)`|\[([^\]]+)\]\(\s*(https?:\/\/(?:[^\s()]|\([^\s()]+\))+)(?:\s+["'][^"']*["'])?\s*\)|(\bhttps?:\/\/[^\s<`]+[^<.,:;"'!?`)\}\]\s])|\*\*(?!\s)([^*]+?)(?<!\s)\*\*|\*(?!\s)([^*]+?)(?<!\s)\*/gi;

/**
 * @typedef {{ type: 'text' | 'link' | 'bold' | 'italic' | 'code', text: string, href?: string }} MessageToken
 */

/**
 * Parses an announcement message string into an array of display tokens.
 *
 * @param {string} text
 * @returns {MessageToken[]}
 */
export function parseAnnouncementMessage(text) {
  if (typeof text !== "string" || !text) return [];

  const tokens = [];
  let lastIndex = 0;
  let match;

  // Reset regex state
  TOKEN_REGEX.lastIndex = 0;

  while ((match = TOKEN_REGEX.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({
        type: "text",
        text: text.slice(lastIndex, match.index),
      });
    }

    if (match[1] !== undefined) {
      // Inline code: `code`
      tokens.push({
        type: "code",
        text: match[1],
      });
    } else if (match[2] !== undefined && match[3] !== undefined) {
      // Markdown link: [text](url)
      tokens.push({
        type: "link",
        text: match[2],
        href: match[3],
      });
    } else if (match[4] !== undefined) {
      // Bare URL: https://...
      tokens.push({
        type: "link",
        text: match[4],
        href: match[4],
      });
    } else if (match[5] !== undefined) {
      // Bold: **text**
      tokens.push({
        type: "bold",
        text: match[5],
      });
    } else if (match[6] !== undefined) {
      // Italic: *text*
      tokens.push({
        type: "italic",
        text: match[6],
      });
    }

    lastIndex = TOKEN_REGEX.lastIndex;
  }

  if (lastIndex < text.length) {
    tokens.push({
      type: "text",
      text: text.slice(lastIndex),
    });
  }

  return tokens;
}
