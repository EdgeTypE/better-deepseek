/**
 * Pending Export Utility
 * Handles triggering exports after navigating to a different chat.
 */

import { exportSession } from "./exporter.js";

export async function setPendingExport(url, format) {
  await chrome.storage.local.set({
    pendingExport: {
      url,
      format,
      timestamp: Date.now()
    }
  });
}

export async function checkPendingExport() {
  const { pendingExport } = await chrome.storage.local.get("pendingExport");
  if (!pendingExport) return;

  // Stale after 30 seconds
  if (Date.now() - pendingExport.timestamp > 30000) {
    await chrome.storage.local.remove("pendingExport");
    return;
  }

  // Check if we are on the target page
  if (window.location.href === pendingExport.url) {
    console.log("[BDS] Triggering pending export for:", pendingExport.url);
    
    // Wait for chat to load
    await waitForChatToLoad();
    
    // Final check to make sure we haven't navigated away during load
    if (window.location.href === pendingExport.url) {
      if (pendingExport.format === "selection") {
        window.dispatchEvent(new CustomEvent("bds:toggleSelectionMode"));
      } else {
        exportSession(pendingExport.format);
      }
      await chrome.storage.local.remove("pendingExport");
    }
  }
}

function waitForChatToLoad() {
  return new Promise((resolve) => {
    let attempts = 0;
    const check = () => {
      attempts++;
      const messages = document.querySelectorAll(".ds-message");
      if (messages.length > 0) {
        // Chat messages found, wait a bit for rendering
        setTimeout(resolve, 1500);
      } else if (attempts > 40) {
        // Timeout after 20 seconds
        resolve();
      } else {
        setTimeout(check, 500);
      }
    };
    check();
  });
}
