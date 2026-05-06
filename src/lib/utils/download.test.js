// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import {
  flattenPathForDownload,
  triggerBlobDownload,
  triggerTextDownload,
  triggerUrlDownload,
} from "./download.js";

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
