/**
 * Polyfills the subset of the chrome.* extension APIs that BDS uses,
 * routing every call through the Android native bridge.
 *
 * The rest of the codebase calls chrome.storage.local, chrome.runtime.sendMessage,
 * chrome.runtime.getURL, and chrome.storage.onChanged. Implementing those four
 * surfaces here lets the extension run inside an Android WebView without
 * modifying any feature code.
 */

import { AndroidStorage, AndroidFetch, AndroidAssetUrl } from "./android-bridge-shim.js";

export function installChromePolyfill() {
  if (typeof window === "undefined") return;
  if (window.chrome && window.chrome.__bdsAndroidPolyfill) return;

  const changeListeners = new Set();

  function fireChange(changes) {
    if (!changes || Object.keys(changes).length === 0) return;
    for (const listener of changeListeners) {
      try {
        listener(changes, "local");
      } catch (err) {
        console.error("[BDS] chrome.storage.onChanged listener error:", err);
      }
    }
  }

  function readKeys(keys) {
    const result = {};
    for (const key of keys) {
      const value = AndroidStorage.get(key);
      if (value !== undefined) result[key] = value;
    }
    return result;
  }

  const storageLocal = {
    get(query) {
      let keys = [];
      let defaults = {};

      if (query === null || query === undefined) {
        return Promise.resolve({});
      }
      if (typeof query === "string") {
        keys = [query];
      } else if (Array.isArray(query)) {
        keys = query.map(String);
      } else if (typeof query === "object") {
        keys = Object.keys(query);
        defaults = query;
      }

      const values = readKeys(keys);
      const merged = { ...defaults, ...values };
      return Promise.resolve(merged);
    },

    set(items) {
      if (!items || typeof items !== "object") {
        return Promise.resolve();
      }
      const changes = {};
      for (const [key, newValue] of Object.entries(items)) {
        const oldValue = AndroidStorage.get(key);
        AndroidStorage.set(key, newValue);
        changes[key] = { oldValue, newValue };
      }
      fireChange(changes);
      return Promise.resolve();
    },

    remove(keys) {
      const list = Array.isArray(keys) ? keys.map(String) : [String(keys)];
      const changes = {};
      for (const key of list) {
        const oldValue = AndroidStorage.get(key);
        AndroidStorage.remove(key);
        changes[key] = { oldValue, newValue: undefined };
      }
      fireChange(changes);
      return Promise.resolve();
    },

    clear() {
      // Not implemented for Android in Phase 1 — nothing in BDS calls it today.
      return Promise.resolve();
    },
  };

  const onChanged = {
    addListener(listener) {
      if (typeof listener === "function") changeListeners.add(listener);
    },
    removeListener(listener) {
      changeListeners.delete(listener);
    },
    hasListener(listener) {
      return changeListeners.has(listener);
    },
  };

  /**
   * sendMessage supports both the promise form (await chrome.runtime.sendMessage(msg))
   * and the callback form (chrome.runtime.sendMessage(msg, cb)) used by pricing.js.
   */
  function sendMessage(message, callback) {
    runtimeApi.lastError = null;

    const promise = AndroidFetch.send(message).catch((err) => ({
      ok: false,
      error: String((err && err.message) || err),
    }));

    if (typeof callback === "function") {
      promise.then(
        (response) => {
          try {
            callback(response);
          } catch (err) {
            console.error("[BDS] sendMessage callback error:", err);
          }
        },
        (err) => {
          runtimeApi.lastError = { message: String(err && err.message) };
          try {
            callback(undefined);
          } catch (e) {
            console.error("[BDS] sendMessage callback error:", e);
          }
        }
      );
      return undefined;
    }

    return promise;
  }

  function getURL(path) {
    return AndroidAssetUrl.resolve(path);
  }

  // Service-worker style listener registration is a no-op on Android — the
  // background entry isn't built for this target. Surfacing a stub keeps any
  // accidental call safe.
  const onMessage = {
    addListener() {},
    removeListener() {},
    hasListener() {
      return false;
    },
  };

  const runtimeApi = {
    sendMessage,
    getURL,
    onMessage,
    lastError: null,
    id: "better-deepseek-android",
  };

  const chromeShim = {
    __bdsAndroidPolyfill: true,
    storage: {
      local: storageLocal,
      onChanged,
    },
    runtime: runtimeApi,
  };

  // Don't clobber a real chrome global if (somehow) one is present — merge.
  const existing = window.chrome;
  if (existing && typeof existing === "object") {
    window.chrome = Object.assign({}, existing, chromeShim);
  } else {
    window.chrome = chromeShim;
  }
}
