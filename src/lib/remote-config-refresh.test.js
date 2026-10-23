// @vitest-environment node

/**
 * Android remote-config refresh.
 *
 * The Android bundle has no background service worker, so these tests pin the
 * replacement path: bridge fetch → same persistence contract → config handed
 * back to the in-memory manager.
 */

import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_FETCH_INTERVAL_MS,
  createBridgeFetch,
  isFetchDue,
  refreshRemoteConfigIfDue,
} from "./remote-config-refresh.js";

const HOUR = 60 * 60 * 1000;

function makeStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    get: vi.fn(async (keys) => {
      const list = Array.isArray(keys) ? keys : [keys];
      const out = {};
      for (const key of list) {
        if (key in data) out[key] = data[key];
      }
      return out;
    }),
    set: vi.fn(async (items) => {
      Object.assign(data, items);
    }),
  };
}

function bridgeReply(config) {
  return { ok: true, status: 200, html: JSON.stringify(config) };
}

const CONFIG = {
  meta: { version: 1 },
  features: {
    composerButtons: {
      targets: { android: { attachMenu: true, attachItems: { showVoice: false } } },
    },
  },
};

describe("isFetchDue", () => {
  it("treats a missing or unusable timestamp as due", () => {
    expect(isFetchDue(undefined, 1000)).toBe(true);
    expect(isFetchDue(null, 1000)).toBe(true);
    expect(isFetchDue({}, 1000)).toBe(true);
    expect(isFetchDue({ lastFetched: "nope" }, 1000)).toBe(true);
    expect(isFetchDue({ lastFetched: 0 }, 1000)).toBe(true);
  });

  it("skips while the stored copy is younger than the interval", () => {
    expect(isFetchDue({ lastFetched: 1000 }, 1000 + HOUR - 1)).toBe(false);
  });

  it("becomes due once the interval has elapsed", () => {
    expect(isFetchDue({ lastFetched: 1000 }, 1000 + HOUR)).toBe(true);
    expect(isFetchDue({ lastFetched: 1000 }, 1000 + HOUR * 5)).toBe(true);
  });

  it("honours a custom interval and falls back on junk", () => {
    expect(isFetchDue({ lastFetched: 0 + 1 }, 5000, 10000)).toBe(false);
    expect(isFetchDue({ lastFetched: 1 }, 5000, 10000)).toBe(false);
    expect(isFetchDue({ lastFetched: 1 }, 10001, 10000)).toBe(true);
    // Junk or non-positive intervals fall back to the default hour.
    expect(isFetchDue({ lastFetched: 1 }, 10001, 0)).toBe(false);
    expect(isFetchDue({ lastFetched: 1 }, 10001, "x")).toBe(false);
    expect(DEFAULT_FETCH_INTERVAL_MS).toBe(HOUR);
  });
});

describe("createBridgeFetch", () => {
  it("sends the bridge payload and parses the JSON body", async () => {
    const sendMessage = vi.fn(async () => bridgeReply(CONFIG));
    const response = await createBridgeFetch(sendMessage)(
      "https://example.test/config.json?t=1",
    );

    expect(sendMessage).toHaveBeenCalledWith({
      type: "bds-fetch-url",
      url: "https://example.test/config.json?t=1",
      options: { method: "GET" },
    });
    expect(response.ok).toBe(true);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(CONFIG);
  });

  it("reports a bridge failure by throwing, so the reason survives", async () => {
    const sendMessage = vi.fn(async () => ({
      ok: false,
      status: 404,
      error: "Server returned 404",
    }));
    await expect(
      createBridgeFetch(sendMessage)("https://example.test/x"),
    ).rejects.toThrow("Server returned 404");
  });

  it("falls back to a status-based message when the bridge omits the error", async () => {
    const sendMessage = vi.fn(async () => ({ ok: false, status: 500 }));
    await expect(
      createBridgeFetch(sendMessage)("https://example.test/x"),
    ).rejects.toThrow("status 500");
  });

  it("throws on a body that is not JSON, so the caller can fail the fetch", async () => {
    const sendMessage = vi.fn(async () => ({ ok: true, status: 200, html: "<html>" }));
    const response = await createBridgeFetch(sendMessage)("https://example.test/x");
    await expect(response.json()).rejects.toThrow();
  });
});

describe("refreshRemoteConfigIfDue", () => {
  it("skips the bridge while the stored config is fresh", async () => {
    const storage = makeStorage({
      bds_remote_config: CONFIG,
      bds_remote_config_meta: { lastFetched: 5000, version: 1 },
    });
    const sendMessage = vi.fn();

    const result = await refreshRemoteConfigIfDue({
      storage,
      sendMessage,
      now: 5000 + HOUR - 1,
    });

    expect(result).toEqual({ fetched: false, reason: "fresh" });
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("fetches, persists and returns the config when due", async () => {
    const storage = makeStorage({});
    const sendMessage = vi.fn(async () => bridgeReply(CONFIG));

    const result = await refreshRemoteConfigIfDue({
      storage,
      sendMessage,
      now: 1000,
    });

    expect(result.fetched).toBe(true);
    expect(result.config).toEqual(CONFIG);
    expect(storage.data.bds_remote_config).toEqual(CONFIG);
    expect(storage.data.bds_remote_config_meta).toEqual({
      lastFetched: 1000,
      version: 1,
    });
  });

  it("re-fetches once the interval has elapsed", async () => {
    const storage = makeStorage({
      bds_remote_config: { meta: { version: 0 } },
      bds_remote_config_meta: { lastFetched: 1000, version: 0 },
    });
    const sendMessage = vi.fn(async () => bridgeReply(CONFIG));

    const result = await refreshRemoteConfigIfDue({
      storage,
      sendMessage,
      now: 1000 + HOUR,
    });

    expect(result.fetched).toBe(true);
    expect(storage.data.bds_remote_config).toEqual(CONFIG);
  });

  it("force ignores the freshness window", async () => {
    const storage = makeStorage({
      bds_remote_config_meta: { lastFetched: 5000, version: 1 },
    });
    const sendMessage = vi.fn(async () => bridgeReply(CONFIG));

    const result = await refreshRemoteConfigIfDue({
      storage,
      sendMessage,
      now: 5001,
      force: true,
    });

    expect(result.fetched).toBe(true);
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it("surfaces a bridge failure without writing storage", async () => {
    const storage = makeStorage({});
    const sendMessage = vi.fn(async () => ({ ok: false, status: 0, error: "offline" }));

    const result = await refreshRemoteConfigIfDue({ storage, sendMessage, now: 10 });

    expect(result.fetched).toBe(false);
    expect(result.reason).toContain("offline");
    expect(storage.set).not.toHaveBeenCalled();
  });

  it("treats unreadable metadata as due instead of throwing", async () => {
    const storage = makeStorage({});
    storage.get.mockImplementationOnce(async () => {
      throw new Error("storage unavailable");
    });
    const sendMessage = vi.fn(async () => bridgeReply(CONFIG));

    const result = await refreshRemoteConfigIfDue({ storage, sendMessage, now: 10 });

    expect(result.fetched).toBe(true);
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it("refuses to run without dependencies", async () => {
    await expect(refreshRemoteConfigIfDue({})).resolves.toEqual({
      fetched: false,
      reason: "missing-deps",
    });
    await expect(refreshRemoteConfigIfDue({ storage: makeStorage({}) })).resolves.toEqual({
      fetched: false,
      reason: "missing-deps",
    });
  });
});
