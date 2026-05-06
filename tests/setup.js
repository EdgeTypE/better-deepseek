import { afterEach, beforeEach, vi } from "vitest";
import { installChromeMock, resetChromeMock } from "./mocks/chrome.js";

installChromeMock();

if (!globalThis.crypto?.randomUUID) {
  const { webcrypto } = await import("node:crypto");
  globalThis.crypto = webcrypto;
}

if (!globalThis.atob) {
  globalThis.atob = (value) => Buffer.from(String(value), "base64").toString("binary");
}

if (!globalThis.btoa) {
  globalThis.btoa = (value) => Buffer.from(String(value), "binary").toString("base64");
}

if (!globalThis.requestAnimationFrame) {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
}

if (!globalThis.cancelAnimationFrame) {
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}

if (!URL.createObjectURL) {
  URL.createObjectURL = () => "blob:test";
}

if (!URL.revokeObjectURL) {
  URL.revokeObjectURL = () => {};
}

if (!globalThis.matchMedia) {
  globalThis.matchMedia = vi.fn(() => ({
    matches: false,
    media: "",
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

if (!globalThis.location) {
  globalThis.location = new URL("https://chat.deepseek.com/");
}

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

if (!globalThis.DataTransfer) {
  globalThis.DataTransfer = class {
    constructor() {
      const files = [];
      this.items = {
        add(file) {
          files.push(file);
        },
      };
      Object.defineProperty(this, "files", {
        get() {
          return files;
        },
      });
    }
  };
}

if (!globalThis.SpeechSynthesisUtterance) {
  globalThis.SpeechSynthesisUtterance = class {
    constructor(text) {
      this.text = text;
      this.lang = "";
      this.voice = null;
    }
  };
}

beforeEach(() => {
  resetChromeMock();
  vi.useRealTimers();
});

afterEach(() => {
  if (typeof document !== "undefined") {
    document.body.innerHTML = "";
    document.head.innerHTML = "";
  }
  if (typeof window !== "undefined" && "localStorage" in window) {
    window.localStorage?.clear?.();
    window.sessionStorage?.clear?.();
  }
});
