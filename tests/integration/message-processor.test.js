// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import state from "../../src/content/state.js";
import { resetAppState } from "../helpers/app-state.js";

const mocks = vi.hoisted(() => ({
  detectMessageRole: vi.fn((node) => node.dataset.role || "assistant"),
  isLatestAssistantMessage: vi.fn((node) => node.dataset.latest === "1"),
  isAbsoluteLastMessage: vi.fn((node) => node.dataset.absoluteLast === "1"),
  scheduleScan: vi.fn(),
  collectMessageNodes: vi.fn(() => []),
  extractMessageRawText: vi.fn((node) => node.dataset.rawText || ""),
  injectPythonRunButtons: vi.fn(),
  injectJavaScriptRunButtons: vi.fn(),
  upsertMemories: vi.fn(),
  upsertCharacters: vi.fn(),
  collectLongWorkFiles: vi.fn(),
  finalizeLongWork: vi.fn(),
  emitZipForFiles: vi.fn(),
  emitStandaloneFiles: vi.fn(),
  handleAutoWebFetch: vi.fn(),
  handleAutoGitHubFetch: vi.fn(),
  handleAutoTwitterFetch: vi.fn(),
  handleAutoYouTubeFetch: vi.fn(),
  mount: vi.fn((component, { target, props }) => {
    const marker = document.createElement("div");
    marker.className = "mock-overlay";
    marker.textContent = props.text || "";
    target.appendChild(marker);
    return { component, props, target };
  }),
  unmount: vi.fn(),
}));

vi.mock("../../src/content/scanner.js", () => ({
  detectMessageRole: mocks.detectMessageRole,
  isLatestAssistantMessage: mocks.isLatestAssistantMessage,
  isAbsoluteLastMessage: mocks.isAbsoluteLastMessage,
  scheduleScan: mocks.scheduleScan,
  collectMessageNodes: mocks.collectMessageNodes,
}));
vi.mock("../../src/content/dom/message-text.js", async () => {
  const actual = await vi.importActual("../../src/content/dom/message-text.js");
  return { ...actual, extractMessageRawText: mocks.extractMessageRawText };
});
vi.mock("../../src/content/dom/python-injector.js", () => ({
  injectPythonRunButtons: mocks.injectPythonRunButtons,
}));
vi.mock("../../src/content/dom/javascript-injector.js", () => ({
  injectJavaScriptRunButtons: mocks.injectJavaScriptRunButtons,
}));
vi.mock("../../src/content/parser/memory-parser.js", async () => {
  const actual = await vi.importActual("../../src/content/parser/memory-parser.js");
  return { ...actual, upsertMemories: mocks.upsertMemories };
});
vi.mock("../../src/content/parser/character-parser.js", () => ({
  upsertCharacters: mocks.upsertCharacters,
}));
vi.mock("../../src/content/files/long-work.js", () => ({
  collectLongWorkFiles: mocks.collectLongWorkFiles,
  finalizeLongWork: mocks.finalizeLongWork,
  emitZipForFiles: mocks.emitZipForFiles,
}));
vi.mock("../../src/content/files/standalone.js", () => ({
  emitStandaloneFiles: mocks.emitStandaloneFiles,
}));
vi.mock("../../src/content/auto.js", () => ({
  handleAutoWebFetch: mocks.handleAutoWebFetch,
  handleAutoGitHubFetch: mocks.handleAutoGitHubFetch,
  handleAutoTwitterFetch: mocks.handleAutoTwitterFetch,
  handleAutoYouTubeFetch: mocks.handleAutoYouTubeFetch,
}));
vi.mock("svelte", async () => {
  const actual = await vi.importActual("svelte");
  return { ...actual, mount: mocks.mount, unmount: mocks.unmount };
});

import { processMessageNode } from "../../src/content/message-processor.svelte.js";

function createMessageNode(rawText, role = "assistant") {
  const node = document.createElement("div");
  node.className = "ds-message";
  node.dataset.role = role;
  node.dataset.latest = "1";
  node.dataset.absoluteLast = "1";
  node.dataset.rawText = rawText;
  const markdown = document.createElement("div");
  markdown.className = "ds-markdown";
  markdown.innerHTML = rawText
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  node.appendChild(markdown);
  document.body.appendChild(node);
  return node;
}

describe("message processor integration", () => {
  beforeEach(() => {
    resetAppState();
    Object.values(mocks).forEach((mock) => {
      if (typeof mock?.mockReset === "function") mock.mockReset();
    });
    mocks.detectMessageRole.mockImplementation((node) => node.dataset.role || "assistant");
    mocks.isLatestAssistantMessage.mockImplementation((node) => node.dataset.latest === "1");
    mocks.isAbsoluteLastMessage.mockImplementation((node) => node.dataset.absoluteLast === "1");
    mocks.collectMessageNodes.mockImplementation(() => []);
    mocks.extractMessageRawText.mockImplementation((node) => node.dataset.rawText || "");
    mocks.mount.mockImplementation((component, { target, props }) => {
      const marker = document.createElement("div");
      marker.className = "mock-overlay";
      marker.textContent = props.text || "";
      target.appendChild(marker);
      return { component, props, target };
    });
    document.body.innerHTML = "";
    vi.useFakeTimers();
  });

  it("renders tool overlays and hides native assistant content", () => {
    const node = createMessageNode(
      "Intro\n<BDS:VISUALIZER><div>viz</div></BDS:VISUALIZER>",
    );

    processMessageNode(node);

    expect(mocks.mount).toHaveBeenCalledOnce();
    const props = mocks.mount.mock.calls[0][1].props;
    expect(props.text).toBe("Intro");
    expect(props.blocks[0].name).toBe("visualizer");
    expect(node.querySelector(".ds-markdown").classList.contains("bds-hidden-message")).toBe(true);
  });

  it("updates an existing tool overlay without mounting a duplicate", () => {
    const node = createMessageNode(
      "Intro\n<BDS:VISUALIZER><div>viz</div></BDS:VISUALIZER>",
    );

    processMessageNode(node);
    node.dataset.rawText = "Updated intro\n<BDS:VISUALIZER><div>viz</div></BDS:VISUALIZER>";
    processMessageNode(node);

    expect(mocks.mount).toHaveBeenCalledOnce();
    expect(mocks.mount.mock.calls[0][1].props.text).toBe("Updated intro");
    expect(document.querySelectorAll(".mock-overlay")).toHaveLength(1);
  });

  it("removes stale DOM overlays before mounting a replacement", () => {
    const node = createMessageNode(
      "Intro\n<BDS:VISUALIZER><div>viz</div></BDS:VISUALIZER>",
    );
    const wrapper = document.createElement("div");
    wrapper.className = "bds-host-wrapper";
    const host = document.createElement("div");
    host.className = "bds-overlay-host";
    const staleOverlay = document.createElement("div");
    staleOverlay.className = "bds-message-overlay";
    staleOverlay.textContent = "stale duplicate";
    host.appendChild(staleOverlay);
    wrapper.appendChild(host);
    node.insertAdjacentElement("afterend", wrapper);

    processMessageNode(node);

    expect(document.querySelector(".bds-message-overlay")).toBeNull();
    expect(document.querySelectorAll(".mock-overlay")).toHaveLength(1);
  });

  it("collects standalone files outside long work", () => {
    const node = createMessageNode(
      '<BDS:create_file fileName="README.md">```markdown\n# Demo\n```</BDS:create_file>',
    );

    processMessageNode(node);

    expect(mocks.emitStandaloneFiles).toHaveBeenCalledWith(
      node,
      [{ fileName: "README.md", content: "# Demo" }],
    );
  });

  it("buffers long work files as soon as a long work block appears", () => {
    const node = createMessageNode(
      '<BDS:LONG_WORK><BDS:create_file fileName="src/app.js">```javascript\nconsole.log(1)\n```</BDS:create_file>',
    );

    processMessageNode(node);

    expect(state.longWork.active).toBe(true);
    expect(mocks.collectLongWorkFiles).toHaveBeenCalledOnce();
    expect(mocks.mount.mock.calls[0][1].props.loading).toBe(true);
  });

  it("upserts memories and characters from assistant output", () => {
    const node = createMessageNode(
      '<BDS:memory_write key_name="user_name" value="Alex" importance="always" />' +
        '<BDS:character_create name="Mage">wise</BDS:character_create>',
    );

    processMessageNode(node);

    expect(mocks.upsertMemories).toHaveBeenCalledWith([
      { key: "user_name", value: "Alex", importance: "always" },
    ]);
    expect(mocks.upsertCharacters).toHaveBeenCalledWith([
      { name: "Mage", usage: "", content: "wise" },
    ]);
  });

  it("fires AUTO handlers only for the absolute last settled message", () => {
    const node = createMessageNode(
      "<BDS:AUTO:REQUEST_WEB_FETCH>https://example.com</BDS:AUTO:REQUEST_WEB_FETCH>",
    );

    processMessageNode(node);
    vi.advanceTimersByTime(3000);
    processMessageNode(node);

    expect(mocks.handleAutoWebFetch).toHaveBeenCalledWith("https://example.com");
  });

  it("dispatches clarifying questions and stores them on state", () => {
    const node = createMessageNode(
      '<BDS:ask_question>[{"id":"q1","question":"Pick one","type":"test","options":["A"]}]</BDS:ask_question>',
    );
    const listener = vi.fn();
    window.addEventListener("bds-ask-questions", listener, { once: true });

    processMessageNode(node);
    vi.advanceTimersByTime(3000);
    processMessageNode(node);

    expect(state.activeQuestions).toHaveLength(1);
    expect(listener).toHaveBeenCalledOnce();
  });

  it("removes injected BetterDeepSeek blocks from user messages", () => {
    const node = createMessageNode(
      "<BetterDeepSeek>Hidden</BetterDeepSeek>\nVisible text",
      "user",
    );

    processMessageNode(node);

    expect(node.querySelector(".ds-markdown").textContent).toContain("Visible text");
    expect(node.querySelector(".ds-markdown").textContent).not.toContain("Hidden");
  });

  it("speaks the latest settled assistant response once in voice mode", () => {
    const speak = vi.fn();
    window.speechSynthesis = {
      cancel: vi.fn(),
      getVoices: () => [{ lang: "en-US" }],
      speak,
    };
    state.settings.voiceMode = true;
    const node = createMessageNode("Hello there");

    processMessageNode(node);
    vi.advanceTimersByTime(3000);
    processMessageNode(node);

    expect(speak).toHaveBeenCalledOnce();
    expect(speak.mock.calls[0][0].text).toBe("Hello there");
  });
});
