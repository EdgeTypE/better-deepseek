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

import "../styles/content.css";

import state from "./state.js";
import { loadStateFromStorage, bindStorageChangeListener } from "./storage.js";
import { injectHookScript, setupBridgeEvents, pushConfigToPage } from "./bridge.js";
import { mountUi } from "./ui/mount.js";
import { observeChatDom, scheduleScan, startUrlWatcher } from "./scanner.js";
import { initSidebarMenuInjector } from "./ui/SidebarMenuInjector.js";
import { initSidebarSearch } from "./ui/SidebarSearch.js";
import { checkPendingExport } from "./tools/pending-export.js";
import { initPricing } from "../lib/pricing.js";

init().catch((error) => {
  console.error("[BetterDeepSeek] Init error:", error);
});

async function init() {
  await waitForBody();
  await loadStateFromStorage();

  injectHookScript();
  setupBridgeEvents();
  mountUi();
  bindStorageChangeListener();
  startUrlWatcher();
  observeChatDom();
  initSidebarMenuInjector();
  initSidebarSearch();
  scheduleScan();
  checkPendingExport();
  pushConfigToPage();

  // Dynamically fetch pricing and update embedded fallback
  initPricing().then((pricing) => {
    if (pricing && pricing.models) {
      state.embeddedPricing = pricing;
      scheduleScan();
    }
  }).catch(() => {});
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
