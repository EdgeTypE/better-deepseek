// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hideGetAppButton } from "../../src/android/hide-get-app.js";

function makeGetAppButton() {
  const container = document.createElement("div");
  const button = document.createElement("button");
  button.type = "button";
  const icon = document.createElement("span");
  icon.textContent = "phone-icon";
  const label = document.createElement("span");
  label.textContent = "Get App";
  button.append(icon, label);
  container.appendChild(button);
  document.body.appendChild(container);
  return { container, button, label };
}

describe("hideGetAppButton", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    delete window.__bdsGetAppHidden;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── immediate detection ────────────────────────────────────────────────

  it("hides the container div that wraps the button", () => {
    const { container } = makeGetAppButton();
    hideGetAppButton();
    expect(container.style.display).toBe("none");
  });

  it("sets __bdsGetAppHidden flag on window", () => {
    makeGetAppButton();
    hideGetAppButton();
    expect(window.__bdsGetAppHidden).toBe(true);
  });

  it("ignores spans whose text does not match 'Get App'", () => {
    const container = document.createElement("div");
    const button = document.createElement("button");
    const span = document.createElement("span");
    span.textContent = "Download App";
    button.appendChild(span);
    container.appendChild(button);
    document.body.appendChild(container);
    hideGetAppButton();
    expect(container.style.display).not.toBe("none");
  });

  it("does nothing when 'Get App' span has no button ancestor", () => {
    const container = document.createElement("div");
    const span = document.createElement("span");
    span.textContent = "Get App";
    container.appendChild(span);
    document.body.appendChild(container);
    expect(() => hideGetAppButton()).not.toThrow();
    expect(container.style.display).not.toBe("none");
  });

  it("does not throw when no Get App span exists at all", () => {
    expect(() => hideGetAppButton()).not.toThrow();
  });

  // ── idempotency ────────────────────────────────────────────────────────

  it("skips hiding when __bdsGetAppHidden flag is already set", () => {
    window.__bdsGetAppHidden = true;
    const { container } = makeGetAppButton();
    hideGetAppButton();
    expect(container.style.display).not.toBe("none");
  });

  // ── MutationObserver fallback ──────────────────────────────────────────

  it("hides container added to DOM after initial call", async () => {
    hideGetAppButton();
    const { container } = makeGetAppButton();
    await vi.waitFor(() => expect(container.style.display).toBe("none"));
  });

  it("sets __bdsGetAppHidden flag after deferred detection", async () => {
    hideGetAppButton();
    makeGetAppButton();
    await vi.waitFor(() => expect(window.__bdsGetAppHidden).toBe(true));
  });

  it("stops watching after 10-second safety timeout", async () => {
    hideGetAppButton();
    vi.advanceTimersByTime(10_000);
    // Element added after observer disconnects — must NOT be hidden.
    const { container } = makeGetAppButton();
    // Flush any pending microtasks — observer is disconnected so nothing fires.
    await Promise.resolve();
    expect(container.style.display).not.toBe("none");
  });

  // ── text-content resilience ────────────────────────────────────────────

  it("trims whitespace when matching span text", () => {
    const container = document.createElement("div");
    const button = document.createElement("button");
    const span = document.createElement("span");
    span.textContent = "  Get App  ";
    button.appendChild(span);
    container.appendChild(button);
    document.body.appendChild(container);
    hideGetAppButton();
    expect(container.style.display).toBe("none");
  });

  it("does not hide when text is 'Get App' cased differently", () => {
    const container = document.createElement("div");
    const button = document.createElement("button");
    const span = document.createElement("span");
    span.textContent = "get app";
    button.appendChild(span);
    container.appendChild(button);
    document.body.appendChild(container);
    hideGetAppButton();
    expect(container.style.display).not.toBe("none");
  });
});
