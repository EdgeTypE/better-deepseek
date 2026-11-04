import { describe, it, expect } from "vitest";
import { parseAnnouncementMessage } from "./announcement-parser.js";

describe("parseAnnouncementMessage", () => {
  it("returns empty array for empty or invalid inputs", () => {
    expect(parseAnnouncementMessage("")).toEqual([]);
    expect(parseAnnouncementMessage(null)).toEqual([]);
    expect(parseAnnouncementMessage(undefined)).toEqual([]);
    expect(parseAnnouncementMessage(123)).toEqual([]);
    expect(parseAnnouncementMessage({})).toEqual([]);
  });

  it("handles plain text with no markdown formatting", () => {
    const text = "This is a simple announcement.";
    expect(parseAnnouncementMessage(text)).toEqual([
      { type: "text", text: "This is a simple announcement." },
    ]);
  });

  it("parses markdown links correctly", () => {
    const text = "Check out [GitHub](https://github.com/EdgeTypE/better-deepseek) now!";
    expect(parseAnnouncementMessage(text)).toEqual([
      { type: "text", text: "Check out " },
      {
        type: "link",
        text: "GitHub",
        href: "https://github.com/EdgeTypE/better-deepseek",
      },
      { type: "text", text: " now!" },
    ]);
  });

  it("handles markdown links with optional spaces or titles", () => {
    const text = 'Visit [GitHub]( https://github.com "DeepSeek Extension" ) for code.';
    expect(parseAnnouncementMessage(text)).toEqual([
      { type: "text", text: "Visit " },
      {
        type: "link",
        text: "GitHub",
        href: "https://github.com",
      },
      { type: "text", text: " for code." },
    ]);
  });

  it("handles URLs with balanced parentheses like Wikipedia", () => {
    const text = "Read [Wikipedia](https://en.wikipedia.org/wiki/DeepSeek_(company)) article.";
    expect(parseAnnouncementMessage(text)).toEqual([
      { type: "text", text: "Read " },
      {
        type: "link",
        text: "Wikipedia",
        href: "https://en.wikipedia.org/wiki/DeepSeek_(company)",
      },
      { type: "text", text: " article." },
    ]);
  });

  it("parses bare http/https URLs and excludes trailing punctuation", () => {
    const text = "Visit https://deepseek.com for info. Also see https://github.com!";
    expect(parseAnnouncementMessage(text)).toEqual([
      { type: "text", text: "Visit " },
      {
        type: "link",
        text: "https://deepseek.com",
        href: "https://deepseek.com",
      },
      { type: "text", text: " for info. Also see " },
      {
        type: "link",
        text: "https://github.com",
        href: "https://github.com",
      },
      { type: "text", text: "!" },
    ]);
  });

  it("prioritizes inline code over URLs and markdown formatting", () => {
    const text = "Use `https://example.com` or `[not a link](https://test.com)` in terminal.";
    expect(parseAnnouncementMessage(text)).toEqual([
      { type: "text", text: "Use " },
      { type: "code", text: "https://example.com" },
      { type: "text", text: " or " },
      { type: "code", text: "[not a link](https://test.com)" },
      { type: "text", text: " in terminal." },
    ]);
  });

  it("does not parse dangerous protocols like javascript: or data: as links", () => {
    const text = "Click [here](javascript:alert(1)) or [download](data:text/html,abc)";
    // Should be treated as normal text because scheme is not http/https
    expect(parseAnnouncementMessage(text)).toEqual([
      { type: "text", text: "Click [here](javascript:alert(1)) or [download](data:text/html,abc)" },
    ]);
  });

  it("parses bold, italic, and inline code without confusing arithmetic asterisks", () => {
    const text = "5 * 4 * 3 is math, but **bold**, *italic*, and `code` are formatted.";
    expect(parseAnnouncementMessage(text)).toEqual([
      { type: "text", text: "5 * 4 * 3 is math, but " },
      { type: "bold", text: "bold" },
      { type: "text", text: ", " },
      { type: "italic", text: "italic" },
      { type: "text", text: ", and " },
      { type: "code", text: "code" },
      { type: "text", text: " are formatted." },
    ]);
  });

  it("parses combined markdown tokens properly", () => {
    const text = "Better DeepSeek hit 512 stars on [GitHub](https://github.com/EdgeTypE/better-deepseek)! Try **Expert** mode with `DeepSeek V4`.";
    const tokens = parseAnnouncementMessage(text);
    expect(tokens).toEqual([
      { type: "text", text: "Better DeepSeek hit 512 stars on " },
      {
        type: "link",
        text: "GitHub",
        href: "https://github.com/EdgeTypE/better-deepseek",
      },
      { type: "text", text: "! Try " },
      { type: "bold", text: "Expert" },
      { type: "text", text: " mode with " },
      { type: "code", text: "DeepSeek V4" },
      { type: "text", text: "." },
    ]);
  });
});
