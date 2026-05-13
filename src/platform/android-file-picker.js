/**
 * Native Android file/folder picker bridge.
 *
 * Wraps AndroidBridge.pickFiles in a Promise API. The native side opens an
 * unrestricted Android document picker and returns text-file contents to JS,
 * which avoids WebView accept/MIME filtering problems for extensions such as
 * .md on Android builds that do not know text/markdown.
 */

export function isNativeFilePickerAvailable() {
  return (
    typeof window !== "undefined" &&
    window.AndroidBridge != null &&
    typeof window.AndroidBridge.pickFiles === "function"
  );
}

export function nativePickFiles(mode = "files") {
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

    const handler = (event) => {
      window.removeEventListener(eventName, handler);
      const data = event.detail;
      if (!data) {
        resolve({ files: [] });
        return;
      }
      if (data.error === "cancelled" || data.cancelled) {
        resolve({ files: [], cancelled: true });
        return;
      }
      if (data.error) {
        reject(new Error(data.error));
        return;
      }
      resolve(data);
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

export function buildFolderFileFromNative(files, folderName) {
  if (!files || files.length === 0) return null;

  const tree = buildPathTree(files.map((file) => file.name));
  let content =
    "Directory Tree:\n" +
    renderPathTree(tree) +
    "\n\n========================================\n\n";

  for (const file of files) {
    content += "\n\n--- [FILE: " + file.name + "] ---\n\n";
    content += file.content;
  }

  const name = (folderName || "folder") + "_workspace.txt";
  const blob = new Blob([content], { type: "text/plain" });
  return new File([blob], name, { type: "text/plain" });
}

function buildPathTree(paths) {
  const tree = {};
  for (const path of paths) {
    const parts = path.split("/");
    let current = tree;
    for (const part of parts) {
      if (!current[part]) current[part] = {};
      current = current[part];
    }
  }
  return tree;
}

function renderPathTree(tree, prefix = "") {
  const keys = Object.keys(tree).sort((a, b) => {
    const aIsDir = Object.keys(tree[a]).length > 0;
    const bIsDir = Object.keys(tree[b]).length > 0;
    if (aIsDir !== bIsDir) return aIsDir ? -1 : 1;
    return a.localeCompare(b);
  });

  let output = "";
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const isLast = index === keys.length - 1;
    output += prefix + (isLast ? "`-- " : "|-- ") + key + "\n";
    if (Object.keys(tree[key]).length > 0) {
      output += renderPathTree(tree[key], prefix + (isLast ? "    " : "|   "));
    }
  }
  return output;
}
