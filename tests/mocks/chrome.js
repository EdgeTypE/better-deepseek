import { vi } from "vitest";

const listeners = new Set();

export const chromeMockState = {
  storageData: {},
  extensionBaseUrl: "chrome-extension://better-deepseek-test/",
};

function clone(value) {
  if (value === undefined) return undefined;
  return structuredClone(value);
}

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

export const chromeMock = {
  storage: {
    local: {
      get: vi.fn(async (keys) => normalizeGetResult(keys)),
      set: vi.fn(async (values) => {
        Object.assign(chromeMockState.storageData, clone(values));
      }),
      remove: vi.fn(async (keys) => {
        const list = Array.isArray(keys) ? keys : [keys];
        for (const key of list) {
          delete chromeMockState.storageData[key];
        }
      }),
      clear: vi.fn(async () => {
        chromeMockState.storageData = {};
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

export function installChromeMock() {
  globalThis.chrome = chromeMock;
  return chromeMock;
}

export function resetChromeMock() {
  chromeMockState.storageData = {};
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

export function emitStorageChange(changes, areaName = "local") {
  for (const listener of listeners) {
    listener(changes, areaName);
  }
}
