/**
 * Remote-data persistence helpers.
 *
 * Pure functions for fetching remote config, status, and locales with
 * structural no-op checks before writing to storage. Each function:
 *   - Fetches all relevant stored keys in one `storage.get`.
 *   - Computes one combined update object containing only changed keys.
 *   - Calls `storage.set()` at most once.
 *   - Returns `{ success, writtenKeys, error }`.
 */

import { deepEqual } from "./deep-equal.js";

export const REMOTE_CONFIG_URL =
  "https://raw.githubusercontent.com/EdgeTypE/better-deepseek/main/extension/remote-config.json";

export const REMOTE_STATUS_URL =
  "https://raw.githubusercontent.com/EdgeTypE/better-deepseek/main/extension/status.json";

export const LOCALE_BASE_URL =
  "https://raw.githubusercontent.com/EdgeTypE/better-deepseek/main/src/locales";

const STORAGE_KEY_CONFIG = "bds_remote_config";
const STORAGE_KEY_CONFIG_META = "bds_remote_config_meta";
const STORAGE_KEY_ANNOUNCEMENT = "bds_remote_announcement";
const STORAGE_KEY_LOCALES = "bds_locale_updates";
const STORAGE_KEY_LOCALE_CHECKED = "bds_locale_update_last_checked";

/**
 * Build one object containing every key whose value changed.
 * Returns null when nothing changed.
 */
function computeDiff(stored, incoming) {
  /** @type {Record<string, any>} */
  const diff = {};
  let hasChanges = false;
  for (const [key, value] of Object.entries(incoming)) {
    if (!deepEqual(stored[key], value)) {
      diff[key] = value;
      hasChanges = true;
    }
  }
  return hasChanges ? diff : null;
}

function isObjectRoot(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * @typedef {{ success: boolean, writtenKeys: string[], error?: string }} PersistResult
 */

// ── Remote config ──

/**
 * @param {{ fetch: typeof fetch, storage: { get: Function, set: Function } }} deps
 * @param {{ now?: number }} [opts]
 * @returns {Promise<PersistResult>}
 */
export async function persistRemoteConfig(deps, { now = Date.now() } = {}) {
  try {
    const response = await deps.fetch(`${REMOTE_CONFIG_URL}?t=${now}`, {
      cache: "no-store",
    });
    if (!response.ok) {
      return { success: false, writtenKeys: [], error: `HTTP ${response.status}` };
    }

    const config = await response.json();
    // Accept only non-array plain objects as remote-config roots.
    if (!isObjectRoot(config)) {
      return { success: false, writtenKeys: [], error: "Invalid config root" };
    }

    // Fetch both stored keys in one call
    const stored = await deps.storage.get([
      STORAGE_KEY_CONFIG,
      STORAGE_KEY_CONFIG_META,
    ]);
    const meta = { lastFetched: now, version: config.meta?.version || 0 };

    // Build one combined diff: config + metadata together → one set() call
    const diff = computeDiff(stored, {
      [STORAGE_KEY_CONFIG]: config,
      [STORAGE_KEY_CONFIG_META]: meta,
    });

    if (diff) {
      await deps.storage.set(diff);
      return { success: true, writtenKeys: Object.keys(diff) };
    }

    return { success: true, writtenKeys: [] };
  } catch (err) {
    return { success: false, writtenKeys: [], error: err?.message || "Unknown error" };
  }
}

// ── Remote status / announcements ──

/**
 * @param {{ fetch: typeof fetch, storage: { get: Function, set: Function } }} deps
 * @param {{ now?: number }} [opts]
 * @returns {Promise<PersistResult>}
 */
export async function persistRemoteStatus(deps, { now = Date.now() } = {}) {
  try {
    const response = await deps.fetch(`${REMOTE_STATUS_URL}?t=${now}`, {
      cache: "no-store",
    });
    if (!response.ok) {
      return { success: false, writtenKeys: [], error: `HTTP ${response.status}` };
    }

    let data = await response.json();
    if (!data) {
      return { success: false, writtenKeys: [], error: "Empty status payload" };
    }

    const announcements = Array.isArray(data) ? data : [data];
    const stored = await deps.storage.get(STORAGE_KEY_ANNOUNCEMENT);

    const diff = computeDiff(stored, {
      [STORAGE_KEY_ANNOUNCEMENT]: announcements,
    });

    if (diff) {
      await deps.storage.set(diff);
      return { success: true, writtenKeys: Object.keys(diff) };
    }

    return { success: true, writtenKeys: [] };
  } catch (err) {
    return { success: false, writtenKeys: [], error: err?.message || "Unknown error" };
  }
}

// ── Locales ──

/**
 * Fetch and persist locale data. Preserves the last stored value for any
 * locale code whose fetch or validation failed, so a transient failure does
 * not erase previously loaded translations.
 *
 * @param {{ fetch: typeof fetch, storage: { get: Function, set: Function } }} deps
 * @param {string[]} localeCodes
 * @param {{ now?: number }} [opts]
 * @returns {Promise<PersistResult>}
 */
export async function persistLocales(deps, localeCodes, { now = Date.now() } = {}) {
  try {
    const results = await Promise.allSettled(
      localeCodes.map((code) =>
        deps
          .fetch(`${LOCALE_BASE_URL}/${code}.json?t=${now}`, { cache: "no-store" })
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => (
            isObjectRoot(data) && isObjectRoot(data.messages)
              ? { code, data }
              : null
          )),
      ),
    );

    // Collect successfully fetched locales
    /** @type {Record<string, any>} */
    const fetched = {};
    for (const result of results) {
      if (result.status === "fulfilled" && result.value) {
        fetched[result.value.code] = result.value.data;
      }
    }

    if (Object.keys(fetched).length === 0) {
      return { success: false, writtenKeys: [], error: "No valid locale files fetched" };
    }

    // Read existing stored locales so we can merge (preserve failed codes)
    const stored = await deps.storage.get([
      STORAGE_KEY_LOCALES,
      STORAGE_KEY_LOCALE_CHECKED,
    ]);
    // Normalize: stored root must be a non-array object
    const raw = stored[STORAGE_KEY_LOCALES];
    const storedLocales =
      raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};

    // Merge: start from fresh successes. For each REQUESTED code that failed,
    // preserve its previous stored value. Do NOT retain unrequested stale codes.
    const merged = { ...fetched };
    for (const code of localeCodes) {
      if (!(code in fetched) && storedLocales[code]) {
        merged[code] = storedLocales[code];
      }
    }

    const lastChecked = new Date(now).toLocaleDateString();

    const diff = computeDiff(stored, {
      [STORAGE_KEY_LOCALES]: merged,
      [STORAGE_KEY_LOCALE_CHECKED]: lastChecked,
    });

    if (diff) {
      await deps.storage.set(diff);
    }

    return { success: true, writtenKeys: diff ? Object.keys(diff) : [] };
  } catch (err) {
    return { success: false, writtenKeys: [], error: err?.message || "Unknown error" };
  }
}
