/**
 * Platform globals entry for the android build.
 *
 * Installs a chrome.* polyfill that routes storage / runtime calls through
 * the native AndroidBridge before any other module touches `chrome`.
 */

import { installChromePolyfill } from "./android-chrome-polyfill.js";
import { hideGetAppButton } from "../android/hide-get-app.js";
import { hideDrawerAppItem } from "../android/hide-drawer-app-item.js";

installChromePolyfill();

function runWhenBodyExists(callback) {
  if (typeof document === "undefined") return;

  const run = () => {
    if (document.body) callback();
  };

  if (document.body) {
    run();
  } else {
    document.addEventListener("DOMContentLoaded", run, { once: true });
  }
}

runWhenBodyExists(() => {
  hideGetAppButton();
  hideDrawerAppItem();
});

export { AndroidStorage, AndroidFetch, AndroidAssetUrl } from "./android-bridge-shim.js";
