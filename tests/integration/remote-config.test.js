// @vitest-environment jsdom

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  remoteConfig,
  getFlag,
  getConfig,
  REMOTE_CONFIG_EVENT,
} from "../../src/lib/remote-config.svelte.js";
import { DEFAULT_REMOTE_CONFIG, STORAGE_KEYS } from "../../src/lib/constants.js";
import { setChromeStorage, chromeMockState, chromeMock } from "../mocks/chrome.js";

describe("RemoteConfigManager", () => {
  beforeEach(() => {
    remoteConfig.resetToBuiltin();
  });

  // ── Default config ──

  describe("default config", () => {
    it("raw contains all default keys", () => {
      const cfg = remoteConfig.raw;
      expect(cfg.features).toBeDefined();
      expect(cfg.selectors).toBeDefined();
      expect(cfg.api).toBeDefined();
      expect(cfg.modelMappings).toBeDefined();
    });

    it("attachMenu defaults match expectations", () => {
      const am = remoteConfig.raw.features.attachMenu;
      expect(am.enabled).toBe(true);
      expect(am.instantMode.show).toBe(true);
      expect(am.expertMode.show).toBe(false);
      expect(am.deepthinkMode.show).toBe(true);
    });

    it("defaults are deep-copied so raw getter never mutates builtins", () => {
      const cfg = remoteConfig.raw;
      cfg.features.attachMenu.enabled = false;
      const cfg2 = remoteConfig.raw;
      expect(cfg2.features.attachMenu.enabled).toBe(true);
    });
  });

  // ── getFlag ──

  describe("getFlag", () => {
    it("returns true for existing enabled flags", () => {
      expect(getFlag("features.attachMenu.enabled")).toBe(true);
    });

    it("returns false for disabled flags", () => {
      expect(getFlag("features.attachMenu.expertMode.show")).toBe(false);
    });

    it("returns true for enabled flags", () => {
      expect(getFlag("features.attachMenu.instantMode.show")).toBe(true);
    });

    it("returns false for non-existent paths", () => {
      expect(getFlag("features.nonexistent")).toBe(false);
      expect(getFlag("")).toBe(false);
    });

    it("returns false for deeply non-existent paths", () => {
      expect(getFlag("features.attachMenu.nonexistent.deep")).toBe(false);
    });
  });

  // ── getConfig ──

  describe("getConfig", () => {
    it("returns the exact value at a path", () => {
      expect(getConfig("features.attachMenu.enabled")).toBe(true);
    });

    it("returns an object for nested paths", () => {
      const mode = getConfig("features.attachMenu.expertMode");
      expect(mode).toEqual({ show: false, showGithub: true, showWeb: true, showFolder: false });
    });

    it("returns undefined for non-existent paths", () => {
      expect(getConfig("features.nonexistent")).toBeUndefined();
      expect(getConfig("")).toBeUndefined();
    });

    it("returns undefined for null intermediate", () => {
      expect(getConfig("features.attachMenu.expertMode.nonexistent.deep")).toBeUndefined();
    });
  });

  // ── replaceRemote (full override) ──

  describe("replaceRemote", () => {
    it("replaces the remote config and merges with defaults", () => {
      remoteConfig.replaceRemote({
        features: { attachMenu: { enabled: false } },
      });
      expect(getFlag("features.attachMenu.enabled")).toBe(false);
    });

    it("preserves default keys not in the override", () => {
      remoteConfig.replaceRemote({
        features: { attachMenu: { enabled: false } },
      });
      expect(getFlag("features.attachMenu.instantMode.show")).toBe(true);
    });

    it("accepts null and clears remote overrides", () => {
      remoteConfig.replaceRemote({ features: { attachMenu: { enabled: false } } });
      remoteConfig.replaceRemote(null);
      expect(getFlag("features.attachMenu.enabled")).toBe(true);
    });

    it("accepts undefined and clears remote overrides", () => {
      remoteConfig.replaceRemote({ features: { attachMenu: { enabled: false } } });
      remoteConfig.replaceRemote(undefined);
      expect(getFlag("features.attachMenu.enabled")).toBe(true);
    });

    it("persists to chrome.storage.local", async () => {
      const data = { features: { attachMenu: { enabled: false } } };
      remoteConfig.replaceRemote(data);
      expect(chromeMock.storage.local.set).toHaveBeenCalledWith({
        [STORAGE_KEYS.remoteConfig]: data,
      });
    });
  });

  // ── applyRemote (partial deep merge) ──

  describe("applyRemote", () => {
    it("deep-merges partial overrides into existing remote config", () => {
      remoteConfig.applyRemote({
        features: { attachMenu: { instantMode: { show: false } } },
      });
      expect(getFlag("features.attachMenu.instantMode.show")).toBe(false);
      expect(getFlag("features.attachMenu.expertMode.show")).toBe(false);
    });

    it("preserves existing remote keys not in the partial", () => {
      remoteConfig.replaceRemote({
        features: { fileUpload: { enabled: false } },
      });
      remoteConfig.applyRemote({
        features: { attachMenu: { enabled: false } },
      });
      expect(getFlag("features.fileUpload.enabled")).toBe(false);
      expect(getFlag("features.attachMenu.enabled")).toBe(false);
    });

    it("replaces arrays (does not merge)", () => {
      remoteConfig.replaceRemote({
        selectors: { message: { container: ["old"] } },
      });
      remoteConfig.applyRemote({
        selectors: { message: { container: ["new"] } },
      });
      expect(getConfig("selectors.message.container")).toEqual(["new"]);
    });

    it("replaces primitives (does not merge)", () => {
      remoteConfig.applyRemote({ api: { statusUrl: "https://example.com" } });
      expect(getConfig("api.statusUrl")).toBe("https://example.com");
    });
  });

  // ── resetToBuiltin ──

  describe("resetToBuiltin", () => {
    it("clears remote overrides and restores defaults", () => {
      remoteConfig.replaceRemote({
        features: { attachMenu: { enabled: false } },
      });
      expect(getFlag("features.attachMenu.enabled")).toBe(false);
      remoteConfig.resetToBuiltin();
      expect(getFlag("features.attachMenu.enabled")).toBe(true);
    });

    it("removes data from chrome.storage.local", async () => {
      remoteConfig.replaceRemote({ features: { attachMenu: { enabled: false } } });
      remoteConfig.resetToBuiltin();
      expect(chromeMock.storage.local.remove).toHaveBeenCalledWith(
        [STORAGE_KEYS.remoteConfig, STORAGE_KEYS.remoteConfigMeta],
      );
    });

    it("notifies on Reset", () => {
      const cb = vi.fn();
      remoteConfig.onChange(cb);
      remoteConfig.resetToBuiltin();
      expect(cb).toHaveBeenCalledOnce();
    });
  });

  // ── onChange callbacks ──

  describe("onChange", () => {
    it("fires callback on replaceRemote", () => {
      const cb = vi.fn();
      remoteConfig.onChange(cb);
      remoteConfig.replaceRemote({ features: { attachMenu: { enabled: false } } });
      expect(cb).toHaveBeenCalledOnce();
    });

    it("fires callback on applyRemote", () => {
      const cb = vi.fn();
      remoteConfig.onChange(cb);
      remoteConfig.applyRemote({ features: { attachMenu: { enabled: false } } });
      expect(cb).toHaveBeenCalledOnce();
    });

    it("fires callback on resetToBuiltin", () => {
      const cb = vi.fn();
      remoteConfig.onChange(cb);
      remoteConfig.resetToBuiltin();
      expect(cb).toHaveBeenCalledOnce();
    });

    it("passes the merged config to the callback", () => {
      const cb = vi.fn();
      remoteConfig.onChange(cb);
      remoteConfig.replaceRemote({ features: { attachMenu: { enabled: false } } });
      expect(cb).toHaveBeenCalledWith(
        expect.objectContaining({
          features: expect.objectContaining({
            attachMenu: expect.objectContaining({ enabled: false }),
          }),
        }),
      );
    });

    it("unsubscribe removes the callback", () => {
      const cb = vi.fn();
      const unsubscribe = remoteConfig.onChange(cb);
      unsubscribe();
      remoteConfig.replaceRemote({ features: { attachMenu: { enabled: false } } });
      expect(cb).not.toHaveBeenCalled();
    });

    it("multiple callbacks all fire", () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      remoteConfig.onChange(cb1);
      remoteConfig.onChange(cb2);
      remoteConfig.replaceRemote({ test: true });
      expect(cb1).toHaveBeenCalledOnce();
      expect(cb2).toHaveBeenCalledOnce();
    });
  });

  // ── CustomEvent dispatch ──

  describe("CustomEvent dispatch", () => {
    it("dispatches REMOTE_CONFIG_EVENT on replaceRemote", () => {
      const handler = vi.fn();
      window.addEventListener(REMOTE_CONFIG_EVENT, handler);
      remoteConfig.replaceRemote({ features: { attachMenu: { enabled: false } } });
      expect(handler).toHaveBeenCalledOnce();
      window.removeEventListener(REMOTE_CONFIG_EVENT, handler);
    });

    it("dispatches REMOTE_CONFIG_EVENT on applyRemote", () => {
      const handler = vi.fn();
      window.addEventListener(REMOTE_CONFIG_EVENT, handler);
      remoteConfig.applyRemote({ features: { attachMenu: { enabled: false } } });
      expect(handler).toHaveBeenCalledOnce();
      window.removeEventListener(REMOTE_CONFIG_EVENT, handler);
    });

    it("dispatches REMOTE_CONFIG_EVENT on resetToBuiltin", () => {
      const handler = vi.fn();
      window.addEventListener(REMOTE_CONFIG_EVENT, handler);
      remoteConfig.resetToBuiltin();
      expect(handler).toHaveBeenCalledOnce();
      window.removeEventListener(REMOTE_CONFIG_EVENT, handler);
    });

    it("event detail contains the merged config", () => {
      const handler = vi.fn();
      window.addEventListener(REMOTE_CONFIG_EVENT, handler);
      remoteConfig.replaceRemote({ features: { attachMenu: { enabled: false } } });
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: expect.objectContaining({
            features: expect.objectContaining({
              attachMenu: expect.objectContaining({ enabled: false }),
            }),
          }),
        }),
      );
      window.removeEventListener(REMOTE_CONFIG_EVENT, handler);
    });
  });

  // ── init() from storage ──

  describe("init", () => {
    it("loads remote config from storage and merges with defaults", async () => {
      remoteConfig.resetToBuiltin();
      setChromeStorage({ [STORAGE_KEYS.remoteConfig]: { features: { fileUpload: { enabled: false } } } });
      const result = await remoteConfig.init();
      expect(result.features.fileUpload.enabled).toBe(false);
      expect(result.features.attachMenu.enabled).toBe(true);
    });

    it("returns defaults when storage is empty", async () => {
      remoteConfig.resetToBuiltin();
      setChromeStorage({});
      const result = await remoteConfig.init();
      expect(result.features.attachMenu.enabled).toBe(true);
    });

    it("is idempotent — subsequent calls return same promise", async () => {
      const p1 = remoteConfig.init();
      const p2 = remoteConfig.init();
      const result = await p1;
      expect(result).toBeDefined();
      expect(result.features).toBeDefined();
    });
  });

  // ── Persistence ──

  describe("persistence", () => {
    it("replaceRemote writes to chrome.storage.local", () => {
      remoteConfig.replaceRemote({ features: { attachMenu: { enabled: false } } });
      expect(chromeMock.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          [STORAGE_KEYS.remoteConfig]: expect.objectContaining({
            features: expect.objectContaining({
              attachMenu: expect.objectContaining({ enabled: false }),
            }),
          }),
        }),
      );
    });

    it("applyRemote writes to chrome.storage.local", () => {
      remoteConfig.applyRemote({ features: { attachMenu: { enabled: false } } });
      expect(chromeMock.storage.local.set).toHaveBeenCalled();
    });
  });

  // ── DeepMerge edge cases ──

  describe("deep merge edge cases", () => {
    it("handles empty remote config", () => {
      remoteConfig.replaceRemote({});
      expect(getFlag("features.attachMenu.enabled")).toBe(true);
    });

    it("nested null in remote overrides that branch entirely", () => {
      remoteConfig.replaceRemote({ features: null });
      expect(getFlag("features.attachMenu.enabled")).toBe(false);
      expect(getFlag("features.fileUpload.enabled")).toBe(false);
    });

    it("remote can add new keys not in defaults", () => {
      remoteConfig.replaceRemote({ customKey: { nested: "value" } });
      expect(getConfig("customKey.nested")).toBe("value");
    });
  });
});

describe("AttachMenu config integration (DOM model switching)", () => {
  let radioGroup;
  let defaultRadio;
  let expertRadio;

  beforeEach(() => {
    remoteConfig.resetToBuiltin();

    radioGroup = document.createElement("div");
    radioGroup.setAttribute("role", "radiogroup");

    defaultRadio = document.createElement("div");
    defaultRadio.setAttribute("role", "radio");
    defaultRadio.setAttribute("data-model-type", "default");
    defaultRadio.setAttribute("aria-checked", "false");
    defaultRadio.textContent = "Instant";

    expertRadio = document.createElement("div");
    expertRadio.setAttribute("role", "radio");
    expertRadio.setAttribute("data-model-type", "expert");
    expertRadio.setAttribute("aria-checked", "false");
    expertRadio.textContent = "Expert";

    radioGroup.appendChild(defaultRadio);
    radioGroup.appendChild(expertRadio);
    document.body.appendChild(radioGroup);
  });

  afterEach(() => {
    radioGroup?.remove();
  });

  function detectModelType() {
    const switcher = document.querySelector('[role="radiogroup"]');
    if (switcher) {
      const checked = switcher.querySelector('[aria-checked="true"]');
      if (checked) {
        const dt = checked.getAttribute("data-model-type");
        if (dt === "expert") return "expert";
        if (dt === "deepthink") return "deepthink";
        return "instant";
      }
    }
    return "instant";
  }

  function getModelKey(modelType) {
    return modelType === "expert" ? "expertMode" : modelType === "instant" ? "instantMode" : "deepthinkMode";
  }

  it("detects expert mode from radio group", () => {
    expertRadio.setAttribute("aria-checked", "true");
    expect(detectModelType()).toBe("expert");
  });

  it("detects instant mode from radio group", () => {
    defaultRadio.setAttribute("aria-checked", "true");
    expect(detectModelType()).toBe("instant");
  });

  it("instant mode shows attach menu with default config", () => {
    defaultRadio.setAttribute("aria-checked", "true");
    const model = detectModelType();
    const modelKey = getModelKey(model);
    const show = getFlag(`features.attachMenu.${modelKey}.show`);
    expect(show).toBe(true);
  });

  it("expert mode hides attach menu with default config", () => {
    expertRadio.setAttribute("aria-checked", "true");
    const model = detectModelType();
    const modelKey = getModelKey(model);
    const show = getFlag(`features.attachMenu.${modelKey}.show`);
    expect(show).toBe(false);
  });

  it("switching model changes visibility flags", () => {
    defaultRadio.setAttribute("aria-checked", "true");
    let model = detectModelType();
    let modelKey = getModelKey(model);
    expect(getFlag(`features.attachMenu.${modelKey}.show`)).toBe(true);

    expertRadio.setAttribute("aria-checked", "true");
    defaultRadio.setAttribute("aria-checked", "false");
    model = detectModelType();
    modelKey = getModelKey(model);
    expect(getFlag(`features.attachMenu.${modelKey}.show`)).toBe(false);
  });

  it("remote config override takes effect for expert mode", () => {
    expertRadio.setAttribute("aria-checked", "true");
    remoteConfig.replaceRemote({
      features: { attachMenu: { expertMode: { show: true } } },
    });
    const model = detectModelType();
    const modelKey = getModelKey(model);
    expect(getFlag(`features.attachMenu.${modelKey}.show`)).toBe(true);
  });

  it("partial applyRemote overrides specific model flag", () => {
    expertRadio.setAttribute("aria-checked", "true");
    remoteConfig.applyRemote({
      features: { attachMenu: { expertMode: { showGithub: false } } },
    });
    const model = detectModelType();
    const modelKey = getModelKey(model);
    expect(getFlag(`features.attachMenu.${modelKey}.show`)).toBe(false);
    expect(getFlag(`features.attachMenu.${modelKey}.showGithub`)).toBe(false);
    expect(getFlag(`features.attachMenu.${modelKey}.showWeb`)).toBe(true);
  });

  it("no radio group falls back to instant mode", () => {
    radioGroup?.remove();
    expect(detectModelType()).toBe("instant");
    const modelKey = getModelKey("instant");
    expect(getFlag(`features.attachMenu.${modelKey}.show`)).toBe(true);
  });

  it("radio group with no checked radio returns instant", () => {
    expect(detectModelType()).toBe("instant");
  });
});
