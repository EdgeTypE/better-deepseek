// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildFolderFileFromNative,
  isNativeFilePickerAvailable,
  nativePickFiles,
  PICK_ERRORS,
} from "../../../src/platform/android-file-picker.js";
import {
  dispatchPickResult,
  dispatchPickStatus,
} from "../../helpers/native-pick-protocol.js";

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
          dispatchPickResult(requestId, result);
        }, 0);
      }),
    };
  }

  afterEach(() => {
    vi.useRealTimers();
    delete document.visibilityState;
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
      skipped: [],
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
      skipped: [],
    }));

    const result = await nativePickFiles("folder");

    expect(window.AndroidBridge.pickFiles).toHaveBeenCalledWith(
      "folder",
      expect.any(String),
    );
    expect(result.folderName).toBe("repo");
  });

  it("resolves a single-chunk v2 payload", async () => {
    installBridgeMock(() => ({
      files: [{ name: "notes.md", content: "# Notes" }],
      skipped: [],
    }));

    const result = await nativePickFiles("files");

    expect(result.files).toEqual([{ name: "notes.md", content: "# Notes" }]);
    expect(result.skipped).toEqual([]);
  });

  it("reassembles multi-chunk payloads in order", async () => {
    let capturedRequestId;
    window.AndroidBridge = {
      pickFiles: vi.fn((mode, requestId) => {
        capturedRequestId = requestId;
      }),
    };
    const payload = {
      files: [{ name: "notes.md", content: "# Notes\n" + "x".repeat(20) }],
      skipped: [],
    };
    const json = JSON.stringify(payload);
    const chunks = [];
    for (let start = 0; start < json.length; start += 7) {
      chunks.push(json.slice(start, start + 7));
    }

    const promise = nativePickFiles("files");

    for (const seq of [1, 0, 2]) {
      window.dispatchEvent(
        new CustomEvent("__bds_native_files_picked_" + capturedRequestId, {
          detail: {
            v: 2,
            kind: "chunk",
            seq,
            total: chunks.length,
            data: chunks[seq],
          },
        }),
      );
    }
    for (let seq = 3; seq < chunks.length; seq += 1) {
      window.dispatchEvent(
        new CustomEvent("__bds_native_files_picked_" + capturedRequestId, {
          detail: {
            v: 2,
            kind: "chunk",
            seq,
            total: chunks.length,
            data: chunks[seq],
          },
        }),
      );
    }

    await expect(promise).resolves.toEqual(payload);
  });

  it("exposes skipped entries on the result", async () => {
    const skipped = [{ name: "photo.png", reason: "unsupported-type" }];
    installBridgeMock(() => ({
      files: [{ name: "notes.md", content: "# Notes" }],
      skipped,
    }));

    const result = await nativePickFiles("files");

    expect(result.skipped).toEqual(skipped);
  });

  it("rejects with malformed-payload when reassembled JSON does not parse", async () => {
    window.AndroidBridge = {
      pickFiles: vi.fn((mode, requestId) => {
        setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent("__bds_native_files_picked_" + requestId, {
              detail: { v: 2, kind: "chunk", seq: 0, total: 1, data: "{not json" },
            }),
          );
        }, 0);
      }),
    };

    await expect(nativePickFiles("files")).rejects.toThrow(PICK_ERRORS.MALFORMED);
  });

  it("rejects with picker-timeout when no event ever arrives", async () => {
    vi.useFakeTimers();
    window.AndroidBridge = { pickFiles: vi.fn() };

    const promise = nativePickFiles("files");
    const expectation = expect(promise).rejects.toThrow(PICK_ERRORS.TIMEOUT);
    await vi.advanceTimersByTimeAsync(10000);

    await expectation;
  });

  it("status opened clears the launch timer", async () => {
    vi.useFakeTimers();
    let capturedRequestId;
    window.AndroidBridge = {
      pickFiles: vi.fn((mode, requestId) => {
        capturedRequestId = requestId;
      }),
    };
    const promise = nativePickFiles("files");
    let settled = false;
    promise.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );

    dispatchPickStatus(capturedRequestId, "opened");
    await vi.advanceTimersByTimeAsync(10000);

    expect(settled).toBe(false);
    dispatchPickResult(capturedRequestId, { files: [], skipped: [] });
    await expect(promise).resolves.toEqual({ files: [], skipped: [] });
  });

  it("does not time out while the document is hidden", async () => {
    vi.useFakeTimers();
    let capturedRequestId;
    window.AndroidBridge = {
      pickFiles: vi.fn((mode, requestId) => {
        capturedRequestId = requestId;
      }),
    };
    const promise = nativePickFiles("files");
    let settled = false;
    promise.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );

    dispatchPickStatus(capturedRequestId, "opened");
    setVisibilityState("hidden");
    await vi.advanceTimersByTimeAsync(9 * 60 * 1000);

    expect(settled).toBe(false);
    dispatchPickResult(capturedRequestId, { files: [], skipped: [] });
    await expect(promise).resolves.toEqual({ files: [], skipped: [] });
  });

  it("rejects with picker-timeout 30s after returning visible with no delivery", async () => {
    vi.useFakeTimers();
    let capturedRequestId;
    window.AndroidBridge = {
      pickFiles: vi.fn((mode, requestId) => {
        capturedRequestId = requestId;
      }),
    };
    const promise = nativePickFiles("files");

    dispatchPickStatus(capturedRequestId, "opened");
    setVisibilityState("hidden");
    setVisibilityState("visible");
    const expectation = expect(promise).rejects.toThrow(PICK_ERRORS.TIMEOUT);
    await vi.advanceTimersByTimeAsync(30000);

    await expectation;
  });

  it("protocol events reset the return-grace timer", async () => {
    vi.useFakeTimers();
    let capturedRequestId;
    window.AndroidBridge = {
      pickFiles: vi.fn((mode, requestId) => {
        capturedRequestId = requestId;
      }),
    };
    const promise = nativePickFiles("files");
    let settled = false;
    promise.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );

    dispatchPickStatus(capturedRequestId, "opened");
    setVisibilityState("hidden");
    setVisibilityState("visible");
    await vi.advanceTimersByTimeAsync(20000);
    dispatchPickStatus(capturedRequestId, "reading");
    await vi.advanceTimersByTimeAsync(20000);

    expect(settled).toBe(false);
    dispatchPickResult(capturedRequestId, { files: [], skipped: [] });
    await expect(promise).resolves.toEqual({ files: [], skipped: [] });
  });

  it("rejects with read-stalled 120s after reading starts with no chunks", async () => {
    vi.useFakeTimers();
    let capturedRequestId;
    window.AndroidBridge = {
      pickFiles: vi.fn((mode, requestId) => {
        capturedRequestId = requestId;
      }),
    };
    const promise = nativePickFiles("files");

    dispatchPickStatus(capturedRequestId, "opened");
    dispatchPickStatus(capturedRequestId, "reading");
    const expectation = expect(promise).rejects.toThrow(PICK_ERRORS.STALLED);
    await vi.advanceTimersByTimeAsync(120000);

    await expectation;
  });

  it("rejects with picker-timeout at the 10 minute absolute cap", async () => {
    vi.useFakeTimers();
    let capturedRequestId;
    window.AndroidBridge = {
      pickFiles: vi.fn((mode, requestId) => {
        capturedRequestId = requestId;
      }),
    };
    const promise = nativePickFiles("files");

    dispatchPickStatus(capturedRequestId, "opened");
    const expectation = expect(promise).rejects.toThrow(PICK_ERRORS.TIMEOUT);
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);

    await expectation;
  });

  it("removes the window and visibilitychange listeners after settling", async () => {
    const windowRemoveSpy = vi.spyOn(window, "removeEventListener");
    const documentRemoveSpy = vi.spyOn(document, "removeEventListener");
    installBridgeMock(() => ({ files: [], skipped: [] }));

    await nativePickFiles("files");

    expect(
      windowRemoveSpy.mock.calls.some(([eventName]) =>
        String(eventName).startsWith("__bds_native_files_picked_"),
      ),
    ).toBe(true);
    expect(
      documentRemoveSpy.mock.calls.some(([eventName]) => eventName === "visibilitychange"),
    ).toBe(true);
  });
});

function setVisibilityState(state) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

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
