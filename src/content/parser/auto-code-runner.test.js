import { describe, expect, it } from "vitest";
import { parseBdsMessage } from "./index.js";
import { normalizeTaggedCodeContent } from "./tag-parser.js";

describe("BDS:AUTO:CODE_RUNNER parsing and normalization", () => {
  it("parses auto:code_runner with language attribute", () => {
    const text = '<BDS:AUTO:CODE_RUNNER language="python">print(1)</BDS:AUTO:CODE_RUNNER>';
    const result = parseBdsMessage(text);
    
    expect(result.renderableBlocks).toHaveLength(1);
    expect(result.renderableBlocks[0]).toEqual({
      name: "auto:code_runner",
      attrs: { language: "python" },
      content: "print(1)"
    });
  });

  it("parses auto:code_runner with lang shorthand attribute", () => {
    const text = '<BDS:AUTO:CODE_RUNNER lang="js">console.log(1)</BDS:AUTO:CODE_RUNNER>';
    const result = parseBdsMessage(text);
    
    expect(result.renderableBlocks[0].attrs.lang).toBe("js");
  });

  it("normalizes code content by unwrapping markdown fences and stripping chatter", () => {
    const text = `
      <BDS:AUTO:CODE_RUNNER language="python">
      Here is the code:
      \`\`\`python
      print("hello")
      \`\`\`
      </BDS:AUTO:CODE_RUNNER>
    `;
    const result = parseBdsMessage(text);
    expect(result.renderableBlocks[0].content).toBe('print("hello")');
  });

  it("identifies auto:code_runner as a hiding tag (hides raw message)", () => {
    const text = '<BDS:AUTO:CODE_RUNNER language="py">...</BDS:AUTO:CODE_RUNNER>';
    const result = parseBdsMessage(text);
    expect(result.containsControlTags).toBe(true);
  });
});

describe("normalizeTaggedCodeContent for auto:code_runner", () => {
  it("handles auto:code_runner specifically", () => {
    const raw = "Sure! ```javascript\nalert(1)\n```";
    expect(normalizeTaggedCodeContent(raw, "auto:code_runner")).toBe("alert(1)");
  });
});
