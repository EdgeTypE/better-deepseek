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

  // Regression: a `>` inside a quoted attribute value used to end the stray-tag
  // capture early, leaving the tail of the tag visible to the user. The scanner
  // reads attribute values as quoted strings, so the whole tag is removed.
  it("removes stray tags whose attributes contain '>'", () => {
    expect(sanitizeVisibleText('A<BDS:memory_calls args="a>b">B')).toBe("AB");
    expect(sanitizeVisibleText('A<BDS:foo x="1 > 2">B')).toBe("AB");
  });

  it("removes self-closing tags whose attributes contain '>'", () => {
    expect(sanitizeVisibleText('A<BDS:create_file fileName="a>b.py"/>B')).toBe("AB");
    expect(
      sanitizeVisibleText('A<BDS:create_file fileName="x.js" content="if (a > b) {}"/>B')
    ).toBe("AB");
  });

  // The paired strips are anchored by the matching close tag, so a truncated
  // attribute capture still removes the same span. These guard that reasoning:
  // if someone rewrites them into self-contained strips, these fail.
  it("still strips paired tags whose attributes contain '>'", () => {
    expect(sanitizeVisibleText('A<BDS:memory_calls args="a>b">body</BDS:memory_calls>B')).toBe("AB");
    expect(
      sanitizeVisibleText('A<BDS:create_file fileName="x.js">if (a > b) {}</BDS:create_file>B')
    ).toBe("AB");
  });

  it("keeps an unterminated tag instead of swallowing the rest of the message", () => {
    expect(sanitizeVisibleText("Hello <BDS:VISUALIZER still typing")).toBe(
      "Hello <BDS:VISUALIZER still typing"
    );
  });

  describe("fence repair (issue #120)", () => {
    it("drops a fence left dangling when a removal took its partner", () => {
      // The removal eats the opening fence because it sits inside the tag span;
      // the closing fence is outside it and would otherwise render as a stray
      // ``` at the end of the message.
      const text = [
        "Intro",
        "",
        '<BDS:create_file fileName="x">',
        "```",
        "</BDS:create_file>",
        "",
        "Prose.",
        "```",
      ].join("\n");

      expect(sanitizeVisibleText(text)).toBe("Intro\n\nProse.");
    });

    it("leaves balanced fences alone", () => {
      const text = ["Intro", "", "```", "code", "```", "", "Prose."].join("\n");

      expect(sanitizeVisibleText(text)).toBe(text);
    });

    it("keeps a block's own fence lines while dropping the dangling one", () => {
      // The inner ```bash belongs to the outer block; only the trailing,
      // unpaired fence is an artifact.
      const text = [
        "Intro",
        "",
        "```",
        "# T",
        "",
        "```bash",
        "run",
        "```",
        "",
        "```",
        "",
        "Prose.",
      ].join("\n");

      expect(sanitizeVisibleText(text)).toBe(
        ["Intro", "", "```", "# T", "", "```bash", "run", "```", "", "Prose."].join("\n")
      );
    });

    it("leaves text without fences untouched", () => {
      const text = ["Intro", "", "plain", "Prose."].join("\n");

      expect(sanitizeVisibleText(text)).toBe(text);
    });
  });
});
