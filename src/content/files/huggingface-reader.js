/**
 * HuggingFace Repository Reader
 *
 * HuggingFace exposes no bulk archive endpoint, so a repository is read through
 * two keyless APIs:
 *
 *   https://huggingface.co/api/{models|datasets|spaces}/{owner}/{repo}/tree/{rev}?recursive=true
 *   https://huggingface.co/{[datasets|spaces]/}{owner}/{repo}/resolve/{rev}/{path}
 *
 * The tree listing carries a `size` for every file, which is what makes a
 * documentation-only import possible: weights and dataset arrays are dropped
 * *before* a single byte is downloaded.
 *
 * Measured behaviours this reader relies on (probed live, not assumed):
 *   - Tree items are `{ type: "file" | "directory", oid, size, path }`. A
 *     directory reports `size: 0`, so `type` decides, never `size`.
 *   - The revision is mandatory — `/tree` without one answers 404.
 *   - Repo info exposes `sha` (the tip of the default revision) but **no**
 *     `default_branch` field, so `main` is tried first and `sha` is the
 *     fallback for a repository whose default branch is something else.
 *   - `resolve/` answers 307 to a same-host `/api/resolve-cache/...` path.
 *     `fetch` follows that internally, and the background allowlist only ever
 *     inspects the first URL.
 */

import { buildRepoFromTree, fetchRepoJson, fetchRepoText } from "./repo-archive.js";

export const HUGGINGFACE_HOST = "huggingface.co";

/** `hf.co` is the official short-link domain; normalise it to the real host. */
export const HUGGINGFACE_SHORT_HOST = "hf.co";

/** Web path prefixes that map 1:1 onto the API segment of the same name. */
const KIND_SEGMENTS = Object.freeze(["datasets", "spaces"]);

/** Default revision. HuggingFace standardised on `main`. */
const DEFAULT_REF = "main";

/** Safety stop so a pathological repo cannot spin forever. */
const MAX_TREE_PAGES = 50;

/**
 * Upper bound on files read through the API. Each file costs one request, so
 * the walk is deliberately bounded rather than unbounded.
 */
const MAX_FILES = 400;

/** Parallel file requests. High enough to be quick, low enough to be polite. */
const FETCH_CONCURRENCY = 6;

/**
 * Weight / tensor / dataset-array formats. The shared path filter already drops
 * any extension it does not recognise as text, but naming these explicitly
 * keeps the "never import model weights" rule readable and testable — a repo
 * import is meant to carry documentation, not a checkpoint.
 */
const HF_MODEL_EXTS = new Set([
  // Weights and serialised models
  "safetensors", "bin", "pt", "pth", "ckpt", "onnx", "h5", "msgpack",
  "tflite", "gguf", "ggml", "ot", "model", "joblib", "pkl", "pickle",
  // Dataset columnar / array formats
  "parquet", "arrow", "npy", "npz", "feather", "tfrecord", "idx", "record",
]);

/**
 * True when a path looks like a model weight or dataset array.
 *
 * @param {string} path
 */
export function isHuggingFaceModelFile(path) {
  const name = String(path || "").split("/").pop().toLowerCase();
  const dot = name.lastIndexOf(".");
  if (dot === -1) return false;
  return HF_MODEL_EXTS.has(name.slice(dot + 1));
}

/**
 * Parse a HuggingFace URL (or `owner/repo` shorthand) into its parts.
 *
 * Supports:
 *   https://huggingface.co/owner/model
 *   https://huggingface.co/owner/model/tree/main
 *   https://huggingface.co/owner/model/tree/refs%2Fpr%2F1
 *   https://huggingface.co/datasets/owner/dataset
 *   https://huggingface.co/spaces/owner/space
 *   https://hf.co/owner/model
 *   owner/model
 *   datasets/owner/dataset
 *
 * @returns {{ kind: "models"|"datasets"|"spaces", owner: string, repo: string, ref: string } | null}
 */
export function parseHuggingFaceUrl(input) {
  const trimmed = String(input || "").trim().replace(/\/+$/, "");
  if (!trimmed) return null;

  // Shorthand without a scheme: owner/repo, or datasets/owner/repo.
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) && trimmed.includes("/")) {
    const parts = trimmed.replace(/\.git$/, "").split("/").filter(Boolean);
    if (parts.length < 2) return null;

    let kind = "models";
    if (KIND_SEGMENTS.includes(parts[0])) {
      kind = parts[0];
      parts.shift();
    }
    if (parts.length < 2) return null;

    return { kind, owner: parts[0], repo: parts[1], ref: DEFAULT_REF };
  }

  let url;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase();
  if (host !== HUGGINGFACE_HOST && host !== HUGGINGFACE_SHORT_HOST) return null;

  const parts = url.pathname.split("/").filter(Boolean);
  if (!parts.length) return null;

  let kind = "models";
  if (KIND_SEGMENTS.includes(parts[0])) {
    kind = parts[0];
    parts.shift();
  }
  if (parts.length < 2) return null;

  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/, "");
  if (!owner || !repo) return null;

  // /tree/<ref>, /blob/<ref>/... and /resolve/<ref>/... all carry the revision
  // in the same slot.
  let ref = DEFAULT_REF;
  if (
    (parts[2] === "tree" || parts[2] === "blob" || parts[2] === "resolve") &&
    parts[3]
  ) {
    ref = decodeURIComponent(parts[3]);
  }

  return { kind, owner, repo, ref };
}

/** Encode a repo id for use as a path (the `/` between owner and name stays). */
function encodeRepoId({ owner, repo }) {
  return `${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

/** Recursive file listing. The revision is required by the API. */
export function buildHuggingFaceTreeUrl({ kind, owner, repo, ref }) {
  const revision = encodeURIComponent(
    String(ref || "").trim() || DEFAULT_REF,
  );
  return (
    `https://${HUGGINGFACE_HOST}/api/${kind}/${encodeRepoId({ owner, repo })}` +
    `/tree/${revision}?recursive=true`
  );
}

/** Repo info — the only place the default revision's commit is published. */
export function buildHuggingFaceInfoUrl({ kind, owner, repo }) {
  return `https://${HUGGINGFACE_HOST}/api/${kind}/${encodeRepoId({ owner, repo })}`;
}

/** Raw contents of a single file. Each path segment is encoded separately. */
export function buildHuggingFaceFileUrl({ kind, owner, repo, ref, path }) {
  const prefix = kind === "models" ? "" : `${kind}/`;
  const revision = encodeURIComponent(String(ref || "").trim() || DEFAULT_REF);
  const encodedPath = String(path || "")
    .split("/")
    .map(encodeURIComponent)
    .join("/");
  return (
    `https://${HUGGINGFACE_HOST}/${prefix}${encodeRepoId({ owner, repo })}` +
    `/resolve/${revision}/${encodedPath}`
  );
}

/**
 * Turn a failed attempt into a user-facing message. A 401/403 means the repo is
 * gated or private, which is a completely different fix than "wrong revision".
 */
function describeFailure(error, hostPath) {
  const status = error && Number.isFinite(error.status) ? error.status : null;
  if (status === 401 || status === 403) {
    return (
      `HuggingFace denied access to ${hostPath} (${status}). ` +
      "The repository is gated or private."
    );
  }
  if (status === 429) {
    return "HuggingFace is rate limiting anonymous requests. Wait a moment and try again.";
  }
  return "Make sure the repository is public and the path is correct.";
}

/**
 * List the repository tree, drop weights / oversized files, then read what is
 * left one file at a time.
 *
 * @returns {Promise<File>}
 */
export async function fetchHuggingFaceTree(
  { kind, owner, repo, ref },
  meta,
  onStatus = () => {},
) {
  onStatus("Listing repository files...");

  const raw = await fetchRepoJson(
    buildHuggingFaceTreeUrl({ kind, owner, repo, ref }),
  );
  const items = Array.isArray(raw) ? raw : [];

  // Directories report `size: 0`, so `type` is what separates them from files.
  const entries = items
    .filter((item) => item && item.type === "file" && typeof item.path === "string")
    .filter((item) => !isHuggingFaceModelFile(item.path))
    .map((item) => ({
      path: item.path,
      size: Number.isFinite(item.size) ? item.size : null,
    }));

  if (!entries.length) {
    // Most likely a bad revision — surface it as 404 so the caller can retry.
    const error = new Error(`HuggingFace returned no files for ${meta.label}.`);
    error.status = 404;
    throw error;
  }

  return buildRepoFromTree({
    entries,
    fetchFile: (path) =>
      fetchRepoText(buildHuggingFaceFileUrl({ kind, owner, repo, ref, path })),
    meta,
    onStatus,
    maxFiles: MAX_FILES,
    concurrency: FETCH_CONCURRENCY,
    emptyMessage:
      `HuggingFace returned no readable text files for ${meta.label}. ` +
      "The repository may contain only model weights or binary files.",
  });
}

/**
 * Fetch and concatenate a HuggingFace repository (model, dataset or space).
 *
 * Revision resolution order:
 *   1. The explicit ref from the URL, if the user typed one.
 *   2. `main`, the HuggingFace convention.
 *   3. The default revision's commit `sha`, read from the repo info endpoint.
 *
 * @param {string} repoUrl - HuggingFace URL or owner/repo
 * @param {(status: string) => void} [onStatus]
 * @returns {Promise<File|null>}
 */
export async function fetchHuggingFaceRepo(repoUrl, onStatus = () => {}) {
  const parsed = parseHuggingFaceUrl(repoUrl);
  if (!parsed) {
    throw new Error(
      "Invalid HuggingFace URL. Use: https://huggingface.co/owner/model",
    );
  }

  const { kind, owner, repo } = parsed;
  const kindPrefix = kind === "models" ? "" : `${kind}/`;
  const hostPath = `${kindPrefix}${owner}/${repo}`;

  const explicitRef = String(parsed.ref || "").trim();
  const hasExplicitRef = Boolean(explicitRef) && explicitRef !== DEFAULT_REF;
  const labelRef = hasExplicitRef ? explicitRef : DEFAULT_REF;

  const meta = {
    label: `${hostPath}@${labelRef}`,
    fileName: `${repo}_huggingface.txt`,
    forge: "bdsHuggingFace",
    forgeMeta: { kind, owner, repo, ref: labelRef },
  };

  // An explicit ref is authoritative. Otherwise `main` is the near-universal
  // default and costs nothing to try before asking for metadata.
  const refs = [labelRef];
  let lastError = null;

  for (const ref of refs) {
    try {
      return await fetchHuggingFaceTree({ ...parsed, ref }, meta, onStatus);
    } catch (error) {
      lastError = error;
    }
  }

  // Last resort: the default branch may not be `main`. Ask the repo info
  // endpoint for the default revision's commit and retry it once.
  if (!hasExplicitRef) {
    try {
      const info = await fetchRepoJson(buildHuggingFaceInfoUrl(parsed));
      const sha =
        info && typeof info === "object" ? String(info.sha || "").trim() : "";
      if (sha) {
        return await fetchHuggingFaceTree(
          { ...parsed, ref: sha },
          meta,
          onStatus,
        );
      }
    } catch (error) {
      lastError = lastError || error;
    }
  }

  throw new Error(
    `HuggingFace repository not found. Tried: ${refs.join(", ")}. ` +
      describeFailure(lastError, hostPath) +
      (lastError ? ` Last error: ${lastError.message}` : ""),
  );
}
