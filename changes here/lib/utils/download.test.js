// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { Blob as NodeBlob } from "node:buffer";
import {
  flattenPathForDownload,
  triggerBlobDownload,
  triggerTextDownload,
  triggerUrlDownload,
} from "./download.js";

afterEach(() => {
  delete window.AndroidBridge;
});

describe("flattenPathForDownload", () => {
  it("replaces path separators and invalid filename characters", () => {
    expect(flattenPathForDownload('folder/a<b>c:file?.txt')).toBe(
      "folder__a_b_c_file_.txt",
    );
  });
});

describe("download helpers", () => {
  it("creates a blob download anchor with a flattened filename", () => {
    vi.useFakeTimers();
    URL.createObjectURL = vi.fn(() => "blob:test");
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    triggerBlobDownload(new Blob(["x"]), "dir/file.txt");

    expect(click).toHaveBeenCalledTimes(1);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    vi.runAllTimers();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test");
  });

  it("creates a plain-text download", () => {
    URL.createObjectURL = vi.fn(() => "blob:test");
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    triggerTextDownload("hello", "note.txt");

    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("opens url downloads in a new tab anchor", () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    triggerUrlDownload("https://example.com/file");

    expect(click).toHaveBeenCalledTimes(1);
  });
});

describe("Android bridge integration", () => {
  it("routes blob downloads through AndroidBridge.downloadBlob when present", async () => {
    const downloadBlob = vi.fn();
    window.AndroidBridge = { downloadBlob };

    // No anchor click should happen on the Android path.
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    // jsdom's Blob historically lacked arrayBuffer; use Node's built-in Blob
    // which exposes the method we rely on in production.
    triggerBlobDownload(
      new NodeBlob(["payload"], { type: "text/plain" }),
      "dir/file.txt",
    );

    // The conversion to base64 is async (blob.arrayBuffer); poll until the
    // bridge spy fires so we don't depend on tick scheduling.
    await vi.waitFor(() => expect(downloadBlob).toHaveBeenCalledTimes(1));

    expect(click).not.toHaveBeenCalled();
    const [base64, mime, name] = downloadBlob.mock.calls[0];
    expect(typeof base64).toBe("string");
    expect(base64.length).toBeGreaterThan(0);
    // Decoded base64 round-trips back to the original payload.
    expect(Buffer.from(base64, "base64").toString("utf8")).toBe("payload");
    expect(mime).toBe("text/plain");
    expect(name).toBe("dir__file.txt");
  });

  it("falls back to anchor download when AndroidBridge.downloadBlob is missing", () => {
    // Bridge present but no downloadBlob method (defensive: any bridge stub
    // produced by a future shim should not accidentally swallow downloads).
    window.AndroidBridge = {};
    URL.createObjectURL = vi.fn(() => "blob:test");
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    triggerBlobDownload(new Blob(["x"]), "file.txt");

    expect(click).toHaveBeenCalledTimes(1);
  });
});
