/**
 * Android: hold the display awake while DeepSeek is generating.
 *
 * Long multi-step runs (LONG_WORK, deep research) routinely outlive the device's
 * display timeout. Once the screen sleeps the WebView is paused, the stream stops
 * being consumed, and the run stalls or loses its steps — the user had to keep
 * tapping the screen to finish a response.
 *
 * The native side only exposes `AndroidBridge.setKeepScreenOn(boolean)`; deciding
 * *when* is JS's job because `isSystemGenerating()` is the only reliable signal
 * (the stop button, the streaming cursor, or message growth). The flag is dropped
 * as soon as generation ends, so the battery cost is bounded to the stream itself.
 *
 * Chrome/Firefox never expose the bridge method, so this module is inert there.
 */

import { devLog } from "../lib/dev-log.js";
import { isSystemGenerating } from "./message-processor.svelte.js";

const POLL_INTERVAL_MS = 1000;

let timer = null;
/** Last value handed to the native side, or null when nothing has been sent yet. */
let lastSent = null;

function getBridge() {
  if (typeof window === "undefined") return null;
  const bridge = window.AndroidBridge;
  if (!bridge || typeof bridge.setKeepScreenOn !== "function") return null;
  return bridge;
}

/** True only on the Android WebView shell that ships the wake-flag bridge method. */
export function isKeepAwakeSupported() {
  return getBridge() !== null;
}

/**
 * Push `generating` to the native window flag. Only writes on change, so the
 * per-second poll costs nothing in the common case.
 *
 * @param {boolean} generating
 * @returns {boolean} the state now in effect
 */
export function applyKeepAwake(generating) {
  const bridge = getBridge();
  if (!bridge) return false;

  const next = Boolean(generating);
  if (next === lastSent) return next;
  lastSent = next;

  try {
    bridge.setKeepScreenOn(next);
    devLog("KeepAwake", next ? "Holding the display awake" : "Releasing the display");
  } catch (error) {
    console.warn("[BDS] setKeepScreenOn failed:", error);
  }
  return next;
}

/** Re-evaluate the page's generation state and apply it. */
export function syncKeepAwake() {
  return applyKeepAwake(isSystemGenerating());
}

/**
 * Start the poll. Returns false when the host has no wake-flag support.
 */
export function startKeepAwakeWatcher() {
  if (timer || !isKeepAwakeSupported()) return false;

  // A WebView reload resets this module but not the native window flag, so the
  // first evaluation must report the page's real state instead of waiting for a
  // transition (which never comes if the new page is idle).
  lastSent = null;
  syncKeepAwake();
  timer = setInterval(syncKeepAwake, POLL_INTERVAL_MS);
  return true;
}

export function stopKeepAwakeWatcher() {
  if (timer) clearInterval(timer);
  timer = null;
  if (lastSent === true) applyKeepAwake(false);
  // Back to "nothing sent yet" so a later start re-syncs the native flag.
  lastSent = null;
}
