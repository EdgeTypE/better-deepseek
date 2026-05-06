// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import state from "../../src/content/state.js";
import { resetAppState } from "../helpers/app-state.js";

const readerMocks = vi.hoisted(() => ({
  fetchAndConvertWebPage: vi.fn(),
  fetchGitHubRepo: vi.fn(),
  fetchTwitterTweet: vi.fn(),
  fetchYouTubeData: vi.fn(),
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
});
