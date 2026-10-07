/**
 * Repository host allowlist.
 *
 * Shared between the content script (which decides whether to hand a token to
 * the background worker) and the background worker (which must never fetch an
 * arbitrary URL on the extension's behalf).
 *
 * `token: true` means the host accepts a credential we actually store — today
 * only GitHub's PAT. Anonymous archive downloads work for the others.
 */

export const REPO_ARCHIVE_HOSTS = Object.freeze([
  { host: "codeload.github.com", forge: "github", token: true },
  { host: "gitlab.com", forge: "gitlab", token: false },
  { host: "codeberg.org", forge: "codeberg", token: false },
]);

/**
 * Per-host API path prefixes we may query for repository metadata (project info,
 * recursive tree). Each host is restricted to its API surface — the web routes
 * (`/group/project`, `/owner/repo`) are never reachable through this allowlist.
 *
 * Codeberg is here purely to read `default_branch`: Gitea instances do not all
 * default to `main`, and the archive endpoint 404s for a wrong ref.
 */
const METADATA_PATH_PREFIXES = Object.freeze({
  "gitlab.com": Object.freeze(["/api/v4/"]),
  "codeberg.org": Object.freeze(["/api/v1/"]),
  "huggingface.co": Object.freeze([
    "/api/models/",
    "/api/datasets/",
    "/api/spaces/",
  ]),
});

/**
 * Hosts we may query for repository metadata — the keys of the prefix map, so
 * adding a host in one place is enough.
 */
export const REPO_METADATA_HOSTS = Object.freeze(
  Object.keys(METADATA_PATH_PREFIXES),
);

/**
 * True for a HuggingFace `resolve` path, i.e. a single file download.
 *
 * Datasets and spaces live under `/datasets/...` and `/spaces/...`, models at
 * the root; all three are `{owner}/{repo}/resolve/{rev}/{path}` after the
 * optional prefix. Repo ids are exactly two segments, so the shape is strict.
 *
 * @param {string} pathname
 */
function isHuggingFaceResolvePath(pathname) {
  const withoutPrefix = pathname.replace(/^\/(datasets|spaces)(?=\/)/, "");
  return /^\/[^/]+\/[^/]+\/resolve\//.test(withoutPrefix);
}

/**
 * Resolve the allowlist entry for a URL, or null if the host is not allowed.
 *
 * GitLab is the one host with two archive routes: the API v4 endpoint we use
 * (`/api/v4/projects/:id/repository/archive.zip`) and the web route
 * (`/:ns/:proj/-/archive/:ref/:proj-:ref.zip`). The web route answers `406` to
 * any request carrying an `Origin` header, which a browser always sends, so we
 * reject it here rather than let it fail confusingly at the network layer.
 *
 * @param {string} url
 */
export function resolveRepoArchiveHost(url) {
  let parsed;
  try {
    parsed = new URL(String(url || ""));
  } catch {
    return null;
  }
  const entry = REPO_ARCHIVE_HOSTS.find((e) => e.host === parsed.hostname);
  if (!entry) return null;
  if (entry.forge === "gitlab" && !parsed.pathname.startsWith("/api/v4/projects/")) {
    return null;
  }
  return entry;
}

/**
 * True when the URL points at a known repository archive endpoint.
 * @param {string} url
 */
export function isRepoArchiveUrl(url) {
  return resolveRepoArchiveHost(url) !== null;
}

/**
 * True when the repository host is allowed to receive our stored credential.
 * @param {string} url
 */
export function canSendRepoToken(url) {
  const entry = resolveRepoArchiveHost(url);
  return Boolean(entry && entry.token);
}

/**
 * True when the URL points at a repository *metadata* endpoint we are allowed
 * to query (project info, recursive tree). Metadata responses carry no archive
 * payload, so this is a separate list from the archive allowlist.
 *
 * Each host is restricted to its API surface — GitLab's web routes and
 * HuggingFace's model/dataset/space pages are not part of this allowlist and
 * must not become reachable through it.
 *
 * @param {string} url
 */
export function isRepoMetadataUrl(url) {
  let parsed;
  try {
    parsed = new URL(String(url || ""));
  } catch {
    return false;
  }
  const prefixes = METADATA_PATH_PREFIXES[parsed.hostname];
  if (!prefixes) return false;
  return prefixes.some((prefix) => parsed.pathname.startsWith(prefix));
}

/**
 * True when the URL points at a single-file *raw* endpoint on an allowlisted
 * host. Used to read repository contents one file at a time when the bulk
 * archive endpoint is unavailable to browser requests.
 *
 * Note that HuggingFace answers these with a 307 to a same-host
 * `/api/resolve-cache/...` path; `fetch` follows redirects internally, so only
 * the URL handed to the worker is validated here.
 *
 * @param {string} url
 */
export function isRepoTextUrl(url) {
  let parsed;
  try {
    parsed = new URL(String(url || ""));
  } catch {
    return false;
  }
  // Only hosts with a per-file endpoint belong here. Codeberg is absent on
  // purpose — its archive endpoint serves the whole repository, so it never
  // needs a file-by-file read.
  if (parsed.hostname === "huggingface.co") {
    return isHuggingFaceResolvePath(parsed.pathname);
  }
  if (parsed.hostname === "gitlab.com") {
    return (
      parsed.pathname.startsWith("/api/v4/projects/") &&
      parsed.pathname.includes("/repository/files/") &&
      parsed.pathname.endsWith("/raw")
    );
  }
  return false;
}
