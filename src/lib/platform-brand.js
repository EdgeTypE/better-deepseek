/**
 * Non-trademarked platform branding for the BDS UI.
 *
 * We use simple colored initials rather than official logos to avoid
 * copyright/trademark issues while still making the current platform
 * visually recognizable.
 */

/** @type {Record<string, {name: string, short: string, initial: string, color: string}>} */
export const PLATFORM_BRAND = {
  "chat.deepseek.com": {
    name: "DeepSeek",
    short: "DS",
    initial: "D",
    color: "#4F46E5",
  },
  "claude.ai": {
    name: "Claude",
    short: "Claude",
    initial: "C",
    color: "#D97757",
  },
  "chatgpt.com": {
    name: "ChatGPT",
    short: "GPT",
    initial: "G",
    color: "#10A37F",
  },
  "kimi.moonshot.cn": {
    name: "Kimi",
    short: "Kimi",
    initial: "K",
    color: "#7C3AED",
  },
};

/**
 * @param {string} [host]
 * @returns {{name: string, short: string, initial: string, color: string}}
 */
export function getPlatformBrand(host) {
  const h = host || (typeof location !== "undefined" ? location.hostname : "");
  return PLATFORM_BRAND[h] || PLATFORM_BRAND["chat.deepseek.com"];
}
