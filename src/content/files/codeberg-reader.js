/**
 * Codeberg Repository Reader
 *
 * Codeberg runs Gitea, whose API exposes a repository archive at
 *   https://codeberg.org/api/v1/repos/{owner}/{repo}/archive/{ref}.zip
 * No API key is required for public repositories. Extraction and filtering are
 * shared with the other forges via `repo-archive.js`.
 *
 * ⚠️ The ref is mandatory and Gitea does **not** fall back to the default
 * branch: `/archive.zip` and `/archive/main.zip` both answer 404 when the
 * repository's default branch is something else. Measured on `forgejo/forgejo`,
 * whose default branch is `forgejo` — so guessing `main` *or* `master` is not
 * enough, and the repo API has to be asked.
 */

import { fetchRepoArchive, fetchRepoJson } from "./repo-archive.js";

export const CODEBERG_HOST = "codeberg.org";

/**
 * Parse a Codeberg URL (or `owner/repo` shorthand) into its parts.
 *
 * Supports:
 *   https://codeberg.org/owner/repo
 *   https://codeberg.org/owner/repo/src/branch/main
 *   https://codeberg.org/owner/repo/src/tag/v1.2.3
 *   https://codeberg.org/owner/repo.git
 *   owner/repo
 *
 * @returns {{ owner: string, repo: string, ref: string } | null}
 */
export function parseCodebergUrl(input) {
  const trimmed = String(input || "").trim().replace(/\/+$/, "");
  if (!trimmed) return null;

  // Shorthand: exactly owner/repo, no scheme.
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) && trimmed.includes("/")) {
    const parts = trimmed.replace(/\.git$/, "").split("/").filter(Boolean);
    if (parts.length < 2) return null;
    return {
      owner: parts[0],
      repo: parts[1],
      ref: "main",
    };
  }

  let url;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  if (url.hostname !== CODEBERG_HOST) return null;

  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 2) return null;

  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/, "");

  // /src/branch/<ref> and /src/tag/<ref> both carry a usable ref after the
  // kind segment; /src/commit/<sha> is a commit, which archives accept too.
  let ref = "main";
  if (parts[2] === "src" && parts[3] && parts[4]) {
    ref = decodeURIComponent(parts[4]);
  }

  if (!owner || !repo) return null;

  return { owner, repo, ref };
}

/** Build the keyless archive URL for a Codeberg repository. */
export function buildCodebergArchiveUrl({ owner, repo, ref }) {
  const o = encodeURIComponent(owner);
  const r = encodeURIComponent(repo);
  const safeRef = encodeURIComponent(String(ref || "main").trim() || "main");
  return `https://${CODEBERG_HOST}/api/v1/repos/${o}/${r}/archive/${safeRef}.zip`;
}

/**
 * Repository metadata endpoint. Keyless for public repositories, and the only
 * way to learn a repository's real default branch — Gitea instances do not all
 * use `main`.
 */
export function buildCodebergRepoApiUrl({ owner, repo }) {
  return `https://${CODEBERG_HOST}/api/v1/repos/${encodeURIComponent(
    owner,
  )}/${encodeURIComponent(repo)}`;
}

/**
 * Turn a failed attempt into a user-facing message. A 401/403 means the repo is
 * private (or does not exist), which is a different fix than "wrong branch".
 */
function describeFailure(error, hostPath) {
  const status = error && Number.isFinite(error.status) ? error.status : null;
  if (status === 401 || status === 403) {
    return (
      `Codeberg denied access to ${hostPath} (${status}). ` +
      "The repository is private or does not exist."
    );
  }
  if (status === 429) {
    return "Codeberg is rate limiting anonymous requests. Wait a moment and try again.";
  }
  return "Make sure the repository is public and the path is correct.";
}

/**
 * Fetch and concatenate a Codeberg repository.
 *
 * Ref resolution order:
 *   1. The explicit ref from the URL, if the user typed one.
 *   2. The repository's real default branch, read from the keyless repo API.
 *   3. `main`, then `master`.
 *
 * The default branch is asked for *before* guessing, because a wrong ref costs a
 * whole download attempt and Gitea defaults are not uniform — `forgejo/forgejo`
 * uses `forgejo`, which neither guess would find.
 *
 * @param {string} repoUrl - Codeberg URL or owner/repo
 * @param {(status: string) => void} [onStatus]
 * @returns {Promise<File|null>}
 */
export async function fetchCodebergRepo(repoUrl, onStatus = () => {}) {
  const parsed = parseCodebergUrl(repoUrl);
  if (!parsed) {
    throw new Error(
      "Invalid Codeberg URL. Use: https://codeberg.org/owner/repo",
    );
  }

  const { owner, repo } = parsed;
  const hostPath = `${owner}/${repo}`;

  const explicitRef = String(parsed.ref || "").trim();
  const hasExplicitRef = Boolean(explicitRef) && explicitRef !== "main";

  // An explicit ref is authoritative — do not spend a request asking for the
  // default branch just to ignore it.
  let resolvedRef = null;
  if (!hasExplicitRef) {
    try {
      const meta = await fetchRepoJson(buildCodebergRepoApiUrl(parsed));
      const defaultBranch =
        meta && typeof meta === "object"
          ? String(meta.default_branch || "").trim()
          : "";
      if (defaultBranch) resolvedRef = defaultBranch;
    } catch {
      // Metadata is best-effort; the ref list below still covers `main`/`master`.
    }
  }

  const refs = [];
  const pushRef = (value) => {
    const ref = String(value || "").trim();
    if (ref && !refs.includes(ref)) refs.push(ref);
  };

  if (hasExplicitRef) {
    pushRef(explicitRef);
  } else {
    if (resolvedRef) pushRef(resolvedRef);
    pushRef("main");
    pushRef("master");
  }

  let lastError = null;

  for (const ref of refs) {
    try {
      return await fetchRepoArchive(
        {
          archiveUrl: buildCodebergArchiveUrl({ owner, repo, ref }),
          label: `${hostPath}@${ref}`,
          fileName: `${repo}_codeberg.txt`,
          forge: "bdsCodeberg",
          forgeMeta: { owner, repo, ref },
        },
        onStatus,
      );
    } catch (error) {
      lastError = error;
    }
  }

  const hinted = resolvedRef ? ` (default branch: ${resolvedRef})` : "";
  throw new Error(
    `Codeberg repository not found. Tried: ${refs.join(", ")}${hinted}. ` +
      describeFailure(lastError, hostPath) +
      (lastError ? ` Last error: ${lastError.message}` : ""),
  );
}
