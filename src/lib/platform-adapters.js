/**
 * Cross-platform input/send-button adapters for non-DeepSeek chat sites.
 *
 * These adapters describe how to locate the composer input and send button,
 * and how to inject text into the input field for each supported platform.
 */

/**
 * @typedef {object} PlatformAdapter
 * @property {string} name - Human-readable platform name.
 * @property {boolean} enabled - Default enabled state.
 * @property {string[]} inputSelectors - CSS selectors for the composer input.
 * @property {(el: Element) => boolean} sendButtonMatcher - Function to identify the send button.
 * @property {(el: HTMLElement, text: string) => void} injectText - Inject text into the input.
 */

/** @type {Record<string, PlatformAdapter>} */
export const PLATFORM_ADAPTERS = {
  "chat.deepseek.com": {
    name: "DeepSeek",
    enabled: true,
    inputSelectors: ["#chat-input", ".ds-textarea textarea", "textarea"],
    sendButtonMatcher: (el) => {
      const isSend =
        el.querySelector('svg path[d*="M8.3125"]') ||
        el.querySelector('svg path[d*="M13.12 19.98"]') ||
        el.title === "Send message" ||
        el.getAttribute("aria-label") === "Send Message";
      const isAttach = el.classList.contains("bds-plus-btn") || el.querySelector("svg line");
      return Boolean(isSend && !isAttach);
    },
    injectText: (el, text) => {
      if (el instanceof HTMLTextAreaElement) {
        el.value = text;
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }
    },
  },
  "claude.ai": {
    name: "Claude",
    enabled: false,
    inputSelectors: ['div[contenteditable="true"].ProseMirror'],
    sendButtonMatcher: (el) => el.getAttribute("aria-label") === "Send message",
    injectText: (el, text) => {
      el.focus();
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      selection?.removeAllRanges();
      selection?.addRange(range);
      document.execCommand("insertText", false, text);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    },
  },
  "chatgpt.com": {
    name: "ChatGPT",
    enabled: false,
    inputSelectors: ["#prompt-textarea"],
    sendButtonMatcher: (el) => el.dataset.testid === "send-button",
    injectText: (el, text) => {
      if (el instanceof HTMLTextAreaElement) {
        el.value = text;
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }
    },
  },
  "kimi.moonshot.cn": {
    name: "Kimi",
    enabled: false,
    inputSelectors: [".chat-input-editor", 'div[contenteditable="true"]'],
    sendButtonMatcher: (el) => {
      const cls = el.className || "";
      const text = (el.textContent || "").trim();
      const ariaLabel = el.getAttribute("aria-label") || "";
      return (
        cls.includes("send-button") ||
        cls.includes("send-btn") ||
        ariaLabel.includes("发送") ||
        ariaLabel.toLowerCase().includes("send") ||
        text === "发送" ||
        text.toLowerCase() === "send"
      );
    },
    injectText: (el, text) => {
      el.focus();
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      selection?.removeAllRanges();
      selection?.addRange(range);
      document.execCommand("insertText", false, text);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    },
  },
};

/** @type {string[]} */
export const PLATFORM_HOSTS = Object.keys(PLATFORM_ADAPTERS);

/**
 * Return the adapter for the current hostname, or null if unsupported.
 * @returns {PlatformAdapter | null}
 */
export function getCurrentPlatformAdapter() {
  return PLATFORM_ADAPTERS[location.hostname] || null;
}

/**
 * Return the default adapter settings object for storage.
 * @returns {Record<string, {enabled: boolean}>}
 */
export function getDefaultPlatformAdapterSettings() {
  return Object.fromEntries(
    Object.entries(PLATFORM_ADAPTERS).map(([host, adapter]) => [
      host,
      { enabled: adapter.enabled },
    ]),
  );
}
