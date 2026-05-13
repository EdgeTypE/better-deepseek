// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildFolderFileFromNative,
  isNativeFilePickerAvailable,
  nativePickFiles,
} from "../../../src/platform/android-file-picker.js";

function readBlobText(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

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

  it("returns true when AndroidBridge.pickFiles is a function", () => {
    window.AndroidBridge = { pickFiles: vi.fn() };
    expect(isNativeFilePickerAvailable()).toBe(true);
  });
});

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

  it("resolves with markdown files on success", async () => {
    installBridgeMock(() => ({
      files: [{ name: "notes.md", content: "# Notes" }],
    }));

    const result = await nativePickFiles("files");

    expect(result.files).toEqual([{ name: "notes.md", content: "# Notes" }]);
  });

  it("resolves with cancelled true on user cancellation", async () => {
    installBridgeMock(() => ({ error: "cancelled", files: [] }));

    const result = await nativePickFiles("files");

    expect(result.cancelled).toBe(true);
    expect(result.files).toHaveLength(0);
  });

  it("rejects on non-cancellation errors", async () => {
    installBridgeMock(() => ({ error: "permission denied", files: [] }));

    await expect(nativePickFiles("files")).rejects.toThrow("permission denied");
  });

  it("passes folder mode through to the bridge", async () => {
    installBridgeMock(() => ({
      files: [{ name: "README.md", content: "# Project" }],
      folderName: "repo",
    }));

    const result = await nativePickFiles("folder");

    expect(window.AndroidBridge.pickFiles).toHaveBeenCalledWith(
      "folder",
      expect.any(String),
    );
    expect(result.folderName).toBe("repo");
  });
});

describe("buildFolderFileFromNative", () => {
  it("returns null for empty input", () => {
    expect(buildFolderFileFromNative([], "repo")).toBeNull();
    expect(buildFolderFileFromNative(null, "repo")).toBeNull();
  });

  it("builds a concatenated workspace file that includes markdown files", async () => {
    const file = buildFolderFileFromNative(
      [
        { name: "src/index.js", content: "console.log('hello');" },
        { name: "README.md", content: "# Project" },
      ],
      "repo",
    );

    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe("repo_workspace.txt");

    const text = await readBlobText(file);
    expect(text).toContain("Directory Tree:");
    expect(text).toContain("README.md");
    expect(text).toContain("--- [FILE: README.md] ---");
    expect(text).toContain("# Project");
  });
});
