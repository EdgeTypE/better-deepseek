// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../scanner.js", () => ({
  collectMessageNodes: vi.fn(),
  detectMessageRole: vi.fn(),
}));

vi.mock("../dom/message-text.js", () => ({
  extractMessageMarkdown: vi.fn(),
}));

describe("exporter helpers", () => {
  beforeEach(() => {
    document.title = "Project Chat - DeepSeek";
  });

  it("collects messages using scanner and markdown extraction", async () => {
    const scanner = await import("../scanner.js");
    const messageText = await import("../dom/message-text.js");
    const { collectMessages } = await import("./exporter.js");

    const first = document.createElement("div");
    const second = document.createElement("div");

    scanner.collectMessageNodes.mockReturnValue([first, second]);
    scanner.detectMessageRole
      .mockReturnValueOnce("user")
      .mockReturnValueOnce("assistant");
    messageText.extractMessageMarkdown
      .mockReturnValueOnce("hello")
      .mockReturnValueOnce("world");

    expect(collectMessages()).toEqual([
      { role: "user", content: "hello" },
      { role: "assistant", content: "world" },
    ]);
  });

  it("formats markdown with title and assistant sections", async () => {
    const { formatMarkdown } = await import("./exporter.js");
    const result = formatMarkdown([
      { role: "user", content: "Question" },
      { role: "assistant", content: "Answer" },
    ]);

    expect(result).toContain("# Project Chat");
    expect(result).toContain("### User");
    expect(result).toContain("### Assistant");
  });

  it("formats markdown-ish html for pdf export", async () => {
    const { formatContentForHtml } = await import("./exporter.js");
    const html = formatContentForHtml("# Title\n\n`code`\n\n- item");

    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<code>code</code>");
    expect(html).toContain("<li>item</li>");
  });
});
