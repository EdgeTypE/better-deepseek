import { describe, it, expect } from "vitest";
import { parseBdsMessage } from "./index.js";

describe("DeepCode Tag Parser", () => {
  it("should parse <BDS:AUTO:FILE_READ path='...'> tag as request and renderable block", () => {
    const text = `Please inspect this file: <BDS:AUTO:FILE_READ path="src/index.js"/>`;
    const result = parseBdsMessage(text);
    expect(result.autoRequests.fileRead).toEqual(["src/index.js"]);
    expect(result.renderableBlocks).toHaveLength(1);
    expect(result.renderableBlocks[0].name).toBe("auto:file_read");
    expect(result.renderableBlocks[0].attrs.path).toBe("src/index.js");
  });

  it("should parse <BDS:file_read> with content as request and renderable block", () => {
    const text = `<BDS:file_read>src/utils/helpers.js</BDS:file_read>`;
    const result = parseBdsMessage(text);
    expect(result.autoRequests.fileRead).toEqual(["src/utils/helpers.js"]);
    expect(result.renderableBlocks).toHaveLength(1);
    expect(result.renderableBlocks[0].name).toBe("auto:file_read");
    expect(result.renderableBlocks[0].content).toBe("src/utils/helpers.js");
  });

  it("should parse <BDS:AUTO:SEARCH_IN_DIRECTORY queries='...'> tag as request and renderable block", () => {
    const text = `<BDS:AUTO:SEARCH_IN_DIRECTORY queries="auth JWT token verification"/>`;
    const result = parseBdsMessage(text);
    expect(result.autoRequests.searchInDirectory).toEqual(["auth JWT token verification"]);
    expect(result.renderableBlocks).toHaveLength(1);
    expect(result.renderableBlocks[0].name).toBe("auto:search_in_directory");
    expect(result.renderableBlocks[0].attrs.queries).toBe("auth JWT token verification");
  });

  it("should parse <BDS:AUTO:LIST_DIR path='...'> tag as request and renderable block", () => {
    const text = `<BDS:AUTO:LIST_DIR path="src/components"/>`;
    const result = parseBdsMessage(text);
    expect(result.autoRequests.dirList).toEqual(["src/components"]);
    expect(result.renderableBlocks).toHaveLength(1);
    expect(result.renderableBlocks[0].name).toBe("auto:list_dir");
    expect(result.renderableBlocks[0].attrs.path).toBe("src/components");
  });

  it("should strip DeepSeek autolink artifacts from tag attribute paths", () => {
    const text = `<BDS:AUTO:LIST_DIR path="src/[components](https_components)"/>`;
    const result = parseBdsMessage(text);
    expect(result.autoRequests.dirList).toEqual(["src/components"]);
    expect(result.renderableBlocks[0].attrs.path).toBe("src/components");
  });

  it("should strip DeepSeek autolink artifacts from create_file fileName", () => {
    const text = `<BDS:create_file fileName="src/[main.rs](https_main.rs)">print('x')</BDS:create_file>`;
    const result = parseBdsMessage(text);
    expect(result.createFiles).toEqual([
      { fileName: "src/main.rs", content: "print('x')" },
    ]);
  });

  it("should strip DeepSeek autolink artifacts from visible text", () => {
    const text = `├── [main.rs](https_main.rs)\n├── [evaluator.rs](https_evaluator.rs)`;
    const result = parseBdsMessage(text);
    expect(result.visibleText).toBe("├── main.rs\n├── evaluator.rs");
  });

  it("should parse [BDS:AUTO_DIR_LIST_RESULT] as renderable block", () => {
    const payload = JSON.stringify({
      path: "src",
      success: true,
      childCount: 2,
      entries: [
        { name: "utils/", type: "dir" },
        { name: "main.js", type: "file" }
      ],
      listing: "- DIR  utils/\n- FILE main.js\n"
    });
    const text = `[BDS:AUTO_DIR_LIST_RESULT]\n${payload}\n[/BDS:AUTO_DIR_LIST_RESULT]`;
    const result = parseBdsMessage(text);
    expect(result.renderableBlocks).toHaveLength(1);
    expect(result.renderableBlocks[0].name).toBe("auto_dir_list_result");
    expect(result.renderableBlocks[0].attrs.path).toBe("src");
    expect(result.renderableBlocks[0].attrs.childCount).toBe("2");
    expect(JSON.parse(result.renderableBlocks[0].content)).toEqual([
      { name: "utils/", type: "dir" },
      { name: "main.js", type: "file" }
    ]);
  });

  it("should parse [BDS:AUTO_FILE_READ_RESULT] as renderable block", () => {
    const payload = JSON.stringify({
      path: "src/main.js",
      fileName: "main.js",
      linesCount: 15,
      success: true,
      content: "console.log('Hello');"
    });
    const text = `[BDS:AUTO_FILE_READ_RESULT]\n${payload}\n[/BDS:AUTO_FILE_READ_RESULT]`;
    const result = parseBdsMessage(text);
    expect(result.renderableBlocks).toHaveLength(1);
    expect(result.renderableBlocks[0].name).toBe("auto_file_read_result");
    expect(result.renderableBlocks[0].attrs.path).toBe("src/main.js");
    expect(result.renderableBlocks[0].attrs.linesCount).toBe(15);
    expect(result.renderableBlocks[0].attrs.success).toBe(true);
    expect(result.renderableBlocks[0].content).toBe("console.log('Hello');");
  });

  it("should parse [BDS:AUTO_DIR_SEARCH_RESULT] as renderable block", () => {
    const payload = JSON.stringify({
      query: "jwt token",
      count: 2,
      results: [
        { fileName: "src/auth.js", startLine: 1, endLine: 20, score: 0.95, content: "function verifyToken() {}" }
      ]
    });
    const text = `[BDS:AUTO_DIR_SEARCH_RESULT]\n${payload}\n[/BDS:AUTO_DIR_SEARCH_RESULT]`;
    const result = parseBdsMessage(text);
    expect(result.renderableBlocks).toHaveLength(1);
    expect(result.renderableBlocks[0].name).toBe("auto_directory_search_result");
    expect(result.renderableBlocks[0].attrs.query).toBe("jwt token");
    expect(result.renderableBlocks[0].attrs.count).toBe("2");
    expect(result.renderableBlocks[0].content).toContain("src/auth.js");
  });

  it("should parse <BDS:HARNESS_TASK> tag as renderable block", () => {
    const text = `<BDS:HARNESS_TASK cwd="C:/Projects/my-app">\n1. Update index.ts\n2. Run tests\n</BDS:HARNESS_TASK>`;
    const result = parseBdsMessage(text);
    expect(result.renderableBlocks).toHaveLength(1);
    expect(result.renderableBlocks[0].name).toBe("harness_task");
    expect(result.renderableBlocks[0].attrs.cwd).toBe("C:/Projects/my-app");
    expect(result.renderableBlocks[0].content).toContain("1. Update index.ts");
  });

  it("should generate <BetterDeepSeek> block with <BDS:HARNESS_RESULT> when pendingReport exists", async () => {
    const { buildHarnessReportBlock } = await import("../../injected/payload-mutator.js");
    const state = {
      config: {
        deepCode: {
          enabled: true,
          manualPath: "A:/Users/Edige/GitHub/asistan",
          pendingReport: {
            cwd: "A:/Users/Edige/GitHub/asistan",
            sessionId: "s-12345",
            report: "## Syntax Scan Completed\nAll 44 files clean.",
          },
        },
      },
    };

    const block = buildHarnessReportBlock(state);
    expect(block).toContain("<BetterDeepSeek>");
    expect(block).toContain('<BDS:HARNESS_RESULT cwd="A:/Users/Edige/GitHub/asistan" sessionId="s-12345">');
    expect(block).toContain("## Syntax Scan Completed");
    expect(block).toContain("</BDS:HARNESS_RESULT>");
    expect(block).toContain("</BetterDeepSeek>");
  });
});
