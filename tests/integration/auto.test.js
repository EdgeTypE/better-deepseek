// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import state from "../../src/content/state.js";
import { resetAppState } from "../helpers/app-state.js";

const readerMocks = vi.hoisted(() => ({
  fetchAndConvertWebPage: vi.fn(),
  fetchGitHubRepo: vi.fn(),
  fetchTwitterTweet: vi.fn(),
  fetchYouTubeData: vi.fn(),
  searchWeb: vi.fn(),
}));

vi.mock("../../src/content/files/web-reader.js", () => ({
  fetchAndConvertWebPage: readerMocks.fetchAndConvertWebPage,
}));
vi.mock("../../src/content/files/github-reader.js", () => ({
  fetchGitHubRepo: readerMocks.fetchGitHubRepo,
}));
vi.mock("../../src/content/files/twitter-reader.js", () => ({
  fetchTwitterTweet: readerMocks.fetchTwitterTweet,
}));
vi.mock("../../src/content/files/youtube-reader.js", () => ({
  fetchYouTubeData: readerMocks.fetchYouTubeData,
}));
vi.mock("../../src/content/files/search-reader.js", () => ({
  searchWeb: readerMocks.searchWeb,
}));

function setupAutoDom() {
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

describe("auto integration", () => {
  beforeEach(() => {
    resetAppState();
    setupAutoDom();
    vi.useFakeTimers();
    Object.values(readerMocks).forEach((mock) => mock.mockReset());
  });

  it("fetches a web page and injects the returned file once", async () => {
    const file = new File(["page"], "page.txt", { type: "text/plain" });
    readerMocks.fetchAndConvertWebPage.mockResolvedValue(file);
    const { handleAutoWebFetch } = await importAutoModule();

    await handleAutoWebFetch("https://example.com");
    await vi.advanceTimersByTimeAsync(600);

    const input = document.querySelector('input[type="file"]');
    const editor = document.querySelector("#chat-input");
    const sendButton = document.querySelector("button");

    expect(readerMocks.fetchAndConvertWebPage).toHaveBeenCalledOnce();
    expect(input.files).toHaveLength(1);
    expect(editor.value).toContain("Web Fetch Result");
    expect(sendButton.click).toHaveBeenCalledOnce();
  });

  it("normalizes markdown links before fetching a web page", async () => {
    const file = new File(["page"], "page.txt", { type: "text/plain" });
    readerMocks.fetchAndConvertWebPage.mockResolvedValue(file);
    const { handleAutoWebFetch } = await importAutoModule();

    await handleAutoWebFetch("[Example](https://example.com/page)");

    expect(readerMocks.fetchAndConvertWebPage).toHaveBeenCalledWith(
      "https://example.com/page",
      expect.any(Function),
    );
  });

  it("injects pure text and sends it through the chat input", async () => {
    const { injectPureTextAndSend } = await importAutoModule();

    injectPureTextAndSend("Deep Research approval prompt");
    await vi.advanceTimersByTimeAsync(600);

    expect(document.querySelector("#chat-input").value).toBe("Deep Research approval prompt");
    expect(document.querySelector("button").click).toHaveBeenCalledOnce();
  });

  it("sets contenteditable chat input text through the shared editor helper", async () => {
    document.body.innerHTML = '<div contenteditable="true"></div>';
    const editor = document.querySelector('[contenteditable="true"]');
    const inputListener = vi.fn();
    editor.addEventListener("input", inputListener);
    const { setChatInputText } = await importAutoModule();

    expect(setChatInputText("Revision request")).toBe(true);

    expect(editor.textContent).toBe("Revision request");
    expect(inputListener).toHaveBeenCalled();
  });

  it("sets plaintext-only contenteditable chat input text", async () => {
    document.body.innerHTML = '<div role="textbox" contenteditable="plaintext-only"></div>';
    const editor = document.querySelector('[role="textbox"]');
    const inputListener = vi.fn();
    editor.addEventListener("input", inputListener);
    const { setChatInputText } = await importAutoModule();

    expect(setChatInputText("Revision request")).toBe(true);

    expect(editor.textContent).toBe("Revision request");
    expect(inputListener).toHaveBeenCalled();
  });

  it("ignores BDS panel textareas when choosing the chat input", async () => {
    document.body.innerHTML = `
      <div class="ds-textarea">
        <div role="textbox" contenteditable="plaintext-only"></div>
        <div class="bds-dr-revision-panel">
          <textarea placeholder="Describe what should change"></textarea>
        </div>
      </div>
    `;
    const editor = document.querySelector('[role="textbox"]');
    const panelTextarea = document.querySelector(".bds-dr-revision-panel textarea");
    const { setChatInputText } = await importAutoModule();

    expect(setChatInputText("Revision request")).toBe(true);

    expect(editor.textContent).toBe("Revision request");
    expect(panelTextarea.value).toBe("");
  });

  it("sets ProseMirror-style contenteditable chat input as paragraphs", async () => {
    document.body.innerHTML = '<div class="ProseMirror" contenteditable="true"><p><br></p></div>';
    const editor = document.querySelector(".ProseMirror");
    const beforeInputListener = vi.fn();
    const inputListener = vi.fn();
    editor.addEventListener("beforeinput", beforeInputListener);
    editor.addEventListener("input", inputListener);
    const { setChatInputText } = await importAutoModule();

    expect(setChatInputText("Line one\nLine two")).toBe(true);

    expect(Array.from(editor.querySelectorAll("p")).map((p) => p.textContent)).toEqual([
      "Line one",
      "Line two",
    ]);
    expect(beforeInputListener).toHaveBeenCalled();
    expect(inputListener).toHaveBeenCalled();
  });

  it("creates an error attachment when github fetch fails", async () => {
    readerMocks.fetchGitHubRepo.mockRejectedValue(new Error("boom"));
    const { handleAutoGitHubFetch } = await importAutoModule();
    const freshState = (await import("../../src/content/state.js")).default;
    freshState.settings.githubToken = "ghp_secret";

    await handleAutoGitHubFetch("owner/repo");
    await vi.advanceTimersByTimeAsync(600);

    const input = document.querySelector('input[type="file"]');
    expect(readerMocks.fetchGitHubRepo).toHaveBeenCalledWith(
      "owner/repo",
      expect.any(Function),
      { token: "ghp_secret" },
    );
    expect(input.files[0].name).toContain("github_error_owner_repo");
  });

  it("prevents duplicate auto requests for the same url", async () => {
    readerMocks.fetchTwitterTweet.mockResolvedValue(
      new File(["tweet"], "tweet.md", { type: "text/markdown" }),
    );
    const { handleAutoTwitterFetch } = await importAutoModule();

    await handleAutoTwitterFetch("https://x.com/post/1");
    await handleAutoTwitterFetch("https://x.com/post/1");

    expect(readerMocks.fetchTwitterTweet).toHaveBeenCalledOnce();
  });

  it("injects youtube files and triggers send", async () => {
    readerMocks.fetchYouTubeData.mockResolvedValue(
      new File(["video"], "video.txt", { type: "text/plain" }),
    );
    const { handleAutoYouTubeFetch } = await importAutoModule();

    await handleAutoYouTubeFetch("https://youtu.be/demo");
    await vi.advanceTimersByTimeAsync(600);

    expect(document.querySelector('input[type="file"]').files).toHaveLength(1);
    expect(document.querySelector("button").click).toHaveBeenCalledOnce();
  });

  it("searches and injects the returned file once", async () => {
    const file = new File(["# Search Results"], "query.md", { type: "text/markdown" });
    readerMocks.searchWeb.mockResolvedValue({
      file,
      results: [{ title: "R1", url: "https://a.com", snippet: "snippet" }],
      query: "test query",
      deepFetch: 3,
    });
    const { handleAutoSearch } = await importAutoModule();

    await handleAutoSearch("test query", 3);
    await vi.advanceTimersByTimeAsync(600);

    const input = document.querySelector('input[type="file"]');
    const editor = document.querySelector("#chat-input");
    const sendButton = document.querySelector("button");

    expect(readerMocks.searchWeb).toHaveBeenCalledWith("test query", 3, expect.any(Function));
    expect(input.files).toHaveLength(1);
    expect(editor.value).toContain("Search Result");
    expect(editor.value).toContain("[BDS:AUTO_SEARCH_RESULT]");
    expect(editor.value).toContain("[/BDS:AUTO_SEARCH_RESULT]");
    expect(sendButton.click).toHaveBeenCalledOnce();
  });

  it("prevents duplicate auto search requests for the same query", async () => {
    readerMocks.searchWeb.mockResolvedValue({
      file: new File(["results"], "q.md", { type: "text/markdown" }),
      results: [],
      query: "same query",
      deepFetch: 0,
    });
    const { handleAutoSearch } = await importAutoModule();

    await handleAutoSearch("same query");
    await handleAutoSearch("same query");

    expect(readerMocks.searchWeb).toHaveBeenCalledOnce();
  });

  it("creates an error attachment when search fails", async () => {
    readerMocks.searchWeb.mockRejectedValue(new Error("search error"));
    const { handleAutoSearch } = await importAutoModule();

    await handleAutoSearch("bad query");
    await vi.advanceTimersByTimeAsync(600);

    const input = document.querySelector('input[type="file"]');
    expect(input.files[0].name).toContain("search_error_bad_query");
  });
});
