import { describe, expect, it } from "vitest";
import { sanitizeVisibleText } from "./text-sanitizer.js";

describe("sanitizeVisibleText", () => {
  it("removes BetterDeepSeek and BDS control blocks", () => {
    const text = [
      "Visible before",
      "<BetterDeepSeek>hidden</BetterDeepSeek>",
      "<BDS:VISUALIZER>secret</BDS:VISUALIZER>",
      "Visible after",
    ].join("\n");

    expect(sanitizeVisibleText(text)).toBe("Visible before\n\nVisible after");
  });

  it("removes self-closing create_file tags and long work wrappers", () => {
    const text = '<BDS:LONG_WORK>\nWork\n<BDS:create_file fileName="a.txt" />\n</BDS:LONG_WORK>';
    expect(sanitizeVisibleText(text)).toBe("");
  });

  it("removes unclosed tag fragments", () => {
    expect(sanitizeVisibleText("Hello <BDS:VISUALIZER>world")).toBe("Hello world");
  });
});
