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

    const sendResult = injectPureTextAndSend("Deep Research approval prompt");
    await vi.advanceTimersByTimeAsync(600);

    expect(document.querySelector("#chat-input").value).toBe("Deep Research approval prompt");
    expect(document.querySelector("button").click).toHaveBeenCalledOnce();
    await expect(sendResult).resolves.toBe(true);
  });

  it("keeps retrying file-backed transition sends after attachment readiness is delayed", async () => {
    const sendButton = document.querySelector("button");
    sendButton.setAttribute("aria-disabled", "true");

    const { sendFileWithMessage } = await importAutoModule();
    const sendResult = sendFileWithMessage(
      new File(["# Evidence"], "evidence.md", { type: "text/markdown" }),
      "<BetterDeepSeek>\n[BDS:DEEP_RESEARCH] Step result\n</BetterDeepSeek>",
      "Deep Research step 2 result",
    );

    await vi.advanceTimersByTimeAsync(11_000);
    expect(sendButton.click).not.toHaveBeenCalled();

    sendButton.removeAttribute("aria-disabled");
    await vi.advanceTimersByTimeAsync(250);

    expect(sendButton.click).toHaveBeenCalledOnce();
    await expect(sendResult).resolves.toBe(true);
  });

  it("waits for DeepSeek role-button send controls while ds-button--disabled is present", async () => {
    document.body.innerHTML = `
      <div id="composer">
        <textarea id="chat-input"></textarea>
        <input type="file" multiple />
        <div
          role="button"
          id="send-arrow"
          class="ds-button ds-button--primary ds-button--filled ds-button--circle ds-button--disabled"
          style="--dsl-button-height: 34px;"
        >
          <div class="ds-button__background"></div>
          <div class="ds-button__icon ds-button__icon--last-child">
            <svg width="16" height="16" viewBox="0 0 16 16">
              <path d="M8.3125 0.981587C8.66767 1.0545 8.97902 1.20558 9.2627 1.43374C9.48724 1.61438 9.73029 1.85933 9.97949 2.10854L14.707 6.83608L13.293 8.25014L9 3.95717V15.0431H7V3.95717L2.70703 8.25014L1.29297 6.83608L6.02051 2.10854C6.26971 1.85933 6.51277 1.61438 6.7373 1.43374C6.97662 1.24126 7.28445 1.04542 7.6875 0.981587C7.8973 0.94841 8.1031 0.956564 8.3125 0.981587Z"></path>
            </svg>
          </div>
        </div>
      </div>
    `;
    const input = document.querySelector('input[type="file"]');
    Object.defineProperty(input, "files", {
      configurable: true,
      writable: true,
      value: [],
    });
    const send = document.querySelector("#send-arrow");
    send.click = vi.fn();

    const { sendFileWithMessage } = await importAutoModule();
    const sendResult = sendFileWithMessage(
      new File(["# Evidence"], "evidence.md", { type: "text/markdown" }),
      "<BetterDeepSeek>\n[BDS:DEEP_RESEARCH] Step result\n</BetterDeepSeek>",
      "Deep Research step result",
    );

    await vi.advanceTimersByTimeAsync(11_000);
    expect(send.click).not.toHaveBeenCalled();

    send.classList.remove("ds-button--disabled");
    await vi.advanceTimersByTimeAsync(250);

    expect(send.click).toHaveBeenCalledOnce();
    await expect(sendResult).resolves.toBe(true);
  });

  it("finds the DeepSeek send arrow after the editor even when mobile nesting exceeds composer-root depth", async () => {
    const deepEditor = Array.from({ length: 12 }, (_, index) => `<div class="editor-depth-${index}">`).join("");
    const closeDeepEditor = "</div>".repeat(12);
    document.body.innerHTML = `
      <div id="mobile-composer">
        <section id="editor-region">
          ${deepEditor}
            <textarea id="chat-input"></textarea>
            <input type="file" multiple />
          ${closeDeepEditor}
        </section>
        <section id="action-region">
          <button type="button" aria-label="Search"><svg><path d="M3 3h2v2"></path></svg></button>
          <div role="button" id="send-arrow" class="ds-button ds-button--primary ds-button--filled ds-button--circle">
            <div class="ds-button__icon">
              <svg width="16" height="16" viewBox="0 0 16 16">
                <path d="M8.3125 0.981587C8.66767 1.0545 8.97902 1.20558 9.2627 1.43374L14.707 6.83608L13.293 8.25014L9 3.95717V15.0431H7V3.95717L2.70703 8.25014L1.29297 6.83608L6.02051 2.10854C6.26971 1.85933 6.51277 1.61438 6.7373 1.43374C6.97662 1.24126 7.28445 1.04542 7.6875 0.981587C7.8973 0.94841 8.1031 0.956564 8.3125 0.981587Z"></path>
              </svg>
            </div>
          </div>
        </section>
      </div>
    `;
    const input = document.querySelector('input[type="file"]');
    Object.defineProperty(input, "files", {
      configurable: true,
      writable: true,
      value: [],
    });
    const search = document.querySelector('[aria-label="Search"]');
    const send = document.querySelector("#send-arrow");
    search.click = vi.fn();
    send.click = vi.fn();

    const { sendFileWithMessage } = await importAutoModule();
    const sendResult = sendFileWithMessage(
      new File(["# Evidence"], "evidence.md", { type: "text/markdown" }),
      "<BetterDeepSeek>\n[BDS:DEEP_RESEARCH] Step result\n</BetterDeepSeek>",
      "Deep Research step result",
    );
    await vi.advanceTimersByTimeAsync(600);

    expect(search.click).not.toHaveBeenCalled();
    expect(send.click).toHaveBeenCalledOnce();
    await expect(sendResult).resolves.toBe(true);
  });

  it("finds an icon-only composer send button when DeepSeek omits send labels", async () => {
    document.body.innerHTML = `
      <div class="composer-shell">
        <input type="file" multiple />
        <textarea id="chat-input"></textarea>
        <button type="button" aria-label="Attach"><svg><path d="M1 1h2v2"></path></svg></button>
        <button type="button" aria-label="Voice"><svg><path d="M2 2h2v2"></path></svg></button>
        <button type="button" class="deepseek-send-icon"><svg><path d="M10 18V6m0 0l-5 5m5-5l5 5"></path></svg></button>
      </div>
    `;
    const input = document.querySelector('input[type="file"]');
    Object.defineProperty(input, "files", {
      configurable: true,
      writable: true,
      value: [],
    });
    const buttons = Array.from(document.querySelectorAll("button"));
    buttons.forEach((button) => {
      button.click = vi.fn();
    });

    const { sendFileWithMessage } = await importAutoModule();
    const sendResult = sendFileWithMessage(
      new File(["# Evidence"], "evidence.md", { type: "text/markdown" }),
      "<BetterDeepSeek>\n[BDS:DEEP_RESEARCH] Step result\n</BetterDeepSeek>",
      "Deep Research step 2 result",
    );
    await vi.advanceTimersByTimeAsync(600);

    expect(buttons[0].click).not.toHaveBeenCalled();
    expect(buttons[1].click).not.toHaveBeenCalled();
    expect(buttons[2].click).toHaveBeenCalledOnce();
    await expect(sendResult).resolves.toBe(true);
  });

  it("sends pure text when the icon-only send button is outside the editor wrapper", async () => {
    document.body.innerHTML = `
      <div id="composer">
        <div id="editor-shell">
          <textarea id="chat-input"></textarea>
          <input type="file" multiple />
          <button type="button" aria-label="Attach"><svg><path d="M1 1h2v2"></path></svg></button>
        </div>
        <div id="prompt-actions">
          <button type="button" class="bds-deep-research-toggle"><svg><path d="M2 2h2v2"></path></svg></button>
          <button type="button" aria-label="Search"><svg><path d="M3 3h2v2"></path></svg></button>
        </div>
        <div id="send-cluster">
          <button type="button" id="send-arrow"><svg><path d="M10 18V6m0 0l-5 5m5-5l5 5"></path></svg></button>
        </div>
      </div>
    `;
    const input = document.querySelector('input[type="file"]');
    Object.defineProperty(input, "files", {
      configurable: true,
      writable: true,
      value: [],
    });
    const attach = document.querySelector('[aria-label="Attach"]');
    const search = document.querySelector('[aria-label="Search"]');
    const deepResearch = document.querySelector(".bds-deep-research-toggle");
    const send = document.querySelector("#send-arrow");
    [attach, search, deepResearch, send].forEach((button) => {
      button.click = vi.fn();
    });

    const { injectPureTextAndSend } = await importAutoModule();
    const sendResult = injectPureTextAndSend("<BetterDeepSeek>\n[BDS:AUTO] Text transition\n</BetterDeepSeek>");
    await vi.advanceTimersByTimeAsync(600);

    expect(attach.click).not.toHaveBeenCalled();
    expect(search.click).not.toHaveBeenCalled();
    expect(deepResearch.click).not.toHaveBeenCalled();
    expect(send.click).toHaveBeenCalledOnce();
    await expect(sendResult).resolves.toBe(true);
  });

  it("sends file-backed transitions when the native file input and send arrow are in sibling clusters", async () => {
    document.body.innerHTML = `
      <div id="composer">
        <div id="editor-shell">
          <textarea id="chat-input"></textarea>
          <input type="file" multiple />
          <button type="button" aria-label="Attach"><svg><path d="M1 1h2v2"></path></svg></button>
        </div>
        <div id="prompt-actions">
          <button type="button" class="bds-deep-research-toggle"><svg><path d="M2 2h2v2"></path></svg></button>
          <button type="button" aria-label="Search"><svg><path d="M3 3h2v2"></path></svg></button>
        </div>
        <div id="send-cluster">
          <button type="button" id="send-arrow"><svg><path d="M10 18V6m0 0l-5 5m5-5l5 5"></path></svg></button>
        </div>
      </div>
    `;
    const input = document.querySelector('input[type="file"]');
    Object.defineProperty(input, "files", {
      configurable: true,
      writable: true,
      value: [],
    });
    const attach = document.querySelector('[aria-label="Attach"]');
    const search = document.querySelector('[aria-label="Search"]');
    const deepResearch = document.querySelector(".bds-deep-research-toggle");
    const send = document.querySelector("#send-arrow");
    [attach, search, deepResearch, send].forEach((button) => {
      button.click = vi.fn();
    });

    const { sendFileWithMessage } = await importAutoModule();
    const sendResult = sendFileWithMessage(
      new File(["# Evidence"], "evidence.md", { type: "text/markdown" }),
      "<BetterDeepSeek>\n[BDS:DEEP_RESEARCH] Step result\n</BetterDeepSeek>",
      "Deep Research step result",
    );
    await vi.advanceTimersByTimeAsync(600);

    expect(input.files).toHaveLength(1);
    expect(attach.click).not.toHaveBeenCalled();
    expect(search.click).not.toHaveBeenCalled();
    expect(deepResearch.click).not.toHaveBeenCalled();
    expect(send.click).toHaveBeenCalledOnce();
    await expect(sendResult).resolves.toBe(true);
  });

  it("does not treat an unlabeled editor-shell icon as a successful send", async () => {
    document.body.innerHTML = `
      <div id="composer">
        <div id="editor-shell">
          <textarea id="chat-input"></textarea>
          <input type="file" multiple />
          <button type="button" id="unlabeled-upload"><svg><path d="M1 1h2v2"></path></svg></button>
        </div>
        <div id="prompt-actions">
          <button type="button" class="bds-deep-research-toggle"><svg><path d="M2 2h2v2"></path></svg></button>
          <button type="button" aria-label="Search"><svg><path d="M3 3h2v2"></path></svg></button>
        </div>
        <div id="send-cluster">
          <button type="button" id="send-arrow"><svg><path d="M20 4L4 12l16 8-4-8 4-8z"></path></svg></button>
        </div>
      </div>
    `;
    const input = document.querySelector('input[type="file"]');
    Object.defineProperty(input, "files", {
      configurable: true,
      writable: true,
      value: [],
    });
    const upload = document.querySelector("#unlabeled-upload");
    const search = document.querySelector('[aria-label="Search"]');
    const deepResearch = document.querySelector(".bds-deep-research-toggle");
    const send = document.querySelector("#send-arrow");
    [upload, search, deepResearch, send].forEach((button) => {
      button.click = vi.fn();
    });

    const { sendFileWithMessage } = await importAutoModule();
    const sendResult = sendFileWithMessage(
      new File(["# Evidence"], "evidence.md", { type: "text/markdown" }),
      "<BetterDeepSeek>\n[BDS:DEEP_RESEARCH] Step result\n</BetterDeepSeek>",
      "Deep Research step result",
    );
    await vi.advanceTimersByTimeAsync(600);

    expect(upload.click).not.toHaveBeenCalled();
    expect(search.click).not.toHaveBeenCalled();
    expect(deepResearch.click).not.toHaveBeenCalled();
    expect(send.click).toHaveBeenCalledOnce();
    await expect(sendResult).resolves.toBe(true);
  });

  it("does not click an attachment-card expand icon that overlaps old send path matching", async () => {
    document.body.innerHTML = `
      <div id="composer">
        <textarea id="chat-input"></textarea>
        <input type="file" multiple />
        <div class="mobile-attachment-card">
          <button type="button" id="attachment-expand" aria-label="Expand attachment">
            <svg><path d="M12 19H5v-7M12 19l-8-8"></path></svg>
          </button>
        </div>
        <div id="prompt-actions">
          <button type="button" class="bds-deep-research-toggle"><svg><path d="M2 2h2v2"></path></svg></button>
          <button type="button" aria-label="Search"><svg><path d="M3 3h2v2"></path></svg></button>
        </div>
        <div id="send-cluster">
          <button type="button" id="send-arrow"><svg><path d="M10 18V6m0 0l-5 5m5-5l5 5"></path></svg></button>
        </div>
      </div>
    `;
    const input = document.querySelector('input[type="file"]');
    Object.defineProperty(input, "files", {
      configurable: true,
      writable: true,
      value: [],
    });
    const expand = document.querySelector("#attachment-expand");
    const search = document.querySelector('[aria-label="Search"]');
    const deepResearch = document.querySelector(".bds-deep-research-toggle");
    const send = document.querySelector("#send-arrow");
    [expand, search, deepResearch, send].forEach((button) => {
      button.click = vi.fn();
    });

    const { sendFileWithMessage } = await importAutoModule();
    const sendResult = sendFileWithMessage(
      new File(["# Evidence"], "evidence.md", { type: "text/markdown" }),
      "<BetterDeepSeek>\n[BDS:DEEP_RESEARCH] Step result\n</BetterDeepSeek>",
      "Deep Research step result",
    );
    await vi.advanceTimersByTimeAsync(600);

    expect(expand.click).not.toHaveBeenCalled();
    expect(search.click).not.toHaveBeenCalled();
    expect(deepResearch.click).not.toHaveBeenCalled();
    expect(send.click).toHaveBeenCalledOnce();
    await expect(sendResult).resolves.toBe(true);
  });

  it("does not click a header share icon that uses a send-like paper-plane path", async () => {
    document.body.innerHTML = `
      <button type="button" id="header-share" aria-label="Share">
        <svg><path d="M22 2L11 13"></path></svg>
      </button>
      <div id="composer">
        <textarea id="chat-input"></textarea>
        <input type="file" multiple />
        <div id="send-cluster">
          <button type="button" id="send-arrow"><svg><path d="M10 18V6m0 0l-5 5m5-5l5 5"></path></svg></button>
        </div>
      </div>
    `;
    const input = document.querySelector('input[type="file"]');
    Object.defineProperty(input, "files", {
      configurable: true,
      writable: true,
      value: [],
    });
    const share = document.querySelector("#header-share");
    const send = document.querySelector("#send-arrow");
    [share, send].forEach((button) => {
      button.click = vi.fn();
    });

    const { sendFileWithMessage } = await importAutoModule();
    const sendResult = sendFileWithMessage(
      new File(["# Evidence"], "evidence.md", { type: "text/markdown" }),
      "<BetterDeepSeek>\n[BDS:DEEP_RESEARCH] Step result\n</BetterDeepSeek>",
      "Deep Research step result",
    );
    await vi.advanceTimersByTimeAsync(600);

    expect(share.click).not.toHaveBeenCalled();
    expect(send.click).toHaveBeenCalledOnce();
    await expect(sendResult).resolves.toBe(true);
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

    expect(readerMocks.searchWeb).toHaveBeenCalledWith("test query", 3, expect.any(Function), {});
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

  it("treats metadata-bearing searches as distinct dedupe keys", async () => {
    readerMocks.searchWeb.mockResolvedValue({
      file: new File(["results"], "q.md", { type: "text/markdown" }),
      results: [],
      query: "same query",
      deepFetch: 0,
      rawResultCount: 0,
    });
    const { handleAutoSearch } = await importAutoModule();

    await handleAutoSearch("same query", 0, { purpose: "overview", sourceType: "general" });
    await handleAutoSearch("same query", 0, { purpose: "overview", sourceType: "docs" });

    expect(readerMocks.searchWeb).toHaveBeenCalledTimes(2);
    expect(readerMocks.searchWeb).toHaveBeenNthCalledWith(
      1,
      "same query",
      0,
      expect.any(Function),
      { purpose: "overview", sourceType: "general" }
    );
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
