// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../scanner.js", () => ({
  collectMessageNodes: vi.fn(),
  detectMessageRole: vi.fn(),
}));

vi.mock("../dom/message-text.js", () => ({
  extractMessageMarkdown: vi.fn(),
}));

vi.mock("html2canvas", () => ({
  __esModule: true,
  default: vi.fn(),
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
      { role: "user", content: "hello", id: null, node: first, bdsCards: [] },
      { role: "assistant", content: "world", id: null, node: second, bdsCards: [] },
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

  it("extracts bds cards from dom nodes", async () => {
    const { extractBdsCards } = await import("./exporter.js");
    
    const node = document.createElement("div");
    node.innerHTML = `
      <div class="bds-visualizer-card">
        <header class="bds-visualizer-header">
          <h4>Custom Visualizer</h4>
          <p>Test Simulation</p>
        </header>
      </div>
    `;

    const cards = extractBdsCards(node);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toEqual({
      type: "visualizer",
      title: "Custom Visualizer",
      details: "Test Simulation"
    });
  });

  it("generates standalone html with bds cards", async () => {
    const { generateStandaloneHtml } = await import("./exporter.js");
    
    const messages = [
      { 
        role: "assistant", 
        content: "Here is the result", 
        bdsCards: [{ type: "visualizer", title: "My Chart", details: "Status: OK" }] 
      }
    ];

    // Correct order: (messages, title, dark)
    const html = generateStandaloneHtml(messages, "Test Chat", true);
    expect(html).toContain("Test Chat");
    expect(html).toContain("My Chart");
    expect(html).toContain("Status: OK");
    expect(html).toContain("bds-card visualizer");
  });

  it("exports to image using html2canvas", async () => {
    const html2canvas = (await import("html2canvas")).default;
    const { exportToImage } = await import("./exporter.js");

    const mockBlob = new Blob(["fake"], { type: "image/png" });
    const mockCanvas = {
      toBlob: vi.fn((cb) => cb(mockBlob)),
    };
    html2canvas.mockResolvedValue(mockCanvas);

    // triggerBlobDownload uses URL.createObjectURL + anchor click on non-Android
    URL.createObjectURL = vi.fn(() => "blob:fake-png");
    URL.revokeObjectURL = vi.fn();
    const linkClickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    const messages = [{ role: "user", content: "hello", bdsCards: [] }];
    await exportToImage(messages, "Test Title", true, "test-file");

    expect(html2canvas).toHaveBeenCalled();
    expect(mockCanvas.toBlob).toHaveBeenCalled();
    expect(linkClickSpy).toHaveBeenCalled();

    linkClickSpy.mockRestore();
  });
});
