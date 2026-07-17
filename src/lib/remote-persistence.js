/**
 * Remote-data persistence helpers.
 *
 * Pure functions for fetching remote config, status, and locales with
 * structural no-op checks before writing to storage. Extracted from the
 * background service worker so tests can inject fetch, storage, and time
 * without importing the side-effectful entrypoint.
 */

import { deepEqual } from "./deep-equal.js";

export const REMOTE_CONFIG_URL =
  "https://raw.githubusercontent.com/EdgeTypE/better-deepseek/main/extension/remote-config.json";

export const REMOTE_STATUS_URL =
  "https://raw.githubusercontent.com/EdgeTypE/better-deepseek/main/extension/status.json";

export const LOCALE_BASE_URL =
  "https://raw.githubusercontent.com/EdgeTypE/better-deepseek/main/src/locales";

/**
 * Build a storage-update object containing only changed keys.
 * Returns null when nothing changed.
 */
function buildStorageUpdate(storedData, newValues) {
  /** @type {Record<string, any>} */
  const updates = {};
  let hasChanges = false;

  for (const [key, newValue] of Object.entries(newValues)) {
    const oldValue = storedData[key];
    if (!deepEqual(oldValue, newValue)) {
      updates[key] = newValue;
      hasChanges = true;
    }
  }

  return hasChanges ? updates : null;
}

/**
 * Fetch and persist remote config.
 *
 * @param {{ fetch: typeof fetch, storage: { get: Function, set: Function } }} deps
 * @param {{ now: number }}
 * @returns {Promise<{ written: boolean }>}
 */
export async function persistRemoteConfig(deps, { now } = { now: Date.now() }) {
  try {
    const response = await deps.fetch(`${REMOTE_CONFIG_URL}?t=${now}`, {
      cache: "no-store",
    });
    if (!response.ok) return { written: false };

    const config = await response.json();
    // Accept only non-array plain objects as remote-config roots.
    if (!config || typeof config !== "object" || Array.isArray(config)) {
      return { written: false };
    }

    const { bds_remote_config: currentConfig } = await deps.storage.get("bds_remote_config");
    const configUpdate = buildStorageUpdate(
      { bds_remote_config: currentConfig },
      { bds_remote_config: config },
    );
    if (configUpdate) {
      await deps.storage.set(configUpdate);
    }

    const meta = { lastFetched: now, version: config.meta?.version || 0 };
    const { bds_remote_config_meta: currentMeta } =
      await deps.storage.get("bds_remote_config_meta");
    const metaUpdate = buildStorageUpdate(
      { bds_remote_config_meta: currentMeta },
      { bds_remote_config_meta: meta },
    );
    if (metaUpdate) {
      await deps.storage.set(metaUpdate);
    }

    return { written: !!configUpdate };
  } catch {
    return { written: false };
  }
}

/**
 * Fetch and persist remote status / announcements.
 */
export async function persistRemoteStatus(deps, { now } = { now: Date.now() }) {
  try {
    const response = await deps.fetch(`${REMOTE_STATUS_URL}?t=${now}`, {
      cache: "no-store",
    });
    if (!response.ok) return { written: false };

    let data = await response.json();
    if (!data) return { written: false };

    const announcements = Array.isArray(data) ? data : [data];
    const { bds_remote_announcement: stored } =
      await deps.storage.get("bds_remote_announcement");

    const update = buildStorageUpdate(
      { bds_remote_announcement: stored },
      { bds_remote_announcement: announcements },
    );
    if (update) {
      await deps.storage.set(update);
    }

    return { written: !!update };
  } catch {
    return { written: false };
  }
}

/**
 * Fetch and persist locale data for the given locale codes.
 */
export async function persistLocales(deps, localeCodes, { now } = { now: Date.now() }) {
  try {
    const results = await Promise.allSettled(
      localeCodes.map((code) =>
        deps
          .fetch(`${LOCALE_BASE_URL}/${code}.json?t=${now}`, { cache: "no-store" })
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => (data?.messages ? { [code]: data } : null)),
      ),
    );

    const updates = {};
    for (const result of results) {
      if (result.status === "fulfilled" && result.value) {
        Object.assign(updates, result.value);
      }
    }
    if (Object.keys(updates).length === 0) {
      return { success: false, error: "No valid locale files fetched" };
    }

    const { bds_locale_updates: stored } = await deps.storage.get("bds_locale_updates");
    const localeUpdate = buildStorageUpdate(
      { bds_locale_updates: stored },
      { bds_locale_updates: updates },
    );
    if (localeUpdate) {
      await deps.storage.set(localeUpdate);
    }

    const lastChecked = new Date(now).toLocaleDateString();
    const { bds_locale_update_last_checked: storedLastChecked } =
      await deps.storage.get("bds_locale_update_last_checked");
    const metaUpdate = buildStorageUpdate(
      { bds_locale_update_last_checked: storedLastChecked },
      { bds_locale_update_last_checked: lastChecked },
    );
    if (metaUpdate) {
      await deps.storage.set(metaUpdate);
    }

    return { success: true };
  } catch (e) {
    return { success: false, error: e?.message };
  }
}
