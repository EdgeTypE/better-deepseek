// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetAppState } from "../helpers/app-state.js";

const readerMocks = vi.hoisted(() => ({
  searchWeb: vi.fn(),
}));

vi.mock("../../src/content/files/search-reader.js", () => ({
  searchWeb: readerMocks.searchWeb,
}));

vi.mock("../../src/content/files/web-reader.js", () => ({
  fetchAndConvertWebPage: vi.fn(),
}));
vi.mock("../../src/content/files/github-reader.js", () => ({
  fetchGitHubRepo: vi.fn(),
}));
vi.mock("../../src/content/files/twitter-reader.js", () => ({
  fetchTwitterTweet: vi.fn(),
}));
vi.mock("../../src/content/files/youtube-reader.js", () => ({
  fetchYouTubeData: vi.fn(),
}));

function setupDom() {
  document.body.innerHTML = `
    <input type="file" multiple />
    <textarea id="chat-input"></textarea>
    <button title="Send message"></button>
  `;
  const input = document.querySelector('input[type="file"]');
  Object.defineProperty(input, "files", {
    configurable: true,
    writable: true,
    value: [],
  });
  const sendButton = document.querySelector("button");
  sendButton.click = vi.fn();
}

async function importAutoModule() {
  vi.resetModules();
  return await import("../../src/content/auto.js");
}

describe("Deep Research run-scoped search dedupe", () => {
  beforeEach(() => {
    resetAppState();
    setupDom();
    vi.useFakeTimers();
    readerMocks.searchWeb.mockReset();
  });

  it("allows same query in different runs", async () => {
    readerMocks.searchWeb.mockResolvedValue({
      query: "best laptops",
      deepFetch: 0,
      results: [{ title: "Test", url: "http://example.com", snippet: "..." }],
      file: new File(["test"], "search.md", { type: "text/plain" }),
    });

    const auto = await importAutoModule();

    await auto.handleAutoSearchForRun("best laptops", 0, "run1");
    await auto.handleAutoSearchForRun("best laptops", 0, "run2");

    expect(readerMocks.searchWeb).toHaveBeenCalledTimes(2);
  });

  it("deduplicates same query within same run", async () => {
    readerMocks.searchWeb.mockResolvedValue({
      query: "laptop reviews",
      deepFetch: 0,
      results: [],
      file: new File(["test"], "search.md", { type: "text/plain" }),
    });

    const auto = await importAutoModule();

    await auto.handleAutoSearchForRun("laptop reviews", 0, "run1");
    await auto.handleAutoSearchForRun("laptop reviews", 0, "run1");

    expect(readerMocks.searchWeb).toHaveBeenCalledTimes(1);
  });

  it("tracks queries per run via getRunSearchQueries", async () => {
    readerMocks.searchWeb.mockResolvedValue({
      query: "q1",
      deepFetch: 0,
      results: [],
      file: new File(["x"], "s.md", { type: "text/plain" }),
    });

    const auto = await importAutoModule();

    await auto.handleAutoSearchForRun("q1", 0, "runA");
    await auto.handleAutoSearchForRun("q2", 0, "runA");

    const queries = auto.getRunSearchQueries("runA");
    expect(queries).toBeDefined();
    expect(queries.has("q1")).toBe(true);
    expect(queries.has("q2")).toBe(true);
  });

  it("deduplicates by query plus metadata within the same run", async () => {
    readerMocks.searchWeb.mockResolvedValue({
      query: "q1",
      deepFetch: 0,
      results: [],
      file: new File(["x"], "s.md", { type: "text/plain" }),
    });

    const auto = await importAutoModule();

    await auto.handleAutoSearchForRun("q1", 0, "runMeta", { purpose: "overview", sourceType: "general" });
    await auto.handleAutoSearchForRun("q1", 0, "runMeta", { purpose: "overview", sourceType: "docs" });
    await auto.handleAutoSearchForRun("q1", 0, "runMeta", { purpose: "overview", sourceType: "docs" });

    expect(readerMocks.searchWeb).toHaveBeenCalledTimes(2);
  });

  it("clearRunSearchHistory removes run data", async () => {
    readerMocks.searchWeb.mockResolvedValue({
      query: "clear test",
      deepFetch: 0,
      results: [],
      file: new File(["x"], "s.md", { type: "text/plain" }),
    });

    const auto = await importAutoModule();

    await auto.handleAutoSearchForRun("clear test", 0, "runX");
    expect(auto.getRunSearchQueries("runX")).toBeDefined();

    auto.clearRunSearchHistory("runX");
    expect(auto.getRunSearchQueries("runX")).toBeUndefined();
  });

  it("falls back to global dedupe when runId is empty", async () => {
    readerMocks.searchWeb.mockResolvedValue({
      query: "global query",
      deepFetch: 0,
      results: [],
      file: new File(["x"], "s.md", { type: "text/plain" }),
    });

    const auto = await importAutoModule();

    await auto.handleAutoSearchForRun("global query", 0, "");
    await auto.handleAutoSearchForRun("global query", 0, "");

    // Global dedupe means second call is blocked
    expect(readerMocks.searchWeb).toHaveBeenCalledTimes(1);
  });

  it("includes runId in result payload", async () => {
    readerMocks.searchWeb.mockResolvedValue({
      query: "payload test",
      deepFetch: 0,
      results: [{ title: "R", url: "http://x.com", snippet: "s" }],
      file: new File(["data"], "search.md", { type: "text/plain" }),
    });

    const auto = await importAutoModule();
    await auto.handleAutoSearchForRun("payload test", 0, "runPayload");

    // Check textarea was updated with the result message containing runId
    await vi.advanceTimersByTimeAsync(600);
    const editor = document.querySelector("#chat-input");
    expect(editor.value).toContain("runPayload");
  });
});
