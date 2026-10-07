/**
 * GitLab Repository Reader
 *
 * GitLab serves whole-repository archives at
 *   https://gitlab.com/api/v4/projects/{urlencoded-namespace/project}/repository/archive.zip?sha={ref}
 * but answers **406 Not Acceptable** to anonymous browser requests on every
 * archive route (`/-/archive/...`, `archive.zip`, `.tar.gz`, `.tar.bz2`), from
 * both page and extension-service-worker contexts. Supplying any
 * `Authorization` header changes the response to 401, which shows the block is
 * an anonymous-abuse rule rather than a header-negotiation problem — and it
 * cannot be worked around by removing request headers, because Chrome
 * re-derives `Origin` / `Sec-Fetch-*` regardless.
 *
 * The keyless path that *does* work is the regular API: `repository/tree`
 * (recursive, paginated) to list paths, then `repository/files/:path/raw` to
 * read each file. Both return 200 anonymously with permissive CORS.
 *
 * So: try the bulk archive first (one request — cheap, and it starts working
 * again automatically if GitLab relaxes the rule), then fall back to walking
 * the tree.
 */

import {
  buildRepoFromTree,
  fetchRepoArchive,
  fetchRepoJson,
  fetchRepoText,
} from "./repo-archive.js";

export const GITLAB_HOST = "gitlab.com";

/** GitLab caps `per_page` at 100 for the tree endpoint. */
const TREE_PAGE_SIZE = 100;

/** Safety stop so a pathological repo cannot spin forever. */
const MAX_TREE_PAGES = 50;

/**
 * Upper bound on files read through the API fallback. Each file costs one
 * request, and anonymous callers share a 500-requests/minute budget, so the
 * walk is deliberately bounded rather than unbounded.
 */
const MAX_FILES = 400;

/** Parallel raw-file requests. High enough to be quick, low enough to be polite. */
const FETCH_CONCURRENCY = 6;

/**
 * Parse a GitLab URL (or `namespace/project` shorthand) into its parts.
 *
 * Supports:
 *   https://gitlab.com/group/project
 *   https://gitlab.com/group/subgroup/project
 *   https://gitlab.com/group/project/-/tree/branch
 *   https://gitlab.com/group/project.git
 *   group/project
 *
 * @returns {{ namespace: string, project: string, ref: string } | null}
 */
export function parseGitLabUrl(input) {
  const trimmed = String(input || "").trim().replace(/\/+$/, "");
  if (!trimmed) return null;

  // Shorthand: at least namespace/project, no scheme.
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) && trimmed.includes("/")) {
    const parts = trimmed.replace(/\.git$/, "").split("/").filter(Boolean);
    if (parts.length < 2) return null;
    return {
      namespace: parts.slice(0, -1).join("/"),
      project: parts[parts.length - 1],
      ref: "main",
    };
  }

  let url;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  if (url.hostname !== GITLAB_HOST) return null;

  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 2) return null;

  // Drop GitLab's routing markers: /-/tree/<ref>, /-/blob/..., /-/commits/...
  const marker = parts.indexOf("-");
  let ref = "main";
  let projectParts = parts;
  if (marker !== -1) {
    projectParts = parts.slice(0, marker);
    if (parts[marker + 1] === "tree" && parts[marker + 2]) {
      ref = parts[marker + 2];
    }
  }

  if (projectParts.length < 2) return null;

  const project = projectParts[projectParts.length - 1].replace(/\.git$/, "");
  const namespace = projectParts.slice(0, -1).join("/");
  if (!project || !namespace) return null;

  return { namespace, project, ref };
}

/** Encode the `namespace/project` pair the way GitLab's API expects. */
function encodeProjectPath({ namespace, project }) {
  return encodeURIComponent(`${namespace}/${project}`);
}

/**
 * Build the bulk archive URL for a GitLab project.
 *
 * ⚠️ Do NOT use the web path `/{ns}/{proj}/-/archive/{ref}/{proj}-{ref}.zip`.
 * It is blocked for browser requests too, and is not on the background
 * allowlist. Both routes currently answer 406 anonymously; this one is kept
 * because it is a single request and may be re-enabled by GitLab.
 */
export function buildGitLabArchiveUrl({ namespace, project, ref }) {
  const base = `https://${GITLAB_HOST}/api/v4/projects/${encodeProjectPath({
    namespace,
    project,
  })}/repository/archive.zip`;
  const safeRef = String(ref || "").trim();
  // Omitting `sha` lets GitLab serve the project's default branch.
  return safeRef ? `${base}?sha=${encodeURIComponent(safeRef)}` : base;
}

/**
 * Project metadata endpoint used to learn the default branch. Keyless for
 * public projects, and the only reliable way to know whether a project uses
 * `main`, `master`, or something else.
 */
export function buildGitLabProjectApiUrl({ namespace, project }) {
  return `https://${GITLAB_HOST}/api/v4/projects/${encodeProjectPath({
    namespace,
    project,
  })}`;
}

/** Recursive tree listing (one page). */
export function buildGitLabTreeUrl({
  namespace,
  project,
  ref,
  page = 1,
  perPage = TREE_PAGE_SIZE,
}) {
  const params = new URLSearchParams({
    recursive: "true",
    per_page: String(perPage),
    page: String(page),
  });
  const safeRef = String(ref || "").trim();
  if (safeRef) params.set("ref", safeRef);
  return `https://${GITLAB_HOST}/api/v4/projects/${encodeProjectPath({
    namespace,
    project,
  })}/repository/tree?${params.toString()}`;
}

/** Raw contents of a single file. The path is fully URL-encoded, slashes included. */
export function buildGitLabRawFileUrl({ namespace, project, ref, path }) {
  const filePath = encodeURIComponent(String(path || ""));
  const base = `https://${GITLAB_HOST}/api/v4/projects/${encodeProjectPath({
    namespace,
    project,
  })}/repository/files/${filePath}/raw`;
  const safeRef = String(ref || "").trim();
  return safeRef ? `${base}?ref=${encodeURIComponent(safeRef)}` : base;
}

/** Human-readable name for a ref, used in the `Repository:` header line. */
function refLabel(ref, fallback) {
  return String(ref || "").trim() || fallback;
}

/**
 * Turn a failed attempt into a user-facing message. A 401/403 means the
 * project is private (or does not exist), which is a completely different fix
 * than "wrong branch" — say so instead of blaming the ref.
 */
function describeFailure(error, hostPath) {
  const status = error && Number.isFinite(error.status) ? error.status : null;
  if (status === 401 || status === 403) {
    return (
      `GitLab denied access to ${hostPath} (${status}). ` +
      "The project is private or does not exist."
    );
  }
  if (status === 429) {
    return "GitLab is rate limiting anonymous requests. Wait a moment and try again.";
  }
  return "Make sure the project is public and the path is correct.";
}

/**
 * Read a repository through the API: list the tree, then hand the paths to the
 * shared tree walker, which applies the `.gitignore` / extension / size filters
 * before spending a request per file.
 *
 * GitLab's tree endpoint reports no size, so the size cap is enforced on the
 * fetched content instead (inside `buildRepoFromTree`).
 *
 * @returns {Promise<File>}
 */
export async function fetchGitLabFileTree(
  { namespace, project, ref },
  meta,
  onStatus = () => {},
) {
  onStatus("Listing repository files...");

  const entries = [];
  for (let page = 1; page <= MAX_TREE_PAGES; page++) {
    const data = await fetchRepoJson(
      buildGitLabTreeUrl({ namespace, project, ref, page }),
    );
    const items = Array.isArray(data) ? data : [];
    if (!items.length) break;

    for (const item of items) {
      if (item && item.type === "blob" && typeof item.path === "string") {
        entries.push({ path: item.path });
      }
    }

    if (items.length < TREE_PAGE_SIZE) break;
  }

  if (!entries.length) {
    // Most likely a bad ref — surface it as 404 so the caller can try another.
    const error = new Error(`GitLab returned no files for ${meta.label}.`);
    error.status = 404;
    throw error;
  }

  return buildRepoFromTree({
    entries,
    fetchFile: (path) =>
      fetchRepoText(buildGitLabRawFileUrl({ namespace, project, ref, path })),
    meta,
    onStatus,
    maxFiles: MAX_FILES,
    concurrency: FETCH_CONCURRENCY,
    emptyMessage:
      `GitLab returned no readable text files for ${meta.label}. ` +
      "The repository may contain only binary or ignored files.",
  });
}

/**
 * Fetch and concatenate a GitLab repository.
 *
 * Ref resolution order:
 *   1. The project's default branch, read from the keyless metadata endpoint.
 *   2. The explicit ref from the URL, if the user typed one.
 *   3. `main`, then `master`.
 *
 * Each ref is attempted as a bulk archive first, then as an API tree walk.
 *
 * @param {string} repoUrl - GitLab URL or namespace/project
 * @param {(status: string) => void} [onStatus]
 * @returns {Promise<File|null>}
 */
export async function fetchGitLabRepo(repoUrl, onStatus = () => {}) {
  const parsed = parseGitLabUrl(repoUrl);
  if (!parsed) {
    throw new Error(
      "Invalid GitLab URL. Use: https://gitlab.com/namespace/project",
    );
  }

  const { namespace, project } = parsed;
  const hostPath = `${namespace}/${project}`;

  // Resolve the real default branch first: guessing costs a wasted round trip,
  // and a project on `master` would fail on the guessed `main` outright.
  const explicitRef = String(parsed.ref || "").trim();
  const hasExplicitRef = Boolean(explicitRef) && explicitRef !== "main";

  let resolvedRef = null;
  if (!hasExplicitRef) {
    try {
      const meta = await fetchRepoJson(buildGitLabProjectApiUrl(parsed));
      const defaultBranch =
        meta && typeof meta === "object"
          ? String(meta.default_branch || "").trim()
          : "";
      if (defaultBranch) resolvedRef = defaultBranch;
    } catch {
      // Metadata is best-effort; the ref list below still covers the common cases.
    }
  }

  // Order: resolved default branch → explicit ref → main → master.
  const refs = [];
  const pushRef = (value) => {
    const ref = String(value || "").trim();
    if (ref && !refs.includes(ref)) refs.push(ref);
  };

  if (resolvedRef) pushRef(resolvedRef);
  if (hasExplicitRef) {
    pushRef(explicitRef);
  } else {
    pushRef("main");
    pushRef("master");
  }

  let lastError = null;
  for (const ref of refs) {
    const meta = {
      label: `${hostPath}@${refLabel(ref, "default")}`,
      fileName: `${project}_gitlab.txt`,
      forge: "bdsGitLab",
      forgeMeta: { namespace, project, ref },
    };

    // Fast path: one request for the whole repository.
    try {
      return await fetchRepoArchive(
        { ...meta, archiveUrl: buildGitLabArchiveUrl({ namespace, project, ref }) },
        onStatus,
      );
    } catch (error) {
      lastError = error;
    }

    // Keyless fallback: walk the tree and read each file.
    try {
      return await fetchGitLabFileTree({ namespace, project, ref }, meta, onStatus);
    } catch (error) {
      lastError = error;
    }
  }

  const hinted = resolvedRef ? ` (default branch: ${resolvedRef})` : "";
  throw new Error(
    `GitLab project archive not found. Tried: ${refs.join(", ")}${hinted}. ` +
      describeFailure(lastError, hostPath) +
      (lastError ? ` Last error: ${lastError.message}` : ""),
  );
}
