/**
 * Shared repository archive extraction.
 *
 * Several forges (GitHub, GitLab, Codeberg/Gitea) expose a "download the whole
 * repository as a ZIP" endpoint that needs no API key for public repos. The
 * download itself happens in the background service worker (`bds-fetch-repo-zip`)
 * because codeload / gitlab.com / codeberg.org do not send CORS headers.
 *
 * Everything after the download — unzip, filter, tree, concatenate — is
 * forge-independent, so it lives here and each reader only contributes:
 *   1. a URL parser
 *   2. an archive URL builder
 *   3. a display label
 */

import { unzipSync, strFromU8 } from "fflate";
import ignore from "ignore";

/** Default directories to always skip */
const SKIP_DIRS = new Set([
  "node_modules", ".git", ".github", "dist", "build",
  ".idea", ".vscode", ".vs", "bin", "obj", "out", "target",
  "__pycache__", ".next", ".nuxt", "vendor", "Pods",
]);

/** Default file names to always skip */
const SKIP_FILES = new Set([
  "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
  "composer.lock", "Gemfile.lock", "Cargo.lock",
  "poetry.lock", "go.sum",
]);

/** Binary / media extensions to skip */
const BINARY_EXTS = new Set([
  "png", "jpg", "jpeg", "gif", "bmp", "ico", "svg", "webp", "avif",
  "mp3", "mp4", "avi", "mov", "mkv", "flv", "wav", "ogg", "webm",
  "exe", "dll", "so", "dylib", "o", "a", "lib",
  "zip", "tar", "gz", "bz2", "7z", "rar", "xz",
  "woff", "woff2", "ttf", "otf", "eot",
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
  "pyc", "class", "jar",
  "db", "sqlite", "sqlite3",
  "DS_Store",
]);

/** Text extensions we actively want to include */
const TEXT_EXTS = new Set([
  "js", "ts", "jsx", "tsx", "mjs", "cjs",
  "svelte", "vue", "html", "htm", "css", "scss", "sass", "less",
  "json", "jsonc", "json5",
  "md", "mdx", "txt", "rst", "adoc",
  "py", "pyi", "pyw",
  "c", "cpp", "cxx", "cc", "h", "hpp", "hxx",
  "java", "kt", "kts", "groovy", "scala",
  "go", "rs", "rb", "php", "pl", "pm",
  "sh", "bash", "zsh", "fish", "ps1", "bat", "cmd",
  "yml", "yaml", "toml", "ini", "cfg", "conf",
  "csv", "tsv", "sql",
  "xml", "xsl", "xsd", "wsdl",
  "env", "env.example", "env.local",
  "cs", "csproj", "sln", "fs", "fsx", "fsproj", "vb", "vbproj",
  "razor", "cshtml",
  "swift", "dart", "r", "R", "jl",
  "lua", "ex", "exs", "erl", "hrl",
  "tf", "hcl",
  "proto", "graphql", "gql",
  "dockerfile", "makefile", "cmake", "nix",
  "gitignore", "editorconfig", "eslintrc", "prettierrc",
]);

/** Maximum size for a single included file */
export const MAX_FILE_BYTES = 2 * 1024 * 1024;

/** Decode a base64 payload into raw bytes. */
export function decodeZipBase64(base64) {
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return bytes;
}

/**
 * Carry the HTTP status from a background response onto the thrown Error.
 *
 * Without this the status is lost between the message reply and the caller,
 * so callers cannot tell "404 wrong ref" apart from "403 private repo" and
 * every failure reads as "not found".
 */
function decorateWithStatus(error, result) {
  if (result && Number.isFinite(result.status)) {
    error.status = Number(result.status);
  }
  return error;
}

/**
 * Decide whether a repo-relative path belongs in the text output.
 *
 * Considers the skip-dir / skip-file / binary-extension / text-extension lists
 * only. `.gitignore` matching and the size cap are the caller's job, because
 * they depend on information the caller has (parsed ignore rules, byte length).
 *
 * @param {string} relativePath - path relative to the repository root
 */
export function isIncludedRepoPath(relativePath) {
  if (!relativePath) return false;

  const pathParts = relativePath.split("/");
  if (pathParts.some((part) => SKIP_DIRS.has(part))) return false;

  const fileName = pathParts[pathParts.length - 1];
  if (SKIP_FILES.has(fileName)) return false;

  const ext = fileName.includes(".")
    ? fileName.split(".").pop().toLowerCase()
    : "";
  if (BINARY_EXTS.has(ext)) return false;

  const isKnownText = TEXT_EXTS.has(ext) || TEXT_EXTS.has(fileName.toLowerCase());
  if (!isKnownText && ext) return false;

  return true;
}

/**
 * Render the shared output layout: header, directory tree, then one section
 * per file. Entries containing null bytes are dropped as disguised binaries.
 *
 * @param {{relativePath: string, content: string}[]} entries
 * @param {string} label - e.g. "owner/repo@main"
 */
export function renderRepoText(entries, label) {
  const sorted = [...entries].sort((a, b) =>
    a.relativePath.localeCompare(b.relativePath),
  );

  let output = `Repository: ${label}\n`;
  output += `${"=".repeat(48)}\n\n`;
  output += "Directory Tree:\n";
  output += buildTree(sorted.map((e) => e.relativePath));
  output += `\n${"=".repeat(48)}\n`;

  for (const { relativePath, content } of sorted) {
    // Skip if it contains null bytes (binary disguised as text)
    if (content.indexOf("\0") !== -1) continue;

    output += `\n${"=".repeat(64)}\n`;
    output += `File: ${relativePath}\n`;
    output += `${"=".repeat(64)}\n`;
    output += `<file_content>\n${content}\n</file_content>\n`;
  }

  return output;
}

/** Wrap rendered repository text in a File carrying the forge metadata stamp. */
export function createRepoFile(text, meta) {
  const blob = new Blob([text], { type: "text/plain" });
  const file = new File([blob], meta.fileName, { type: "text/plain" });
  if (meta.forge && meta.forgeMeta) {
    Object.defineProperty(file, meta.forge, {
      value: meta.forgeMeta,
      configurable: true,
    });
  }
  return file;
}

/**
 * Build the output File from already-fetched file contents.
 *
 * Used by forges whose bulk archive endpoint is unavailable to browser
 * requests, so the repository is read file-by-file through the API instead.
 *
 * @param {{relativePath: string, content: string}[]} entries
 * @param {object} meta - { label, fileName, forge?, forgeMeta? }
 * @param {(status: string) => void} [onStatus]
 * @returns {File}
 */
export function buildRepoTextFile(entries, meta, onStatus = () => {}) {
  onStatus("Creating file...");
  return createRepoFile(renderRepoText(entries, meta.label), meta);
}

/**
 * Ask the background worker for JSON from an allowlisted repository API.
 *
 * Used to resolve a repository's default revision before walking its file
 * tree (GitLab project metadata, HuggingFace repo info).
 *
 * @param {string} url
 */
export async function fetchRepoJson(url) {
  const res = await chrome.runtime.sendMessage({
    type: "bds-fetch-repo-metadata",
    url,
  });
  if (!res || !res.ok) {
    const error = new Error(
      (res && res.error) || "Failed to query the repository API.",
    );
    if (res && Number.isFinite(res.status)) error.status = Number(res.status);
    throw error;
  }
  return res.data;
}

/**
 * Ask the background worker for a single repository file's text.
 *
 * Some forges refuse bulk archive downloads to anonymous browser requests
 * (GitLab answers 406) and HuggingFace has no archive endpoint at all, so
 * those repositories are read one file at a time instead.
 *
 * @param {string} url
 */
export async function fetchRepoText(url) {
  const res = await chrome.runtime.sendMessage({
    type: "bds-fetch-repo-text",
    url,
  });
  if (!res || !res.ok) {
    const error = new Error(
      (res && res.error) || "Failed to read a repository file.",
    );
    if (res && Number.isFinite(res.status)) error.status = Number(res.status);
    throw error;
  }
  return res.text;
}

/** Run `fn` over `items` with a bounded number of concurrent workers. */
export async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  const workerCount = Math.max(1, Math.min(limit, items.length));

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (cursor < items.length) {
        const index = cursor++;
        results[index] = await fn(items[index], index);
      }
    }),
  );

  return results;
}

/**
 * Build the output File by walking a repository's file list.
 *
 * Shared by forges that cannot download a bulk archive and must read files one
 * at a time — GitLab, whose archive endpoints reject anonymous browser
 * requests, and HuggingFace, which has no archive endpoint at all.
 *
 * Entries are filtered *before* any file is fetched, so an oversized or
 * irrelevant file costs nothing.
 *
 * @param {object} options
 * @param {{path: string, size?: number|null}[]} options.entries - full file list
 * @param {(path: string) => Promise<string>} options.fetchFile - reads one file
 * @param {object} options.meta - { label, fileName, forge?, forgeMeta? }
 * @param {(status: string) => void} [options.onStatus]
 * @param {number} [options.maxFiles] - cap on files read (one request each)
 * @param {number} [options.concurrency]
 * @param {string} [options.emptyMessage]
 * @returns {Promise<File>}
 */
export async function buildRepoFromTree({
  entries,
  fetchFile,
  meta,
  onStatus = () => {},
  maxFiles = 400,
  concurrency = 6,
  emptyMessage,
}) {
  const ig = ignore();
  if (entries.some((entry) => entry.path === ".gitignore")) {
    try {
      ig.add(await fetchFile(".gitignore"));
    } catch {
      // ignore parse/fetch errors — filtering simply stays less strict
    }
  }

  const wanted = entries
    // Skip anything already known to be too large, before spending a request.
    .filter((entry) => entry.size == null || entry.size <= MAX_FILE_BYTES)
    .filter((entry) => isIncludedRepoPath(entry.path))
    .filter((entry) => !ig.ignores(entry.path))
    .slice(0, maxFiles)
    .map((entry) => entry.path);

  onStatus(`Reading ${wanted.length} files...`);

  let done = 0;
  const fetched = await mapLimit(wanted, concurrency, async (path) => {
    try {
      const content = await fetchFile(path);
      if (content.length > MAX_FILE_BYTES) return null;
      return { relativePath: path, content };
    } catch {
      // A single unreadable file must not sink the whole import.
      return null;
    } finally {
      done++;
      if (done % 10 === 0 || done === wanted.length) {
        onStatus(`Reading files... ${done}/${wanted.length}`);
      }
    }
  });

  const results = fetched.filter(Boolean);
  if (!results.length) {
    throw new Error(
      emptyMessage ||
        `No readable text files found for ${meta.label}. ` +
          "The repository may contain only binary or ignored files.",
    );
  }

  return buildRepoTextFile(results, meta, onStatus);
}

/**
 * Build a filtered, concatenated text representation of a repository archive.
 *
 * @param {Uint8Array} zipData - raw ZIP bytes
 * @param {object} meta
 * @param {string} meta.label - header line, e.g. "owner/repo@main"
 * @param {string} meta.fileName - output file name
 * @param {string} [meta.forge] - property name for the metadata stamp
 * @param {object} [meta.forgeMeta] - value for the metadata stamp
 * @param {(status: string) => void} [onStatus]
 * @returns {File}
 */
export function buildRepoArchiveFile(zipData, meta, onStatus = () => {}) {
  onStatus("Extracting ZIP...");

  let files;
  try {
    files = unzipSync(zipData);
  } catch (e) {
    throw new Error("Failed to extract ZIP: " + (e && e.message ? e.message : e));
  }

  // The ZIP root is usually "{repo}-{ref}/"; derive it from the file entries
  // rather than assuming the exact naming scheme of the forge.
  const filePaths = Object.keys(files);
  const rootPrefix = findCommonPrefix(filePaths);

  // Parse .gitignore if present
  const ig = ignore();
  const gitignoreKey = filePaths.find(
    (p) => stripPrefix(p, rootPrefix) === ".gitignore",
  );
  if (gitignoreKey) {
    try {
      ig.add(strFromU8(files[gitignoreKey]));
    } catch {
      // ignore parse errors
    }
  }

  onStatus("Processing files...");

  const entries = [];
  for (const fullPath of filePaths) {
    const relativePath = stripPrefix(fullPath, rootPrefix);
    if (!relativePath || fullPath.endsWith("/")) continue; // skip dirs
    if (!isIncludedRepoPath(relativePath)) continue;
    if (ig.ignores(relativePath)) continue;
    if (files[fullPath].length > MAX_FILE_BYTES) continue;

    try {
      entries.push({ relativePath, content: strFromU8(files[fullPath]) });
    } catch {
      // encoding error, skip
    }
  }

  onStatus("Creating file...");
  return createRepoFile(renderRepoText(entries, meta.label), meta);
}

/**
 * Ask the background worker for a repository ZIP and turn it into a File.
 *
 * @param {object} options
 * @param {string} options.archiveUrl
 * @param {string} options.label
 * @param {string} options.fileName
 * @param {string} [options.forge]
 * @param {object} [options.forgeMeta]
 * @param {string} [options.token] - only sent to hosts that allow it (GitHub)
 * @param {string} [options.invalidMessage]
 * @param {(status: string) => void} [onStatus]
 * @returns {Promise<File>}
 */
export async function fetchRepoArchive(options, onStatus = () => {}) {
  const {
    archiveUrl,
    label,
    fileName,
    forge,
    forgeMeta,
    token,
    invalidMessage,
    notFoundMessage,
  } = options;

  onStatus(`Downloading ${label}...`);

  let result;
  try {
    result = await chrome.runtime.sendMessage({
      type: "bds-fetch-repo-zip",
      url: archiveUrl,
      token: token || undefined,
    });
  } catch (error) {
    throw new Error(String((error && error.message) || error));
  }

  if (!result || !result.ok || !result.base64) {
    if (result && result.status === 404 && notFoundMessage) {
      throw decorateWithStatus(new Error(notFoundMessage), result);
    }
    throw decorateWithStatus(
      new Error(
        (result && result.error) || invalidMessage || "Failed to download repository.",
      ),
      result,
    );
  }

  return buildRepoArchiveFile(
    decodeZipBase64(result.base64),
    { label, fileName, forge, forgeMeta },
    onStatus,
  );
}

/** Strip the common ZIP root prefix from a path */
export function stripPrefix(path, prefix) {
  if (prefix && path.startsWith(prefix)) {
    return path.slice(prefix.length);
  }
  return path;
}

/** Find the common directory prefix (the ZIP root folder) */
export function findCommonPrefix(paths) {
  if (!paths.length) return "";

  // ZIPs vary: some list a bare directory entry ("repo-main/") before any file,
  // others list files first. Deriving the prefix from paths[0] therefore only
  // works for one of the two layouts — and a leading directory entry yields a
  // prefix of "" which then breaks the "skip directories" check downstream.
  // Instead, intersect the first segment across all *file* entries.
  const segments = [];
  for (const p of paths) {
    if (!p || p.endsWith("/")) continue; // directory entry
    const slashIdx = p.indexOf("/");
    if (slashIdx === -1) return ""; // a top-level file exists → no common root
    segments.push(p.slice(0, slashIdx));
  }

  if (!segments.length) return "";
  const [first, ...rest] = segments;
  return rest.every((segment) => segment === first) ? `${first}/` : "";
}

/** Build a visual file tree string from a list of relative paths */
export function buildTree(paths) {
  const tree = {};
  for (const p of paths) {
    const parts = p.split("/");
    let current = tree;
    for (const part of parts) {
      if (!current[part]) current[part] = {};
      current = current[part];
    }
  }

  let result = "";

  function walk(node, prefix = "") {
    const keys = Object.keys(node).sort((a, b) => {
      const aDir = Object.keys(node[a]).length > 0;
      const bDir = Object.keys(node[b]).length > 0;
      if (aDir && !bDir) return -1;
      if (!aDir && bDir) return 1;
      return a.localeCompare(b);
    });

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const isLast = i === keys.length - 1;
      const marker = isLast ? "\u2514\u2500\u2500 " : "\u251c\u2500\u2500 ";
      const children = node[key];
      const isDir = Object.keys(children).length > 0;
      result += prefix + marker + key + (isDir ? "/" : "") + "\n";
      if (isDir) {
        walk(children, prefix + (isLast ? "    " : "\u2502   "));
      }
    }
  }

  walk(tree);
  return result;
}
