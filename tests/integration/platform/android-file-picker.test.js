// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildFolderFileFromNative,
  isNativeFilePickerAvailable,
  nativePickFiles,
} from "../../../src/platform/android-file-picker.js";

// ── isNativeFilePickerAvailable ───────────────────────────────────────────────

describe("isNativeFilePickerAvailable", () => {
  afterEach(() => {
    delete window.AndroidBridge;
  });

  it("returns false when AndroidBridge is absent", () => {
    expect(isNativeFilePickerAvailable()).toBe(false);
  });

  it("returns false when AndroidBridge lacks pickFiles", () => {
    window.AndroidBridge = { getStorage: () => null };
    expect(isNativeFilePickerAvailable()).toBe(false);
  });

  it("returns false when pickFiles is not a function", () => {
    window.AndroidBridge = { pickFiles: "not-a-function" };
    expect(isNativeFilePickerAvailable()).toBe(false);
  });

  it("returns true when AndroidBridge.pickFiles is a function", () => {
    window.AndroidBridge = { pickFiles: vi.fn() };
    expect(isNativeFilePickerAvailable()).toBe(true);
  });
});

// ── nativePickFiles ───────────────────────────────────────────────────────────

describe("nativePickFiles", () => {
  function installBridgeMock(handler) {
    window.AndroidBridge = {
      pickFiles: vi.fn((mode, requestId) => {
        setTimeout(() => {
          const result = handler(mode, requestId);
          window.dispatchEvent(
            new CustomEvent("__bds_native_files_picked_" + requestId, {
              detail: result,
            }),
          );
        }, 0);
      }),
    };
  }

  afterEach(() => {
    delete window.AndroidBridge;
  });

  it("rejects immediately when bridge is unavailable", async () => {
    await expect(nativePickFiles("files")).rejects.toThrow(
      "AndroidBridge.pickFiles not available",
    );
  });

  it("resolves with files on success", async () => {
    installBridgeMock(() => ({
      files: [{ name: "hello.txt", content: "hello" }],
    }));
    const result = await nativePickFiles("files");
    expect(result.files).toEqual([{ name: "hello.txt", content: "hello" }]);
  });

  it("resolves with cancelled:true on user cancellation", async () => {
    installBridgeMock(() => ({ error: "cancelled", files: [] }));
    const result = await nativePickFiles("files");
    expect(result.cancelled).toBe(true);
    expect(result.files).toHaveLength(0);
  });

  it("rejects on non-cancellation error", async () => {
    installBridgeMock(() => ({ error: "permission denied", files: [] }));
    await expect(nativePickFiles("files")).rejects.toThrow("permission denied");
  });

  it("resolves with empty files when detail is null", async () => {
    installBridgeMock(() => null);
    const result = await nativePickFiles("files");
    expect(result.files).toHaveLength(0);
  });

  it("calls bridge with the provided mode", async () => {
    installBridgeMock(() => ({ files: [] }));
    await nativePickFiles("folder");
    expect(window.AndroidBridge.pickFiles).toHaveBeenCalledWith(
      "folder",
      expect.any(String),
    );
  });

  it("calls bridge with 'files' when mode is omitted", async () => {
    installBridgeMock(() => ({ files: [] }));
    await nativePickFiles();
    expect(window.AndroidBridge.pickFiles).toHaveBeenCalledWith(
      "files",
      expect.any(String),
    );
  });

  it("includes folderName from folder mode result", async () => {
    installBridgeMock(() => ({
      files: [{ name: "a.txt", content: "a" }],
      folderName: "myRepo",
    }));
    const result = await nativePickFiles("folder");
    expect(result.folderName).toBe("myRepo");
  });
});

// ── buildFolderFileFromNative ─────────────────────────────────────────────────

describe("buildFolderFileFromNative", () => {
  // jsdom 26 exposes FileReader but not Blob.prototype.text/arrayBuffer.
  // Polyfill for the duration of this suite only.
  beforeEach(() => {
    if (typeof Blob !== "undefined" && typeof Blob.prototype.text !== "function") {
      Blob.prototype.text = function () {
        const blob = this;
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(/** @type {string} */ (reader.result));
          reader.onerror = () => reject(reader.error);
          reader.readAsText(blob);
        });
      };
    }
  });
  it("returns null for empty files array", () => {
    expect(buildFolderFileFromNative([], "proj")).toBeNull();
  });

  it("returns null for null input", () => {
    expect(buildFolderFileFromNative(null, "proj")).toBeNull();
  });

  it("builds a File with correct workspace name", () => {
    const files = [{ name: "index.js", content: "const x = 1;" }];
    const result = buildFolderFileFromNative(files, "myProject");
    expect(result).toBeInstanceOf(File);
    expect(result.name).toBe("myProject_workspace.txt");
    expect(result.type).toBe("text/plain");
  });

  it("uses 'folder' as name fallback when folderName is absent", () => {
    const files = [{ name: "a.txt", content: "a" }];
    const result = buildFolderFileFromNative(files, undefined);
    expect(result.name).toBe("folder_workspace.txt");
  });

  it("concatenates all file contents with path headers", async () => {
    const files = [
      { name: "a.js", content: "const a = 1;" },
      { name: "b.js", content: "const b = 2;" },
    ];
    const result = buildFolderFileFromNative(files, "proj");
    const text = await result.text();
    expect(text).toContain("--- [FILE: a.js] ---");
    expect(text).toContain("const a = 1;");
    expect(text).toContain("--- [FILE: b.js] ---");
    expect(text).toContain("const b = 2;");
  });

  it("includes a directory tree section", async () => {
    const files = [
      { name: "src/index.js", content: "// main" },
      { name: "package.json", content: "{}" },
    ];
    const result = buildFolderFileFromNative(files, "proj");
    const text = await result.text();
    expect(text).toContain("Directory Tree:");
    expect(text).toContain("src");
    expect(text).toContain("package.json");
  });

  it("renders nested directory tree correctly", async () => {
    const files = [
      { name: "src/utils/helper.js", content: "// helper" },
      { name: "README.md", content: "# Readme" },
    ];
    const result = buildFolderFileFromNative(files, "proj");
    const text = await result.text();
    expect(text).toContain("src");
    expect(text).toContain("utils");
    expect(text).toContain("helper.js");
    expect(text).toContain("README.md");
  });
});
