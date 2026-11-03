import { describe, expect, it } from "vitest";
import { parseBdsMessage } from "./index.js";

describe("BDS:GET prompt module parsing", () => {
  it("parses a paired get tag into a request and a card block", () => {
    const parsed = parseBdsMessage("<BDS:GET>midi</BDS:GET>");

    expect(parsed.autoRequests.promptModules).toEqual(["midi"]);
    expect(parsed.renderableBlocks).toHaveLength(1);
    expect(parsed.renderableBlocks[0]).toMatchObject({
      name: "get",
      content: "midi",
      attrs: { module: "midi" },
    });
    expect(parsed.visibleText).not.toContain("BDS:GET");
    expect(parsed.visibleText).toContain("\x00BLOCK:0\x00");
  });

  it("accepts the self-closing name attribute form", () => {
    const parsed = parseBdsMessage('<BDS:GET name="docx"/>');

    expect(parsed.autoRequests.promptModules).toEqual(["docx"]);
    expect(parsed.renderableBlocks[0]).toMatchObject({
      name: "get",
      content: "docx",
    });
    expect(parsed.visibleText).not.toContain("BDS:GET");
  });

  it("keeps prose around the tag", () => {
    const parsed = parseBdsMessage("One moment.\n<BDS:GET>midi</BDS:GET>\nThen I compose.");

    expect(parsed.autoRequests.promptModules).toEqual(["midi"]);
    expect(parsed.visibleText).toContain("One moment.");
    expect(parsed.visibleText).toContain("Then I compose.");
  });

  it("ignores the tag inside a code block", () => {
    const parsed = parseBdsMessage("```html\n<BDS:GET>midi</BDS:GET>\n```");

    expect(parsed.autoRequests.promptModules).toEqual([]);
    expect(parsed.renderableBlocks).toHaveLength(0);
  });

  it("ignores an empty tag", () => {
    const parsed = parseBdsMessage("<BDS:GET></BDS:GET>");

    expect(parsed.autoRequests.promptModules).toEqual([]);
  });
});
