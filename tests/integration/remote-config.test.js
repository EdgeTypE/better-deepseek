// @vitest-environment jsdom

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  remoteConfig,
  getFlag,
  getConfig,
  REMOTE_CONFIG_EVENT,
  detectModelType,
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
      expect(am.expertMode.show).toBe(true);
      expect(am.expertMode.showUploadFile).toBe(false);
      expect(am.deepthinkMode.show).toBe(true);
      expect(am.visionMode.show).toBe(true);
      expect(am.visionMode.showUploadFile).toBe(true);
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
      expect(getFlag("features.attachMenu.expertMode.showUploadFile")).toBe(false);
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
      expect(mode).toEqual({
        show: true,
        showPlus: false,
        showUploadFile: false,
        showUploadFolder: false,
        showGithub: false,
        showWeb: false,
        showProject: true,
        showVoice: true,
      });
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
      expect(getFlag("features.attachMenu.expertMode.show")).toBe(true);
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
      remoteConfig.replaceRemote({ features: { attachMenu: { enabled: false } } });
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
      remoteConfig.replaceRemote({ features: { attachMenu: { enabled: false } } });
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
      remoteConfig.replaceRemote({ features: { attachMenu: { enabled: false } } });
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

  // ── syncFromStorage (external sync, no persistence) ──

  describe("syncFromStorage", () => {
    it("updates merged config from external value with zero storage writes", () => {
      const setCallsBefore = chromeMock.storage.local.set.mock.calls.length;
      remoteConfig.syncFromStorage({ features: { attachMenu: { enabled: false } } });
      expect(getFlag("features.attachMenu.enabled")).toBe(false);
      expect(chromeMock.storage.local.set.mock.calls.length).toBe(setCallsBefore);
    });

    it("normalizes invalid values to {} without writing", () => {
      remoteConfig.syncFromStorage(null);
      expect(getFlag("features.attachMenu.enabled")).toBe(true);
      remoteConfig.syncFromStorage(undefined);
      expect(getFlag("features.attachMenu.enabled")).toBe(true);
      remoteConfig.syncFromStorage("not-an-object");
      expect(getFlag("features.attachMenu.enabled")).toBe(true);
    });

    it("emits notification when merged config actually changes", () => {
      const handler = vi.fn();
      window.addEventListener(REMOTE_CONFIG_EVENT, handler);
      remoteConfig.syncFromStorage({ features: { attachMenu: { enabled: false } } });
      expect(handler).toHaveBeenCalledOnce();
      window.removeEventListener(REMOTE_CONFIG_EVENT, handler);
    });

    it("emits zero notifications when external data is structurally identical", () => {
      remoteConfig.syncFromStorage({ features: { attachMenu: { enabled: false } } });
      const handler = vi.fn();
      window.addEventListener(REMOTE_CONFIG_EVENT, handler);
      remoteConfig.syncFromStorage({ features: { attachMenu: { enabled: false } } });
      expect(handler).not.toHaveBeenCalled();
      window.removeEventListener(REMOTE_CONFIG_EVENT, handler);
    });

    it("restores built-ins when storage is removed (empty value)", () => {
      remoteConfig.syncFromStorage({ features: { attachMenu: { enabled: false } } });
      expect(getFlag("features.attachMenu.enabled")).toBe(false);
      remoteConfig.syncFromStorage({});
      expect(getFlag("features.attachMenu.enabled")).toBe(true);
    });

    it("never calls chrome.storage.local.set", () => {
      const setCallsBefore = chromeMock.storage.local.set.mock.calls.length;
      remoteConfig.syncFromStorage({ features: { attachMenu: { enabled: false } } });
      remoteConfig.syncFromStorage({});
      remoteConfig.syncFromStorage(null);
      expect(chromeMock.storage.local.set.mock.calls.length).toBe(setCallsBefore);
    });
  });

  // ── Structural equality guard ──

  describe("structural equality", () => {
    it("replaceRemote skips persist and notify for identical value", () => {
      remoteConfig.replaceRemote({ features: { attachMenu: { enabled: false } } });
      const setCallsBefore = chromeMock.storage.local.set.mock.calls.length;
      const handler = vi.fn();
      window.addEventListener(REMOTE_CONFIG_EVENT, handler);
      remoteConfig.replaceRemote({ features: { attachMenu: { enabled: false } } });
      expect(chromeMock.storage.local.set.mock.calls.length).toBe(setCallsBefore);
      expect(handler).not.toHaveBeenCalled();
      window.removeEventListener(REMOTE_CONFIG_EVENT, handler);
    });

    it("applyRemote skips persist and notify for no-op merge", () => {
      remoteConfig.applyRemote({ features: { attachMenu: { enabled: false } } });
      const setCallsBefore = chromeMock.storage.local.set.mock.calls.length;
      const handler = vi.fn();
      window.addEventListener(REMOTE_CONFIG_EVENT, handler);
      remoteConfig.applyRemote({ features: { attachMenu: { enabled: false } } });
      expect(chromeMock.storage.local.set.mock.calls.length).toBe(setCallsBefore);
      expect(handler).not.toHaveBeenCalled();
      window.removeEventListener(REMOTE_CONFIG_EVENT, handler);
    });

    it("resetToBuiltin always clears storage but skips notification when already at defaults", () => {
      const handler = vi.fn();
      window.addEventListener(REMOTE_CONFIG_EVENT, handler);
      remoteConfig.resetToBuiltin();
      // Always clears persisted config + metadata
      expect(chromeMock.storage.local.remove).toHaveBeenCalledWith(
        [STORAGE_KEYS.remoteConfig, STORAGE_KEYS.remoteConfigMeta],
      );
      // No notification when config didn't change
      expect(handler).not.toHaveBeenCalled();
      window.removeEventListener(REMOTE_CONFIG_EVENT, handler);
    });

    it("local mutation APIs still persist exactly once when value changes", () => {
      const cb = vi.fn();
      remoteConfig.onChange(cb);
      remoteConfig.replaceRemote({ features: { attachMenu: { enabled: false } } });
      expect(chromeMock.storage.local.set).toHaveBeenCalledTimes(1);
      expect(cb).toHaveBeenCalledOnce();

      chromeMock.storage.local.set.mockClear();
      remoteConfig.applyRemote({ features: { fileUpload: { enabled: false } } });
      expect(chromeMock.storage.local.set).toHaveBeenCalledTimes(1);
      expect(cb).toHaveBeenCalledTimes(2);
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
    defaultRadio.setAttribute("data-model-type", "instant");
    defaultRadio.setAttribute("aria-checked", "false");
    defaultRadio.textContent = "Instant";

    expertRadio = document.createElement("div");
    expertRadio.setAttribute("role", "radio");
    expertRadio.setAttribute("data-model-type", "expert");
    expertRadio.setAttribute("aria-checked", "false");
    expertRadio.textContent = "Expert";

    const visionRadio = document.createElement("div");
    visionRadio.setAttribute("role", "radio");
    visionRadio.setAttribute("data-model-type", "vision");
    visionRadio.setAttribute("aria-checked", "false");
    visionRadio.textContent = "Vision";

    radioGroup.appendChild(defaultRadio);
    radioGroup.appendChild(expertRadio);
    radioGroup.appendChild(visionRadio);
    document.body.appendChild(radioGroup);
  });

  afterEach(() => {
    radioGroup?.remove();
  });

  function getModelKey(modelType) {
    return modelType === "vision" ? "visionMode" : modelType === "expert" ? "expertMode" : modelType === "instant" ? "instantMode" : "deepthinkMode";
  }

  it("detects expert mode from radio group", () => {
    expertRadio.setAttribute("aria-checked", "true");
    expect(detectModelType()).toBe("expert");
  });

  it("detects instant mode from radio group", () => {
    defaultRadio.setAttribute("aria-checked", "true");
    expect(detectModelType()).toBe("instant");
  });

  it("detects vision mode from radio group", () => {
    radioGroup.querySelector('[data-model-type="vision"]').setAttribute("aria-checked", "true");
    expect(detectModelType()).toBe("vision");
  });

  it("vision mode uses the visionMode config block", () => {
    radioGroup.querySelector('[data-model-type="vision"]').setAttribute("aria-checked", "true");
    remoteConfig.applyRemote({
      features: { attachMenu: { visionMode: { showUploadFile: false } } },
    });

    const model = detectModelType();
    const modelKey = getModelKey(model);

    expect(modelKey).toBe("visionMode");
    expect(getFlag(`features.attachMenu.${modelKey}.show`)).toBe(true);
    expect(getFlag(`features.attachMenu.${modelKey}.showUploadFile`)).toBe(false);
  });

  it("instant mode shows attach menu with default config", () => {
    defaultRadio.setAttribute("aria-checked", "true");
    const model = detectModelType();
    const modelKey = getModelKey(model);
    const show = getFlag(`features.attachMenu.${modelKey}.show`);
    expect(show).toBe(true);
  });

  it("expert mode shows attach menu but hides upload-specific actions by default", () => {
    expertRadio.setAttribute("aria-checked", "true");
    const model = detectModelType();
    const modelKey = getModelKey(model);
    expect(getFlag(`features.attachMenu.${modelKey}.show`)).toBe(true);
    expect(getFlag(`features.attachMenu.${modelKey}.showPlus`)).toBe(false);
    expect(getFlag(`features.attachMenu.${modelKey}.showUploadFile`)).toBe(false);
    expect(getFlag(`features.attachMenu.${modelKey}.showProject`)).toBe(true);
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
    expect(getFlag(`features.attachMenu.${modelKey}.show`)).toBe(true);
    expect(getFlag(`features.attachMenu.${modelKey}.showUploadFile`)).toBe(false);
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
    expect(getFlag(`features.attachMenu.${modelKey}.show`)).toBe(true);
    expect(getFlag(`features.attachMenu.${modelKey}.showGithub`)).toBe(false);
    expect(getFlag(`features.attachMenu.${modelKey}.showWeb`)).toBe(false);
  });

  it("returns null when neither switcher nor badge is present", () => {
    radioGroup?.remove();
    expect(detectModelType()).toBeNull();
    const modelKey = getModelKey("instant");
    expect(getFlag(`features.attachMenu.${modelKey}.show`)).toBe(true);
  });

  it("returns null when the switcher is present but nothing is checked", () => {
    expect(detectModelType()).toBeNull();
  });

  it("returns null for an unknown data-model-type value", () => {
    defaultRadio.setAttribute("data-model-type", "mystery-model");
    defaultRadio.setAttribute("aria-checked", "true");
    expect(detectModelType()).toBeNull();
  });

  it("maps chat data-model-type to instant", () => {
    defaultRadio.setAttribute("data-model-type", "chat");
    defaultRadio.setAttribute("aria-checked", "true");
    expect(detectModelType()).toBe("instant");
  });

  it("honors remote-config attrMap overrides", () => {
    defaultRadio.setAttribute("data-model-type", "v-mode");
    defaultRadio.setAttribute("aria-checked", "true");
    remoteConfig.applyRemote({
      modelDetection: { attrMap: { "v-mode": "vision" } },
    });
    expect(detectModelType()).toBe("vision");
  });

  describe("model badge detection fallback", () => {
    let badge;

    beforeEach(() => {
      radioGroup?.remove();
      badge = document.createElement("div");
      badge.className = "_46a12ab";
      document.body.appendChild(badge);
    });

    afterEach(() => {
      badge?.remove();
    });

    it("detects deepthink from English model badge text", () => {
      badge.textContent = "DeepThink";
      expect(detectModelType()).toBe("deepthink");
    });

    it("detects deepthink from R1 model badge text", () => {
      badge.textContent = "DeepSeek R1";
      expect(detectModelType()).toBe("deepthink");
    });

    it("detects expert from reasoner model badge text", () => {
      badge.textContent = "deepseek-reasoner";
      expect(detectModelType()).toBe("expert");
    });

    it("detects vision from model badge text", () => {
      badge.textContent = "Vision";
      expect(detectModelType()).toBe("vision");
    });

    it("badge exact-match rules still win over substring rules", () => {
      badge.textContent = "Expert";
      expect(detectModelType()).toBe("expert");

      badge.textContent = "vision preview";
      expect(detectModelType()).toBe("vision");
    });
  });
});
