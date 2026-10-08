// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const folderPickerMocks = vi.hoisted(() => ({
  pickFolderSelection: vi.fn(),
}));

vi.mock("../../../src/lib/utils/folder-picker.js", () => folderPickerMocks);

import { pickFolderAndConcatenate } from "../../../src/content/files/folder-reader.js";
import state from "../../../src/content/state.js";

function folderFile(path, content, options = {}) {
  const file = new File([content], path.split("/").pop(), options);
  Object.defineProperty(file, "path", {
    configurable: true,
    value: path,
  });
  Object.defineProperty(file, "text", {
    configurable: true,
    value: async () => (typeof content === "string" ? content : ""),
  });
  return file;
}

async function workspaceText(result) {
  if (!result?.workspaceFile) return "";
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(result.workspaceFile);
  });
}

describe("pickFolderAndConcatenate", () => {
  beforeEach(() => {
    folderPickerMocks.pickFolderSelection.mockReset();
    state.settings.processGitignoreOnUpload = false;
  });

  afterEach(() => {
    folderPickerMocks.pickFolderSelection.mockReset();
  });

  it("splits image files from the workspace when includeImages is true", async () => {
    folderPickerMocks.pickFolderSelection.mockResolvedValue({
      rootName: "repo",
      files: [
        folderFile("repo/README.md", "# Project", { type: "text/markdown" }),
        folderFile("repo/assets/photo.png", new Uint8Array([1, 2, 3]), { type: "image/png" }),
      ],
    });

    const result = await pickFolderAndConcatenate({ includeImages: true });

    expect(result.workspaceFile.name).toBe("repo_workspace.txt");
    expect(result.imageFiles.map((file) => file.name)).toEqual(["photo.png"]);
    expect(result.imageFiles[0].type).toBe("image/png");
    expect(result.skippedImages).toBe(0);
    expect(await workspaceText(result)).toContain("--- [FILE: repo/README.md] ---");
  });

  it("caps included images at ten and reports skipped image overflow", async () => {
    const images = Array.from({ length: 12 }, (_, index) =>
      folderFile(`repo/assets/img${index}.png`, new Uint8Array([index]), { type: "image/png" }),
    );
    folderPickerMocks.pickFolderSelection.mockResolvedValue({
      rootName: "repo",
      files: [
        folderFile("repo/README.md", "# Project", { type: "text/markdown" }),
        ...images,
      ],
    });

    const result = await pickFolderAndConcatenate({ includeImages: true });

    expect(result.imageFiles).toHaveLength(10);
    expect(result.skippedImages).toBe(2);
  });

  it("leaves workspace content unchanged when includeImages is false", async () => {
    const textFile = folderFile("repo/README.md", "# Project", { type: "text/markdown" });
    const imageFile = folderFile("repo/assets/photo.png", new Uint8Array([1, 2, 3]), {
      type: "image/png",
    });
    folderPickerMocks.pickFolderSelection.mockResolvedValueOnce({
      rootName: "repo",
      files: [textFile, imageFile],
    });
    folderPickerMocks.pickFolderSelection.mockResolvedValueOnce({
      rootName: "repo",
      files: [textFile],
    });

    const mixedResult = await pickFolderAndConcatenate({ includeImages: false });
    const baselineResult = await pickFolderAndConcatenate({ includeImages: false });

    expect(mixedResult.imageFiles).toEqual([]);
    expect(mixedResult.skippedImages).toBe(0);
    expect(await workspaceText(mixedResult)).toBe(await workspaceText(baselineResult));
  });
});
