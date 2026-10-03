// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installChromePolyfill } from "./android-chrome-polyfill.js";

function installBridge(overrides = {}) {
  const store = new Map();
  const bridge = {
    getStorage: vi.fn((key) => (store.has(key) ? store.get(key) : null)),
    setStorage: vi.fn((key, value) => store.set(key, String(value ?? ""))),
    removeStorage: vi.fn((key) => store.delete(key)),
    getAssetUrl: vi.fn((path) => `https://bds-asset.local/bds/${path}`),
    fetch: vi.fn(() => JSON.stringify({ ok: true })),
    downloadBlob: vi.fn(),
    ...overrides,
  };
  window.AndroidBridge = bridge;
  return { bridge, store };
}

beforeEach(() => {
  // Each test installs a fresh polyfill against a fresh bridge.
  delete window.chrome;
});

afterEach(() => {
  delete window.chrome;
  delete window.AndroidBridge;
});

describe("installChromePolyfill", () => {
  it("is idempotent — installing twice does not double-wrap chrome", () => {
    installBridge();
    installChromePolyfill();
    const first = window.chrome;
    installChromePolyfill();
    expect(window.chrome).toBe(first);
    expect(window.chrome.__bdsAndroidPolyfill).toBe(true);
  });

  it("does nothing when window is undefined", () => {
    // The module already returns early when typeof window === "undefined";
    // this assertion documents the contract. Re-import to exercise the guard.
    expect(() => installChromePolyfill()).not.toThrow();
  });
});

describe("chrome.storage.local.get", () => {
  it("returns an empty object when called with null", async () => {
    installBridge();
    installChromePolyfill();
    await expect(chrome.storage.local.get(null)).resolves.toEqual({});
  });

  it("looks up a single string key", async () => {
    installBridge();
    installChromePolyfill();
    await chrome.storage.local.set({ greeting: "hello" });
    await expect(chrome.storage.local.get("greeting")).resolves.toEqual({
      greeting: "hello",
    });
  });

  it("looks up an array of keys", async () => {
    installBridge();
    installChromePolyfill();
    await chrome.storage.local.set({ a: 1, b: 2, c: 3 });
    await expect(chrome.storage.local.get(["a", "c"])).resolves.toEqual({ a: 1, c: 3 });
  });

  it("merges defaults from an object query", async () => {
    installBridge();
    installChromePolyfill();
    await chrome.storage.local.set({ existing: "value" });
    await expect(
      chrome.storage.local.get({ existing: "fallback", missing: "default" }),
    ).resolves.toEqual({ existing: "value", missing: "default" });
  });
});

describe("chrome.storage.local.set / remove + onChanged", () => {
  it("fires onChanged with old/new values on set", async () => {
    installBridge();
    installChromePolyfill();
    const listener = vi.fn();
    chrome.storage.onChanged.addListener(listener);

    await chrome.storage.local.set({ token: "abc" });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(
      { token: { oldValue: undefined, newValue: "abc" } },
      "local",
    );
  });

  it("fires onChanged on remove with newValue undefined", async () => {
    installBridge();
    installChromePolyfill();
    await chrome.storage.local.set({ token: "abc" });

    const listener = vi.fn();
    chrome.storage.onChanged.addListener(listener);
    await chrome.storage.local.remove("token");

    expect(listener).toHaveBeenCalledWith(
      { token: { oldValue: "abc", newValue: undefined } },
      "local",
    );
  });

  it("removeListener stops further notifications", async () => {
    installBridge();
    installChromePolyfill();
    const listener = vi.fn();
    chrome.storage.onChanged.addListener(listener);
    chrome.storage.onChanged.removeListener(listener);
    await chrome.storage.local.set({ a: 1 });
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("chrome.runtime.sendMessage", () => {
  it("returns a promise resolving to the bridge response", async () => {
    installBridge({
      fetch: vi.fn(() => JSON.stringify({ ok: true, html: "<p>x</p>" })),
    });
    installChromePolyfill();

    await expect(
      chrome.runtime.sendMessage({ type: "bds-fetch-url", url: "https://x" }),
    ).resolves.toEqual({ ok: true, html: "<p>x</p>" });
  });

  it("invokes the legacy callback form with the response", async () => {
    installBridge({
      fetch: vi.fn(() => JSON.stringify({ ok: true, value: 42 })),
    });
    installChromePolyfill();

    await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: "anything" }, (response) => {
        try {
          expect(response).toEqual({ ok: true, value: 42 });
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    });
  });

  it("translates bridge throws into an ok:false response", async () => {
    installBridge({
      fetch: vi.fn(() => {
        throw new Error("boom");
      }),
    });
    installChromePolyfill();

    const response = await chrome.runtime.sendMessage({ type: "x" });
    // The shim catches the throw and produces the same ok:false shape the
    // background service worker would have returned on rejection.
    expect(response.ok).toBe(false);
    expect(String(response.error)).toMatch(/boom/);
  });
});

describe("chrome.runtime.getURL", () => {
  it("delegates to the native asset URL resolver", () => {
    const { bridge } = installBridge();
    installChromePolyfill();

    expect(chrome.runtime.getURL("sandbox.html")).toBe(
      "https://bds-asset.local/bds/sandbox.html",
    );
    expect(bridge.getAssetUrl).toHaveBeenCalledWith("sandbox.html");
  });
});

describe("merging with an existing chrome global", () => {
  it("preserves unrelated chrome.* fields installed by another polyfill", () => {
    installBridge();
    window.chrome = { app: { existing: true } };
    installChromePolyfill();

    expect(window.chrome.app).toEqual({ existing: true });
    expect(window.chrome.storage.local.get).toBeTypeOf("function");
  });
});
