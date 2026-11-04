/**
 * skills.sh catalog client for the "Find Skill" picker.
 *
 * Two public, unauthenticated endpoints are used:
 *   GET https://skills.sh/api/search?q=<query>
 *   GET https://skills.sh/api/download/<source>/<skillId>
 * The second one is the snapshot endpoint the official `skills` CLI installs
 * from (vercel-labs/skills/src/blob.ts). The documented /api/v1/* endpoints
 * require a Vercel OIDC token and therefore cannot be used from an extension.
 *
 * Requests go through `bds-fetch-url`: served by the service worker on
 * Chrome/Firefox and by the native OkHttp bridge on Android. As with remote
 * config, a JSON body arrives in `reply.html` (see remote-config-refresh.js).
 */

export const SKILLS_SH_BASE = "https://skills.sh";
export const MIN_QUERY_LENGTH = 2;
export const MAX_RESULTS = 40;

/** Build the search URL. The query is trimmed so pasted whitespace never 400s. */
export function buildSearchUrl(query, base = SKILLS_SH_BASE) {
  const q = String(query ?? "").trim();
  return `${base}/api/search?q=${encodeURIComponent(q)}`;
}

/**
 * Build the download URL from a normalized search result.
 * GitHub sources are "owner/repo", well-known sources are a single host segment;
 * both are encoded segment-by-segment so slashes inside a value cannot escape
 * the path.
 */
export function buildDownloadUrl(skill, base = SKILLS_SH_BASE) {
  const source = String(skill?.source ?? "").trim();
  const skillId = String(skill?.skillId ?? "").trim();
  if (!source || !skillId) {
    throw new Error("Incomplete skill identifier.");
  }
  const segments = source.split("/").filter(Boolean).concat(skillId);
  // encodeURIComponent leaves dots untouched, so a ".." segment would be
  // collapsed by URL resolution and hit a different endpoint instead.
  if (segments.some((segment) => segment === "." || segment === "..")) {
    throw new Error("Invalid skill identifier.");
  }
  return `${base}/api/download/${segments.map(encodeURIComponent).join("/")}`;
}

/**
 * Turn the search payload into a stable, UI-friendly shape.
 * Defensive about missing fields because the endpoint is not versioned.
 */
export function normalizeSearchResults(payload, limit = MAX_RESULTS) {
  const raw = Array.isArray(payload?.skills) ? payload.skills : [];
  const results = [];
  const seen = new Set();

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;

    const source = String(item.source ?? "").trim();
    const id = String(item.id ?? "").trim();
    // Older/alternate payloads may omit skillId; the id is "<source>/<skillId>".
    const skillId =
      String(item.skillId ?? "").trim() ||
      (source && id.startsWith(`${source}/`) ? id.slice(source.length + 1) : "");
    if (!source || !skillId) continue;

    const key = id || `${source}/${skillId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    results.push({
      id: key,
      source,
      skillId,
      name: String(item.name ?? "").trim() || skillId,
      installs: Number.isFinite(Number(item.installs)) ? Number(item.installs) : 0,
    });

    if (results.length >= Math.max(1, Number(limit) || MAX_RESULTS)) break;
  }

  return results;
}

/**
 * Pick SKILL.md out of a snapshot. Root-level SKILL.md wins; nested copies are
 * a fallback for repos that keep the manifest in a subfolder.
 */
export function pickSkillMarkdown(payload) {
  const files = Array.isArray(payload?.files) ? payload.files : [];
  const file =
    files.find((entry) => entry && String(entry.path).toLowerCase() === "skill.md") ||
    files.find((entry) => entry && /(?:^|\/)skill\.md$/i.test(String(entry.path)));
  const content = file ? String(file.contents ?? "").trim() : "";
  if (!content) {
    throw new Error("No SKILL.md in the downloaded snapshot.");
  }
  return content;
}

/** Compact install count for the result rows (e.g. 868432 -> "868.4K"). */
export function formatInstalls(count) {
  const n = Number(count) || 0;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}

/** Fetch a JSON document through the extension's fetch bridge. */
export async function fetchSkillsJson(url, timeoutMs = 15000) {
  let reply;
  try {
    reply = await chrome.runtime.sendMessage({
      type: "bds-fetch-url",
      url,
      options: { method: "GET", timeoutMs },
    });
  } catch (error) {
    throw new Error(
      `Request failed: ${String(error && error.message ? error.message : error)}`,
    );
  }

  if (!reply || !reply.ok) {
    throw new Error(
      String(reply?.error || `Request failed (status ${Number(reply?.status) || 0}).`),
    );
  }

  try {
    return JSON.parse(String(reply.html ?? ""));
  } catch {
    throw new Error("skills.sh returned an invalid response.");
  }
}

export async function searchSkills(query) {
  const q = String(query ?? "").trim();
  if (q.length < MIN_QUERY_LENGTH) {
    throw new Error(`Query must be at least ${MIN_QUERY_LENGTH} characters.`);
  }
  return normalizeSearchResults(await fetchSkillsJson(buildSearchUrl(q)));
}

export async function downloadSkillMarkdown(skill) {
  return pickSkillMarkdown(await fetchSkillsJson(buildDownloadUrl(skill), 20000));
}
