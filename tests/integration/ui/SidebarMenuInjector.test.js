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

function buildSettingsDrawerMenu(labelText) {
  const menu = document.createElement("div");
  menu.className = "ds-dropdown-menu";
  const items = ["Settings", "Report issue", labelText, "Log out"];
  for (const text of items) {
    const opt = document.createElement("div");
    opt.className = "ds-dropdown-menu-option";
    const itemLabel = document.createElement("div");
    itemLabel.className = "ds-dropdown-menu-option__label";
    itemLabel.textContent = text;
    opt.appendChild(itemLabel);
    menu.appendChild(opt);
  }
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

    it("captures URL when mousedown fires on sibling button (button outside <a>, real Chrome/Firefox layout)", async () => {
      const container = document.createElement("div");
      const link = document.createElement("a");
      link.href = "https://chat.deepseek.com/chat/s/sibling";
      link.textContent = "Chat Title";
      const btn = document.createElement("button");
      btn.textContent = "...";
      container.appendChild(link);
      container.appendChild(btn);
      document.body.appendChild(container);

      btn.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

      const menu = buildDropdownMenu();
      await vi.waitFor(() => expect(menu.querySelector(".bds-tags-option")).not.toBeNull());

      menu.querySelector(".bds-tags-option").click();
      await vi.waitFor(() =>
        expect(tagEditorMocks.openTagEditor).toHaveBeenCalledWith(
          "https://chat.deepseek.com/chat/s/sibling"
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
    it("injects Tags, Export, and Export All options when .ds-dropdown-menu is appended to DOM", async () => {
      const menu = buildDropdownMenu();
      await vi.waitFor(() => {
        expect(menu.querySelector(".bds-tags-option")).not.toBeNull();
        expect(menu.querySelector(".bds-export-option")).not.toBeNull();
        expect(menu.querySelector(".bds-export-all-option")).not.toBeNull();
      });
    });

    it("places Tags, Export, and Export All options before Delete", async () => {
      const menu = buildDropdownMenu();
      await vi.waitFor(() => expect(menu.querySelector(".bds-tags-option")).not.toBeNull());

      const opts = Array.from(menu.querySelectorAll(".ds-dropdown-menu-option"));
      const tagsIdx = opts.findIndex((o) => o.classList.contains("bds-tags-option"));
      const exportIdx = opts.findIndex((o) => o.classList.contains("bds-export-option"));
      const exportAllIdx = opts.findIndex((o) => o.classList.contains("bds-export-all-option"));
      const deleteIdx = opts.findIndex((o) =>
        o.querySelector(".ds-dropdown-menu-option__label")?.textContent
          .toLowerCase()
          .includes("delete")
      );

      expect(tagsIdx).toBeGreaterThanOrEqual(0);
      expect(exportIdx).toBeGreaterThanOrEqual(0);
      expect(exportAllIdx).toBeGreaterThan(exportIdx);
      expect(tagsIdx).toBeLessThan(deleteIdx);
      expect(exportIdx).toBeLessThan(deleteIdx);
      expect(exportAllIdx).toBeLessThan(deleteIdx);
    });

    it("keeps the Export All format list between Export All and Delete", async () => {
      const menu = buildDropdownMenu();
      await vi.waitFor(() => expect(menu.querySelector(".bds-export-all-option")).not.toBeNull());

      const opts = Array.from(menu.querySelectorAll(".ds-dropdown-menu-option"));
      const exportAllIdx = opts.findIndex((o) => o.classList.contains("bds-export-all-option"));
      const formatIdxs = opts
        .map((o, i) => (o.classList.contains("bds-export-all-format") ? i : -1))
        .filter((i) => i >= 0);
      const deleteIdx = opts.findIndex((o) =>
        o.querySelector(".ds-dropdown-menu-option__label")?.textContent
          .toLowerCase()
          .includes("delete")
      );

      expect(formatIdxs).toHaveLength(4);
      expect(formatIdxs[0]).toBe(exportAllIdx + 1);
      expect(Math.max(...formatIdxs)).toBeLessThan(deleteIdx);
    });

    it("does not inject BDS options twice into the same menu", async () => {
      const menu = buildDropdownMenu();
      await vi.waitFor(() => expect(menu.querySelector(".bds-export-option")).not.toBeNull());

      // Trigger backup click handler which rescans existing dropdown menus
      document.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 150));

      expect(menu.querySelectorAll(".bds-tags-option")).toHaveLength(1);
      expect(menu.querySelectorAll(".bds-export-option")).toHaveLength(1);
      expect(menu.querySelectorAll(".bds-export-all-option")).toHaveLength(1);
      expect(menu.querySelectorAll(".bds-export-all-format")).toHaveLength(4);
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

  describe("Export All", () => {
    async function openMenu() {
      const menu = buildDropdownMenu();
      await vi.waitFor(() => expect(menu.querySelector(".bds-export-all-option")).not.toBeNull());
      return menu;
    }

    function mockLocation(href) {
      const original = Object.getOwnPropertyDescriptor(window, "location");
      Object.defineProperty(window, "location", {
        configurable: true,
        value: { href },
      });
      return () => Object.defineProperty(window, "location", original);
    }

    it("keeps the format list collapsed until Export All is clicked", async () => {
      const menu = await openMenu();
      const parent = menu.querySelector(".bds-export-all-option");
      const formats = () => Array.from(menu.querySelectorAll(".bds-export-all-format"));

      expect(formats().every((option) => option.style.display === "none")).toBe(true);

      parent.click();
      expect(formats().every((option) => option.style.display === "")).toBe(true);
      expect(parent.dataset.bdsExpanded).toBe("true");

      parent.click();
      expect(formats().every((option) => option.style.display === "none")).toBe(true);
      expect(parent.dataset.bdsExpanded).toBe("false");
    });

    it("offers every format except PDF on the Android bridge", async () => {
      window.AndroidBridge = { downloadBlob: vi.fn() };
      try {
        const menu = await openMenu();

        const formats = Array.from(menu.querySelectorAll(".bds-export-all-format"));
        expect(formats.map((option) => option.dataset.bdsFormat)).toEqual([
          "markdown",
          "html",
          "image",
        ]);
      } finally {
        delete window.AndroidBridge;
      }
    });

    it("exports the whole chat in the chosen format when the captured chat is open", async () => {
      const url = "https://chat.deepseek.com/chat/s/current";
      const restoreLocation = mockLocation(url);
      try {
        const { link } = buildChatLink(url);
        link.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

        const menu = await openMenu();
        menu.querySelector(".bds-export-all-option").click();
        menu.querySelector('[data-bds-format="markdown"]').click();

        await vi.waitFor(() =>
          expect(exporterMocks.exportSession).toHaveBeenCalledWith("markdown")
        );
        expect(pendingExportMocks.setPendingExport).not.toHaveBeenCalled();
      } finally {
        restoreLocation();
      }
    });

    it("queues a pending export when the chosen chat is not the open one", async () => {
      const restoreLocation = mockLocation("https://chat.deepseek.com/chat/s/current");
      try {
        const { link } = buildChatLink("https://chat.deepseek.com/chat/s/other");
        link.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

        const menu = await openMenu();
        menu.querySelector(".bds-export-all-option").click();
        menu.querySelector('[data-bds-format="pdf"]').click();

        await vi.waitFor(() =>
          expect(pendingExportMocks.setPendingExport).toHaveBeenCalledWith(
            "https://chat.deepseek.com/chat/s/other",
            "pdf"
          )
        );
        expect(exporterMocks.exportSession).not.toHaveBeenCalled();
      } finally {
        restoreLocation();
      }
    });

    it("keeps the original Export Chat entry on selection mode", async () => {
      const url = "https://chat.deepseek.com/chat/s/current";
      const restoreLocation = mockLocation(url);
      try {
        const { link } = buildChatLink(url);
        link.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

        const menu = await openMenu();
        const toggled = vi.fn();
        window.addEventListener("bds:toggleSelectionMode", toggled);

        menu.querySelector(".bds-export-option").click();

        await vi.waitFor(() => expect(toggled).toHaveBeenCalled());
        expect(exporterMocks.exportSession).not.toHaveBeenCalled();
        expect(pendingExportMocks.setPendingExport).not.toHaveBeenCalled();
      } finally {
        restoreLocation();
      }
    });

    it("warns when a format is chosen with no captured URL", async () => {
      const menu = await openMenu();
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      menu.querySelector(".bds-export-all-option").click();
      menu.querySelector('[data-bds-format="markdown"]').click();

      await new Promise((r) => setTimeout(r, 50));
      expect(exporterMocks.exportSession).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("[BDS]"));
      warnSpy.mockRestore();
    });
  });

  describe("settings drawer injection", () => {
    it("injects Get BDS App and What's New options when menu contains 'Get App'", async () => {
      const menu = buildSettingsDrawerMenu("Get App");
      await vi.waitFor(() => expect(menu.querySelector(".bds-whats-new-option")).not.toBeNull());

      const options = menu.querySelectorAll(".ds-dropdown-menu-option");
      const labels = Array.from(options).map((o) =>
        o.querySelector(".ds-dropdown-menu-option__label")?.textContent.trim()
      );
      const getAppIdx = labels.indexOf("Get App");
      const bdsIdx = labels.indexOf("Get BDS App");
      const wnIdx = labels.indexOf("What's New?");
      expect(getAppIdx).toBeGreaterThanOrEqual(0);
      expect(bdsIdx).toBe(getAppIdx + 1);
      expect(wnIdx).toBe(bdsIdx + 1);
    });

    it("injects Get BDS App and What's New options when menu contains 'Download mobile App'", async () => {
      const menu = buildSettingsDrawerMenu("Download mobile App");
      await vi.waitFor(() => expect(menu.querySelector(".bds-whats-new-option")).not.toBeNull());

      const options = menu.querySelectorAll(".ds-dropdown-menu-option");
      const labels = Array.from(options).map((o) =>
        o.querySelector(".ds-dropdown-menu-option__label")?.textContent.trim()
      );
      const targetIdx = labels.indexOf("Download mobile App");
      const bdsIdx = labels.indexOf("Get BDS App");
      const wnIdx = labels.indexOf("What's New?");
      expect(bdsIdx).toBe(targetIdx + 1);
      expect(wnIdx).toBe(bdsIdx + 1);
    });

    it("does not inject settings options into chat context menus (no target text)", async () => {
      const menu = buildDropdownMenu();
      await vi.waitFor(() => expect(menu.querySelector(".bds-export-option")).not.toBeNull());
      await new Promise((r) => setTimeout(r, 100));
      expect(menu.querySelector(".bds-get-app-option")).toBeNull();
      expect(menu.querySelector(".bds-whats-new-option")).toBeNull();
    });

    it("does not inject settings options twice", async () => {
      const menu = buildSettingsDrawerMenu("Get App");
      await vi.waitFor(() => expect(menu.querySelector(".bds-whats-new-option")).not.toBeNull());

      document.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 150));

      expect(menu.querySelectorAll(".bds-get-app-option")).toHaveLength(1);
      expect(menu.querySelectorAll(".bds-whats-new-option")).toHaveLength(1);
    });

    it("opens GitHub releases URL when Get BDS App is clicked", async () => {
      const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

      const menu = buildSettingsDrawerMenu("Get App");
      await vi.waitFor(() => expect(menu.querySelector(".bds-get-app-option")).not.toBeNull());

      menu.querySelector(".bds-get-app-option").click();

      expect(openSpy).toHaveBeenCalledWith(
        "https://github.com/EdgeTypE/better-deepseek/releases",
        "_blank"
      );
      openSpy.mockRestore();
    });

    it("triggers What's New modal when What's New option is clicked", async () => {
      const menu = buildSettingsDrawerMenu("Get App");
      await vi.waitFor(() => expect(menu.querySelector(".bds-whats-new-option")).not.toBeNull());

      // Import the real state module to check its value
      const stateModule = await import("../../../src/content/state.js");
      const appState = stateModule.default;
      appState.ui = { refreshWhatsNew: vi.fn(), showConfirm: vi.fn(() => Promise.resolve(true)) };

      menu.querySelector(".bds-whats-new-option").click();

      expect(appState.whatsNewPending).toBe(true);
      expect(appState.ui.refreshWhatsNew).toHaveBeenCalledOnce();
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
