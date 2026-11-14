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
} from "../../src/lib/remote-persistence.js";

// ── Helpers ──

function makeDeps() {
  return {
    fetch: vi.fn(),
    storage: {
      get: (key) => chrome.storage.local.get(key),
      set: (values) => chrome.storage.local.set(values),
    },
  };
}

// ── persistRemoteConfig ──

describe("persistRemoteConfig", () => {
  let deps;

  beforeEach(() => { resetChromeMock(); installChromeMock(); deps = makeDeps(); });
  afterEach(async () => { await flushStorageChanges(); });

  it("initial fetch writes config and meta in one operation", async () => {
    const config = { features: { test: true }, meta: { version: 1 } };
    deps.fetch.mockResolvedValueOnce({ ok: true, json: async () => config });

    const r = await persistRemoteConfig(deps);
    expect(r.success).toBe(true);
    expect(r.writtenKeys.sort()).toEqual(["bds_remote_config", "bds_remote_config_meta"]);
    expect(chrome.storage.local.set).toHaveBeenCalledTimes(1);
  });

  it("identical config at later time writes only meta", async () => {
    const config = { features: { test: true }, meta: { version: 1 } };
    setChromeStorage({
      bds_remote_config: config,
      bds_remote_config_meta: { lastFetched: 1000, version: 1 },
    });
    deps.fetch.mockResolvedValueOnce({ ok: true, json: async () => config });

    chrome.storage.local.set.mockClear();
    const r = await persistRemoteConfig(deps, { now: 2000 });
    expect(r.success).toBe(true);
    expect(r.writtenKeys).toEqual(["bds_remote_config_meta"]);
    expect(chrome.storage.local.set).toHaveBeenCalledTimes(1);
  });

  it("identical config with identical metadata writes nothing", async () => {
    const config = { features: { test: true }, meta: { version: 1 } };
    setChromeStorage({
      bds_remote_config: config,
      bds_remote_config_meta: { lastFetched: 2000, version: 1 },
    });
    deps.fetch.mockResolvedValueOnce({ ok: true, json: async () => config });

    chrome.storage.local.set.mockClear();
    const r = await persistRemoteConfig(deps, { now: 2000 });
    expect(r.success).toBe(true);
    expect(r.writtenKeys).toEqual([]);
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });

  it("meta.version change updates both config and meta atomically", async () => {
    const oldConfig = { features: { test: true }, meta: { version: 1 } };
    setChromeStorage({ bds_remote_config: oldConfig });
    const newConfig = { features: { test: true }, meta: { version: 2 } };
    deps.fetch.mockResolvedValueOnce({ ok: true, json: async () => newConfig });

    chrome.storage.local.set.mockClear();
    const r = await persistRemoteConfig(deps);
    expect(r.success).toBe(true);
    expect(r.writtenKeys.sort()).toEqual(["bds_remote_config", "bds_remote_config_meta"]);
    expect(chrome.storage.local.set).toHaveBeenCalledTimes(1);
    const call = chrome.storage.local.set.mock.calls[0][0];
    expect(call.bds_remote_config).toEqual(newConfig);
  });

  it("key reorder is structural equality — no config write", async () => {
    setChromeStorage({
      bds_remote_config: { meta: { version: 1 }, features: { test: true } },
      bds_remote_config_meta: { lastFetched: 2000, version: 1 },
    });
    deps.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ features: { test: true }, meta: { version: 1 } }),
    });

    chrome.storage.local.set.mockClear();
    const r = await persistRemoteConfig(deps, { now: 2000 });
    expect(r.success).toBe(true);
    expect(r.writtenKeys).toEqual([]);
  });

  it("rejects array root", async () => {
    deps.fetch.mockResolvedValueOnce({ ok: true, json: async () => [{ features: {} }] });
    chrome.storage.local.set.mockClear();
    const r = await persistRemoteConfig(deps);
    expect(r.success).toBe(false);
    expect(r.writtenKeys).toEqual([]);
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });

  it("rejects null root", async () => {
    deps.fetch.mockResolvedValueOnce({ ok: true, json: async () => null });
    chrome.storage.local.set.mockClear();
    const r = await persistRemoteConfig(deps);
    expect(r.success).toBe(false);
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });

  it("rejects primitive root", async () => {
    deps.fetch.mockResolvedValueOnce({ ok: true, json: async () => "not-an-object" });
    chrome.storage.local.set.mockClear();
    const r = await persistRemoteConfig(deps);
    expect(r.success).toBe(false);
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });

  it("non-ok response returns failure", async () => {
    deps.fetch.mockResolvedValueOnce({ ok: false, status: 500 });
    chrome.storage.local.set.mockClear();
    const r = await persistRemoteConfig(deps);
    expect(r.success).toBe(false);
    expect(r.error).toBe("HTTP 500");
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });

  it("JSON parse failure returns failure", async () => {
    deps.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => { throw new Error("JSON parse error"); },
    });
    chrome.storage.local.set.mockClear();
    const r = await persistRemoteConfig(deps);
    expect(r.success).toBe(false);
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });

  it("storage rejection is surfaced", async () => {
    const config = { features: { test: true }, meta: { version: 1 } };
    deps.fetch.mockResolvedValueOnce({ ok: true, json: async () => config });
    deps.storage.set = vi.fn(async () => { throw new Error("Storage full"); });

    const r = await persistRemoteConfig(deps);
    expect(r.success).toBe(false);
    expect(r.error).toBe("Storage full");
  });

  it("Firefox mode: single set produces exactly one event with both keys", async () => {
    setStorageMockMode("firefox");
    const config = { features: { test: true }, meta: { version: 1 } };
    deps.fetch.mockResolvedValueOnce({ ok: true, json: async () => config });

    const events = [];
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local") events.push(changes);
    });

    await persistRemoteConfig(deps);
    await flushStorageChanges();

    expect(events).toHaveLength(1);
    expect(Object.keys(events[0]).sort()).toEqual(["bds_remote_config", "bds_remote_config_meta"]);
  });
});

// ── persistRemoteStatus ──

describe("persistRemoteStatus", () => {
  let deps;

  beforeEach(() => { resetChromeMock(); installChromeMock(); deps = makeDeps(); });
  afterEach(async () => { await flushStorageChanges(); });

  it("initial fetch writes announcements", async () => {
    const announcements = [{ id: "a1", text: "Test" }];
    deps.fetch.mockResolvedValueOnce({ ok: true, json: async () => announcements });

    const r = await persistRemoteStatus(deps);
    expect(r.success).toBe(true);
    expect(r.writtenKeys).toEqual(["bds_remote_announcement"]);
    const stored = await chrome.storage.local.get("bds_remote_announcement");
    expect(stored.bds_remote_announcement).toEqual(announcements);
  });

  it("identical fetch writes nothing", async () => {
    const announcements = [{ id: "a1", text: "Test" }];
    setChromeStorage({ bds_remote_announcement: announcements });
    deps.fetch.mockResolvedValueOnce({ ok: true, json: async () => announcements });

    chrome.storage.local.set.mockClear();
    const r = await persistRemoteStatus(deps);
    expect(r.success).toBe(true);
    expect(r.writtenKeys).toEqual([]);
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });

  it("wraps single object in array", async () => {
    const single = { id: "a1", text: "Test" };
    deps.fetch.mockResolvedValueOnce({ ok: true, json: async () => single });

    await persistRemoteStatus(deps);
    const stored = await chrome.storage.local.get("bds_remote_announcement");
    expect(stored.bds_remote_announcement).toEqual([single]);
  });

  it("empty array clears announcements", async () => {
    setChromeStorage({ bds_remote_announcement: [{ id: "old" }] });
    deps.fetch.mockResolvedValueOnce({ ok: true, json: async () => [] });

    const r = await persistRemoteStatus(deps);
    expect(r.success).toBe(true);
    expect(r.writtenKeys).toEqual(["bds_remote_announcement"]);
    const stored = await chrome.storage.local.get("bds_remote_announcement");
    expect(stored.bds_remote_announcement).toEqual([]);
  });

  it("null data returns failure without write", async () => {
    deps.fetch.mockResolvedValueOnce({ ok: true, json: async () => null });
    chrome.storage.local.set.mockClear();
    const r = await persistRemoteStatus(deps);
    expect(r.success).toBe(false);
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });
});

// ── persistLocales ──

describe("persistLocales", () => {
  let deps;

  beforeEach(() => { resetChromeMock(); installChromeMock(); deps = makeDeps(); });
  afterEach(async () => { await flushStorageChanges(); });

  function mockLocaleFetch(code, data) {
    deps.fetch.mockImplementation((url) => {
      if (url.includes(`/${code}.json`)) {
        return Promise.resolve({ ok: true, json: async () => data });
      }
      return Promise.resolve({ ok: true, json: async () => ({ messages: {} }) });
    });
  }

  it("initial fetch writes locale data and last-checked atomically", async () => {
    mockLocaleFetch("en", { messages: { hello: "Hello" } });

    chrome.storage.local.set.mockClear();
    const r = await persistLocales(deps, ["en"]);
    expect(r.success).toBe(true);
    expect(r.writtenKeys.sort()).toEqual(["bds_locale_update_last_checked", "bds_locale_updates"]);
    expect(chrome.storage.local.set).toHaveBeenCalledTimes(1);

    const stored = await chrome.storage.local.get("bds_locale_updates");
    expect(stored.bds_locale_updates.en.messages.hello).toBe("Hello");
  });

  it("preserves existing locale when fetch fails for that code", async () => {
    setChromeStorage({
      bds_locale_updates: { en: { messages: { hello: "Hello" } }, tr: { messages: { merhaba: "Merhaba" } } },
    });

    // en succeeds, tr fails
    deps.fetch.mockImplementation((url) => {
      if (url.includes("/en.json")) {
        return Promise.resolve({ ok: true, json: async () => ({ messages: { hello: "Updated" } }) });
      }
      if (url.includes("/tr.json")) {
        return Promise.resolve({ ok: false, status: 500 });
      }
      return Promise.resolve({ ok: true, json: async () => ({ messages: {} }) });
    });

    const r = await persistLocales(deps, ["en", "tr"]);
    expect(r.success).toBe(true);

    const stored = await chrome.storage.local.get("bds_locale_updates");
    // en updated, tr preserved from previous value
    expect(stored.bds_locale_updates.en.messages.hello).toBe("Updated");
    expect(stored.bds_locale_updates.tr.messages.merhaba).toBe("Merhaba");
  });

  it("all-locale-failure returns error without writing", async () => {
    deps.fetch.mockResolvedValue({ ok: false, status: 500 });
    chrome.storage.local.set.mockClear();

    const r = await persistLocales(deps, ["en", "tr"]);
    expect(r.success).toBe(false);
    expect(r.error).toBe("No valid locale files fetched");
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });

  it("identical locale data writes nothing", async () => {
    setChromeStorage({
      bds_locale_updates: { en: { messages: { hello: "Hello" } } },
      bds_locale_update_last_checked: new Date(2000).toLocaleDateString(),
    });
    mockLocaleFetch("en", { messages: { hello: "Hello" } });

    chrome.storage.local.set.mockClear();
    const r = await persistLocales(deps, ["en"], { now: 2000 });
    expect(r.success).toBe(true);
    expect(r.writtenKeys).toEqual([]);
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });

  it("non-messages data is ignored for that code", async () => {
    // Data without a .messages key is invalid locale data
    deps.fetch.mockImplementation((url) => {
      return Promise.resolve({ ok: true, json: async () => ({ noMessages: true }) });
    });
    chrome.storage.local.set.mockClear();

    const r = await persistLocales(deps, ["en"]);
    expect(r.success).toBe(false);
    expect(r.error).toBe("No valid locale files fetched");
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });

  it.each([
    ["array", []],
    ["string", "translations"],
    ["number", 42],
  ])("rejects a %s messages root", async (_label, messages) => {
    mockLocaleFetch("en", { messages });
    chrome.storage.local.set.mockClear();

    const result = await persistLocales(deps, ["en"]);

    expect(result).toEqual({
      success: false,
      writtenKeys: [],
      error: "No valid locale files fetched",
    });
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });
});
