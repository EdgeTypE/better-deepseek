/**
 * DeepSeek Server Status Monitor
 *
 * Polls status.deepseek.com/api/v2/status.json to detect outages.
 */

import state from "./state.js";

const STATUS_API = "https://status.deepseek.com/api/v2/status.json";
const POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes

let pollTimer = null;

/**
 * Fetch current status from DeepSeek.
 */
export async function fetchServerStatus() {
  try {
    const response = await fetch(STATUS_API);
    if (!response.ok) throw new Error("Status API returned " + response.status);
    
    const data = await response.json();
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
      
      console.log("[BDS] Server status updated:", state.serverStatus);
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
