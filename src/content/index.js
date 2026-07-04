/**
 * Content script entry point.
 *
 * Orchestrates initialization of all subsystems:
 * - Wait for document.body
 * - Load state from chrome.storage
 * - Inject the MAIN-world hook script
 * - Set up bridge events
 * - Mount Svelte UI
 * - Bind storage change listener
 * - Start URL watcher
 * - Observe chat DOM
 * - Schedule initial scan
 * - Push config to injected script
 */

import "bds-platform-globals";
import "../styles/content.css";

import state from "./state.js";
import { setDevLogging } from "../lib/dev-log.js";
import { loadStateFromStorage, bindStorageChangeListener } from "./storage.js";
import { injectHookScript, setupBridgeEvents, pushConfigToPage } from "./bridge.js";
import { mountUi } from "./ui/mount.js";
import { observeChatDom, scheduleScan, startUrlWatcher } from "./scanner.js";
import { initSidebarMenuInjector } from "./ui/SidebarMenuInjector.js";
import { initSidebarSearch } from "./ui/SidebarSearch.js";
import { checkPendingExport } from "./tools/pending-export.js";
import { initPricing } from "../lib/pricing.js";
import { startStatusMonitor } from "./status-monitor.js";
import { startThemeWatcher } from "./theme.js";
import { initDeepResearchRuntime } from "./deep-research.js";
import { i18n } from "../lib/i18n.svelte.js";
import { remoteConfig, REMOTE_CONFIG_EVENT, detectModelType } from "../lib/remote-config.svelte.js";
import { STORAGE_KEYS, CSS_PRESETS } from "../lib/constants.js";
import { loadAllHistory } from "./load-all-history.js";

const CONTENT_BOOTSTRAP_KEY = "__bdsContentBootstrapped";

if (!window[CONTENT_BOOTSTRAP_KEY]) {
  window[CONTENT_BOOTSTRAP_KEY] = true;
  init().catch((error) => {
    console.error("[BetterDeepSeek] Init error:", error);
  });
}

async function init() {
  await waitForBody();
  await loadStateFromStorage();

  if (typeof localStorage !== "undefined" && localStorage.getItem("bds:devlog")) {
    setDevLogging(true);
  }

  applyCustomCSS(state.settings.customCSS, state.cssSnippets);

  // Initialize localization locale
  i18n.init(state.settings.syncLocale ? null : state.settings.locale);

  // Silently check for language updates on startup
  if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
    chrome.runtime.sendMessage({ type: "BDS_UPDATE_LANGUAGES" });
  }

  injectHookScript();
  setupBridgeEvents();
  mountUi();
  initDeepResearchRuntime();
  bindStorageChangeListener();
  startUrlWatcher();
  observeChatDom();
  initSidebarMenuInjector();
  initSidebarSearch();
  scheduleScan();
  checkPendingExport();
  checkPendingMemoryImport();
  pushConfigToPage();
  startStatusMonitor();
  startThemeWatcher();

  // Keep state.remoteConfig in sync when the RemoteConfigManager updates
  window.addEventListener(REMOTE_CONFIG_EVENT, () => {
    state.remoteConfig = remoteConfig.raw;
  });

  // Live-update custom CSS when settings change
  window.addEventListener("bds:settingsChanged", () => {
    applyCustomCSS(state.settings.customCSS, state.cssSnippets);
  });

  // Live-update custom CSS when snippets change
  window.addEventListener("bds:cssSnippetsChanged", () => {
    applyCustomCSS(state.settings.customCSS, state.cssSnippets);
  });

  window.addEventListener("bds:deep-research-config-changed", () => {
    pushConfigToPage();
  });

  // Debug API — listen for requests from MAIN-world injected script
  window.addEventListener("bds:debug-api-request", (e) => {
    let detail = e.detail;
    if (typeof detail === "string") { try { detail = JSON.parse(detail); } catch { return; } }
    const { id, method, args } = detail || {};
    let result;
    try {
      switch (method) {
        case "getRaw":   result = remoteConfig.raw; break;
        case "getFlag":  result = remoteConfig.getFlag(args?.[0]); break;
        case "getConfig": result = remoteConfig.getConfig(args?.[0]); break;
        case "applyRemote":   remoteConfig.applyRemote(args?.[0]); result = remoteConfig.raw; break;
        case "replaceRemote": remoteConfig.replaceRemote(args?.[0]); result = remoteConfig.raw; break;
        case "resetToBuiltin": remoteConfig.resetToBuiltin(); result = remoteConfig.raw; break;
        case "detectModel": result = detectModelType() || "instant"; break;
        case "toggleDebugPanel":
          window.dispatchEvent(new CustomEvent("bds:toggle-debug-panel"));
          result = true;
          break;
      }
    } catch (err) { result = { __error: err.message }; }
    window.dispatchEvent(new CustomEvent("bds:debug-api-response", {
      detail: JSON.stringify({ id, result }),
    }));
  });

  // Dynamically fetch pricing and update embedded fallback
  initPricing().then((pricing) => {
    if (pricing && pricing.models) {
      state.embeddedPricing = pricing;
      scheduleScan();
    }
  }).catch(() => {});

  // Auto-trigger loadAllHistory when navigating to a session page
  if ((state.settings.loadAllHistoryOnSession || state.settings.showTimestamps) && location.href.includes("/chat/s/")) {
    // Delay slightly so the DOM has a chance to render the first batch of messages
    setTimeout(() => loadAllHistory(), 500);
  }

  window.addEventListener("bds:urlChanged", () => {
    if ((state.settings.loadAllHistoryOnSession || state.settings.showTimestamps) && location.href.includes("/chat/s/")) {
      loadAllHistory();
    }
  });
}

/**
 * Check for a pending memory import and dispatch it as a user message.
 */
async function checkPendingMemoryImport() {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.pendingMemoryImport);
    const pending = result[STORAGE_KEYS.pendingMemoryImport];
    if (!pending) return;

    // Clear the pending import immediately to prevent re-trigger
    await chrome.storage.local.remove(STORAGE_KEYS.pendingMemoryImport);

    // Wait for the chat UI to be fully rendered
    await waitForChatReady();

    // Find the textarea input
    const inputSelectors = remoteConfig.getConfig("selectors.chatInput.textarea");
    const textarea = findVisibleElement(inputSelectors);
    if (!textarea) return;

    // Set value via the native input setter so React/Svelte frameworks detect it
    const nativeInput = textarea.querySelector("textarea") || textarea;
    const nativeTag = nativeInput.tagName === "TEXTAREA";

    if (nativeTag) {
      nativeInput.value = pending;
      nativeInput.dispatchEvent(new Event("input", { bubbles: true }));
      nativeInput.dispatchEvent(new Event("change", { bubbles: true }));
    } else if (nativeInput.isContentEditable) {
      nativeInput.textContent = pending;
      nativeInput.dispatchEvent(new InputEvent("input", { bubbles: true }));
    }

    // Find and click the send button
    const sendBtnSelectors = remoteConfig.getConfig("selectors.sendButton.selectors");
    const sendSvgPaths = remoteConfig.getConfig("selectors.sendButton.svgPaths");
    const disabledClass = remoteConfig.getConfig("selectors.sendButton.disabledClass");

    const sendBtn = findSendButton(sendBtnSelectors, sendSvgPaths, disabledClass);
    if (sendBtn) {
      setTimeout(() => {
        sendBtn.click();
      }, 300);
    }
  } catch (e) {
    console.warn("[BDS] Pending memory import failed:", e);
  }
}

function findVisibleElement(selectors) {
  if (typeof selectors === "string") selectors = [selectors];
  for (const sel of selectors) {
    const els = document.querySelectorAll(sel);
    for (const el of els) {
      if (el.offsetParent !== null || (el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0)) {
        return el;
      }
    }
  }
  return null;
}

function findSendButton(selectors, svgPaths, disabledClass) {
  if (typeof selectors === "string") selectors = [selectors];
  if (typeof svgPaths === "string") svgPaths = [svgPaths];

  // First try to find a non-disabled button with the right SVG icon
  for (const sel of selectors) {
    const buttons = document.querySelectorAll(sel);
    for (const btn of buttons) {
      if (disabledClass && btn.classList.contains(disabledClass)) continue;
      const svg = btn.querySelector("svg path");
      if (svg && svgPaths) {
        const d = svg.getAttribute("d") || "";
        if (svgPaths.some(p => d.startsWith(p))) {
          return btn;
        }
      }
    }
  }

  // Fallback: find the last non-disabled button in the input area
  const wrapperSelectors = remoteConfig.getConfig("selectors.chatInput.wrapper");
  const wrappers = typeof wrapperSelectors === "string" ? [wrapperSelectors] : wrapperSelectors;
  for (const ws of wrappers) {
    const wrapper = document.querySelector(ws);
    if (!wrapper) continue;
    const btns = wrapper.querySelectorAll('div[role="button"], button');
    for (const btn of btns) {
      if (disabledClass && btn.classList.contains(disabledClass)) continue;
      if (btn.offsetParent !== null) return btn;
    }
  }

  return null;
}

async function waitForChatReady() {
  const inputSelectors = remoteConfig.getConfig("selectors.chatInput.textarea");
  const maxAttempts = 50; // ~10 seconds
  for (let i = 0; i < maxAttempts; i++) {
    const el = findVisibleElement(inputSelectors);
    if (el) return;
    await new Promise(r => setTimeout(r, 200));
  }
  console.warn("[BDS] Chat UI not ready within timeout");
}

async function waitForBody() {
  if (document.body) {
    return;
  }

  await new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      if (document.body) {
        observer.disconnect();
        resolve();
      }
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  });
}

function applyCustomCSS(customCSS, snippets) {
  const id = "bds-custom-css";
  let style = document.getElementById(id);
  if (!style) {
    style = document.createElement("style");
    style.id = id;
    document.head.appendChild(style);
  }
  
  let compiled = customCSS || "";
  if (Array.isArray(snippets)) {
    const activeSnippetsCss = snippets
      .filter((s) => s.active)
      .map((s) => `/* Snippet: ${s.name} */\n${s.css}`)
      .join("\n\n");
    if (activeSnippetsCss) {
      compiled = `${activeSnippetsCss}\n\n/* Raw Custom CSS */\n${compiled}`;
    }
  }
  
  style.textContent = compiled;
}
