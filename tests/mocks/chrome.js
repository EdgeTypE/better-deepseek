import { vi } from "vitest";

const listeners = new Set();

export const chromeMockState = {
  storageData: {},
  extensionBaseUrl: "chrome-extension://better-deepseek-test/",
  /** "chrome" | "firefox" — controls whether unchanged keys produce events. */
  mode: "chrome",
};

function clone(value) {
  if (value === undefined) return undefined;
  return structuredClone(value);
}

/**
 * Deep structural equality. Objects compared by sorted keys; arrays by index.
 * Primitive-like types compared by ===.
 */
function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;

  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  const aKeys = Object.keys(a).sort();
  const bKeys = Object.keys(b).sort();
  if (aKeys.length !== bKeys.length) return false;
  for (let i = 0; i < aKeys.length; i++) {
    if (aKeys[i] !== bKeys[i]) return false;
    if (!deepEqual(a[aKeys[i]], b[bKeys[i]])) return false;
  }
  return true;
}

function computeChanges(oldData, newValues, removedKeys = []) {
  /** @type {Record<string, {oldValue?: any, newValue?: any}>} */
  const changes = {};

  for (const [key, newValue] of Object.entries(newValues)) {
    const oldValue = clone(chromeMockState.storageData[key]);
    if (oldValue === undefined && newValue === undefined) continue;
    // Chrome mode: only emit if value structurally changed
    // Firefox mode: emit for every key supplied to set (see MDN compat note)
    if (chromeMockState.mode === "chrome") {
      if (deepEqual(oldValue, newValue)) continue;
    }
    changes[key] = { oldValue, newValue: clone(newValue) };
  }

  for (const key of removedKeys) {
    if (!(key in chromeMockState.storageData)) continue;
    changes[key] = { oldValue: clone(chromeMockState.storageData[key]) };
  }

  return changes;
}

// ── Per-operation FIFO notification queue ──

/** @type {Array<Record<string, {oldValue?: any, newValue?: any}>>} */
const notificationQueue = [];
let flushPromise = null;
let flushResolve = null;

function scheduleNotification(changes) {
  const changeKeys = Object.keys(changes);
  if (changeKeys.length === 0) return;
  notificationQueue.push({ ...changes });

  if (!flushPromise) {
    flushPromise = new Promise((resolve) => {
      flushResolve = resolve;
    }).then(async () => {
      // Drain queue one operation at a time
      while (notificationQueue.length > 0) {
        const batch = notificationQueue.shift();
        await notifyListeners(batch);
      }
      flushPromise = null;
      flushResolve = null;
    });
    // Kick off the microtask
    Promise.resolve().then(() => flushResolve());
  }
}

async function notifyListeners(changes) {
  const changeKeys = Object.keys(changes);
  if (changeKeys.length === 0) return;

  // Deep-clone for each listener independently so no listener can mutate
  // another listener's view or the internal state.
  for (const listener of listeners) {
    const cloned = {};
    for (const key of changeKeys) {
      cloned[key] = {
        oldValue: clone(changes[key].oldValue),
        newValue: clone(changes[key].newValue),
      };
    }
    // Fire asynchronously to match real chrome.storage behavior
    await Promise.resolve();
    listener(cloned, "local");
  }
}

export const chromeMock = {
  storage: {
    local: {
      get: vi.fn(async (keys) => normalizeGetResult(keys)),
      set: vi.fn(async (values) => {
        const changes = computeChanges(chromeMockState.storageData, values);
        Object.assign(chromeMockState.storageData, clone(values));
        scheduleNotification(changes);
      }),
      remove: vi.fn(async (keys) => {
        const list = Array.isArray(keys) ? keys : [keys];
        const changes = computeChanges(chromeMockState.storageData, {}, list);
        for (const key of list) {
          delete chromeMockState.storageData[key];
        }
        scheduleNotification(changes);
      }),
      clear: vi.fn(async () => {
        const removedKeys = Object.keys(chromeMockState.storageData);
        const changes = computeChanges(chromeMockState.storageData, {}, removedKeys);
        chromeMockState.storageData = {};
        scheduleNotification(changes);
      }),
    },
    onChanged: {
      addListener: vi.fn((listener) => {
        listeners.add(listener);
      }),
      removeListener: vi.fn((listener) => {
        listeners.delete(listener);
      }),
    },
  },
  runtime: {
    sendMessage: vi.fn(async () => undefined),
    getURL: vi.fn((path = "") => `${chromeMockState.extensionBaseUrl}${path}`),
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
      hasListener: vi.fn(() => false),
    },
    onInstalled: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
      hasListener: vi.fn(() => false),
    },
  },
};

function normalizeGetResult(keys) {
  if (keys == null) {
    return clone(chromeMockState.storageData);
  }

  if (typeof keys === "string") {
    return { [keys]: clone(chromeMockState.storageData[keys]) };
  }

  if (Array.isArray(keys)) {
    return keys.reduce((acc, key) => {
      acc[key] = clone(chromeMockState.storageData[key]);
      return acc;
    }, {});
  }

  if (typeof keys === "object") {
    return Object.entries(keys).reduce((acc, [key, fallback]) => {
      acc[key] =
        key in chromeMockState.storageData
          ? clone(chromeMockState.storageData[key])
          : clone(fallback);
      return acc;
    }, {});
  }

  return {};
}

export function installChromeMock() {
  globalThis.chrome = chromeMock;
  return chromeMock;
}

export function resetChromeMock() {
  chromeMockState.storageData = {};
  chromeMockState.mode = "chrome";
  // Invalidate pending notification jobs so no prior microtask fires in a later test
  notificationQueue.length = 0;
  flushPromise = null;
  flushResolve = null;
  chromeMock.storage.local.get.mockClear();
  chromeMock.storage.local.set.mockClear();
  chromeMock.storage.local.remove.mockClear();
  chromeMock.storage.local.clear.mockClear();
  chromeMock.storage.onChanged.addListener.mockClear();
  chromeMock.storage.onChanged.removeListener.mockClear();
  chromeMock.runtime.sendMessage.mockClear();
  chromeMock.runtime.getURL.mockClear();
  chromeMock.runtime.onMessage.addListener.mockClear();
  chromeMock.runtime.onMessage.removeListener.mockClear();
  chromeMock.runtime.onMessage.hasListener.mockClear();
  chromeMock.runtime.onInstalled.addListener.mockClear();
  chromeMock.runtime.onInstalled.removeListener.mockClear();
  chromeMock.runtime.onInstalled.hasListener.mockClear();
  listeners.clear();
}

export function setChromeStorage(data) {
  chromeMockState.storageData = clone(data) || {};
}

/**
 * Flush all pending storage.onChanged notifications.
 * Call this instead of arbitrary waits in tests.
 */
export async function flushStorageChanges() {
  if (flushPromise) {
    await flushPromise;
  }
  // Ensure any remaining microtasks complete
  await Promise.resolve();
}

/**
 * Set storage mock mode. "chrome" emits only structurally changed keys;
 * "firefox" may emit keys supplied to `set` even when values are unchanged
 * (per MDN compatibility note for Firefox's storage.onChanged behavior).
 */
export function setStorageMockMode(mode) {
  chromeMockState.mode = mode;
}

/**
 * @deprecated Use storage.local.set() + flushStorageChanges() instead.
 */
export function emitStorageChange(changes, areaName = "local") {
  for (const listener of listeners) {
    listener(changes, areaName);
  }
}
