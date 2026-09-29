/**
 * Better DeepSeek - Browser Context Menus
 *
 * Registers context menu items:
 * - When text is selected: "Ask DeepSeek"
 * - When right-clicked on a page without selection: "Summarize with DeepSeek"
 */

import { devLog } from "../lib/dev-log.js";

export const MENU_ASK_SELECTION = "bds-ask-selection";
export const MENU_SUMMARIZE_PAGE = "bds-summarize-page";

const localeMods = import.meta.glob("../locales/*.json", { eager: true });

/**
 * Returns localized strings for context menus based on active locale.
 * @param {string} locale
 * @returns {{ askDeepSeek: string, summarizePage: string, summarizePrompt: string }}
 */
export function getLocalizedLabels(locale = "en") {
  const norm = String(locale || "en").toLowerCase();
  const base = norm.split("-")[0];

  const key = `../locales/${norm}.json`;
  const baseKey = `../locales/${base}.json`;
  const fallbackKey = "../locales/en.json";

  const mod = localeMods[key] || localeMods[baseKey] || localeMods[fallbackKey];
  const fallbackMod = localeMods[fallbackKey];

  const messages = mod?.default?.messages || mod?.messages || {};
  const fallbackMessages = fallbackMod?.default?.messages || fallbackMod?.messages || {};

  const cm = messages.contextMenu || {};
  const fcm = fallbackMessages.contextMenu || {};

  return {
    askDeepSeek: cm.askDeepSeek || fcm.askDeepSeek || "Ask DeepSeek",
    summarizePage: cm.summarizePage || fcm.summarizePage || "Summarize with DeepSeek",
    summarizePrompt: cm.summarizePrompt || fcm.summarizePrompt || "Please summarize this webpage: {{url}}",
  };
}

/**
 * Resolves the effective locale, respecting syncLocale and falling back to browser language.
 * When syncLocale is true (the default), resolves from chrome.i18n / navigator.
 * When syncLocale is false, uses settings.locale.
 *
 * @param {object} [settings]
 * @returns {string}
 */
export function resolveEffectiveLocale(settings = {}) {
  // syncLocale is true by default in Better DeepSeek
  const isSync = settings.syncLocale !== false;
  if (!isSync && settings.locale) {
    return settings.locale;
  }

  let systemLang = "";
  if (typeof chrome !== "undefined" && typeof chrome.i18n?.getUILanguage === "function") {
    try {
      systemLang = chrome.i18n.getUILanguage();
    } catch (_) {}
  }

  if (!systemLang && typeof navigator !== "undefined" && navigator.language) {
    systemLang = navigator.language;
  }

  return systemLang || settings.locale || "en";
}

/**
 * Re-creates context menu items with the latest localized titles.
 */
export async function updateContextMenuItems() {
  if (typeof chrome === "undefined" || !chrome.contextMenus) return;

  await new Promise((resolve) => {
    chrome.contextMenus.removeAll(() => {
      if (chrome.runtime?.lastError) {
        // Ignore removal error
      }
      resolve();
    });
  });

  const data = await chrome.storage.local.get("bds_settings");
  const locale = resolveEffectiveLocale(data?.bds_settings);
  const labels = getLocalizedLabels(locale);

  // 1. Text selection context: "Ask DeepSeek"
  chrome.contextMenus.create(
    {
      id: MENU_ASK_SELECTION,
      title: labels.askDeepSeek,
      contexts: ["selection"],
    },
    () => {
      if (chrome.runtime?.lastError) {
        // Ignored if already created
      }
    },
  );

  // 2. Page context (outside selection): "Summarize with DeepSeek"
  chrome.contextMenus.create(
    {
      id: MENU_SUMMARIZE_PAGE,
      title: labels.summarizePage,
      contexts: ["page"],
    },
    () => {
      if (chrome.runtime?.lastError) {
        // Ignored if already created
      }
    },
  );
}

/**
 * Handles context menu clicks.
 */
export async function handleContextMenuClick(info, tab) {
  let promptText = "";

  if (info.menuItemId === MENU_ASK_SELECTION) {
    const selectedText = String(info.selectionText || "").trim();
    if (!selectedText) return;
    promptText = selectedText;
  } else if (info.menuItemId === MENU_SUMMARIZE_PAGE) {
    const pageUrl = String(info.pageUrl || tab?.url || "").trim();
    if (!pageUrl) return;

    const data = await chrome.storage.local.get("bds_settings");
    const locale = resolveEffectiveLocale(data?.bds_settings);
    const labels = getLocalizedLabels(locale);
    promptText = labels.summarizePrompt.replace("{{url}}", pageUrl);
  }

  if (promptText) {
    try {
      devLog("ContextMenu", `Clicked ${info.menuItemId}, opening DeepSeek tab...`);
      const newTab = await chrome.tabs.create({ url: "https://chat.deepseek.com/" });
      await chrome.storage.local.set({
        bds_pending_context_prompt: {
          targetTabId: newTab?.id || null,
          text: promptText,
          timestamp: Date.now(),
        },
      });
    } catch (err) {
      console.error("[BDS:ContextMenu] Failed to open DeepSeek tab:", err);
    }
  }
}

/**
 * Initializes context menus and event listeners.
 */
export function setupContextMenus() {
  if (typeof chrome === "undefined" || !chrome.contextMenus) return;

  if (chrome.runtime?.onInstalled) {
    chrome.runtime.onInstalled.addListener(() => {
      updateContextMenuItems();
    });
  }

  if (chrome.runtime?.onStartup) {
    chrome.runtime.onStartup.addListener(() => {
      updateContextMenuItems();
    });
  }

  // Update on initial script execution
  updateContextMenuItems();

  // Listen for locale and syncLocale changes in settings
  if (chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes.bds_settings) {
        const oldSettings = changes.bds_settings.oldValue || {};
        const newSettings = changes.bds_settings.newValue || {};
        if (
          oldSettings.locale !== newSettings.locale ||
          oldSettings.syncLocale !== newSettings.syncLocale
        ) {
          updateContextMenuItems();
        }
      }
    });
  }

  if (chrome.contextMenus.onClicked) {
    chrome.contextMenus.onClicked.addListener(handleContextMenuClick);
  }
}
