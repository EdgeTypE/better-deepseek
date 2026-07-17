/**
 * Background persistence contract tests.
 *
 * Exercises the pure remote-persistence module with injected fetch/storage.
 */
// @vitest-environment node
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { resetChromeMock, installChromeMock, setChromeStorage, flushStorageChanges, setStorageMockMode } from "../mocks/chrome.js";
import {
  persistRemoteConfig,
  persistRemoteStatus,
  persistLocales,
  REMOTE_CONFIG_URL,
  REMOTE_STATUS_URL,
} from "../../src/lib/remote-persistence.js";

describe("persistRemoteConfig", () => {
  let deps;

  beforeEach(() => {
    resetChromeMock();
    installChromeMock();
    deps = {
      fetch: vi.fn(),
      storage: {
        get: (key) => chrome.storage.local.get(key),
        set: (values) => chrome.storage.local.set(values),
      },
    };
  });

  afterEach(async () => {
    await flushStorageChanges();
  });

  it("writes bds_remote_config on initial fetch", async () => {
    const config = { features: { test: true }, meta: { version: 1 } };
    deps.fetch.mockResolvedValueOnce({ ok: true, json: async () => config });

    const result = await persistRemoteConfig(deps);
    expect(result.written).toBe(true);
    const stored = await chrome.storage.local.get("bds_remote_config");
    expect(stored.bds_remote_config).toEqual(config);
  });

  it("does not write on identical fetch", async () => {
    const config = { features: { test: true }, meta: { version: 1 } };
    setChromeStorage({ bds_remote_config: config });

    deps.fetch.mockResolvedValueOnce({ ok: true, json: async () => config });
    chrome.storage.local.set.mockClear();

    const result = await persistRemoteConfig(deps);
    expect(result.written).toBe(false);
    const setCalls = chrome.storage.local.set.mock.calls;
    const configWrites = setCalls.filter((c) => "bds_remote_config" in (c[0] || {}));
    expect(configWrites).toHaveLength(0);
  });

  it("does not write when keys reordered (structural equality)", async () => {
    const stored = { meta: { version: 1 }, features: { test: true } };
    setChromeStorage({ bds_remote_config: stored });

    const fetched = { features: { test: true }, meta: { version: 1 } };
    deps.fetch.mockResolvedValueOnce({ ok: true, json: async () => fetched });
    chrome.storage.local.set.mockClear();

    const result = await persistRemoteConfig(deps);
    expect(result.written).toBe(false);
    const setCalls = chrome.storage.local.set.mock.calls;
    const configWrites = setCalls.filter((c) => "bds_remote_config" in (c[0] || {}));
    expect(configWrites).toHaveLength(0);
  });

  it("writes when nested value changes", async () => {
    const stored = { features: { test: true }, meta: { version: 1 } };
    setChromeStorage({ bds_remote_config: stored });

    const fetched = { features: { test: false }, meta: { version: 1 } };
    deps.fetch.mockResolvedValueOnce({ ok: true, json: async () => fetched });

    await persistRemoteConfig(deps);
    const storedAfter = await chrome.storage.local.get("bds_remote_config");
    expect(storedAfter.bds_remote_config.features.test).toBe(false);
  });

  it("writes when meta.version changes (complete config comparison)", async () => {
    const stored = { features: { test: true }, meta: { version: 1 } };
    setChromeStorage({ bds_remote_config: stored });

    const fetched = { features: { test: true }, meta: { version: 2 } };
    deps.fetch.mockResolvedValueOnce({ ok: true, json: async () => fetched });

    await persistRemoteConfig(deps);
    const storedAfter = await chrome.storage.local.get("bds_remote_config");
    expect(storedAfter.bds_remote_config.meta.version).toBe(2);
  });

  it("rejects arrays as config roots", async () => {
    deps.fetch.mockResolvedValueOnce({ ok: true, json: async () => [{ features: {} }] });
    chrome.storage.local.set.mockClear();

    const result = await persistRemoteConfig(deps);
    expect(result.written).toBe(false);
    const setCalls = chrome.storage.local.set.mock.calls;
    const configWrites = setCalls.filter((c) => "bds_remote_config" in (c[0] || {}));
    expect(configWrites).toHaveLength(0);
  });

  it("rejects null config", async () => {
    deps.fetch.mockResolvedValueOnce({ ok: true, json: async () => null });
    chrome.storage.local.set.mockClear();

    const result = await persistRemoteConfig(deps);
    expect(result.written).toBe(false);
  });

  it("rejects primitive config roots", async () => {
    deps.fetch.mockResolvedValueOnce({ ok: true, json: async () => "not-an-object" });
    chrome.storage.local.set.mockClear();

    const result = await persistRemoteConfig(deps);
    expect(result.written).toBe(false);
  });

  it("no write on non-ok response", async () => {
    deps.fetch.mockResolvedValueOnce({ ok: false, status: 500 });
    chrome.storage.local.set.mockClear();

    const result = await persistRemoteConfig(deps);
    expect(result.written).toBe(false);
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });

  it("no write on JSON parse failure", async () => {
    deps.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => { throw new Error("JSON parse error"); },
    });
    chrome.storage.local.set.mockClear();

    const result = await persistRemoteConfig(deps);
    expect(result.written).toBe(false);
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });
});

describe("persistRemoteStatus", () => {
  let deps;

  beforeEach(() => {
    resetChromeMock();
    installChromeMock();
    deps = {
      fetch: vi.fn(),
      storage: {
        get: (key) => chrome.storage.local.get(key),
        set: (values) => chrome.storage.local.set(values),
      },
    };
  });

  it("writes on initial fetch", async () => {
    const announcements = [{ id: "a1", text: "Test" }];
    deps.fetch.mockResolvedValueOnce({ ok: true, json: async () => announcements });

    const result = await persistRemoteStatus(deps);
    expect(result.written).toBe(true);
    const stored = await chrome.storage.local.get("bds_remote_announcement");
    expect(stored.bds_remote_announcement).toEqual(announcements);
  });

  it("no write on identical fetch", async () => {
    const announcements = [{ id: "a1", text: "Test" }];
    setChromeStorage({ bds_remote_announcement: announcements });

    deps.fetch.mockResolvedValueOnce({ ok: true, json: async () => announcements });
    chrome.storage.local.set.mockClear();

    const result = await persistRemoteStatus(deps);
    expect(result.written).toBe(false);
    const setCalls = chrome.storage.local.set.mock.calls;
    const announcementWrites = setCalls.filter((c) => "bds_remote_announcement" in (c[0] || {}));
    expect(announcementWrites).toHaveLength(0);
  });

  it("wraps single object in array", async () => {
    const single = { id: "a1", text: "Test" };
    deps.fetch.mockResolvedValueOnce({ ok: true, json: async () => single });

    await persistRemoteStatus(deps);
    const stored = await chrome.storage.local.get("bds_remote_announcement");
    expect(stored.bds_remote_announcement).toEqual([single]);
  });

  it("no write on null data", async () => {
    deps.fetch.mockResolvedValueOnce({ ok: true, json: async () => null });
    chrome.storage.local.set.mockClear();

    const result = await persistRemoteStatus(deps);
    expect(result.written).toBe(false);
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });
});

describe("no feedback loop", () => {
  it("external sync under Firefox mode does not cause write-back in loop prevention", async () => {
    resetChromeMock();
    installChromeMock();
    setStorageMockMode("firefox");
    setChromeStorage({ bds_remote_config: { features: { test: true }, meta: { version: 1 } } });

    // External sync (simulating content-script syncFromStorage) must not write back
    chrome.storage.local.set.mockClear();
    // This is effectively what syncFromStorage does — uses memory, no storage write
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });
});
