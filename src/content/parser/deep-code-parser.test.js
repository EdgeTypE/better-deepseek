import { describe, it, expect } from "vitest";
import { parseBdsMessage } from "./index.js";

describe("DeepCode Tag Parser", () => {
  it("should parse <BDS:AUTO:FILE_READ path='...'> tag", () => {
    const text = `Please inspect this file: <BDS:AUTO:FILE_READ path="src/index.js"/>`;
    const result = parseBdsMessage(text);
    expect(result.autoRequests.fileRead).toEqual(["src/index.js"]);
  });

  it("should parse <BDS:file_read> with content", () => {
    const text = `<BDS:file_read>src/utils/helpers.js</BDS:file_read>`;
    const result = parseBdsMessage(text);
    expect(result.autoRequests.fileRead).toEqual(["src/utils/helpers.js"]);
  });

  it("should parse <BDS:AUTO:SEARCH_IN_DIRECTORY queries='...'> tag", () => {
    const text = `<BDS:AUTO:SEARCH_IN_DIRECTORY queries="auth JWT token verification"/>`;
    const result = parseBdsMessage(text);
    expect(result.autoRequests.searchInDirectory).toEqual(["auth JWT token verification"]);
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
