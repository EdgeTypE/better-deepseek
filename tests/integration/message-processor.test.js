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
  handleAutoSearch: vi.fn(),
  handleAutoSearchForRun: vi.fn(),
  clearRunSearchHistory: vi.fn(),
  injectPureTextAndSend: vi.fn(() => true),
  sendFileWithMessage: vi.fn(() => Promise.resolve(true)),
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
  handleAutoSearch: mocks.handleAutoSearch,
  handleAutoSearchForRun: mocks.handleAutoSearchForRun,
  clearRunSearchHistory: mocks.clearRunSearchHistory,
  injectPureTextAndSend: mocks.injectPureTextAndSend,
  sendFileWithMessage: mocks.sendFileWithMessage,
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
    expect(props.text).toBe("Intro\n\x00BLOCK:0\x00");
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
    expect(mocks.mount.mock.calls[0][1].props.text).toBe("Updated intro\n\x00BLOCK:0\x00");
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
      [{ fileName: "README.md", content: "# Demo\n" }],
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

    expect(mocks.handleAutoWebFetch).toHaveBeenCalledWith("https://example.com/");
  });

  it("normalizes markdown links before firing AUTO web fetch", () => {
    const node = createMessageNode(
      "<BDS:AUTO:REQUEST_WEB_FETCH>[Example](https://example.com/page)</BDS:AUTO:REQUEST_WEB_FETCH>",
    );

    processMessageNode(node);
    vi.advanceTimersByTime(3000);
    processMessageNode(node);

    expect(mocks.handleAutoWebFetch).toHaveBeenCalledWith("https://example.com/page");
  });

  it("routes run-scoped AUTO search requests to the deep research handler", () => {
    const node = createMessageNode(
      '<BDS:AUTO:SEARCH runId="run1" deepFetch="2" purpose="compare thermals" sourceType="reviews">gaming laptop reviews</BDS:AUTO:SEARCH>',
    );

    processMessageNode(node);
    vi.advanceTimersByTime(3000);
    processMessageNode(node);

    expect(mocks.handleAutoSearchForRun).toHaveBeenCalledWith(
      "gaming laptop reviews",
      2,
      "run1",
      { purpose: "compare thermals", sourceType: "reviews" },
    );
    expect(mocks.handleAutoSearch).not.toHaveBeenCalled();
  });

  it("suppresses AUTO tags only for managed Deep Research runs in the current conversation", () => {
    state.deepResearch.runs = [{
      id: "managed-other",
      conversationId: "other-conversation",
      status: "running",
      execution: { managed: true, steps: [], currentStepIndex: 0, awaitingAnalysisStepId: null, reportRequested: false },
    }];
    const node = createMessageNode(
      "<BDS:AUTO:REQUEST_WEB_FETCH>https://example.com</BDS:AUTO:REQUEST_WEB_FETCH>",
    );

    processMessageNode(node);
    vi.advanceTimersByTime(3000);
    processMessageNode(node);

    expect(mocks.handleAutoWebFetch).toHaveBeenCalledWith("https://example.com/");
  });

  it("suppresses AUTO tags for managed Deep Research runs in the current conversation", () => {
    state.deepResearch.runs = [{
      id: "managed-current",
      conversationId: "default",
      status: "running",
      execution: { managed: true, steps: [], currentStepIndex: 0, awaitingAnalysisStepId: null, reportRequested: false },
    }];
    const node = createMessageNode(
      "<BDS:AUTO:REQUEST_WEB_FETCH>https://example.com</BDS:AUTO:REQUEST_WEB_FETCH>",
    );

    processMessageNode(node);
    vi.advanceTimersByTime(3000);
    processMessageNode(node);

    expect(mocks.handleAutoWebFetch).not.toHaveBeenCalled();
  });

  it("recovers managed Deep Research when the model emits AUTO search instead of step-done", async () => {
    const run = {
      id: "managed-current",
      conversationId: "default",
      status: "running",
      execution: {
        managed: true,
        steps: [{ id: "3", status: "awaiting_analysis", outcome: "{}", error: null }],
        currentStepIndex: 0,
        awaitingAnalysisStepId: "3",
        reportRequested: false,
      },
    };
    state.deepResearch.runs = [run];
    const node = createMessageNode(
      'Step 3 found useful evidence. I should execute step 4 now.\n<BDS:AUTO:SEARCH runId="managed-current" deepFetch="3">Originality.ai Copyleaks AI detector performance comparison 2025</BDS:AUTO:SEARCH>',
    );

    processMessageNode(node);
    await Promise.resolve();

    expect(mocks.handleAutoSearchForRun).not.toHaveBeenCalled();
    expect(run.execution.steps[0].status).toBe("complete");
    expect(run.execution.awaitingAnalysisStepId).toBeNull();
    expect(run.execution.reportRequested).toBe(true);
    expect(mocks.mount).toHaveBeenCalledOnce();
    const props = mocks.mount.mock.calls[0][1].props;
    expect(props.text).toContain("Step 3 found useful evidence");
    expect(props.blocks.some((block) => block.name === "auto:search")).toBe(false);
  });

  it("does not render early managed Deep Research reports before the report gate opens", () => {
    state.deepResearch.runs = [{
      id: "run-early-report",
      conversationId: "default",
      status: "running",
      execution: {
        managed: true,
        steps: [{ id: "1", status: "awaiting_analysis" }],
        currentStepIndex: 0,
        awaitingAnalysisStepId: "1",
        reportRequested: false,
      },
    }];
    const node = createMessageNode(
      '<BDS:DEEP_RESEARCH_REPORT runId="run-early-report"># Early Report</BDS:DEEP_RESEARCH_REPORT>',
    );

    processMessageNode(node);

    expect(mocks.mount).toHaveBeenCalledOnce();
    expect(mocks.mount.mock.calls[0][1].props.blocks).toEqual([]);
  });

  it("renders managed Deep Research reports after all steps complete and reporting is requested", () => {
    state.deepResearch.runs = [{
      id: "run-final-report",
      conversationId: "default",
      status: "reporting",
      execution: {
        managed: true,
        steps: [{ id: "1", status: "complete" }],
        currentStepIndex: 1,
        awaitingAnalysisStepId: null,
        reportRequested: true,
      },
    }];
    const node = createMessageNode(
      '<BDS:DEEP_RESEARCH_REPORT runId="run-final-report"># Final Report</BDS:DEEP_RESEARCH_REPORT>',
    );

    processMessageNode(node);

    expect(mocks.mount).toHaveBeenCalledOnce();
    expect(mocks.mount.mock.calls[0][1].props.blocks[0].name).toBe("deep_research_report");
  });

  it("defers Deep Research step-done side effects until generation is complete", () => {
    const stopButton = document.createElement("div");
    stopButton.className = "ds-icon-stop";
    document.body.appendChild(stopButton);

    const listener = vi.fn();
    window.addEventListener("bds:deep-research-step-done", listener);
    const node = createMessageNode(
      '<BDS:DEEP_RESEARCH_STEP_DONE runId="run-streaming" stepId="2">{"analysis":"done","newInsights":["x"]}</BDS:DEEP_RESEARCH_STEP_DONE>',
    );

    processMessageNode(node);
    expect(listener).not.toHaveBeenCalled();

    stopButton.remove();
    vi.advanceTimersByTime(3000);
    processMessageNode(node);

    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0][0].detail).toMatchObject({
      runId: "run-streaming",
      stepId: "2",
      analysis: { analysis: "done", newInsights: ["x"] },
    });

    window.removeEventListener("bds:deep-research-step-done", listener);
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

  it("does not reopen clarifying questions after a user reply", () => {
    const originalNode = createMessageNode(
      '<BDS:ask_question>[{"id":"q1","question":"Pick one","type":"test","options":["A"]}]</BDS:ask_question>',
    );
    const listener = vi.fn();
    window.addEventListener("bds-ask-questions", listener);

    processMessageNode(originalNode);
    vi.advanceTimersByTime(3000);
    processMessageNode(originalNode);

    expect(listener).toHaveBeenCalledOnce();

    state.activeQuestions = null;
    originalNode.remove();
    const recreatedNode = createMessageNode(originalNode.dataset.rawText);
    recreatedNode.dataset.absoluteLast = "0";
    processMessageNode(recreatedNode);
    vi.advanceTimersByTime(3000);
    processMessageNode(recreatedNode);

    expect(state.activeQuestions).toBeNull();
    expect(listener).toHaveBeenCalledOnce();
    window.removeEventListener("bds-ask-questions", listener);
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

describe("bookmark button injection", () => {
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
    state.ui = { showToast: vi.fn(), showConfirm: vi.fn(() => Promise.resolve(true)) };
  });

  function createUserBookmarkNode() {
    const wrapper = document.createElement("div");
    wrapper.className = "_4f9bf79 _43c05b5";
    const msgContainer = document.createElement("div");
    msgContainer.className = "_11d6b3a";
    const contentArea = document.createElement("div");
    contentArea.className = "_425ea0b";
    const actionBar = document.createElement("div");
    actionBar.className = "ds-flex _78e0558 _0bbda35";
    const sibling = document.createElement("div");
    sibling.className = "db183363 ds-icon-button ds-icon-button--m ds-icon-button--sizing-container";
    sibling.setAttribute("tabindex", "0");
    sibling.setAttribute("role", "button");
    actionBar.appendChild(sibling);
    contentArea.appendChild(actionBar);
    msgContainer.appendChild(contentArea);
    wrapper.appendChild(msgContainer);
    const node = document.createElement("div");
    node.className = "ds-message";
    node.dataset.role = "user";
    node.dataset.rawText = "Hello";
    wrapper.appendChild(node);
    document.body.appendChild(wrapper);
    return node;
  }

  function createAssistantBookmarkNode() {
    const wrapper = document.createElement("div");
    wrapper.className = "_4f9bf79 _43c05b5";
    const actionRow = document.createElement("div");
    actionRow.className = "ds-flex _0a3d93b";
    const buttonsContainer = document.createElement("div");
    buttonsContainer.className = "ds-flex _965abe9 _54866f7";
    const sibling = document.createElement("div");
    sibling.className = "db183363 ds-icon-button ds-icon-button--m ds-icon-button--sizing-container";
    sibling.setAttribute("tabindex", "0");
    sibling.setAttribute("role", "button");
    buttonsContainer.appendChild(sibling);
    actionRow.appendChild(buttonsContainer);
    wrapper.appendChild(actionRow);
    const node = document.createElement("div");
    node.className = "ds-message";
    node.dataset.role = "assistant";
    node.dataset.rawText = "Hi there";
    wrapper.appendChild(node);
    document.body.appendChild(wrapper);
    return node;
  }

  it("injects bookmark button into user message action bar", () => {
    const node = createUserBookmarkNode();
    processMessageNode(node);
    const actionBar = node.parentElement.querySelector("._11d6b3a .ds-flex");
    const btn = actionBar.querySelector(".bds-bookmark-btn");
    expect(btn).not.toBeNull();
    expect(btn.getAttribute("role")).toBe("button");
    expect(btn.querySelector(".ds-icon svg")).not.toBeNull();
    expect(btn.querySelector(".ds-button__background")).not.toBeNull();
    expect(btn.querySelector(".ds-button__icon")).not.toBeNull();
  });

  it("injects bookmark button into assistant message action bar", () => {
    const node = createAssistantBookmarkNode();
    processMessageNode(node);
    const wrapper = node.closest("._4f9bf79._43c05b5");
    const buttonsContainer = wrapper.querySelector("._0a3d93b ._965abe9");
    const btn = buttonsContainer.querySelector(".bds-bookmark-btn");
    expect(btn).not.toBeNull();
  });

  it("does not duplicate bookmark button on re-process", () => {
    const node = createUserBookmarkNode();
    processMessageNode(node);
    processMessageNode(node);
    const actionBar = node.parentElement.querySelector("._11d6b3a .ds-flex");
    expect(actionBar.querySelectorAll(".bds-bookmark-btn")).toHaveLength(1);
  });

  it("clicking bookmark button adds item to state.savedItems", async () => {
    document.title = "Test Conversation - DeepSeek";
    const node = createUserBookmarkNode();
    processMessageNode(node);
    const actionBar = node.parentElement.querySelector("._11d6b3a .ds-flex");
    actionBar.querySelector(".bds-bookmark-btn").click();
    await Promise.resolve();
    await Promise.resolve();
    expect(state.savedItems).toHaveLength(1);
    expect(state.savedItems[0].type).toBe("bookmark");
    expect(state.savedItems[0].messageType).toBe("user");
    expect(state.savedItems[0].conversationTitle).toBe("Test Conversation");
  });

  it("clicking active bookmark removes it from state", async () => {
    document.title = "Conv - DeepSeek";
    const node = createUserBookmarkNode();
    processMessageNode(node);
    const actionBar = node.parentElement.querySelector("._11d6b3a .ds-flex");
    const btn = actionBar.querySelector(".bds-bookmark-btn");
    btn.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(state.savedItems).toHaveLength(1);
    btn.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(state.savedItems).toHaveLength(0);
  });

  it("toggles bds-bookmark-btn--active class on click", async () => {
    const node = createUserBookmarkNode();
    processMessageNode(node);
    const actionBar = node.parentElement.querySelector("._11d6b3a .ds-flex");
    const btn = actionBar.querySelector(".bds-bookmark-btn");
    expect(btn.classList.contains("bds-bookmark-btn--active")).toBe(false);
    btn.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(btn.classList.contains("bds-bookmark-btn--active")).toBe(true);
    btn.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(btn.classList.contains("bds-bookmark-btn--active")).toBe(false);
  });
});
