const localeModules = import.meta.glob("../locales/*.json", { eager: true });
let locales = $state({});
const availableLocaleCodes = [];

function getLocaleCode(path) {
  return path.match(/([^/\\]+)\.json$/)?.[1];
}

function resolveLocaleCode(lang) {
  const normalized = String(lang || "").trim().toLowerCase();
  if (!normalized) return null;
  if (locales[normalized]) return normalized;

  const base = normalized.split("-")[0];
  if (locales[base]) return base;
  return availableLocaleCodes.find(code => code.split("-")[0] === base) || null;
}

for (const [path, mod] of Object.entries(localeModules)) {
  const code = getLocaleCode(path);
  const data = mod.default || mod;
  if (code && data && data.messages) {
    locales[code] = data;
    availableLocaleCodes.push(code);
  }
}

class I18nManager {
  locale = $state(availableLocaleCodes[0] || "en");

  messages = $derived(locales[this.locale] || locales[availableLocaleCodes[0]]);

  /**
   * Initializes the locale from chrome.storage.local, cookies, or falls back to system preferences.
   * @param {string} [savedLocale] Custom saved locale code
   */
  init(savedLocale) {
    const resolvedSavedLocale = resolveLocaleCode(savedLocale);
    if (resolvedSavedLocale) {
      this.locale = resolvedSavedLocale;
      return;
    }

    let detectedLang = null;

    // 1. Try to get DeepSeek web language from NEXT_LOCALE cookie
    if (typeof document !== "undefined" && document.cookie) {
      const cookies = document.cookie.split(";");
      for (const cookie of cookies) {
        const [name, val] = cookie.trim().split("=");
        if (name === "NEXT_LOCALE" && val) {
          detectedLang = val.trim();
          break;
        }
      }
    }

    const resolvedDetectedLocale = resolveLocaleCode(detectedLang)
      || resolveLocaleCode(typeof navigator !== "undefined" ? navigator.language : null);

    this.locale = resolvedDetectedLocale || availableLocaleCodes[0] || "en";
  }

  /**
   * Dynamically hot-loads updated locales fetched from remote source
   * @param {Object} updates Dictionary of locale code → updated locale data
   */
  loadUpdatedLocales(updates) {
    if (!updates || typeof updates !== "object") return;
    for (const [code, data] of Object.entries(updates)) {
      if (data && data.messages && locales[code]) {
        const localDate = locales[code].updatedAt || "1970-01-01T00:00:00Z";
        const remoteDate = data.updatedAt || "1970-01-01T00:00:00Z";
        if (remoteDate > localDate) {
          locales[code] = data;
        }
      }
    }
  }

  /**
   * Resets all locales back to their original bundled data
   */
  resetLocales() {
    for (const [path, mod] of Object.entries(localeModules)) {
      const code = getLocaleCode(path);
      const data = mod.default || mod;
      if (code && data && data.messages) {
        locales[code] = data;
      }
    }
  }

  /**
   * Updates the active locale, persisting it to chrome storage.
   * @param {string} lang Language code
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

    let value = this.resolvePath(this.messages.messages, parts);

    if (value === undefined && this.locale !== availableLocaleCodes[0]) {
      const fallback = availableLocaleCodes[0] || "en";
      if (locales[fallback]?.messages) {
        value = this.resolvePath(locales[fallback].messages, parts);
      }
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
export { availableLocaleCodes };
