/**
 * Android platform shim.
 *
 * Wraps the native @JavascriptInterface object exposed by the Android
 * MainActivity (window.AndroidBridge) into typed JS helpers that the
 * rest of the extension can consume without caring about the host.
 *
 * Contract (Phase 1, do not change without updating WebViewBridge.kt):
 *   AndroidStorage   -> getStorage / setStorage / removeStorage
 *   AndroidFetch     -> fetch (returns { ok, status, body, error, ... })
 *   AndroidAssetUrl  -> getAssetUrl (resolves bds/* asset paths)
 *
 * Native bridge methods (see WebViewBridge.kt):
 *   getStorage(key: String): String?
 *   setStorage(key: String, value: String): void   // value is JSON.stringify(jsValue)
 *   removeStorage(key: String): void
 *   fetch(payloadJson: String): String   // JSON-encoded { ok, ... }
 *   getAssetUrl(relativePath: String): String
 *   downloadBlob(base64, mimeType, fileName): void
 *   reportTheme(isDark: Boolean): void  // live bar-icon colour update; persistence via setStorage
 *   pickFiles(mode: String, requestId: String): void
 *     // mode: "files" | "folder"; result delivered as
 *     // CustomEvent("__bds_native_files_picked_" + requestId)
 */

function getBridge() {
  const bridge = typeof window !== "undefined" ? window.AndroidBridge : null;
  if (!bridge) {
    throw new Error("[BDS] window.AndroidBridge is not available.");
  }
  return bridge;
}

export const AndroidStorage = {
  get(key) {
    const bridge = getBridge();
    const raw = bridge.getStorage(String(key));
    if (raw === null || raw === undefined || raw === "") {
      return undefined;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return undefined;
    }
  },
  set(key, value) {
    const bridge = getBridge();
    bridge.setStorage(String(key), JSON.stringify(value));
  },
  remove(key) {
    const bridge = getBridge();
    bridge.removeStorage(String(key));
  },
};

export const AndroidFetch = {
  /**
   * Send a sendMessage-shaped payload (e.g. { type, url, ... }) through the
   * native bridge. Returns a Promise resolving to the parsed response object.
   */
  async send(payload) {
    const bridge = getBridge();
    const raw = bridge.fetch(JSON.stringify(payload || {}));
    if (typeof raw !== "string" || raw.length === 0) {
      return { ok: false, error: "Empty response from AndroidBridge.fetch" };
    }
    try {
      return JSON.parse(raw);
    } catch (err) {
      return {
        ok: false,
        error: "Failed to parse AndroidBridge.fetch response: " + (err && err.message),
      };
    }
  },
  /**
   * Trigger a native blob download. Used for create_file / LONG_WORK ZIPs.
   */
  downloadBlob(base64, mimeType, fileName) {
    const bridge = getBridge();
    bridge.downloadBlob(String(base64 || ""), String(mimeType || "application/octet-stream"), String(fileName || "download.bin"));
  },
};

export const AndroidAssetUrl = {
  /**
   * Resolve a bundled asset path (e.g. "sandbox.html", "static/loading/1.svg")
   * to an absolute URL served by the native WebViewAssetLoader.
   */
  resolve(relativePath) {
    const bridge = getBridge();
    return bridge.getAssetUrl(String(relativePath || ""));
  },
};
