/**
 * Detect and strip "autolink artifacts" introduced by DeepSeek's renderer.
 *
 * DeepSeek's UI now linkifies bare tokens that look like domains/filenames
 * (e.g. `main.rs`, `evaluator.rs`) into <a> elements, often with a sentinel
 * href like `https_...` or a real href that points at the token itself.
 * When such elements are serialized back into markdown they pollute BDS tag
 * attributes (fileName="src/main.rs"), AUTO tool paths, and file trees.
 */

const SENTINEL_LINK_RE = /\[([^\]\n]*)\]\(\s*https?_[^)\s]*\s*\)/gi;

// Matches `[text](https://text)` where text is a bare domain equal to the URL
// host. The optional trailing "/" plus closing paren are consumed so no stray
// ")" fragments survive. Links that point at a path on a matching host
// (e.g. [github.com](https://github.com/acme/repo)) are real links and are NOT
// matched — consistent with isAutoLinkArtifact below.
const BARE_DOMAIN_LINK_RE =
  /\[([a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.[a-zA-Z]{2,})\]\(\s*https?:\/\/(?:www\.)?\1\/?\s*\)/gi;

/**
 * Convert markdown autolink artifacts back to their plain link text.
 * Real links like `[DeepSeek](https://chat.deepseek.com)` are preserved.
 */
export function stripAutoLinkArtifacts(value) {
  return String(value || "")
    .replace(SENTINEL_LINK_RE, "$1")
    .replace(BARE_DOMAIN_LINK_RE, "$1");
}

/**
 * Decide whether an <a> element is a renderer autolink artifact rather than a
 * real user/AI-authored link. Used by the markdown reconstruction pass so the
 * artifact never re-enters extracted text.
 */
export function isAutoLinkArtifact(linkText, href) {
  const text = String(linkText || "").trim();
  const h = String(href || "").trim();

  if (!h || h === "#") return true;

  if (/^https?_\S*$/i.test(h)) return true;

  if (/^https?:\/\//i.test(h)) {
    try {
      const url = new URL(h);
      const host = url.hostname.replace(/^www\./i, "");
      // A bare-token autolink points at the bare domain itself (no path).
      // Requiring an empty pathname keeps real links like
      // [github.com](https://github.com/acme/repo/blob/main.rs) intact.
      if (
        text &&
        !/\s/.test(text) &&
        host.toLowerCase() === text.toLowerCase() &&
        (url.pathname === "/" || url.pathname === "")
      ) {
        return true;
      }
    } catch {
      // malformed URL — treat as artifact, emit plain text
      return true;
    }
  }

  return false;
}