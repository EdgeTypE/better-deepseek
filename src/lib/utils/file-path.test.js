import { describe, expect, it, vi } from "vitest";
import * as helpers from "./helpers.js";
import {
  buildCreateFilePackageName,
  guessMimeType,
  normalizeFilePath,
} from "./file-path.js";

describe("normalizeFilePath", () => {
  it("normalizes slashes, strips drive letters, and removes traversal", () => {
    expect(normalizeFilePath("C:\\temp\\..\\src\\app.js")).toBe("temp/src/app.js");
  });

  it("sanitizes invalid filename characters", () => {
    expect(normalizeFilePath('folder/<bad>:name?.txt')).toBe("folder/_bad__name_.txt");
  });

  it("falls back to file.txt for empty input", () => {
    expect(normalizeFilePath("")).toBe("file.txt");
    expect(normalizeFilePath("../..")).toBe("file.txt");
  });
});

describe("buildCreateFilePackageName", () => {
  it("uses the folder path as a descriptive zip prefix", () => {
    vi.spyOn(helpers, "buildTimestamp").mockReturnValue("20260506-120000");
    expect(buildCreateFilePackageName("src/utils/app.js")).toBe(
      "src-utils-20260506-120000.zip",
    );
  });

  it("falls back to the file stem when no folder exists", () => {
    vi.spyOn(helpers, "buildTimestamp").mockReturnValue("20260506-120000");
    expect(buildCreateFilePackageName("index.html")).toBe(
      "index-20260506-120000.zip",
    );
  });
});

describe("guessMimeType", () => {
  it("maps common code and text extensions", () => {
    expect(guessMimeType("index.html")).toBe("text/html");
    expect(guessMimeType("app.js")).toBe("application/javascript");
    expect(guessMimeType("notes.md")).toBe("text/markdown");
    expect(guessMimeType("data.json")).toBe("application/json");
  });

  it("falls back to text/plain", () => {
    expect(guessMimeType("unknown.bin")).toBe("text/plain");
  });
});
