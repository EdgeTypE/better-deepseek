const DB_NAME = "bds-linked-dirs";
const DB_VERSION = 1;
const STORE_NAME = "handles";

const fileCache = new Map();
const CACHE_TTL_MS = 5000;

const SKIP_DIRS = new Set([
  "node_modules", ".git", ".github", "dist", "build",
  ".idea", ".vscode", ".vs", "bin", "obj", "out", "target",
  "dist-chrome", "dist-firefox", "__pycache__", ".next",
  ".svelte-kit", ".cache", ".nyc_output", "coverage",
  ".venv", "venv", "env", ".env", "vendor",
]);

const TEXT_EXTS = new Set([
  "js", "ts", "jsx", "tsx", "svelte", "vue", "html", "css", "scss",
  "less", "json", "md", "txt", "py", "c", "cpp", "h", "hpp", "java",
  "go", "rs", "rb", "php", "sh", "yml", "yaml", "toml", "ini", "csv",
  "sql", "xml", "env", "cs", "csproj", "sln", "fs", "fsproj", "razor",
  "swift", "kt", "dart", "gradle", "kts", "proto", "cmake", "cfg",
  "conf", "pl", "pm", "r", "m", "mm", "lua", "zig", "tex", "bib",
]);

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "projectId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function closeDb(db) {
  try { db.close(); } catch { /* ignore */ }
}

function idbGet(db, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

function idbPut(db, record) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(record);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function idbDelete(db, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export function supportsLocalDirectoryLinking() {
  return typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
}

export async function linkDirectory(projectId) {
  if (!supportsLocalDirectoryLinking()) {
    throw new Error(
      "Local directory linking requires File System Access API (Chromium 86+)."
    );
  }

  const handle = await window.showDirectoryPicker();
  const rootName = handle.name;

  const files = await readAllFilesFromHandle(handle);

  const db = await openDb();
  try {
    await idbPut(db, { projectId, handle, rootName, linkedAt: Date.now() });
  } finally {
    closeDb(db);
  }

  fileCache.set(projectId, { files, rootName, cachedAt: Date.now() });

  return { rootName, fileCount: files.length };
}

export async function unlinkDirectory(projectId) {
  const db = await openDb();
  try {
    await idbDelete(db, projectId);
  } finally {
    closeDb(db);
  }
  fileCache.delete(projectId);
}

export async function getLinkedDirectoryInfo(projectId) {
  const db = await openDb();
  let record;
  try {
    record = await idbGet(db, projectId);
  } finally {
    closeDb(db);
  }
  if (!record) return null;

  let hasPermission = false;
  try {
    const result = await record.handle.queryPermission({ mode: "read" });
    hasPermission = result === "granted";
  } catch {
    hasPermission = false;
  }

  const cached = fileCache.get(projectId);
  return {
    rootName: record.rootName,
    linkedAt: record.linkedAt,
    fileCount: cached ? cached.files.length : 0,
    hasPermission,
    files: cached ? cached.files : [],
  };
}

export async function getDirectoryFiles(projectId) {
  const cached = fileCache.get(projectId);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.files;
  }

  const db = await openDb();
  let record;
  try {
    record = await idbGet(db, projectId);
  } finally {
    closeDb(db);
  }
  if (!record) return null;

  let permission;
  try {
    permission = await record.handle.queryPermission({ mode: "read" });
  } catch {
    fileCache.delete(projectId);
    return null;
  }

  if (permission !== "granted") {
    try {
      permission = await record.handle.requestPermission({ mode: "read" });
    } catch {
      fileCache.delete(projectId);
      return null;
    }
    if (permission !== "granted") {
      return null;
    }
  }

  const files = await readAllFilesFromHandle(record.handle);
  fileCache.set(projectId, { files, rootName: record.rootName, cachedAt: Date.now() });
  return files;
}

export async function refreshDirectoryCache(projectId) {
  fileCache.delete(projectId);
  return getDirectoryFiles(projectId);
}

export function clearAllCaches() {
  fileCache.clear();
}

async function readAllFilesFromHandle(dirHandle) {
  const files = [];
  await readDirectoryHandle(dirHandle, "", files);
  return files;
}

async function readDirectoryHandle(dirHandle, path, outFiles) {
  for await (const entry of dirHandle.values()) {
    const entryPath = path ? `${path}/${entry.name}` : entry.name;

    if (!shouldKeepPath(entryPath)) continue;

    if (entry.kind === "file") {
      if (!isTextFile(entry.name)) continue;
      try {
        const file = await entry.getFile();
        if (file.size > 2 * 1024 * 1024) continue;
        const content = await file.text();
        if (content.indexOf("\0") !== -1) continue;
        outFiles.push({ name: entryPath, content });
      } catch (err) {
        console.warn(`[BDS:LocalDir] Skipping ${entryPath}:`, err);
      }
    } else if (entry.kind === "directory") {
      await readDirectoryHandle(entry, entryPath, outFiles);
    }
  }
}

function shouldKeepPath(path) {
  const segments = String(path || "").split("/");
  for (const segment of segments) {
    if (SKIP_DIRS.has(segment)) return false;
  }
  return true;
}

function isTextFile(filename) {
  const ext = filename.split(".").pop().toLowerCase();
  return TEXT_EXTS.has(ext);
}
