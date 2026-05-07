/**
 * Platform globals entry for the android build.
 *
 * Installs a chrome.* polyfill that routes storage / runtime calls through
 * the native AndroidBridge before any other module touches `chrome`.
 */

import { installChromePolyfill } from "./android-chrome-polyfill.js";

installChromePolyfill();

export { AndroidStorage, AndroidFetch, AndroidAssetUrl } from "./android-bridge-shim.js";
