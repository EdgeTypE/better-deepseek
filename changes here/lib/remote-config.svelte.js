import { DEFAULT_REMOTE_CONFIG, STORAGE_KEYS } from "./constants.js";
import { deepEqual } from "./deep-equal.js";

const EVENT_CONFIG_UPDATED = "bds:remote-config-updated";

/**
 * Normalize a remote-config root value. A root must be a non-array object;
 * invalid roots (null, undefined, arrays, primitives) become {}.
 * Nested arrays remain valid configuration values.
 */
function normalizeRoot(value) {
  return (value && typeof value === "object" && !Array.isArray(value)) ? value : {};
}

function deepMerge(target, source) {
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === "object" &&
      !Array.isArray(source[key])
    ) {
      if (!target[key] || typeof target[key] !== "object" || Array.isArray(target[key])) {
        target[key] = {};
      }
      deepMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

function resolvePath(obj, parts) {
  let current = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = current[part];
  }
  return current;
}

class RemoteConfigManager {
  #builtin = DEFAULT_REMOTE_CONFIG;
  #remote = {};
  #callbacks = new Set();
  #initPromise = null;

  get raw() {
    const merged = {};
    deepMerge(merged, this.#builtin);
    deepMerge(merged, this.#remote);
    return merged;
  }

  async init() {
    if (this.#initPromise) return this.#initPromise;
    this.#initPromise = this.#doInit();
    return this.#initPromise;
  }

  async #doInit() {
    try {
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        const result = await chrome.storage.local.get([STORAGE_KEYS.remoteConfig]);
        const stored = result[STORAGE_KEYS.remoteConfig];
        this.#remote = normalizeRoot(stored);
      }
    } catch (e) {
      console.warn("[BDS] Failed to load remote config from storage:", e);
    }
    return this.raw;
  }

  getFlag(path) {
    const value = resolvePath(this.raw, path.split("."));
    return !!value;
  }

  getConfig(path) {
    return resolvePath(this.raw, path.split("."));
  }

  /**
   * Accept an externally-sourced remote config value (from a storage change
   * event). Replaces the internal #remote copy, notifies consumers only when
   * the merged result actually differs, and NEVER writes back to storage.
   *
   * This is the ownership boundary: local/debug mutations own persistence;
   * external syncs are read-only consumers.
   */
  syncFromStorage(value) {
    const normalized = normalizeRoot(value);
    const prevRaw = this.raw;
    this.#remote = normalized;
    const nextRaw = this.raw;
    if (!deepEqual(prevRaw, nextRaw)) {
      this.#notify();
    }
  }

  async applyRemote(partial) {
    const normalized = normalizeRoot(partial);
    const prevRemote = structuredClone(this.#remote);
    deepMerge(this.#remote, normalized);
    if (!deepEqual(prevRemote, this.#remote)) {
      const persisted = this.#persist();
      this.#notify();
      return persisted;
    }
    return false;
  }

  async replaceRemote(full) {
    const next = normalizeRoot(full);
    if (!deepEqual(this.#remote, next)) {
      this.#remote = next;
      const persisted = this.#persist();
      this.#notify();
      return persisted;
    }
    return false;
  }

  async resetToBuiltin() {
    const hadOverrides = !deepEqual(this.#remote, {});
    this.#remote = {};
    // Always clear persisted config + metadata, even when in-memory override
    // is already empty — storage hygiene is unconditional.
    const cleared = this.#clearStorage();
    // Suppress notification only when logical configuration did not change.
    if (hadOverrides) {
      this.#notify();
    }
    return cleared;
  }

  onChange(callback) {
    this.#callbacks.add(callback);
    return () => this.#callbacks.delete(callback);
  }

  #persist() {
    try {
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        return chrome.storage.local
          .set({ [STORAGE_KEYS.remoteConfig]: this.#remote })
          .then(() => true, (error) => {
            console.warn("[BDS] Failed to persist remote config:", error);
            return false;
          });
      }
    } catch (e) {
      console.warn("[BDS] Failed to persist remote config:", e);
    }
    return Promise.resolve(false);
  }

  #clearStorage() {
    try {
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        return chrome.storage.local
          .remove([STORAGE_KEYS.remoteConfig, STORAGE_KEYS.remoteConfigMeta])
          .then(() => true, (error) => {
            console.warn("[BDS] Failed to clear remote config:", error);
            return false;
          });
      }
    } catch (e) {
      console.warn("[BDS] Failed to clear remote config:", e);
    }
    return Promise.resolve(false);
  }

  #notify() {
    for (const cb of this.#callbacks) {
      try { cb(this.raw); } catch (e) { console.warn("[BDS] Remote config callback error:", e); }
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(EVENT_CONFIG_UPDATED, { detail: this.raw }));
    }
  }
}

export const remoteConfig = new RemoteConfigManager();

export function getFlag(path) {
  return remoteConfig.getFlag(path);
}

export function getConfig(path) {
  return remoteConfig.getConfig(path);
}

export const REMOTE_CONFIG_EVENT = EVENT_CONFIG_UPDATED;

/**
 * Detects the currently-active DeepSeek model mode from the page DOM.
 *
 * Returns null when detection is inconclusive (switcher/badge missing, or a
 * checked radio's data-model-type isn't in the mapping table) — callers must
 * not conflate "nothing detected" with "instant", since transient DOM states
 * (composer re-render, picker roundtrip) can otherwise corrupt cached state.
 */
export function detectModelType() {
  const switcherSel = getConfig("selectors.modelSwitcher");
  if (switcherSel) {
    const switcher = document.querySelector(switcherSel);
    if (switcher) {
      const checked = switcher.querySelector('[aria-checked="true"]');
      if (checked) {
        const attrMap = getConfig("modelDetection.attrMap") || {};
        const dt = checked.getAttribute("data-model-type");
        return Object.prototype.hasOwnProperty.call(attrMap, dt) ? attrMap[dt] : null;
      }
    }
  }
  const badgeSel = getConfig("selectors.modelBadge");
  if (badgeSel) {
    const el = document.querySelector(badgeSel);
    if (el) {
      const text = (el.textContent || "").toLowerCase().trim();
      const badgeRules = getConfig("modelDetection.badgeRules") || [];
      for (const [key, type] of badgeRules) {
        if (text === key) return type;
      }
      for (const [key, type] of badgeRules) {
        if (text.includes(key)) return type;
      }
    }
  }
  return null;
}
