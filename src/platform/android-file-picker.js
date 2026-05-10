/**
 * Native Android file/folder picker bridge.
 *
 * Wraps window.AndroidBridge.pickFiles (when available) into a Promise-based API.
 * Safe to import on all build targets — returns false/rejects when the bridge method is absent.
 *
 * Native bridge contract (WebViewBridge.kt):
 *   pickFiles(mode: String, requestId: String): void
 *     mode:      "files" | "folder"
 *     requestId: UUID-style string ([a-z0-9-], max 64 chars)
 *   Result delivered as CustomEvent '__bds_native_files_picked_<requestId>' with detail:
 *     { files: [{name, content}], folderName?: string }   on success
 *     { error: "cancelled", files: [] }                   on user cancellation
 *     { error: "<message>",  files: [] }                  on error
 */

/**
 * Returns true when AndroidBridge.pickFiles is available (Android 11+ native app with bridge
 * registered). Safe to call on any platform.
 */
export function isNativeFilePickerAvailable() {
  return (
    typeof window !== "undefined" &&
    window.AndroidBridge != null &&
    typeof window.AndroidBridge.pickFiles === "function"
  );
}

/**
 * Launch the native file or folder picker and resolve with the selected files.
 *
 * @param {"files"|"folder"} mode
 * @returns {Promise<{files: Array<{name:string, content:string}>, folderName?: string, cancelled?: boolean}>}
 */
export function nativePickFiles(mode) {
  return new Promise((resolve, reject) => {
    if (!isNativeFilePickerAvailable()) {
      reject(new Error("[BDS] AndroidBridge.pickFiles not available"));
      return;
    }

    const requestId =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : Date.now().toString(36) + Math.random().toString(36).slice(2);

    const eventName = "__bds_native_files_picked_" + requestId;

    const handler = (e) => {
      window.removeEventListener(eventName, handler);
      const data = e.detail;
      if (!data) {
        resolve({ files: [] });
        return;
      }
      if (data.error === "cancelled") {
        resolve({ files: [], cancelled: true });
      } else if (data.error) {
        reject(new Error(data.error));
      } else {
        resolve(data);
      }
    };

    window.addEventListener(eventName, handler);

    try {
      window.AndroidBridge.pickFiles(String(mode || "files"), requestId);
    } catch (err) {
      window.removeEventListener(eventName, handler);
      reject(err);
    }
  });
}

/**
 * Convert native-picked files into a single concatenated File, matching the format produced by
 * pickFolderAndConcatenate in folder-reader.js. All files are assumed to be text (already
 * filtered by the Kotlin side).
 *
 * @param {Array<{name:string, content:string}>} files
 * @param {string} folderName
 * @returns {File|null}
 */
export function buildFolderFileFromNative(files, folderName) {
  if (!files || files.length === 0) return null;

  const tree = buildPathTree(files.map((f) => f.name));
  let content =
    "Directory Tree:\n" +
    renderPathTree(tree) +
    "\n\n========================================\n\n";

  for (const f of files) {
    content += "\n\n--- [FILE: " + f.name + "] ---\n\n";
    content += f.content;
  }

  const blob = new Blob([content], { type: "text/plain" });
  const name = (folderName || "folder") + "_workspace.txt";
  return new File([blob], name, { type: "text/plain" });
}

function buildPathTree(paths) {
  const tree = {};
  for (const p of paths) {
    const parts = p.split("/");
    let cur = tree;
    for (const part of parts) {
      if (!cur[part]) cur[part] = {};
      cur = cur[part];
    }
  }
  return tree;
}

function renderPathTree(tree, prefix) {
  if (prefix === undefined) prefix = "";
  const keys = Object.keys(tree).sort(function (a, b) {
    const aIsDir = Object.keys(tree[a]).length > 0;
    const bIsDir = Object.keys(tree[b]).length > 0;
    if (aIsDir !== bIsDir) return aIsDir ? -1 : 1;
    return a.localeCompare(b);
  });
  let out = "";
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const isLast = i === keys.length - 1;
    // Use ASCII box-drawing approximations to avoid non-ASCII chars in source.
    out += prefix + (isLast ? "`-- " : "|-- ") + key + "\n";
    if (Object.keys(tree[key]).length > 0) {
      out += renderPathTree(tree[key], prefix + (isLast ? "    " : "|   "));
    }
  }
  return out;
}
