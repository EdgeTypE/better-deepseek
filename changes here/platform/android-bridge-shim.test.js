// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AndroidStorage,
  AndroidFetch,
  AndroidAssetUrl,
} from "./android-bridge-shim.js";

function installBridge(overrides = {}) {
  const bridge = {
    getStorage: vi.fn(() => null),
    setStorage: vi.fn(),
    removeStorage: vi.fn(),
    getAssetUrl: vi.fn((p) => `https://bds-asset.local/bds/${p}`),
    fetch: vi.fn(() => JSON.stringify({ ok: true })),
    downloadBlob: vi.fn(),
    ...overrides,
  };
  window.AndroidBridge = bridge;
  return bridge;
}

afterEach(() => {
  delete window.AndroidBridge;
});

describe("AndroidStorage", () => {
  it("returns undefined when the bridge has no value", () => {
    installBridge({ getStorage: vi.fn(() => null) });
    expect(AndroidStorage.get("missing")).toBeUndefined();
  });

  it("parses JSON-encoded values from the native bridge", () => {
    installBridge({
      getStorage: vi.fn(() => JSON.stringify({ count: 7 })),
    });
    expect(AndroidStorage.get("settings")).toEqual({ count: 7 });
  });

  it("returns undefined when the stored value is not valid JSON", () => {
    installBridge({ getStorage: vi.fn(() => "not-json{") });
    expect(AndroidStorage.get("broken")).toBeUndefined();
  });

  it("stringifies values before persisting via setStorage", () => {
    const bridge = installBridge();
    AndroidStorage.set("alpha", { x: 1 });
    expect(bridge.setStorage).toHaveBeenCalledWith("alpha", JSON.stringify({ x: 1 }));
  });

  it("forwards remove() to the native bridge", () => {
    const bridge = installBridge();
    AndroidStorage.remove("alpha");
    expect(bridge.removeStorage).toHaveBeenCalledWith("alpha");
  });

  it("throws a clear error when the bridge is missing", () => {
    delete window.AndroidBridge;
    expect(() => AndroidStorage.get("foo")).toThrow(/AndroidBridge is not available/);
  });
});

describe("AndroidFetch", () => {
  it("serializes the payload and parses the JSON response", async () => {
    const bridge = installBridge({
      fetch: vi.fn(() => JSON.stringify({ ok: true, html: "<p>hi</p>" })),
    });
    const result = await AndroidFetch.send({ type: "bds-fetch-url", url: "https://x" });
    expect(bridge.fetch).toHaveBeenCalledWith(
      JSON.stringify({ type: "bds-fetch-url", url: "https://x" }),
    );
    expect(result).toEqual({ ok: true, html: "<p>hi</p>" });
  });

  it("returns a structured error when the bridge returns an empty string", async () => {
    installBridge({ fetch: vi.fn(() => "") });
    const result = await AndroidFetch.send({ type: "bds-fetch-url" });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Empty response/);
  });

  it("returns a structured error when the bridge returns malformed JSON", async () => {
    installBridge({ fetch: vi.fn(() => "not-json") });
    const result = await AndroidFetch.send({ type: "bds-fetch-url" });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Failed to parse/);
  });

  it("propagates authRejected payloads from the native bridge", async () => {
    installBridge({
      fetch: vi.fn(() =>
        JSON.stringify({
          ok: false,
          status: 401,
          authRejected: true,
          error: "rejected",
        }),
      ),
    });
    const result = await AndroidFetch.send({
      type: "bds-fetch-github-zip",
      url: "https://codeload.github.com/x/y/zip/refs/heads/main",
      token: "bad",
    });
    expect(result).toEqual({
      ok: false,
      status: 401,
      authRejected: true,
      error: "rejected",
    });
  });

  it("downloadBlob coerces all args to strings before calling the bridge", () => {
    const bridge = installBridge();
    AndroidFetch.downloadBlob("ZGF0YQ==", "text/plain", "note.txt");
    expect(bridge.downloadBlob).toHaveBeenCalledWith("ZGF0YQ==", "text/plain", "note.txt");
  });

  it("downloadBlob falls back to defaults when args are missing", () => {
    const bridge = installBridge();
    AndroidFetch.downloadBlob(null, null, null);
    expect(bridge.downloadBlob).toHaveBeenCalledWith("", "application/octet-stream", "download.bin");
  });
});

describe("AndroidAssetUrl", () => {
  it("delegates to the native bridge with a coerced path", () => {
    const bridge = installBridge();
    expect(AndroidAssetUrl.resolve("sandbox.html")).toBe(
      "https://bds-asset.local/bds/sandbox.html",
    );
    expect(bridge.getAssetUrl).toHaveBeenCalledWith("sandbox.html");
  });
});
