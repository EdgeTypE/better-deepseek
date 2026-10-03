// @vitest-environment jsdom

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

// Inline MockIndexedDB — stores structured-clone-safe metadata in a map
// and keeps the actual directory handle in a separate in-memory store.
const handleStore = new Map();
const metaStore = new Map();

class MockIndexedDB {
  constructor() {
    this._data = new Map();
  }

  open(name, version) {
    const request = new MockRequest();
    const db = new MockDB(this._data);
    setTimeout(() => {
      request.result = db;
      request.onsuccess && request.onsuccess({ target: { result: db } });
    }, 0);
    return request;
  }
}

class MockRequest {
  constructor() {
    this.onsuccess = null;
    this.onerror = null;
    this.result = null;
    this.error = null;
  }
}

class MockDB {
  constructor(data) {
    this._data = data;
  }
  transaction(storeName, mode) {
    return new MockTX(this._data, storeName, mode);
  }
  close() {}
}

class MockTX {
  constructor(data, storeName, mode) {
    this._data = data;
    this._mode = mode;
  }
  objectStore(name) {
    return new MockStore(this._data, this._mode);
  }
  oncomplete = null;
}

class MockStore {
  constructor(data, mode) {
    this._data = data;
    this._mode = mode;
  }
  put(record) {
    const request = new MockRequest();
    setTimeout(() => {
      if (!record || typeof record !== "object") {
        request.onerror && request.onerror({ target: { error: new Error("Invalid record") } });
        return;
      }
      // Keep the handle in handleStore so get() can reconstruct the full record
      if (record.handle) {
        handleStore.set(record.projectId, record.handle);
      }
      const { projectId, rootName, linkedAt } = record;
      this._data.set(projectId, { projectId, rootName, linkedAt });
      request.onsuccess && request.onsuccess();
    }, 0);
    return request;
  }
  get(key) {
    const request = new MockRequest();
    setTimeout(() => {
      const meta = this._data.get(key) || null;
      if (meta) {
        request.result = {
          ...meta,
          handle: handleStore.get(key) || null,
        };
      } else {
        request.result = null;
      }
      request.onsuccess && request.onsuccess();
    }, 0);
    return request;
  }
  delete(key) {
    const request = new MockRequest();
    setTimeout(() => {
      this._data.delete(key);
      handleStore.delete(key);
      request.onsuccess && request.onsuccess();
    }, 0);
    return request;
  }
}

// We don't use fake-indexeddb — instead we mock indexedDB globally so that
// the module's internal idbPut/idbGet/idbDelete work via our mock store.
// This is necessary because FileSystemDirectoryHandle (mocked via MockDirHandle)
// contains methods that cannot be structurally cloned by fake-indexeddb.

import {
  supportsLocalDirectoryLinking,
  linkDirectory,
  unlinkDirectory,
  getLinkedDirectoryInfo,
  getDirectoryFiles,
  refreshDirectoryCache,
  clearAllCaches,
} from "./local-directory-source.js";

async function* makeValues(entries) {
  yield* entries;
}

class MockFileHandle {
  constructor(name, content) {
    this.kind = "file";
    this.name = name;
    this._content = content;
  }
  async getFile() {
    const self = this;
    return {
      size: self._content.length,
      async text() { return self._content; },
    };
  }
}

class MockDirHandle {
  constructor(name, entries) {
    this.kind = "directory";
    this.name = name;
    this._entries = entries;
  }
  values() {
    return makeValues(this._entries);
  }
  async queryPermission() {
    return "granted";
  }
  async requestPermission() {
    return "granted";
  }
}

function createMockFileHandle(name, content) {
  return new MockFileHandle(name, content);
}

function createMockDirHandle(name, entries) {
  return new MockDirHandle(name, entries);
}

const mockDirectory = createMockDirHandle("my-project", [
  createMockFileHandle("index.js", 'const x = 1;\nconsole.log(x);'),
  createMockFileHandle("utils.js", 'export function add(a, b) { return a + b; }'),
  createMockFileHandle("README.md", "# My Project\n\nThis is a test project."),
  createMockDirHandle("components", [
    createMockFileHandle("Button.svelte", "<script>let label = 'click';</script>\n<button>{label}</button>"),
  ]),
  createMockDirHandle("node_modules", [
    createMockFileHandle("dep.js", "module.exports = {};"),
  ]),
]);

describe("local-directory-source", () => {
  beforeEach(() => {
    clearAllCaches();
    handleStore.clear();

    const mockIndexedDB = new MockIndexedDB();
    // The module accesses `indexedDB` as a global — stub both globalThis
    // and window.indexedDB for compatibility.
    vi.stubGlobal("indexedDB", mockIndexedDB);
    vi.stubGlobal("window", {
      showDirectoryPicker: vi.fn(async () => mockDirectory),
      indexedDB: mockIndexedDB,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    handleStore.clear();
  });

  describe("supportsLocalDirectoryLinking", () => {
    it("returns true when showDirectoryPicker is available", () => {
      vi.stubGlobal("window", { showDirectoryPicker: vi.fn() });
      expect(supportsLocalDirectoryLinking()).toBe(true);
    });

    it("returns false when showDirectoryPicker is not available", () => {
      vi.stubGlobal("window", {});
      expect(supportsLocalDirectoryLinking()).toBe(false);
    });
  });

  describe("linkDirectory", () => {
    it("throws when showDirectoryPicker is unavailable", async () => {
      vi.stubGlobal("window", { indexedDB: new MockIndexedDB() });
      await expect(linkDirectory("proj-1")).rejects.toThrow("File System Access API");
    });

    it("opens directory picker, reads files, stores handle in IndexedDB", async () => {
      const result = await linkDirectory("proj-1");
      expect(result.rootName).toBe("my-project");
      expect(result.fileCount).toBe(4);

      const info = await getLinkedDirectoryInfo("proj-1");
      expect(info).not.toBeNull();
      expect(info.rootName).toBe("my-project");
      expect(info.hasPermission).toBe(true);
      expect(info.fileCount).toBe(4);
    });
  });

  describe("getDirectoryFiles", () => {
    it("returns files from linked directory", async () => {
      await linkDirectory("proj-2");
      const files = await getDirectoryFiles("proj-2");

      expect(files).not.toBeNull();
      expect(files.length).toBe(4);

      const names = files.map((f) => f.name);
      expect(names).toContain("index.js");
      expect(names).toContain("utils.js");
      expect(names).toContain("README.md");
      expect(names).toContain("components/Button.svelte");
      expect(names).not.toContain("node_modules/dep.js");
    });

    it("returns null when no directory is linked", async () => {
      const files = await getDirectoryFiles("nonexistent");
      expect(files).toBeNull();
    });

    it("returns cached files on subsequent calls", async () => {
      await linkDirectory("proj-3");
      await getDirectoryFiles("proj-3");

      const cached = await getDirectoryFiles("proj-3");
      expect(cached.length).toBe(4);
    });
  });

  describe("unlinkDirectory", () => {
    it("removes handle from IndexedDB and clears cache", async () => {
      await linkDirectory("proj-4");
      await unlinkDirectory("proj-4");

      const info = await getLinkedDirectoryInfo("proj-4");
      expect(info).toBeNull();

      const files = await getDirectoryFiles("proj-4");
      expect(files).toBeNull();
    });
  });

  describe("refreshDirectoryCache", () => {
    it("bypasses cache and re-reads from directory", async () => {
      await linkDirectory("proj-5");
      await getDirectoryFiles("proj-5");

      const files = await refreshDirectoryCache("proj-5");
      expect(files.length).toBe(4);
    });
  });
});
