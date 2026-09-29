import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getLocalizedLabels,
  resolveEffectiveLocale,
  updateContextMenuItems,
  handleContextMenuClick,
  setupContextMenus,
  MENU_ASK_SELECTION,
  MENU_SUMMARIZE_PAGE,
} from "./context-menu.js";
import { chromeMockState, resetChromeMock, setChromeStorage } from "../../tests/mocks/chrome.js";

describe("context-menu", () => {
  beforeEach(() => {
    resetChromeMock();
  });

  describe("getLocalizedLabels", () => {
    it("returns English labels by default", () => {
      const labels = getLocalizedLabels("en");
      expect(labels.askDeepSeek).toBe("Ask DeepSeek");
      expect(labels.summarizePage).toBe("Summarize with DeepSeek");
      expect(labels.summarizePrompt).toContain("Please summarize this webpage");
    });

    it("returns Turkish labels when locale is tr", () => {
      const labels = getLocalizedLabels("tr");
      expect(labels.askDeepSeek).toBe("DeepSeek'e Sor");
      expect(labels.summarizePage).toBe("DeepSeek ile Özetle");
      expect(labels.summarizePrompt).toContain("Lütfen bu web sayfasını özetle");
    });

    it("falls back to English for unknown locales", () => {
      const labels = getLocalizedLabels("xyz");
      expect(labels.askDeepSeek).toBe("Ask DeepSeek");
      expect(labels.summarizePage).toBe("Summarize with DeepSeek");
    });
  });

  describe("resolveEffectiveLocale", () => {
    it("uses settings.locale when syncLocale is explicitly false", () => {
      chrome.i18n.getUILanguage.mockReturnValue("en");
      const locale = resolveEffectiveLocale({ syncLocale: false, locale: "tr" });
      expect(locale).toBe("tr");
    });

    it("uses browser language when syncLocale is true (default)", () => {
      chrome.i18n.getUILanguage.mockReturnValue("tr-TR");
      const locale = resolveEffectiveLocale({ syncLocale: true, locale: "en" });
      expect(locale).toBe("tr-TR");
    });

    it("uses browser language when syncLocale is omitted", () => {
      chrome.i18n.getUILanguage.mockReturnValue("zh-CN");
      const locale = resolveEffectiveLocale({});
      expect(locale).toBe("zh-CN");
    });
  });

  describe("updateContextMenuItems", () => {
    it("creates localized menu items when syncLocale is false and locale is tr", async () => {
      setChromeStorage({ bds_settings: { locale: "tr", syncLocale: false } });
      await updateContextMenuItems();

      expect(chrome.contextMenus.removeAll).toHaveBeenCalled();
      expect(chrome.contextMenus.create).toHaveBeenCalledWith(
        expect.objectContaining({
          id: MENU_ASK_SELECTION,
          title: "DeepSeek'e Sor",
          contexts: ["selection"],
        }),
        expect.any(Function)
      );
      expect(chrome.contextMenus.create).toHaveBeenCalledWith(
        expect.objectContaining({
          id: MENU_SUMMARIZE_PAGE,
          title: "DeepSeek ile Özetle",
          contexts: ["page"],
        }),
        expect.any(Function)
      );
    });

    it("creates localized menu items using browser language when syncLocale is true (default)", async () => {
      chrome.i18n.getUILanguage.mockReturnValue("tr");
      setChromeStorage({ bds_settings: { locale: "en", syncLocale: true } });
      await updateContextMenuItems();

      expect(chrome.contextMenus.create).toHaveBeenCalledWith(
        expect.objectContaining({
          id: MENU_ASK_SELECTION,
          title: "DeepSeek'e Sor",
          contexts: ["selection"],
        }),
        expect.any(Function)
      );
    });
  });

  describe("handleContextMenuClick", () => {
    it("handles selection click and writes pending context prompt", async () => {
      await handleContextMenuClick(
        { menuItemId: MENU_ASK_SELECTION, selectionText: "Explain quantum computing" },
        {}
      );

      expect(chrome.tabs.create).toHaveBeenCalledWith({ url: "https://chat.deepseek.com/" });
      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          bds_pending_context_prompt: expect.objectContaining({
            text: "Explain quantum computing",
          }),
        })
      );
    });

    it("handles page click and writes summarized page prompt", async () => {
      setChromeStorage({ bds_settings: { locale: "en", syncLocale: false } });

      await handleContextMenuClick(
        { menuItemId: MENU_SUMMARIZE_PAGE, pageUrl: "https://example.com/article" },
        { url: "https://example.com/article" }
      );

      expect(chrome.tabs.create).toHaveBeenCalledWith({ url: "https://chat.deepseek.com/" });
      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          bds_pending_context_prompt: expect.objectContaining({
            text: "Please summarize this webpage: https://example.com/article",
          }),
        })
      );
    });

    it("ignores selection click if text is empty", async () => {
      await handleContextMenuClick(
        { menuItemId: MENU_ASK_SELECTION, selectionText: "   " },
        {}
      );

      expect(chrome.tabs.create).not.toHaveBeenCalled();
    });

    it("ignores page click if pageUrl is empty", async () => {
      await handleContextMenuClick(
        { menuItemId: MENU_SUMMARIZE_PAGE, pageUrl: "" },
        {}
      );

      expect(chrome.tabs.create).not.toHaveBeenCalled();
    });
  });

  describe("setupContextMenus", () => {
    it("registers event listeners on install and click", () => {
      setupContextMenus();
      expect(chrome.runtime.onInstalled.addListener).toHaveBeenCalled();
      expect(chrome.contextMenus.onClicked.addListener).toHaveBeenCalled();
    });
  });
});
