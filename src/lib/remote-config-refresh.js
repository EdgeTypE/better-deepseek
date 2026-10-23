/**
 * Remote-config refresh for builds that have no background service worker.
 *
 * On Chrome/Firefox the service worker owns the periodic fetch
 * (`src/background/index.js` → `persistRemoteConfig`). The Android build
 * deliberately ships no background entry (see `build.js`), so nothing ever
 * wrote `bds_remote_config` there: the app ran on the built-in
 * `DEFAULT_REMOTE_CONFIG` forever and every published remote-config change —
 * including the `targets.android` composer-button set — was invisible.
 *
 * This module closes that gap from the content script, fetching the same JSON
 * through the native bridge (`bds-fetch-url`, backed by OkHttp in
 * `WebViewBridge.kt`) and persisting it with the same diff/no-op logic the
 * service worker uses. Nothing here reads `process.env.BDS_TARGET`; callers
 * decide when it applies.
 */

import { persistRemoteConfig } from "./remote-persistence.js";
import { STORAGE_KEYS } from "./constants.js";

/** Mirror of `remoteConfig.fetchIntervalMs` in remote-config.json. */
export const DEFAULT_FETCH_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Adapt `chrome.runtime.sendMessage` into a `fetch`-shaped function.
 *
 * The Android bridge replies `{ ok, status, html }` for `bds-fetch-url`; the
 * body of a JSON document arrives in `html`. A `?t=` cache-buster is added by
 * `persistRemoteConfig`, which OkHttp honours as a distinct URL.
 */
export function createBridgeFetch(sendMessage) {
  return async (url) => {
    const reply = await sendMessage({
      type: "bds-fetch-url",
      url,
      options: { method: "GET" },
    });
    // The bridge reports transport failures in-band (`{ ok: false, error }`).
    // Throwing keeps the reason intact: `persistRemoteConfig` only sees
    // `ok`/`status` on a response object, so returning a fake 0-status
    // response would log "HTTP 0" instead of the real cause.
    if (!reply || !reply.ok) {
      throw new Error(
        (reply && reply.error) || `Bridge fetch failed (status ${Number(reply?.status) || 0})`,
      );
    }
    return {
      ok: true,
      status: Number(reply.status) || 0,
      json: async () => JSON.parse(String(reply.html ?? "")),
    };
  };
}

/**
 * True when the stored config is old enough to re-fetch. A missing or
 * unparseable timestamp counts as due, so a first run always fetches.
 */
export function isFetchDue(meta, now, intervalMs = DEFAULT_FETCH_INTERVAL_MS) {
  const last = Number(meta && meta.lastFetched) || 0;
  if (!(last > 0)) return true;
  const interval = Number(intervalMs) > 0 ? Number(intervalMs) : DEFAULT_FETCH_INTERVAL_MS;
  return now - last >= interval;
}

/**
 * Fetch + persist remote config when the stored copy is stale.
 *
 * Returns `{ fetched: false, reason }` when the call was skipped or failed, and
 * `{ fetched: true, config }` with the freshly stored document otherwise. The
 * caller is responsible for handing `config` to the in-memory manager
 * (`remoteConfig.syncFromStorage`), since persistence and notification are
 * separate concerns here.
 */
export async function refreshRemoteConfigIfDue({
  storage,
  sendMessage,
  now = Date.now(),
  intervalMs = DEFAULT_FETCH_INTERVAL_MS,
  force = false,
} = {}) {
  if (!storage || typeof sendMessage !== "function") {
    return { fetched: false, reason: "missing-deps" };
  }

  try {
    const metaKeys = await storage.get([STORAGE_KEYS.remoteConfigMeta]);
    const meta = metaKeys?.[STORAGE_KEYS.remoteConfigMeta];
    if (!force && !isFetchDue(meta, now, intervalMs)) {
      return { fetched: false, reason: "fresh" };
    }
  } catch (err) {
    // Unreadable metadata must not block the fetch; treat it as due.
    void err;
  }

  const result = await persistRemoteConfig(
    { fetch: createBridgeFetch(sendMessage), storage },
    { now },
  );
  if (!result.success) {
    return { fetched: false, reason: result.error || "fetch-failed" };
  }

  const stored = await storage.get([STORAGE_KEYS.remoteConfig]);
  const config = stored?.[STORAGE_KEYS.remoteConfig];
  return config
    ? { fetched: true, config }
    : { fetched: false, reason: "empty-config" };
}
