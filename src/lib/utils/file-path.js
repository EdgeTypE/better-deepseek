import { buildTimestamp } from "./helpers.js";

/**
 * Normalize a file path: strip drive letters, resolve traversals, sanitize.
 */
export function normalizeFilePath(fileName) {
  const cleaned = String(fileName || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^[A-Za-z]:/, "")
    .replace(/^\/+/, "");

  if (!cleaned) {
    return "file.txt";
  }

  const safeParts = cleaned
    .split("/")
    .filter((part) => part && part !== "." && part !== "..")
    .map((part) => part.replace(/[<>:"|?*]/g, "_"));

  return safeParts.join("/") || "file.txt";
}

/**
 * Build a descriptive zip filename from a create_file path.
 */
export function buildCreateFilePackageName(path) {
  const normalizedPath = normalizeFilePath(path);
  const folderHint = normalizedPath.includes("/")
    ? normalizedPath.split("/").slice(0, -1).join("-")
    : normalizedPath.split(".")[0];

  const safeHint = folderHint
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const base = safeHint || "generated-file";
  return `${base}-${buildTimestamp()}.zip`;
}

/**
 * Guess MIME type from file extension.
 */
export function guessMimeType(fileName) {
  const ext = String(fileName || "").split(".").pop().toLowerCase();

  switch (ext) {
    case "html":
      return "text/html";
    case "css":
      return "text/css";
    case "js":
    case "ts":
    case "tsx":
    case "jsx":
      return "application/javascript";
    case "json":
      return "application/json";
    case "md":
      return "text/markdown";
    case "py":
    case "txt":
    default:
      return "text/plain";
  }
}
