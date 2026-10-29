/**
 * Trigger a Blob download.
 *
 * On Chrome/Firefox we drop an ephemeral <a download> anchor — the browser
 * handles the rest. Inside the Android WebView that path is unreliable
 * (anchor downloads aren't surfaced to the user), so when the native
 * AndroidBridge.downloadBlob hook is available we hand the bytes to Kotlin
 * which writes them into MediaStore.Downloads and shows a toast.
 */
export function triggerBlobDownload(blob, fileName) {
  const flatName = flattenPathForDownload(fileName);

  if (canUseAndroidBridge()) {
    triggerNativeBlobDownload(blob, flatName).catch((err) => {
      console.error("[BDS] Android downloadBlob failed:", err);
    });
    return;
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = flatName;
  anchor.rel = "noopener";

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 2000);
}

function canUseAndroidBridge() {
  return (
    typeof window !== "undefined" &&
    window.AndroidBridge &&
    typeof window.AndroidBridge.downloadBlob === "function"
  );
}

async function triggerNativeBlobDownload(blob, flatName) {
  // Prefer Blob.arrayBuffer when available; fall back to Response wrapping
  // because some embedded WebView builds (and jsdom in tests) ship a partial
  // Blob implementation without arrayBuffer.
  const buffer =
    typeof blob.arrayBuffer === "function"
      ? await blob.arrayBuffer()
      : await new Response(blob).arrayBuffer();
  const base64 = bytesToBase64(new Uint8Array(buffer));
  const mimeType = blob.type || "application/octet-stream";
  window.AndroidBridge.downloadBlob(base64, mimeType, flatName);
}

/**
 * Pure-JS Uint8Array -> base64. Avoids the chunked-string overhead of
 * `btoa(String.fromCharCode(...bytes))` while staying dependency-free, since
 * this module is imported by every download surface.
 */
function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, slice);
  }
  if (typeof btoa === "function") {
    return btoa(binary);
  }
  // Node fallback (used by Vitest).
  return Buffer.from(binary, "binary").toString("base64");
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
