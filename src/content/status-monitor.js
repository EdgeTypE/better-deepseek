/**
 * DeepSeek Server Status Monitor
 *
 * Polls status.deepseek.com/api/v2/status.json to detect outages.
 */

import { devLog } from "../lib/dev-log.js";
import state from "./state.js";

const STATUS_API = "https://status.deepseek.com/api/v2/status.json";
const POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes

let pollTimer = null;

/**
 * Fetch current status from DeepSeek.
 */
export async function fetchServerStatus() {
  // TODO: Replace with proper Playwright network mocking (page.route) in E2E suite
  // to avoid embedding test-specific logic in production code.
  if (window.__mockDeepSeek) return;
  try {
    const result = await chrome.runtime.sendMessage({
      type: "bds-fetch-url",
      url: STATUS_API,
    });
    if (!result || !result.ok) {
      throw new Error(result?.error || "Fetch failed");
    }

    const data = JSON.parse(result.html);
    const { status } = data;

    if (status) {
      state.serverStatus = {
        indicator: status.indicator || "none",
        description: status.description || "Operational",
        lastChecked: Date.now()
      };

      // Dispatch event for UI components
      window.dispatchEvent(new CustomEvent("bds:status-updated", {
        detail: state.serverStatus
      }));

      devLog("Status", "Server status updated:", state.serverStatus);
    }
  } catch (error) {
    console.warn("[BDS] Failed to fetch server status:", error);
  }
}

/**
 * Start periodic polling.
 */
export function startStatusMonitor() {
  if (pollTimer) return;

  
  // TODO: Replace with proper Playwright network mocking (page.route) in E2E suite
  if (window.__mockDeepSeek) {
    devLog("Status", "Skipping status monitor in test environment");
    return;
  }
  
  // Initial check
  fetchServerStatus();

  // Set up interval
  pollTimer = setInterval(fetchServerStatus, POLL_INTERVAL);
}

/**
 * Stop polling.
 */
export function stopStatusMonitor() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}
