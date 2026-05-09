// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEYS } from "../../src/lib/constants.js";
import { startThemeWatcher } from "../../src/content/theme.js";

describe("startThemeWatcher", () => {
  let storageSet;
  let mediaQueryDark;

  beforeEach(() => {
    storageSet = vi.fn().mockResolvedValue(undefined);
    global.chrome = { storage: { local: { set: storageSet } } };

    // Default: system light mode, body has no theme class.
    document.documentElement.className = "";
    document.documentElement.removeAttribute("data-theme");
    document.body.className = "";

    mediaQueryDark = false;
    const listeners = new Set();
    window.matchMedia = vi.fn().mockReturnValue({
      get matches() {
        return mediaQueryDark;
      },
      addEventListener: (_event, fn) => listeners.add(fn),
      removeEventListener: (_event, fn) => listeners.delete(fn),
      _fire: () => listeners.forEach((fn) => fn()),
    });

    delete window.AndroidBridge;
  });

  // ── detect() ──────────────────────────────────────────────────────────

  it("detects dark mode from body class", () => {
    document.body.className = "en_US dark";
    startThemeWatcher();
    expect(storageSet).toHaveBeenCalledWith(
      expect.objectContaining({ [STORAGE_KEYS.pageIsDark]: true })
    );
  });

  it("detects light mode when body class is 'en_US light'", () => {
    document.body.className = "en_US light";
    startThemeWatcher();
    expect(storageSet).toHaveBeenCalledWith(
      expect.objectContaining({ [STORAGE_KEYS.pageIsDark]: false })
    );
  });

  it("falls back to matchMedia when body has no theme class", () => {
    document.body.className = "";
    mediaQueryDark = true;
    startThemeWatcher();
    expect(storageSet).toHaveBeenCalledWith(
      expect.objectContaining({ [STORAGE_KEYS.pageIsDark]: true })
    );
  });

  it("does not treat html.dark as dark (DeepSeek puts class on body)", () => {
    document.documentElement.className = "dark";
    document.body.className = "en_US light";
    startThemeWatcher();
    expect(storageSet).toHaveBeenCalledWith(
      expect.objectContaining({ [STORAGE_KEYS.pageIsDark]: false })
    );
  });

  // ── MutationObserver on <body> ─────────────────────────────────────────

  it("re-runs when body class changes to dark", async () => {
    document.body.className = "en_US light";
    startThemeWatcher();
    storageSet.mockClear();

    document.body.className = "en_US dark";
    await vi.waitFor(() =>
      expect(storageSet).toHaveBeenCalledWith(
        expect.objectContaining({ [STORAGE_KEYS.pageIsDark]: true })
      )
    );
  });

  it("re-runs when body class changes to light", async () => {
    document.body.className = "en_US dark";
    startThemeWatcher();
    storageSet.mockClear();

    document.body.className = "en_US light";
    await vi.waitFor(() =>
      expect(storageSet).toHaveBeenCalledWith(
        expect.objectContaining({ [STORAGE_KEYS.pageIsDark]: false })
      )
    );
  });

  // ── matchMedia change listener ─────────────────────────────────────────

  it("re-runs on matchMedia change", () => {
    document.body.className = "";
    mediaQueryDark = false;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    startThemeWatcher();
    storageSet.mockClear();

    mediaQueryDark = true;
    mq._fire();

    expect(storageSet).toHaveBeenCalledWith(
      expect.objectContaining({ [STORAGE_KEYS.pageIsDark]: true })
    );
  });

  // ── AndroidBridge.reportTheme ──────────────────────────────────────────

  it("calls AndroidBridge.reportTheme when bridge is present", () => {
    document.body.className = "en_US dark";
    window.AndroidBridge = { reportTheme: vi.fn() };
    startThemeWatcher();
    expect(window.AndroidBridge.reportTheme).toHaveBeenCalledWith(true);
  });

  it("does not throw when AndroidBridge is absent", () => {
    document.body.className = "en_US dark";
    delete window.AndroidBridge;
    expect(() => startThemeWatcher()).not.toThrow();
  });

  it("does not throw when AndroidBridge.reportTheme throws", () => {
    document.body.className = "en_US dark";
    window.AndroidBridge = {
      reportTheme: vi.fn(() => {
        throw new Error("bridge error");
      }),
    };
    expect(() => startThemeWatcher()).not.toThrow();
  });
});
