// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DRAWER_APP_ITEM_TEXT,
  hideDrawerAppItem,
} from "../../src/android/hide-drawer-app-item.js";

/** Creates a .ds-dropdown-menu matching DeepSeek's real DOM structure. */
function makeMenu(items = []) {
  const menu = document.createElement("div");
  menu.className = "ds-dropdown-menu";
  for (const { text, testid } of items) {
    const opt = document.createElement("div");
    opt.className = "ds-dropdown-menu-option";
    if (testid) opt.dataset.testid = testid;
    opt.innerHTML = `
      <div class="ds-dropdown-menu-option__icon"></div>
      <div class="ds-dropdown-menu-option__label">${text}</div>
    `;
    menu.appendChild(opt);
  }
  document.body.appendChild(menu);
  return menu;
}

const STANDARD_ITEMS = [
  { text: "Settings", testid: "item-settings" },
  { text: "Report issue", testid: "item-report" },
  { text: DRAWER_APP_ITEM_TEXT, testid: "item-download" },
  { text: "Log out", testid: "item-logout" },
];

describe("hideDrawerAppItem", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    delete window.__bdsDrawerItemObserver;
  });

  afterEach(() => {
    window.__bdsDrawerItemObserver?.disconnect();
    delete window.__bdsDrawerItemObserver;
  });

  // ── DRAWER_APP_ITEM_TEXT constant ─────────────────────────────────────

  it("DRAWER_APP_ITEM_TEXT is the exact target string", () => {
    expect(DRAWER_APP_ITEM_TEXT).toBe("Download mobile App");
  });

  // ── immediate detection ────────────────────────────────────────────────

  it("hides the Download mobile App option", () => {
    makeMenu(STANDARD_ITEMS);
    hideDrawerAppItem();
    expect(document.querySelector('[data-testid="item-download"]').hasAttribute("data-bds-hide")).toBe(true);
  });

  it("leaves unrelated options visible", () => {
    makeMenu(STANDARD_ITEMS);
    hideDrawerAppItem();
    expect(document.querySelector('[data-testid="item-settings"]').hasAttribute("data-bds-hide")).toBe(false);
    expect(document.querySelector('[data-testid="item-report"]').hasAttribute("data-bds-hide")).toBe(false);
    expect(document.querySelector('[data-testid="item-logout"]').hasAttribute("data-bds-hide")).toBe(false);
  });

  it("hides the option when label has surrounding whitespace", () => {
    makeMenu([{ text: `  ${DRAWER_APP_ITEM_TEXT}  `, testid: "item" }]);
    hideDrawerAppItem();
    expect(document.querySelector('[data-testid="item"]').hasAttribute("data-bds-hide")).toBe(true);
  });

  it("does nothing when no .ds-dropdown-menu is present", () => {
    expect(() => hideDrawerAppItem()).not.toThrow();
  });

  // ── exact match required ───────────────────────────────────────────────

  it("does not hide options with only partial text", () => {
    makeMenu([{ text: "Download App", testid: "item" }]);
    hideDrawerAppItem();
    expect(document.querySelector('[data-testid="item"]').hasAttribute("data-bds-hide")).toBe(false);
  });

  it("does not hide options with different casing", () => {
    makeMenu([{ text: "download mobile app", testid: "item" }]);
    hideDrawerAppItem();
    expect(document.querySelector('[data-testid="item"]').hasAttribute("data-bds-hide")).toBe(false);
  });

  it("does not hide options with alternate phrasing (Get the App)", () => {
    makeMenu([{ text: "Get the App", testid: "item" }]);
    hideDrawerAppItem();
    expect(document.querySelector('[data-testid="item"]').hasAttribute("data-bds-hide")).toBe(false);
  });

  it("hides the option when label has a leading icon before the target text", () => {
    makeMenu([{ text: "📱 Download mobile App", testid: "item" }]);
    hideDrawerAppItem();
    expect(document.querySelector('[data-testid="item"]').hasAttribute("data-bds-hide")).toBe(true);
  });

  it("does not hide options with unrelated text", () => {
    makeMenu([{ text: "Mobile settings", testid: "item" }]);
    hideDrawerAppItem();
    expect(document.querySelector('[data-testid="item"]').hasAttribute("data-bds-hide")).toBe(false);
  });

  // ── idempotency ────────────────────────────────────────────────────────

  it("skips when __bdsDrawerItemObserver already set", () => {
    const sentinel = { disconnect: () => {} };
    window.__bdsDrawerItemObserver = sentinel;
    makeMenu(STANDARD_ITEMS);
    hideDrawerAppItem();
    expect(document.querySelector('[data-testid="item-download"]').hasAttribute("data-bds-hide")).toBe(false);
    expect(window.__bdsDrawerItemObserver).toBe(sentinel);
  });

  it("sets __bdsDrawerItemObserver on window", () => {
    hideDrawerAppItem();
    expect(window.__bdsDrawerItemObserver).toBeTruthy();
  });

  // ── MutationObserver: menu added after call ────────────────────────────

  it("hides option when .ds-dropdown-menu added after initial call", async () => {
    hideDrawerAppItem();
    makeMenu(STANDARD_ITEMS);
    await vi.waitFor(() =>
      expect(document.querySelector('[data-testid="item-download"]').hasAttribute("data-bds-hide")).toBe(true),
    );
  });

  it("leaves unrelated options visible after deferred detection", async () => {
    hideDrawerAppItem();
    makeMenu(STANDARD_ITEMS);
    await vi.waitFor(() =>
      expect(document.querySelector('[data-testid="item-download"]').hasAttribute("data-bds-hide")).toBe(true),
    );
    expect(document.querySelector('[data-testid="item-settings"]').hasAttribute("data-bds-hide")).toBe(false);
    expect(document.querySelector('[data-testid="item-logout"]').hasAttribute("data-bds-hide")).toBe(false);
  });

  it("does not affect per-chat menus that have no matching option", async () => {
    hideDrawerAppItem();
    // Simulate a chat context menu (Rename/Pin/Share/Delete — no download item).
    makeMenu([
      { text: "Rename", testid: "chat-rename" },
      { text: "Pin", testid: "chat-pin" },
      { text: "Delete", testid: "chat-delete" },
    ]);
    await vi.waitFor(() => expect(document.querySelector('[data-testid="chat-rename"]')).toBeTruthy());
    expect(document.querySelector('[data-testid="chat-rename"]').hasAttribute("data-bds-hide")).toBe(false);
    expect(document.querySelector('[data-testid="chat-delete"]').hasAttribute("data-bds-hide")).toBe(false);
  });

  // ── SPA persistence ───────────────────────────────────────────────────

  it("re-hides option when menu is removed and re-added (SPA nav)", async () => {
    const menu = makeMenu(STANDARD_ITEMS);
    hideDrawerAppItem();
    expect(document.querySelector('[data-testid="item-download"]').hasAttribute("data-bds-hide")).toBe(true);

    menu.remove();
    makeMenu(STANDARD_ITEMS);
    await vi.waitFor(() =>
      expect(document.querySelector('[data-testid="item-download"]').hasAttribute("data-bds-hide")).toBe(true),
    );
  });
});
