// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const generating = vi.hoisted(() => ({ value: false }));

vi.mock("./message-processor.svelte.js", () => ({
  isSystemGenerating: () => generating.value,
}));

import {
  applyKeepAwake,
  isKeepAwakeSupported,
  startKeepAwakeWatcher,
  stopKeepAwakeWatcher,
  syncKeepAwake,
} from "./keep-awake.js";

function installBridge(overrides = {}) {
  const bridge = { setKeepScreenOn: vi.fn(), ...overrides };
  window.AndroidBridge = bridge;
  return bridge;
}

beforeEach(() => {
  generating.value = false;
});

afterEach(() => {
  stopKeepAwakeWatcher();
  vi.useRealTimers();
  delete window.AndroidBridge;
});

describe("keep-awake", () => {
  it("reports unsupported when the host has no wake-flag method", () => {
    expect(isKeepAwakeSupported()).toBe(false);
    expect(startKeepAwakeWatcher()).toBe(false);
  });

  it("treats a bridge without setKeepScreenOn as unsupported", () => {
    window.AndroidBridge = { reportTheme: vi.fn() };
    expect(isKeepAwakeSupported()).toBe(false);
    expect(applyKeepAwake(true)).toBe(false);
  });

  it("sets the flag only when the state changes", () => {
    const bridge = installBridge();

    expect(applyKeepAwake(true)).toBe(true);
    expect(applyKeepAwake(true)).toBe(true);
    expect(applyKeepAwake(false)).toBe(false);
    expect(applyKeepAwake(false)).toBe(false);

    expect(bridge.setKeepScreenOn.mock.calls).toEqual([[true], [false]]);
  });

  it("follows isSystemGenerating while the watcher runs", () => {
    vi.useFakeTimers();
    const bridge = installBridge();
    expect(startKeepAwakeWatcher()).toBe(true);

    generating.value = true;
    vi.advanceTimersByTime(1000);
    expect(bridge.setKeepScreenOn).toHaveBeenLastCalledWith(true);

    generating.value = false;
    vi.advanceTimersByTime(1000);
    expect(bridge.setKeepScreenOn).toHaveBeenLastCalledWith(false);
  });

  it("sends the real state on start instead of waiting for a transition", () => {
    // A WebView reload resets this module but leaves the native flag set, so an
    // idle first evaluation has to clear it.
    const bridge = installBridge();
    applyKeepAwake(false);
    bridge.setKeepScreenOn.mockClear();

    syncKeepAwake();
    expect(bridge.setKeepScreenOn).not.toHaveBeenCalled();

    startKeepAwakeWatcher();
    expect(bridge.setKeepScreenOn.mock.calls).toEqual([[false]]);
  });

  it("releases the display when the watcher stops mid-generation", () => {
    vi.useFakeTimers();
    const bridge = installBridge();
    generating.value = true;
    startKeepAwakeWatcher();
    expect(bridge.setKeepScreenOn).toHaveBeenLastCalledWith(true);

    stopKeepAwakeWatcher();
    expect(bridge.setKeepScreenOn).toHaveBeenLastCalledWith(false);
  });

  it("does not start a second interval", () => {
    vi.useFakeTimers();
    const bridge = installBridge();
    expect(startKeepAwakeWatcher()).toBe(true);
    expect(startKeepAwakeWatcher()).toBe(false);

    generating.value = true;
    vi.advanceTimersByTime(1000);
    expect(bridge.setKeepScreenOn).toHaveBeenCalledTimes(2);
  });

  it("survives a throwing bridge call", () => {
    installBridge({
      setKeepScreenOn: vi.fn(() => {
        throw new Error("boom");
      }),
    });
    expect(() => applyKeepAwake(true)).not.toThrow();
  });
});
