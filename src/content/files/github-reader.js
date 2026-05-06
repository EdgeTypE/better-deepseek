/**
 * GitHub Repository Reader
 *
 * Fetches a GitHub repo ZIP via codeload, optionally with a GitHub PAT,
 * extracts in-memory with fflate, filters via .gitignore,
 * and produces a gitingest-style concatenated text file.
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
  "dockerfile", "makefile", "cmake",
  "gitignore", "editorconfig", "eslintrc", "prettierrc",
]);

/**
 * Parse a GitHub URL into { owner, repo, branch }.
 * Supports:
 *   https://github.com/owner/repo
 *   https://github.com/owner/repo/tree/branch
 *   owner/repo
 */
export function parseGitHubUrl(input) {
  let trimmed = input.trim().replace(/\/+$/, "");

  // owner/repo shorthand
  if (/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(trimmed)) {
    const [owner, repo] = trimmed.split("/");
    return { owner, repo, branch: "main" };
  }

  try {
    const url = new URL(trimmed);
    if (url.hostname !== "github.com") return null;

    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return null;

    const owner = parts[0];
    const repo = parts[1];
    let branch = "main";

    // /tree/branch-name or /tree/branch/subpath
    // Only consider it a branch if "tree" is the 3rd segment
    // All segments after "tree" are considered part of the branch name
    // to support slashes in branch names
    if (parts[2] === "tree") {
      branch = parts.slice(3).join("/");
    }

    return { owner, repo, branch };
  } catch {
    return null;
  }
}

/**
 * Fetch, extract, and concatenate a GitHub repo.
 * @param {string} repoUrl - GitHub URL or owner/repo
 * @param {(status: string) => void} onStatus - status callback
 * @param {{ token?: string }} [options] - optional fetch overrides
 * @returns {Promise<File|null>}
 */
export function decodeZipBase64(base64) {
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return bytes;
}

export function buildGitHubFetchError(result, fallbackMessage) {
  if (result && result.authRejected) {
    return new Error(
      "GitHub rejected your token. Check that it has the `repo` scope and hasn't expired."
    );
  }

  if (result && result.status === 404) {
    return new Error(
      "Repository not found or you may need a GitHub token for private repos. Add one in Advanced Settings."
    );
  }

  return new Error(
    result && result.error
      ? result.error
      : fallbackMessage
  );
}

export function preferGitHubFailure(current, next) {
  if (!next) return current;
  if (!current) return next;
  if (next.authRejected && !current.authRejected) return next;
  if (next.status === 404 && current.status !== 404) return next;
  return next;
}

export async function fetchGitHubRepo(repoUrl, onStatus = () => { }, options = {}) {
  const parsed = parseGitHubUrl(repoUrl);
  if (!parsed) {
    throw new Error("Invalid GitHub URL. Use: https://github.com/owner/repo");
  }

  const { owner, repo, branch } = parsed;
  const token = String(
    typeof options.token === "string" ? options.token : ""
  ).trim();

  // Try main, then master as fallback
  // Fetch via background service worker to bypass CORS
  let zipData = null;
  let lastFailure = null;
  for (const b of [branch, branch === "main" ? "master" : null].filter(Boolean)) {
    const codeloadUrl = `https://codeload.github.com/${owner}/${repo}/zip/refs/heads/${b}`;
    onStatus(`Downloading ${owner}/${repo} (${b})...`);

    try {
      const result = await chrome.runtime.sendMessage({
        type: "bds-fetch-github-zip",
        url: codeloadUrl,
        token: token || undefined,
      });

      if (result && result.ok && result.base64) {
        zipData = decodeZipBase64(result.base64);
        break;
      }

      lastFailure = preferGitHubFailure(lastFailure, result);
      if (result && result.authRejected) {
        break;
      }
    } catch (error) {
      lastFailure = preferGitHubFailure(lastFailure, {
        error: String(error && error.message ? error.message : error),
      });
      // try next branch
    }
  }

  if (!zipData) {
    throw buildGitHubFetchError(
      lastFailure,
      `Could not download ${owner}/${repo}/${branch}. Check the URL and make sure the repo is public.`
    );
  }

  onStatus("Extracting ZIP...");

  let files;
  try {
    files = unzipSync(zipData);
  } catch (e) {
    throw new Error("Failed to extract ZIP: " + e.message);
  }

  // The ZIP root is usually "{repo}-{branch}/"
  const filePaths = Object.keys(files);
  const rootPrefix = findCommonPrefix(filePaths);

  // Parse .gitignore if present
  const ig = ignore();
  const gitignoreKey = filePaths.find(
    (p) => stripPrefix(p, rootPrefix) === ".gitignore"
  );
  if (gitignoreKey) {
    try {
      const raw = strFromU8(files[gitignoreKey]);
      ig.add(raw);
    } catch {
      // ignore parse errors
    }
  }

  onStatus("Processing files...");

  // Collect valid paths
  const validEntries = [];
  for (const fullPath of filePaths) {
    const relativePath = stripPrefix(fullPath, rootPrefix);
    if (!relativePath || fullPath.endsWith("/")) continue; // skip dirs

    // Check skip directories
    const pathParts = relativePath.split("/");
    if (pathParts.some((part) => SKIP_DIRS.has(part))) continue;

    // Check skip files
    const fileName = pathParts[pathParts.length - 1];
    if (SKIP_FILES.has(fileName)) continue;

    // Check binary extensions
    const ext = fileName.includes(".")
      ? fileName.split(".").pop().toLowerCase()
      : "";
    if (BINARY_EXTS.has(ext)) continue;

    // Check .gitignore
    if (ig.ignores(relativePath)) continue;

    // Check file size (skip > 2MB)
    if (files[fullPath].length > 2 * 1024 * 1024) continue;

    // Only include known text extensions or extensionless files that are small
    const isKnownText = TEXT_EXTS.has(ext) || TEXT_EXTS.has(fileName.toLowerCase());
    if (!isKnownText && ext) continue;

    validEntries.push({ fullPath, relativePath });
  }

  // Sort for deterministic output
  validEntries.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  // Build file tree
  let output = `Repository: ${owner}/${repo}/${branch}\n`;
  output += `${"=".repeat(48)}\n\n`;
  output += "Directory Tree:\n";
  output += buildTree(validEntries.map((e) => e.relativePath));
  output += `\n${"=".repeat(48)}\n`;

  // Concatenate file contents
  for (const { fullPath, relativePath } of validEntries) {
    try {
      const content = strFromU8(files[fullPath]);
      // Skip if it contains null bytes (binary disguised as text)
      if (content.indexOf("\0") !== -1) continue;

      output += `\n${"=".repeat(64)}\n`;
      output += `File: ${relativePath}\n`;
      output += `${"=".repeat(64)}\n`;
      output += `<file_content>\n${content}\n</file_content>\n`;
    } catch {
      // encoding error, skip
    }
  }

  onStatus("Creating file...");

  const blob = new Blob([output], { type: "text/plain" });
  return new File([blob], `${repo}_github.txt`, { type: "text/plain" });
}

/** Strip the common ZIP root prefix from a path */
function stripPrefix(path, prefix) {
  if (path.startsWith(prefix)) {
    return path.slice(prefix.length);
  }
  return path;
}

/** Find the common directory prefix (the ZIP root folder) */
function findCommonPrefix(paths) {
  if (!paths.length) return "";
  const first = paths[0];
  const slashIdx = first.indexOf("/");
  if (slashIdx === -1) return "";
  return first.slice(0, slashIdx + 1);
}

/** Build a visual file tree string from a list of relative paths */
function buildTree(paths) {
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
