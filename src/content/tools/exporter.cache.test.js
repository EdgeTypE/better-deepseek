// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./history-cache.js", () => ({
  readCachedMessages: vi.fn(),
}));

vi.mock("../scanner.js", () => ({
  collectMessageNodes: vi.fn(),
  detectMessageRole: vi.fn(),
}));

vi.mock("../dom/message-text.js", () => ({
  extractMessageMarkdown: vi.fn(),
  extractMessageRawText: vi.fn(),
}));

vi.mock("../load-all-history.js", () => ({
  loadAllHistory: vi.fn(),
  isLoadInProgress: vi.fn(),
}));

vi.mock("../../lib/utils/download.js", () => ({
  triggerTextDownload: vi.fn(),
  triggerBlobDownload: vi.fn(),
}));

vi.mock("html2canvas", () => ({ default: vi.fn() }));

import state from "../state.js";
import { exportSession } from "./exporter.js";
import { readCachedMessages } from "./history-cache.js";
import { collectMessageNodes, detectMessageRole } from "../scanner.js";
import { extractMessageMarkdown } from "../dom/message-text.js";
import { triggerTextDownload } from "../../lib/utils/download.js";
import { loadAllHistory } from "../load-all-history.js";

function cachedMessage(id, role, content) {
  return {
    message_id: id,
    role: role === "assistant" ? "ASSISTANT" : "USER",
    fragments: [{ type: role === "assistant" ? "RESPONSE" : "REQUEST", content }],
  };
}

function hit(messages) {
  return { status: "hit", chatMessages: messages };
}

describe("exportSession — IndexedDB cache source", () => {
  beforeEach(() => {
    document.title = "Cache Chat - DeepSeek";
    window.history.replaceState(null, "", "/chat/s/test-session");
    state.settings.loadAllHistoryOnSession = false;
  });

  it("uses the cache when it holds the full session", async () => {
    readCachedMessages.mockResolvedValue(
      hit([cachedMessage(1, "user", "cached user"), cachedMessage(2, "assistant", "cached assistant")])
    );
    collectMessageNodes.mockReturnValue([document.createElement("div")]);

    await exportSession("markdown");

    expect(readCachedMessages).toHaveBeenCalledWith(
      "test-session",
      expect.objectContaining({ waitMs: expect.any(Number) })
    );
    const [markdown] = triggerTextDownload.mock.calls[0];
    expect(markdown).toContain("cached user");
    expect(markdown).toContain("cached assistant");
    expect(extractMessageMarkdown).not.toHaveBeenCalled();
  });

  it("prefers the cache over the API when both are available", async () => {
    state.settings.loadAllHistoryOnSession = true;
    readCachedMessages.mockResolvedValue(hit([cachedMessage(1, "user", "cached user")]));
    collectMessageNodes.mockReturnValue([document.createElement("div")]);
    loadAllHistory.mockResolvedValue([cachedMessage(1, "user", "api user")]);

    await exportSession("markdown");

    expect(loadAllHistory).not.toHaveBeenCalled();
    const [markdown] = triggerTextDownload.mock.calls[0];
    expect(markdown).toContain("cached user");
    expect(markdown).not.toContain("api user");
  });

  it("falls back to the API when the cache misses", async () => {
    state.settings.loadAllHistoryOnSession = true;
    readCachedMessages.mockResolvedValue({ status: "unavailable" });
    loadAllHistory.mockResolvedValue([cachedMessage(1, "user", "api user")]);

    await exportSession("markdown");

    expect(loadAllHistory).toHaveBeenCalled();
    const [markdown] = triggerTextDownload.mock.calls[0];
    expect(markdown).toContain("api user");
  });

  it("falls back to the DOM when the cache is unavailable", async () => {
    readCachedMessages.mockResolvedValue({ status: "unavailable" });

    const node = document.createElement("div");
    collectMessageNodes.mockReturnValue([node]);
    detectMessageRole.mockReturnValue("user");
    extractMessageMarkdown.mockReturnValue("dom message");

    await exportSession("markdown");

    expect(extractMessageMarkdown).toHaveBeenCalledWith(node);
    const [markdown] = triggerTextDownload.mock.calls[0];
    expect(markdown).toContain("dom message");
  });

  it("prefers the DOM when the cache is shorter than the rendered messages", async () => {
    readCachedMessages.mockResolvedValue(hit([cachedMessage(1, "user", "stale cached")]));
    collectMessageNodes.mockReturnValue([document.createElement("div"), document.createElement("div")]);
    detectMessageRole.mockReturnValue("user");
    extractMessageMarkdown.mockReturnValueOnce("dom one").mockReturnValueOnce("dom two");

    await exportSession("markdown");

    expect(extractMessageMarkdown).toHaveBeenCalledTimes(2);
    const [markdown] = triggerTextDownload.mock.calls[0];
    expect(markdown).toContain("dom one");
    expect(markdown).toContain("dom two");
    expect(markdown).not.toContain("stale cached");
  });

  it("skips the cache for DOM-scoped selection ids", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    collectMessageNodes.mockReturnValue([]);

    await exportSession("markdown", ["msg-abc123"]);

    expect(readCachedMessages).not.toHaveBeenCalled();
    expect(triggerTextDownload).not.toHaveBeenCalled();
  });

  it("matches selection ids against numeric cached message ids", async () => {
    readCachedMessages.mockResolvedValue(
      hit([cachedMessage(1, "user", "cached user"), cachedMessage(2, "assistant", "cached assistant")])
    );

    await exportSession("markdown", ["2"]);

    const [markdown] = triggerTextDownload.mock.calls[0];
    expect(markdown).toContain("cached assistant");
    expect(markdown).not.toContain("cached user");
  });

  it("strips BDS control blocks from cached user messages", async () => {
    const rawUser = [
      "<BetterDeepSeek>secret system prompt</BetterDeepSeek>",
      "Explain closures.",
      "<BDS:memory_calls>",
      '{"save":true}',
      "</BDS:memory_calls>",
    ].join("\n");
    readCachedMessages.mockResolvedValue(hit([cachedMessage(1, "user", rawUser)]));
    collectMessageNodes.mockReturnValue([document.createElement("div")]);

    await exportSession("markdown");

    const [markdown] = triggerTextDownload.mock.calls[0];
    expect(markdown).toContain("Explain closures.");
    expect(markdown).not.toContain("BetterDeepSeek");
    expect(markdown).not.toContain("secret system prompt");
    expect(markdown).not.toContain("memory_calls");
  });
});
