/**
 * DeepCode state management and local directory indexing integration.
 */

import state from "./state.js";
import { STORAGE_KEYS } from "../lib/constants.js";
import { getLinkedDirectoryInfo, getDirectoryFiles, linkDirectory, adoptDirectoryHandle, supportsLocalDirectoryLinking } from "../lib/local-directory-source.js";
import { devLog } from "../lib/dev-log.js";

const RECENT_DIRS_KEY = "bds_deepcode_recent_dirs";
const PATH_CACHE_KEY = "bds_deepcode_path_cache";

/**
 * Project id used while a directory is picked but not yet committed.
 * Picking writes here so the currently linked (active) handle is untouched
 * until the user confirms; Cancel removes only this pending record.
 */
const PENDING_PROJECT_ID = "deepcode-pending-project";
const ACTIVE_PROJECT_ID = "deepcode-active-project";

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
 * Toggle DeepCode enabled state.
 */
export function toggleDeepCodeEnabled() {
  setDeepCodeEnabled(!state.deepCode.enabled);
}

/**
 * Trigger directory picker, auto-resolve absolute path, and activate DeepCode.
 * @returns {Promise<{ rootName: string, fileCount: number, path: string }>}
 */
export async function pickAndLinkDeepCodeDirectory() {
  const picked = await pickDeepCodeDirectory();
  await activateDeepCodeDirectory(picked.rootName, picked.fileCount, picked.path);
  return picked;
}

/**
 * Pick a directory via File System Access API, auto-resolve its absolute path,
 * and link the directory handle WITHOUT mutating DeepCode state.
 * @returns {Promise<{ rootName: string, fileCount: number, path: string }>}
 */
export async function pickDeepCodeDirectory() {
  if (!supportsLocalDirectoryLinking()) {
    throw new Error("File System Access API is not supported on this browser context.");
  }
  const res = await linkDirectory(PENDING_PROJECT_ID);
  
  // Auto-resolve system path from cache or query Harness workspaces
  let pathForFolder = await getCachedPathForFolder(res.rootName);
  if (!pathForFolder) {
    pathForFolder = await tryResolveHarnessWorkspacePath(res.rootName);
  }
  if (!pathForFolder && state.deepCode.manualPath) {
    // If current path matches or ends with rootName
    const cur = state.deepCode.manualPath.replace(/\\/g, "/");
    if (cur.toLowerCase().endsWith(res.rootName.toLowerCase())) {
      pathForFolder = state.deepCode.manualPath;
    }
  }

  return {
    rootName: res.rootName,
    fileCount: res.fileCount,
    path: pathForFolder || "",
  };
}

/**
 * Activate DeepCode for a previously picked directory: set path, recent history,
 * persist state, and enable. This is the single commit point after the user
 * confirms the absolute path.
 * @param {string} rootName 
 * @param {number} fileCount 
 * @param {string} [path] 
 */
export async function activateDeepCodeDirectory(rootName, fileCount = 0, path = "") {
  await adoptDirectoryHandle(PENDING_PROJECT_ID, ACTIVE_PROJECT_ID);
  await setDeepCodeDirectory(rootName, fileCount, path);
  setDeepCodeEnabled(true);
}

/**
 * Update the selected directory handle/path and add to recent directories.
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

  state.deepCode.manualPath = manualPath || "";

  if (rootName && state.deepCode.manualPath) {
    await saveCachedPathForFolder(rootName, state.deepCode.manualPath);
    await addRecentDirectory(rootName, state.deepCode.manualPath, fileCount);
  } else if (rootName) {
    await addRecentDirectory(rootName, "", fileCount);
  }

  emitDeepCodeState();
  await persistDeepCodeState();
  await ensureDeepCodeFilesLoaded();
}

/**
 * Select a directory from recent history.
 * @param {{ name: string, path: string, fileCount: number }} entry 
 * @returns {Promise<{ needsPicker: boolean }>} needsPicker is true when the
 *   selected directory has no matching linked handle (path-only mode).
 */
export async function selectRecentDirectory(entry) {
  if (!entry || !entry.name) return { needsPicker: false };
  state.deepCode.activeDirectory = entry.name;
  state.deepCode.manualPath = entry.path || "";
  state.deepCode.fileCount = entry.fileCount || 0;
  state.deepCode.enabled = true;

  await addRecentDirectory(entry.name, entry.path, entry.fileCount);
  emitDeepCodeState();
  await persistDeepCodeState();

  const linked = await getLinkedDirectoryInfo(ACTIVE_PROJECT_ID);
  const handleMatches =
    !!linked &&
    linked.rootName &&
    linked.rootName.toLowerCase() === entry.name.toLowerCase();

  if (handleMatches) {
    await ensureDeepCodeFilesLoaded();
    return { needsPicker: false };
  }

  state.deepCode.files = [];
  emitDeepCodeState();
  await persistDeepCodeState();
  return { needsPicker: true };
}

/**
 * Add or update directory in recent history.
 */
export async function addRecentDirectory(name, path = "", fileCount = 0) {
  if (!name) return;
  const list = Array.isArray(state.deepCode.recentDirectories)
    ? [...state.deepCode.recentDirectories]
    : [];

  const existingIdx = list.findIndex(
    (d) => (d.name && d.name.toLowerCase() === name.toLowerCase()) || (path && d.path && d.path.toLowerCase() === path.toLowerCase())
  );

  const item = {
    name,
    path: path || (existingIdx >= 0 ? list[existingIdx].path : ""),
    fileCount: fileCount || (existingIdx >= 0 ? list[existingIdx].fileCount : 0),
    lastUsed: Date.now(),
  };

  if (existingIdx >= 0) {
    list.splice(existingIdx, 1);
  }
  list.unshift(item);

  // Keep top 10 recent directories
  state.deepCode.recentDirectories = list.slice(0, 10);

  if (typeof chrome !== "undefined" && chrome?.storage?.local) {
    try {
      await chrome.storage.local.set({ [RECENT_DIRS_KEY]: state.deepCode.recentDirectories });
    } catch (e) {
      devLog("[DeepCode] Failed to persist recent directories:", e);
    }
  }
  emitDeepCodeState();
}

/**
 * Remove a directory from recent history.
 */
export async function removeRecentDirectory(pathOrName) {
  if (!pathOrName) return;
  const key = String(pathOrName).toLowerCase();
  const list = (state.deepCode.recentDirectories || []).filter(
    (d) => d.name.toLowerCase() !== key && (d.path || "").toLowerCase() !== key
  );
  state.deepCode.recentDirectories = list;

  if (typeof chrome !== "undefined" && chrome?.storage?.local) {
    try {
      await chrome.storage.local.set({ [RECENT_DIRS_KEY]: list });
    } catch (e) {
      devLog("[DeepCode] Failed to remove recent directory:", e);
    }
  }
  emitDeepCodeState();
}

/**
 * Get cached absolute path for a given folder name.
 */
export async function getCachedPathForFolder(folderName) {
  if (!folderName || typeof chrome === "undefined" || !chrome?.storage?.local) return "";
  try {
    const res = await chrome.storage.local.get(PATH_CACHE_KEY);
    const cache = res?.[PATH_CACHE_KEY] || {};
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
    const res = await chrome.storage.local.get(PATH_CACHE_KEY);
    const cache = res?.[PATH_CACHE_KEY] || {};
    cache[folderName] = absolutePath;
    await chrome.storage.local.set({ [PATH_CACHE_KEY]: cache });
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
    const linked = await getLinkedDirectoryInfo(ACTIVE_PROJECT_ID);
    if (linked) {
      const files = await getDirectoryFiles(ACTIVE_PROJECT_ID);
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
        manualPath: state.deepCode.manualPath,
        pendingReport: state.deepCode.pendingReport,
        recentDirectories: state.deepCode.recentDirectories || [],
      }
    })
  );
}

/**
 * Store a pending Harness execution report to be injected into the next user message prompt.
 * @param {{ cwd?: string, sessionId?: string, report: string, completedAt?: number }} reportData 
 */
export function setPendingHarnessReport(reportData) {
  if (!reportData || !reportData.report) {
    state.deepCode.pendingReport = null;
  } else {
    state.deepCode.pendingReport = {
      cwd: reportData.cwd || state.deepCode.manualPath || "",
      sessionId: reportData.sessionId || "",
      report: reportData.report,
      completedAt: reportData.completedAt || Date.now(),
    };
  }
  emitDeepCodeState();
  window.dispatchEvent(new CustomEvent("bds:request-config-push"));
}

/**
 * Clear the pending Harness report once consumed.
 */
export function clearPendingHarnessReport() {
  state.deepCode.pendingReport = null;
  emitDeepCodeState();
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
        manualPath: state.deepCode.manualPath,
      },
      [RECENT_DIRS_KEY]: state.deepCode.recentDirectories || [],
    });
  }
}

/**
 * Load state from chrome.storage.local.
 */
export async function loadDeepCodeState() {
  if (typeof chrome === "undefined" || !chrome?.storage?.local) return;
  try {
    const result = await chrome.storage.local.get([
      STORAGE_KEYS.deepCodeState,
      RECENT_DIRS_KEY,
    ]);
    const data = result[STORAGE_KEYS.deepCodeState];
    const recents = result[RECENT_DIRS_KEY];

    if (Array.isArray(recents)) {
      state.deepCode.recentDirectories = recents;
    }

    if (data) {
      state.deepCode.enabled = Boolean(data.enabled);
      state.deepCode.activeDirectory = data.activeDirectory || null;
      state.deepCode.fileCount = data.fileCount || 0;
      state.deepCode.manualPath = data.manualPath || "";
      if (state.deepCode.enabled) {
        await ensureDeepCodeFilesLoaded();
      }
    }
    emitDeepCodeState();
  } catch (err) {
    devLog(`[DeepCode] Failed to load state:`, err);
  }
}
