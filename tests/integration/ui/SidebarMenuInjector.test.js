// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const exporterMocks = vi.hoisted(() => ({ exportSession: vi.fn() }));
const pendingExportMocks = vi.hoisted(() => ({
  setPendingExport: vi.fn().mockResolvedValue(undefined),
  checkPendingExport: vi.fn(),
}));
const tagEditorMocks = vi.hoisted(() => ({ openTagEditor: vi.fn() }));

vi.mock("../../../src/content/tools/exporter.js", () => exporterMocks);
vi.mock("../../../src/content/tools/pending-export.js", () => pendingExportMocks);
vi.mock("../../../src/content/tags/tag-editor.js", () => tagEditorMocks);

function buildChatLink(href = "https://chat.deepseek.com/chat/s/test") {
  const link = document.createElement("a");
  link.href = href;
  const btn = document.createElement("button");
  btn.textContent = "...";
  link.appendChild(btn);
  document.body.appendChild(link);
  return { link, btn };
}

function buildDropdownMenu() {
  const menu = document.createElement("div");
  menu.className = "ds-dropdown-menu";
  const deleteOpt = document.createElement("div");
  deleteOpt.className = "ds-dropdown-menu-option";
  const deleteLabel = document.createElement("div");
  deleteLabel.className = "ds-dropdown-menu-option__label";
  deleteLabel.textContent = "Delete";
  deleteOpt.appendChild(deleteLabel);
  menu.appendChild(deleteOpt);
  document.body.appendChild(menu);
  return menu;
}

describe("SidebarMenuInjector", () => {
  let initSidebarMenuInjector;
  let cleanup;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    document.body.innerHTML = "";
    const mod = await import("../../../src/content/ui/SidebarMenuInjector.js");
    initSidebarMenuInjector = mod.initSidebarMenuInjector;
    cleanup = initSidebarMenuInjector();
  });

  afterEach(() => {
    cleanup?.();
  });

  describe("URL capture via href-based mousedown listener", () => {
    it("captures URL when mousedown fires on the chat link element itself", async () => {
      const { link } = buildChatLink("https://chat.deepseek.com/chat/s/abc");
      link.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

      const menu = buildDropdownMenu();
      await vi.waitFor(() => expect(menu.querySelector(".bds-tags-option")).not.toBeNull());

      menu.querySelector(".bds-tags-option").click();
      await vi.waitFor(() =>
        expect(tagEditorMocks.openTagEditor).toHaveBeenCalledWith(
          "https://chat.deepseek.com/chat/s/abc"
        )
      );
    });

    it("captures URL when mousedown fires on a descendant inside the chat link (three-dot button)", async () => {
      const { btn } = buildChatLink("https://chat.deepseek.com/chat/s/xyz");
      btn.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

      const menu = buildDropdownMenu();
      await vi.waitFor(() => expect(menu.querySelector(".bds-tags-option")).not.toBeNull());

      menu.querySelector(".bds-tags-option").click();
      await vi.waitFor(() =>
        expect(tagEditorMocks.openTagEditor).toHaveBeenCalledWith(
          "https://chat.deepseek.com/chat/s/xyz"
        )
      );
    });

    it("does not capture URL from mousedown outside any chat link", async () => {
      const outside = document.createElement("div");
      document.body.appendChild(outside);
      outside.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

      const menu = buildDropdownMenu();
      await vi.waitFor(() => expect(menu.querySelector(".bds-tags-option")).not.toBeNull());

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      menu.querySelector(".bds-tags-option").click();

      await new Promise((r) => setTimeout(r, 100));
      expect(tagEditorMocks.openTagEditor).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("[BDS]"));
      warnSpy.mockRestore();
    });

    it("updates captured URL on each mousedown (last click wins)", async () => {
      const { link: link1 } = buildChatLink("https://chat.deepseek.com/chat/s/first");
      const { link: link2 } = buildChatLink("https://chat.deepseek.com/chat/s/second");

      link1.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      link2.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

      const menu = buildDropdownMenu();
      await vi.waitFor(() => expect(menu.querySelector(".bds-tags-option")).not.toBeNull());

      menu.querySelector(".bds-tags-option").click();
      await vi.waitFor(() =>
        expect(tagEditorMocks.openTagEditor).toHaveBeenCalledWith(
          "https://chat.deepseek.com/chat/s/second"
        )
      );
    });
  });

  describe("menu injection via MutationObserver", () => {
    it("injects Tags and Export options when .ds-dropdown-menu is appended to DOM", async () => {
      const menu = buildDropdownMenu();
      await vi.waitFor(() => {
        expect(menu.querySelector(".bds-tags-option")).not.toBeNull();
        expect(menu.querySelector(".bds-export-option")).not.toBeNull();
      });
    });

    it("places Tags and Export options before Delete", async () => {
      const menu = buildDropdownMenu();
      await vi.waitFor(() => expect(menu.querySelector(".bds-tags-option")).not.toBeNull());

      const opts = Array.from(menu.querySelectorAll(".ds-dropdown-menu-option"));
      const tagsIdx = opts.findIndex((o) => o.classList.contains("bds-tags-option"));
      const exportIdx = opts.findIndex((o) => o.classList.contains("bds-export-option"));
      const deleteIdx = opts.findIndex((o) =>
        o.querySelector(".ds-dropdown-menu-option__label")?.textContent
          .toLowerCase()
          .includes("delete")
      );

      expect(tagsIdx).toBeGreaterThanOrEqual(0);
      expect(exportIdx).toBeGreaterThanOrEqual(0);
      expect(tagsIdx).toBeLessThan(deleteIdx);
      expect(exportIdx).toBeLessThan(deleteIdx);
    });

    it("does not inject BDS options twice into the same menu", async () => {
      const menu = buildDropdownMenu();
      await vi.waitFor(() => expect(menu.querySelector(".bds-export-option")).not.toBeNull());

      // Trigger backup click handler which rescans existing dropdown menus
      document.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 150));

      expect(menu.querySelectorAll(".bds-tags-option")).toHaveLength(1);
      expect(menu.querySelectorAll(".bds-export-option")).toHaveLength(1);
    });

    it("injects into nested .ds-dropdown-menu added as child of another node", async () => {
      const wrapper = document.createElement("div");
      const menu = document.createElement("div");
      menu.className = "ds-dropdown-menu";
      wrapper.appendChild(menu);
      document.body.appendChild(wrapper);

      await vi.waitFor(() => expect(menu.querySelector(".bds-export-option")).not.toBeNull());
    });
  });

  describe("Tags and Export handler warnings", () => {
    it("warns when Tags clicked with no captured URL", async () => {
      const menu = buildDropdownMenu();
      await vi.waitFor(() => expect(menu.querySelector(".bds-tags-option")).not.toBeNull());

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      menu.querySelector(".bds-tags-option").click();

      await new Promise((r) => setTimeout(r, 100));
      expect(tagEditorMocks.openTagEditor).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("[BDS]"));
      warnSpy.mockRestore();
    });

    it("warns when Export Chat clicked with no captured URL", async () => {
      const menu = buildDropdownMenu();
      await vi.waitFor(() => expect(menu.querySelector(".bds-export-option")).not.toBeNull());

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      menu.querySelector(".bds-export-option").click();

      await new Promise((r) => setTimeout(r, 50));
      expect(exporterMocks.exportSession).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("[BDS]"));
      warnSpy.mockRestore();
    });
  });
});
