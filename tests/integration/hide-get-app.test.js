// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
    delete window.__bdsGetAppObserver;
  });

  afterEach(() => {
    // Disconnect live observer so it doesn't bleed between tests.
    window.__bdsGetAppObserver?.disconnect();
    delete window.__bdsGetAppObserver;
  });

  // ── immediate detection ────────────────────────────────────────────────

  it("hides the container div that wraps the button", () => {
    const { container } = makeGetAppButton();
    hideGetAppButton();
    expect(container.style.display).toBe("none");
  });

  it("sets __bdsGetAppObserver on window", () => {
    makeGetAppButton();
    hideGetAppButton();
    expect(window.__bdsGetAppObserver).toBeTruthy();
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

  it("skips setup when __bdsGetAppObserver already set", () => {
    const sentinel = { disconnect: vi.fn() };
    window.__bdsGetAppObserver = sentinel;
    const { container } = makeGetAppButton();
    hideGetAppButton();
    // Container should not be hidden — the early-return fired.
    expect(container.style.display).not.toBe("none");
    // Sentinel must be untouched.
    expect(window.__bdsGetAppObserver).toBe(sentinel);
  });

  // ── MutationObserver: deferred detection ──────────────────────────────

  it("hides container added to DOM after initial call", async () => {
    hideGetAppButton();
    const { container } = makeGetAppButton();
    await vi.waitFor(() => expect(container.style.display).toBe("none"));
  });

  it("observer is set immediately (not deferred)", () => {
    hideGetAppButton();
    expect(window.__bdsGetAppObserver).toBeTruthy();
  });

  // ── SPA persistence: observer stays alive after first hide ────────────

  it("re-hides button when removed and re-inserted (SPA nav)", async () => {
    const { container } = makeGetAppButton();
    hideGetAppButton();
    expect(container.style.display).toBe("none");

    // Simulate SPA transition: remove old node, add fresh one.
    container.remove();
    const { container: container2 } = makeGetAppButton();
    await vi.waitFor(() => expect(container2.style.display).toBe("none"));
  });

  it("hides all matching instances if multiple exist simultaneously", () => {
    const { container: c1 } = makeGetAppButton();
    const { container: c2 } = makeGetAppButton();
    hideGetAppButton();
    expect(c1.style.display).toBe("none");
    expect(c2.style.display).toBe("none");
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
