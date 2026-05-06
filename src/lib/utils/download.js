/**
 * Trigger a Blob download via an ephemeral anchor element.
 */
export function triggerBlobDownload(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = flattenPathForDownload(fileName);
  anchor.rel = "noopener";

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 2000);
}

/**
 * Trigger a plain-text download.
 */
export function triggerTextDownload(text, fileName) {
  const blob = new Blob([String(text || "")], { type: "text/plain" });
  triggerBlobDownload(blob, fileName);
}

/**
 * Trigger a download by opening a URL in a new tab.
 */
export function triggerUrlDownload(url) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.target = "_blank";
  anchor.rel = "noopener";

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

/**
 * Flatten a path for use as a download filename.
 */
export function flattenPathForDownload(path) {
  return String(path || "file.txt")
    .replace(/[<>:"|?*]/g, "_")
    .replace(/\//g, "__");
}
