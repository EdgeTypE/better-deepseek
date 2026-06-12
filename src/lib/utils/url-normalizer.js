const MARKDOWN_HTTP_LINK_RE = /\[[^\]]*]\(\s*(https?:\/\/[^)\s]+)\s*(?:"[^"]*"|'[^']*')?\)/i;
const HTTP_URL_RE = /https?:\/\/[^\s<>"')\]]+/i;

function unwrapCandidate(value) {
  let candidate = String(value || "").trim();

  while (
    (candidate.startsWith("<") && candidate.endsWith(">")) ||
    (candidate.startsWith("`") && candidate.endsWith("`")) ||
    (candidate.startsWith('"') && candidate.endsWith('"')) ||
    (candidate.startsWith("'") && candidate.endsWith("'"))
  ) {
    candidate = candidate.slice(1, -1).trim();
  }

  return candidate
    .replace(/&amp;/g, "&")
    .replace(/[.,;:]+$/g, "");
}

export function extractHttpUrl(value) {
  const input = String(value || "").trim();
  if (!input) return "";

  const markdownMatch = input.match(MARKDOWN_HTTP_LINK_RE);
  const rawCandidate = markdownMatch?.[1] || input.match(HTTP_URL_RE)?.[0] || input;
  const candidate = unwrapCandidate(rawCandidate);

  try {
    const parsed = new URL(candidate);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : "";
  } catch {
    return "";
  }
}

export function normalizeHttpUrl(value) {
  const url = extractHttpUrl(value);
  if (!url) {
    throw new Error("Expected an http or https URL.");
  }
  return url;
}
