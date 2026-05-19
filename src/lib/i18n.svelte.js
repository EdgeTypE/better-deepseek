import en from "../locales/en.json";
import tr from "../locales/tr.json";

const locales = { en, tr };

class I18nManager {
  // Svelte 5 reactive state for active locale
  locale = $state("en");

  // Derived messages dictionary corresponding to the active locale
  messages = $derived(locales[this.locale] || locales["en"]);

  /**
   * Initializes the locale from chrome.storage.local, cookies, or falls back to system preferences.
   * @param {string} [savedLocale] Custom saved locale code
   */
  init(savedLocale) {
    if (savedLocale && locales[savedLocale]) {
      this.locale = savedLocale;
      return;
    }

    let detectedLang = null;

    // 1. Try to get DeepSeek web language from NEXT_LOCALE cookie
    if (typeof document !== "undefined" && document.cookie) {
      const cookies = document.cookie.split(";");
      for (const cookie of cookies) {
        const [name, val] = cookie.trim().split("=");
        if (name === "NEXT_LOCALE" && val) {
          detectedLang = val.trim().split("-")[0];
          break;
        }
      }
    }

    // 2. Try browser/system language if cookie language is not found or not supported
    if (!detectedLang || !locales[detectedLang]) {
      detectedLang = (typeof navigator !== "undefined" ? navigator.language : "en").split("-")[0];
    }

    // 3. Fallback to English if still not supported
    if (detectedLang && locales[detectedLang]) {
      this.locale = detectedLang;
    } else {
      this.locale = "en";
    }
  }

  /**
   * Dynamically hot-loads updated locales fetched from remote source
   * @param {Object} updatedEn Updated English dictionary
   * @param {Object} updatedTr Updated Turkish dictionary
   */
  loadUpdatedLocales(updatedEn, updatedTr) {
    if (updatedEn && updatedEn.messages) {
      locales.en = updatedEn;
    }
    if (updatedTr && updatedTr.messages) {
      locales.tr = updatedTr;
    }
  }

  /**
   * Updates the active locale, persisting it to chrome storage.
   * @param {string} lang Language code ('en', 'tr', etc.)
   */
  setLocale(lang) {
    if (locales[lang]) {
      this.locale = lang;
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get("bds_settings", (data) => {
          const settings = data.bds_settings || {};
          settings.locale = lang;
          chrome.storage.local.set({ bds_settings: settings });
        });
      }
    }
  }

  /**
   * Resolves a dotted-path localization key and performs template variable interpolation.
   * Supports falling back to English if the translation is missing in the active language.
   * 
   * @param {string} path Dotted key path (e.g. 'settings.advancedSettings')
   * @param {Record<string, any>} [vars] Template variables to interpolate (e.g. { version: '2.0' })
   * @returns {string} The localized and interpolated string
   */
  t(path, vars = {}) {
    const parts = path.split(".");

    // 1. Resolve within active locale's dictionary
    let value = this.resolvePath(this.messages.messages, parts);

    // 2. If missing, fall back to English dictionary
    if (value === undefined && this.locale !== "en") {
      value = this.resolvePath(locales["en"].messages, parts);
    }

    // 3. If completely missing, return key path as a safety string
    if (value === undefined) {
      return path;
    }

    let str = String(value);

    // 4. Interpolate variables placeholders (e.g. {{version}} or {{n}})
    for (const [key, val] of Object.entries(vars)) {
      str = str.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "g"), val);
    }

    return str;
  }

  /**
   * Helper to traverse a nested dictionary path
   * @private
   */
  resolvePath(obj, parts) {
    let current = obj;
    for (const part of parts) {
      if (current && typeof current === "object") {
        current = current[part];
      } else {
        return undefined;
      }
    }
    return current;
  }
}

export const i18n = new I18nManager();
export const t = (path, vars) => i18n.t(path, vars);
