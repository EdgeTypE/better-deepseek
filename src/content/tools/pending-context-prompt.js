/**
 * Handles pending prompts initiated from the browser's right-click context menu.
 */

import { devLog } from "../../lib/dev-log.js";
import { injectPureTextAndSend } from "../auto.js";

const EXPIRATION_MS = 60_000;
const MAX_ATTEMPTS = 30;
const ATTEMPT_INTERVAL_MS = 500;

let isProcessing = false;

/** For test teardown */
export function _resetProcessingForTesting() {
  isProcessing = false;
}

export async function checkPendingContextPrompt() {
  if (typeof chrome === "undefined" || !chrome.storage?.local) return;

  // In-flight guard: prevent duplicate concurrent invocations in the same tab
  if (isProcessing) {
    devLog("ContextMenu", "checkPendingContextPrompt already in progress, skipping.");
    return;
  }

  isProcessing = true;

  try {
    const { bds_pending_context_prompt } = await chrome.storage.local.get("bds_pending_context_prompt");
    if (!bds_pending_context_prompt) return;

    // Check expiration
    if (Date.now() - bds_pending_context_prompt.timestamp > EXPIRATION_MS) {
      devLog("ContextMenu", "Pending context prompt expired, removing.");
      await chrome.storage.local.remove("bds_pending_context_prompt");
      return;
    }

    // If targetTabId is specified, verify that this tab matches
    if (bds_pending_context_prompt.targetTabId && typeof chrome.runtime?.sendMessage === "function") {
      try {
        const res = await chrome.runtime.sendMessage({ type: "bds-get-my-tab-id" });
        if (res && res.tabId && res.tabId !== bds_pending_context_prompt.targetTabId) {
          devLog("ContextMenu", "Pending prompt targeted for different tab, skipping.");
          return;
        }
      } catch (err) {
        devLog("ContextMenu", "Failed to check tab ID:", err);
      }
    }

    // Immediately remove from storage so no other listener/tab handles it
    await chrome.storage.local.remove("bds_pending_context_prompt");

    const promptText = bds_pending_context_prompt.text;
    if (!promptText) return;

    devLog("ContextMenu", "Found pending context prompt, waiting for chat editor...");

    // Poll until editor is available and message is sent
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const ok = await injectPureTextAndSend(promptText, "Context menu prompt");
      if (ok) {
        devLog("ContextMenu", `Prompt sent successfully on attempt ${attempt + 1}`);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, ATTEMPT_INTERVAL_MS));
    }

    console.warn("[BDS:ContextMenu] Timed out waiting for chat editor to send context menu prompt.");
  } catch (err) {
    console.error("[BDS:ContextMenu] Error checking pending context prompt:", err);
  } finally {
    isProcessing = false;
  }
}
