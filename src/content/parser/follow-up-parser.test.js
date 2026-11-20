import { describe, expect, it } from "vitest";
import { parseBdsMessage } from "./index.js";

describe("BDS:follow_up parser", () => {
  it("parses a self-closing <BDS:follow_up .../> tag", () => {
    const result = parseBdsMessage(
      'Here is your answer.\n\n<BDS:follow_up label="Want a runnable Colab script?" query="Create a standalone Google Colab script."/>',
    );
    expect(result.renderableBlocks).toHaveLength(1);
    expect(result.renderableBlocks[0]).toMatchObject({
      name: "follow_up",
      attrs: {
        label: "Want a runnable Colab script?",
        query: "Create a standalone Google Colab script.",
        button: "",
      },
      content: "Create a standalone Google Colab script.",
    });
    expect(result.visibleText).toContain("Here is your answer.");
    expect(result.visibleText).toContain("\x00BLOCK:0\x00");
    expect(result.isStreamingTool).toBe(false);
  });

  it("supports <BDS:followup .../> alias and custom button text", () => {
    const result = parseBdsMessage(
      '<BDS:followup label="Share WebSocket structure?" query="Show the WebSocket frame layout." button="Show me"/>',
    );
    expect(result.renderableBlocks).toHaveLength(1);
    expect(result.renderableBlocks[0].attrs).toEqual({
      label: "Share WebSocket structure?",
      query: "Show the WebSocket frame layout.",
      button: "Show me",
    });
  });

  it("supports paired <BDS:follow_up>...</BDS:follow_up> with body as query fallback", () => {
    const result = parseBdsMessage(
      '<BDS:follow_up label="Generate tests?">Write Vitest unit tests for the parser.</BDS:follow_up>',
    );
    expect(result.renderableBlocks).toHaveLength(1);
    expect(result.renderableBlocks[0].attrs.query).toBe("Write Vitest unit tests for the parser.");
  });

  it("preserves '>' inside quoted attributes", () => {
    const result = parseBdsMessage(
      '<BDS:follow_up label="Compare A > B?" query="Compare A > B in detail."/>',
    );
    expect(result.renderableBlocks).toHaveLength(1);
    expect(result.renderableBlocks[0].attrs.label).toBe("Compare A > B?");
    expect(result.renderableBlocks[0].attrs.query).toBe("Compare A > B in detail.");
  });

  it("ignores follow_up tags inside fenced or inline code blocks", () => {
    const result = parseBdsMessage(
      'Example:\n```xml\n<BDS:follow_up label="x" query="y"/>\n```\nInline `<BDS:follow_up label="a" query="b"/>`',
    );
    expect(result.renderableBlocks).toHaveLength(0);
  });

  it("ignores empty follow_up tags with neither label nor query", () => {
    const result = parseBdsMessage('<BDS:follow_up button="Yes"/>');
    expect(result.renderableBlocks).toHaveLength(0);
  });
});
