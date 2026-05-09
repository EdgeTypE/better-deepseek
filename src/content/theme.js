/**
 * Page-theme watcher.
 *
 * Detects DeepSeek's light/dark mode and persists it to chrome.storage.local so every platform
 * can read STORAGE_KEYS.pageIsDark without relying on the OS dark-mode setting:
 *   - Desktop (Chrome / Firefox): background / popup code reads chrome.storage.local directly.
 *   - Android: the chrome.storage polyfill routes the write through AndroidBridge.setStorage,
 *     and WebViewBridge.getLastKnownIsDark() reads the same SharedPreferences key on startup.
 *
 * Additionally fires AndroidBridge.reportTheme() when available so the native layer can update
 * status/navigation bar icon colours without waiting for the next cold start.
 */

import { STORAGE_KEYS } from "../lib/constants.js";

export function startThemeWatcher() {
  function detect() {
    return (
      document.documentElement.classList.contains("dark") ||
      window.matchMedia("(prefers-color-scheme: dark)").matches
    );
  }

  function apply(isDark) {
    chrome.storage.local.set({ [STORAGE_KEYS.pageIsDark]: isDark });
    // Live notification for Android native bar icon colours. No-op on other platforms.
    // Avoid typeof-function check: JavascriptInterface methods on some WebView versions
    // are callable but do not report as "function" via typeof.
    try {
      window.AndroidBridge?.reportTheme(isDark);
    } catch (_) {}
  }

  function run() {
    apply(detect());
  }

  run();

  new MutationObserver(run).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "data-theme"],
  });

  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", run);
}
