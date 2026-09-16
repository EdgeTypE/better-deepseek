import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  UNKNOWN_EXTENSION_VERSION,
  getExtensionVersion,
} from "./extension-version.js";

/**
 * The chrome mock installed by tests/setup.js provides `getManifest`, so
 * tests that need its absence delete the property and this puts it back.
 * `vi.restoreAllMocks()` would not help — the swaps below are plain
 * assignments, not spies.
 */
const originalGetManifest = globalThis.chrome.runtime.getManifest;

/** Simulate a context with no extension manifest, e.g. the Android shell. */
function withoutManifest() {
  delete globalThis.chrome.runtime.getManifest;
}

/**
 * `__BDS_VERSION__` is normally injected by build.js. In Vitest it does not
 * exist, so tests that need it assign it onto globalThis — an unresolved
 * identifier falls back to the global scope chain.
 */
function setBuildVersion(value) {
  if (value === undefined) {
    delete globalThis.__BDS_VERSION__;
  } else {
    globalThis.__BDS_VERSION__ = value;
  }
}

describe("getExtensionVersion", () => {
  beforeEach(() => {
    globalThis.chrome.runtime.getManifest = originalGetManifest;
    setBuildVersion(undefined);
  });

  afterEach(() => {
    globalThis.chrome.runtime.getManifest = originalGetManifest;
    setBuildVersion(undefined);
  });

  it("prefers the runtime manifest version", () => {
    globalThis.chrome.runtime.getManifest = () => ({ version: "1.4.2" });
    expect(getExtensionVersion()).toBe("1.4.2");
  });

  it("prefers the runtime manifest over the build-time constant", () => {
    globalThis.chrome.runtime.getManifest = () => ({ version: "1.4.2" });
    setBuildVersion("9.9.9");
    expect(getExtensionVersion()).toBe("1.4.2");
  });

  it("trims surrounding whitespace from the manifest version", () => {
    globalThis.chrome.runtime.getManifest = () => ({ version: "  1.4.2\n" });
    expect(getExtensionVersion()).toBe("1.4.2");
  });

  it("falls back to the build-time constant when no manifest is reachable", () => {
    // Mirrors the Android polyfill, which implements storage and messaging
    // but has no getManifest — the constant is the only source there.
    withoutManifest();
    setBuildVersion("0.1.14");
    expect(getExtensionVersion()).toBe("0.1.14");
  });

  it("reports the shipped manifest version by default", () => {
    expect(getExtensionVersion()).toBe(originalGetManifest().version);
  });

  it("returns the unknown sentinel when neither source is available", () => {
    withoutManifest();
    expect(getExtensionVersion()).toBe(UNKNOWN_EXTENSION_VERSION);
  });

  it("returns the unknown sentinel when getManifest throws", () => {
    globalThis.chrome.runtime.getManifest = () => {
      throw new Error("no extension context");
    };
    expect(getExtensionVersion()).toBe(UNKNOWN_EXTENSION_VERSION);
  });

  it("ignores an empty or non-string manifest version", () => {
    for (const version of ["", "   ", undefined, null, 42, {}]) {
      globalThis.chrome.runtime.getManifest = () => ({ version });
      expect(getExtensionVersion()).toBe(UNKNOWN_EXTENSION_VERSION);
    }
  });

  it("ignores an empty build-time constant", () => {
    withoutManifest();
    setBuildVersion("   ");
    expect(getExtensionVersion()).toBe(UNKNOWN_EXTENSION_VERSION);
  });

  it("does not cache the first result across calls", () => {
    withoutManifest();
    expect(getExtensionVersion()).toBe(UNKNOWN_EXTENSION_VERSION);
    globalThis.chrome.runtime.getManifest = () => ({ version: "2.0.0" });
    expect(getExtensionVersion()).toBe("2.0.0");
  });
});
