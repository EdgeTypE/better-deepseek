/**
 * DeepCode state management and local directory indexing integration.
 */

import state from "./state.js";
import { STORAGE_KEYS } from "../lib/constants.js";
import { getLinkedDirectoryInfo, getDirectoryFiles } from "../lib/local-directory-source.js";
import { devLog } from "../lib/dev-log.js";

/**
 * Initialize or update DeepCode enabled state.
 * @param {boolean} enabled 
 */
export function setDeepCodeEnabled(enabled) {
  state.deepCode.enabled = Boolean(enabled);
  emitDeepCodeState();
  void persistDeepCodeState();

  if (state.deepCode.enabled) {
    void ensureDeepCodeFilesLoaded();
  }
}

/**
 * Update the selected directory handle/path.
 * @param {string} rootName 
 * @param {number} fileCount 
 * @param {string} [manualPath] 
 */
export async function setDeepCodeDirectory(rootName, fileCount = 0, manualPath = "") {
  state.deepCode.activeDirectory = rootName;
  state.deepCode.fileCount = fileCount;

  // Auto-resolve manualPath from pathCache if not provided
  if (!manualPath && rootName) {
    const cachedPath = await getCachedPathForFolder(rootName);
    if (cachedPath) {
      manualPath = cachedPath;
    } else {
      // Try resolving from local Harness workspace list
      const resolved = await tryResolveHarnessWorkspacePath(rootName);
      if (resolved) {
        manualPath = resolved;
      }
    }
  }

  state.deepCode.manualPath = manualPath || state.deepCode.manualPath || "";

  if (rootName && state.deepCode.manualPath) {
    await saveCachedPathForFolder(rootName, state.deepCode.manualPath);
  }

  emitDeepCodeState();
  await persistDeepCodeState();
  await ensureDeepCodeFilesLoaded();
}

/**
 * Get cached absolute path for a given folder name.
 */
export async function getCachedPathForFolder(folderName) {
  if (!folderName || typeof chrome === "undefined" || !chrome?.storage?.local) return "";
  try {
    const res = await chrome.storage.local.get("bds_deepcode_path_cache");
    const cache = res?.bds_deepcode_path_cache || {};
    return cache[folderName] || "";
  } catch {
    return "";
  }
}

/**
 * Save folder name -> absolute path mapping in chrome.storage.local.
 */
export async function saveCachedPathForFolder(folderName, absolutePath) {
  if (!folderName || !absolutePath || typeof chrome === "undefined" || !chrome?.storage?.local) return;
  try {
    const res = await chrome.storage.local.get("bds_deepcode_path_cache");
    const cache = res?.bds_deepcode_path_cache || {};
    cache[folderName] = absolutePath;
    await chrome.storage.local.set({ bds_deepcode_path_cache: cache });
  } catch (err) {
    devLog("[DeepCode] Failed to save path cache:", err);
  }
}

/**
 * Try resolving absolute path by querying Harness workspace list.
 */
export async function tryResolveHarnessWorkspacePath(folderName) {
  if (!folderName || typeof chrome === "undefined" || !chrome?.runtime?.sendMessage) return "";
  try {
    const res = await chrome.runtime.sendMessage({
      type: "EXECUTE_HARNESS_TASK",
      payload: { queryWorkspacesOnly: true, folderName },
    });
    return res?.matchedPath || "";
  } catch {
    return "";
  }
}

/**
 * Ensure files from the linked directory are loaded into memory for quick RAG / file reads.
 */
export async function ensureDeepCodeFilesLoaded() {
  try {
    const linked = await getLinkedDirectoryInfo("deepcode-active-project");
    if (linked) {
      const files = await getDirectoryFiles("deepcode-active-project");
      state.deepCode.files = files || [];
      state.deepCode.activeDirectory = linked.rootName || state.deepCode.activeDirectory;
      state.deepCode.fileCount = files ? files.length : 0;
      devLog(`[DeepCode] Loaded ${state.deepCode.files.length} files from linked directory.`);
    } else if (state.deepCode.manualPath) {
      devLog(`[DeepCode] Manual path configured: ${state.deepCode.manualPath}`);
    }
  } catch (err) {
    devLog(`[DeepCode] Error loading directory files:`, err);
  }
}

/**
 * Get active files for DeepCode operations.
 * @returns {Array<{ name: string, content: string }>}
 */
export function getDeepCodeFiles() {
  return state.deepCode.files || [];
}

/**
 * Dispatch DOM custom event for toggle status updates across components.
 */
export function emitDeepCodeState() {
  window.dispatchEvent(
    new CustomEvent("bds:deep-code-toggle-state", {
      detail: {
        enabled: state.deepCode.enabled,
        activeDirectory: state.deepCode.activeDirectory,
        fileCount: state.deepCode.fileCount,
        manualPath: state.deepCode.manualPath
      }
    })
  );
}

/**
 * Persist state to chrome.storage.local.
 */
export async function persistDeepCodeState() {
  if (typeof chrome !== "undefined" && chrome?.storage?.local) {
    await chrome.storage.local.set({
      [STORAGE_KEYS.deepCodeState]: {
        enabled: state.deepCode.enabled,
        activeDirectory: state.deepCode.activeDirectory,
        fileCount: state.deepCode.fileCount,
        manualPath: state.deepCode.manualPath
      }
    });
  }
}

/**
 * Load state from chrome.storage.local.
 */
export async function loadDeepCodeState() {
  if (typeof chrome === "undefined" || !chrome?.storage?.local) return;
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.deepCodeState);
    const data = result[STORAGE_KEYS.deepCodeState];
    if (data) {
      state.deepCode.enabled = Boolean(data.enabled);
      state.deepCode.activeDirectory = data.activeDirectory || null;
      state.deepCode.fileCount = data.fileCount || 0;
      state.deepCode.manualPath = data.manualPath || "";
      if (state.deepCode.enabled) {
        await ensureDeepCodeFilesLoaded();
      }
    }
  } catch (err) {
    devLog(`[DeepCode] Failed to load state:`, err);
  }
}
