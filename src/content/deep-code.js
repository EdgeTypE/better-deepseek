/**
 * DeepCode state management and local directory indexing integration.
 */

import state from "./state.js";
import { STORAGE_KEYS } from "../lib/constants.js";
import { getLinkedDirectoryInfo, getDirectoryFiles, getDirectoryPaths, linkDirectory, adoptDirectoryHandle, supportsLocalDirectoryLinking, SKIP_DIRS } from "../lib/local-directory-source.js";
import { devLog } from "../lib/dev-log.js";
import { t } from "../lib/i18n.svelte.js";

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
    throw new Error(t("deepCodeModal.fsApiUnsupported"));
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
      state.deepCode.paths = (await getDirectoryPaths(ACTIVE_PROJECT_ID)) || [];
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
 * Build a compact, depth-limited file tree of the indexed codebase for prompt
 * injection. Derived synchronously from the in-memory path list (directories
 * and text files; skipped dirs like node_modules are already excluded during
 * indexing and re-checked here as a safety net).
 *
 * Accepts either string paths or { name } objects. Directory entries carry a
 * trailing slash and are always shown, so the folder structure stays visible
 * even when a directory holds no indexable text files.
 *
 * Rendering is a flat indented list of relative paths, e.g.:
 *   <BDS:DEEP_CODE_FILE_TREE root="my-project">
 *   - README.md
 *   - package.json
 *   - src/
 *   - src/index.js
 *   - src/utils/helpers.js
 *   </BDS:DEEP_CODE_FILE_TREE>
 *
 * @param {Array<string | { name: string }>} paths
 * @param {{ maxDepth?: number, maxEntries?: number, maxChars?: number, rootName?: string }} [opts]
 * @returns {string} Rendered tree block, or "" when there is nothing to show.
 */
export function buildDeepCodeFileTree(paths, opts = {}) {
  const maxDepth = Math.max(1, Number(opts.maxDepth) || 3);
  const maxEntries = Math.max(1, Number(opts.maxEntries) || 300);
  const maxChars = Math.max(1, Number(opts.maxChars) || 6000);
  const rootName = String(opts.rootName || "").trim();

  if (!Array.isArray(paths) || paths.length === 0) return "";

  const normalized = new Set();
  for (const entry of paths) {
    const raw = typeof entry === "string" ? entry : entry?.name;
    if (typeof raw !== "string" || !raw.trim()) continue;
    const path = raw.trim().replace(/\/+/g, "/");
    const segments = path.split("/").filter(Boolean);
    if (segments.length === 0) continue;
    if (segments.length > maxDepth + 1) continue;
    if (segments.some((segment) => SKIP_DIRS.has(segment))) continue;
    normalized.add(path);
  }

  const sorted = Array.from(normalized).sort((a, b) => a.localeCompare(b));

  const lines = [];
  for (const path of sorted) {
    const next = `- ${path}`;
    if (lines.length >= maxEntries || lines.join("\n").length + next.length + 1 > maxChars) {
      break;
    }
    lines.push(next);
  }

  if (lines.length === 0) return "";

  const truncated = sorted.length - lines.length;
  const body = lines.join("\n") + (truncated > 0 ? `\n... (${truncated} more files)` : "");
  const rootAttr = rootName ? ` root="${rootName}"` : "";

  return `<BDS:DEEP_CODE_FILE_TREE${rootAttr}>\n${body}\n</BDS:DEEP_CODE_FILE_TREE>`;
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
        enabled: false,
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
      // DeepCode always starts as disabled upon refresh (F5), requiring manual activation
      state.deepCode.enabled = false;
      state.deepCode.activeDirectory = data.activeDirectory || null;
      state.deepCode.fileCount = data.fileCount || 0;
      state.deepCode.manualPath = data.manualPath || "";
    }
    emitDeepCodeState();
  } catch (err) {
    devLog(`[DeepCode] Failed to load state:`, err);
  }
}

/**
 * Check whether the user has already acknowledged the DeepCode onboarding popup.
 * @returns {Promise<boolean>}
 */
export async function isDeepCodeOnboarded() {
  if (typeof chrome === "undefined" || !chrome?.storage?.local) return true;
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.deepCodeOnboarded);
    return Boolean(result[STORAGE_KEYS.deepCodeOnboarded]);
  } catch {
    return true;
  }
}

/**
 * Persist the onboarding acknowledgement so the popup is not shown again.
 */
export async function markDeepCodeOnboarded() {
  if (typeof chrome === "undefined" || !chrome?.storage?.local) return;
  try {
    await chrome.storage.local.set({ [STORAGE_KEYS.deepCodeOnboarded]: true });
  } catch { /* ignore */ }
}
