// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi } from "vitest";
import state from "./state.js";
import { addRecentDirectory, buildDeepCodeFileTree } from "./deep-code.js";

function flushPromises() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("addRecentDirectory", () => {
  beforeEach(() => {
    state.deepCode.recentDirectories = [];
    state.deepCode.manualPath = "";
    state.deepCode.activeDirectory = null;
    vi.spyOn(window, "dispatchEvent").mockImplementation(() => true);
  });

  it("accumulates multiple distinct directories", async () => {
    await addRecentDirectory("asistan", "A:/Users/Edige/GitHub/asistan", 44);
    await addRecentDirectory("DOOMonSystemTray", "A:/Users/Edige/GitHub/DOOMonSystemTray", 24);
    await flushPromises();

    expect(state.deepCode.recentDirectories).toHaveLength(2);
    expect(state.deepCode.recentDirectories[0].name).toBe("DOOMonSystemTray");
    expect(state.deepCode.recentDirectories[1].name).toBe("asistan");
  });

  it("keeps distinct directories even when path is empty", async () => {
    await addRecentDirectory("proje-a", "", 5);
    await addRecentDirectory("proje-b", "", 3);
    await flushPromises();

    expect(state.deepCode.recentDirectories).toHaveLength(2);
  });

  it("deduplicates by name on re-add", async () => {
    await addRecentDirectory("asistan", "A:/Users/Edige/GitHub/asistan", 44);
    await addRecentDirectory("asistan", "A:/Users/Edige/GitHub/asistan", 50);
    await flushPromises();

    expect(state.deepCode.recentDirectories).toHaveLength(1);
    expect(state.deepCode.recentDirectories[0].fileCount).toBe(50);
  });

  it("deduplicates by path for differently-named entries of the same directory", async () => {
    await addRecentDirectory("asistan", "A:/Users/Edige/GitHub/asistan", 44);
    await addRecentDirectory("Asistan", "A:/Users/Edige/GitHub/asistan", 44);
    await flushPromises();

    expect(state.deepCode.recentDirectories).toHaveLength(1);
  });

  it("caps the list at 10 entries", async () => {
    for (let i = 0; i < 12; i++) {
      await addRecentDirectory(`proje-${i}`, `A:/dirs/proje-${i}`, i);
    }
    await flushPromises();

    expect(state.deepCode.recentDirectories).toHaveLength(10);
  });
});

describe("buildDeepCodeFileTree", () => {
  it("returns an empty string for empty input", () => {
    expect(buildDeepCodeFileTree([])).toBe("");
    expect(buildDeepCodeFileTree(null)).toBe("");
    expect(buildDeepCodeFileTree([{ name: "", content: "" }])).toBe("");
  });

  it("renders a flat sorted list wrapped in the tag with root attr", () => {
    const tree = buildDeepCodeFileTree(
      [
        { name: "src/utils/helpers.js", content: "" },
        { name: "README.md", content: "" },
        { name: "package.json", content: "" },
        { name: "src/index.js", content: "" },
      ],
      { rootName: "my-project" }
    );

    expect(tree).toBe(
      '<BDS:DEEP_CODE_FILE_TREE root="my-project">\n' +
        "- package.json\n- README.md\n- src/index.js\n- src/utils/helpers.js\n" +
        "</BDS:DEEP_CODE_FILE_TREE>"
    );
  });

  it("excludes files deeper than maxDepth", () => {
    const tree = buildDeepCodeFileTree(
      [
        { name: "src/index.js", content: "" },
        { name: "src/utils/helpers.js", content: "" },
        { name: "src/utils/deep/nested/file.js", content: "" },
      ],
      { maxDepth: 3 }
    );

    expect(tree).toContain("- src/index.js");
    expect(tree).toContain("- src/utils/helpers.js");
    expect(tree).not.toContain("nested");
  });

  it("excludes skipped directories such as node_modules", () => {
    const tree = buildDeepCodeFileTree([
      { name: "package.json", content: "" },
      { name: "node_modules/lodash/index.js", content: "" },
      { name: "dist/bundle.js", content: "" },
      { name: "src/index.js", content: "" },
    ]);

    expect(tree).toContain("- package.json");
    expect(tree).toContain("- src/index.js");
    expect(tree).not.toContain("node_modules");
    expect(tree).not.toContain("dist");
  });

  it("caps the number of entries and reports truncation", () => {
    const files = Array.from({ length: 20 }, (_, i) => ({
      name: `file-${i}.js`,
      content: "",
    }));
    const tree = buildDeepCodeFileTree(files, { maxEntries: 5 });

    const shown = tree.split("\n").filter((line) => line.startsWith("- "));
    expect(shown).toHaveLength(5);
    expect(tree).toContain(`... (${15} more files)`);
  });

  it("caps the total character length", () => {
    const files = Array.from({ length: 50 }, (_, i) => ({
      name: `src/modules/very-long-file-name-${i}.js`,
      content: "",
    }));
    const tree = buildDeepCodeFileTree(files, { maxChars: 200 });

    const body = tree.slice(tree.indexOf(">") + 1, tree.lastIndexOf("</"));
    expect(body.length).toBeLessThanOrEqual(200 + 40);
  });

  it("renders deterministically regardless of input order", () => {
    const a = buildDeepCodeFileTree([
      { name: "b.js", content: "" },
      { name: "a.js", content: "" },
    ]);
    const b = buildDeepCodeFileTree([
      { name: "a.js", content: "" },
      { name: "b.js", content: "" },
    ]);
    expect(a).toBe(b);
  });

  it("renders directory entries with a trailing slash alongside text files", () => {
    const tree = buildDeepCodeFileTree(
      ["README.md", "dataset/", "models/", "src/", "src/main.py", "src/utils/ocr.py"],
      { rootName: "gokturkceOCR" }
    );

    expect(tree).toContain('<BDS:DEEP_CODE_FILE_TREE root="gokturkceOCR">');
    expect(tree).toContain("- README.md");
    expect(tree).toContain("- dataset/");
    expect(tree).toContain("- models/");
    expect(tree).toContain("- src/");
    expect(tree).toContain("- src/main.py");
    expect(tree).toContain("- src/utils/ocr.py");
  });

  it("deduplicates repeated path entries", () => {
    const tree = buildDeepCodeFileTree(["src/", "src/", "src/main.py", "src/main.py"]);
    expect(tree.match(/^- src\/$/gm)).toHaveLength(1);
    expect(tree.match(/^- src\/main\.py$/gm)).toHaveLength(1);
  });
});