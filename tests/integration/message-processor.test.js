// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import state from "../../src/content/state.js";
import { resetAppState } from "../helpers/app-state.js";

const mocks = vi.hoisted(() => ({
  detectMessageRole: vi.fn((node) => node.dataset.role || "assistant"),
  isLatestAssistantMessage: vi.fn((node) => node.dataset.latest === "1"),
  isAbsoluteLastMessage: vi.fn((node) => node.dataset.absoluteLast === "1"),
  scheduleScan: vi.fn(),
  scheduleMessageScan: vi.fn(),
  collectMessageNodes: vi.fn(() => []),
  findLatestAssistantMessageNode: vi.fn(() => null),
  findChatEditor: vi.fn(() => null),
  extractMessageRawText: vi.fn((node) => node.dataset.rawText || ""),
  // The processor takes plain (measuring/speaking) and rich (overlay) text in
  // one call; the harness drives both from the node's dataset.
  extractMessageTexts: vi.fn((node) => {
    const plain = node.dataset.rawText || "";
    return { plain, rich: node.dataset.richText || plain };
  }),
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
  // Native voice is opt-in per test: the default keeps every other test on the
  // Web Speech path it was written against.
  isNativeVoiceSupported: vi.fn(() => false),
  speakNativeResponse: vi.fn(() => Promise.resolve({ ok: false, reason: "not stubbed" })),
  stopNativeSpeech: vi.fn(),
  loadAllHistory: vi.fn(() => Promise.resolve(null)),
  devLog: vi.fn(),
}));

vi.mock("../../src/content/scanner.js", () => ({
  detectMessageRole: mocks.detectMessageRole,
  isLatestAssistantMessage: mocks.isLatestAssistantMessage,
  isAbsoluteLastMessage: mocks.isAbsoluteLastMessage,
  scheduleScan: mocks.scheduleScan,
  scheduleMessageScan: mocks.scheduleMessageScan,
  collectMessageNodes: mocks.collectMessageNodes,
  findLatestAssistantMessageNode: mocks.findLatestAssistantMessageNode,
}));
vi.mock("../../src/content/dom/message-text.js", async () => {
  const actual = await vi.importActual("../../src/content/dom/message-text.js");
  return {
    ...actual,
    extractMessageRawText: mocks.extractMessageRawText,
    extractMessageTexts: mocks.extractMessageTexts,
  };
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
  findChatEditor: mocks.findChatEditor,
}));
vi.mock("svelte", async () => {
  const actual = await vi.importActual("svelte");
  return { ...actual, mount: mocks.mount, unmount: mocks.unmount };
});
vi.mock("../../src/content/live/native-tts.js", () => ({
  isNativeVoiceSupported: mocks.isNativeVoiceSupported,
  speakNativeResponse: mocks.speakNativeResponse,
  stopNativeSpeech: mocks.stopNativeSpeech,
}));
vi.mock("../../src/content/load-all-history.js", async () => {
  const actual = await vi.importActual("../../src/content/load-all-history.js");
  return { ...actual, loadAllHistory: mocks.loadAllHistory };
});
vi.mock("../../src/lib/dev-log.js", async () => {
  const actual = await vi.importActual("../../src/lib/dev-log.js");
  return { ...actual, devLog: mocks.devLog };
});

import {
  disposeMessageNode,
  processMessageNode,
  resetMessagePricing,
  resetGeneratingTracker,
  isSystemGenerating,
  handleReasoningBlockCollapse,
  collapseAllOpenReasoningBlocks,
  expandAllCollapsedReasoningBlocks,
  stopVoicePlayback,
} from "../../src/content/message-processor.svelte.js";

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

/**
 * Drive a node the way a live reply is processed: the streaming cursor is on
 * the page for the first scan, then the reply completes and settles.
 *
 * Auto-read only speaks a reply we watched arrive — a reply rendered from
 * history is already complete on first sight, and reading that aloud was the
 * bug. Tests that skip this shape never reach the voice path.
 */
function streamReply(node) {
  const cursor = document.createElement("span");
  cursor.className = "ds-cursor";
  node.appendChild(cursor);

  processMessageNode(node); // streaming: not finished yet
  cursor.remove();
  processMessageNode(node); // complete, but still within the settle window
  vi.advanceTimersByTime(3000);
  processMessageNode(node); // settled -> auto-read
}

describe("message processor integration", () => {
  beforeEach(() => {
    resetAppState();
    resetMessagePricing();
    resetGeneratingTracker();
    Object.values(mocks).forEach((mock) => {
      if (typeof mock?.mockReset === "function") mock.mockReset();
    });
    mocks.detectMessageRole.mockImplementation((node) => node.dataset.role || "assistant");
    mocks.isLatestAssistantMessage.mockImplementation((node) => node.dataset.latest === "1");
    mocks.isAbsoluteLastMessage.mockImplementation((node) => node.dataset.absoluteLast === "1");
    mocks.collectMessageNodes.mockImplementation(() => []);
    mocks.extractMessageRawText.mockImplementation((node) => node.dataset.rawText || "");
    mocks.extractMessageTexts.mockImplementation((node) => {
      const plain = node.dataset.rawText || "";
      return { plain, rich: node.dataset.richText || plain };
    });
    mocks.mount.mockImplementation((component, { target, props }) => {
      const marker = document.createElement("div");
      marker.className = "mock-overlay";
      marker.textContent = props.text || "";
      target.appendChild(marker);
      return { component, props, target };
    });
    mocks.isNativeVoiceSupported.mockImplementation(() => false);
    mocks.speakNativeResponse.mockImplementation(() =>
      Promise.resolve({ ok: false, reason: "not stubbed" }),
    );
    mocks.stopNativeSpeech.mockImplementation(() => {});
    mocks.loadAllHistory.mockImplementation(() => Promise.resolve(null));
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

  it("moves an existing wrapper when an unchanged message is reparented", () => {
    const node = createMessageNode(
      "Intro\n<BDS:VISUALIZER><div>viz</div></BDS:VISUALIZER>",
    );
    const nodes = [node];
    const context = {
      latestAssistantNode: node,
      absoluteLastNode: node,
      systemGenerating: false,
    };
    processMessageNode(node, 0, nodes, context);
    const wrapper = node.querySelector(".bds-host-wrapper");

    const newParent = document.createElement("section");
    document.body.appendChild(newParent);
    newParent.appendChild(node);
    processMessageNode(node, 0, nodes, context);

    expect(node.contains(wrapper)).toBe(true);
    expect(wrapper.parentElement).toBe(node);
    expect(document.querySelectorAll(".bds-host-wrapper")).toHaveLength(1);
  });

  it("updates token totals without re-enumerating every message", () => {
    state.settings.tokenPriceDisplay = true;
    mocks.collectMessageNodes.mockImplementation(() => {
      throw new Error("whole-chat enumeration is forbidden during incremental pricing");
    });

    const nodes = Array.from({ length: 40 }, (_, index) =>
      createMessageNode(`user message ${index}`, "user"),
    );
    const context = {
      latestAssistantNode: null,
      absoluteLastNode: nodes.at(-1),
      systemGenerating: false,
    };

    nodes.forEach((node, index) => processMessageNode(node, index, nodes, context));

    expect(mocks.collectMessageNodes).not.toHaveBeenCalled();
    expect(state.pricing.sessionInputTokens).toBeGreaterThan(0);
    expect(state.pricing.sessionOutputTokens).toBe(0);

    const beforeDispose = state.pricing.sessionInputTokens;
    disposeMessageNode(nodes[0]);
    expect(state.pricing.sessionInputTokens).toBeLessThan(beforeDispose);
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
    node.appendChild(wrapper);

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

  describe("isSystemGenerating", () => {
    function createTextarea(value) {
      const editor = document.createElement("textarea");
      editor.value = value || "";
      document.body.appendChild(editor);
      return editor;
    }

    function createAssistantMessage({ withButtons = false, withCursor = false } = {}) {
      const node = document.createElement("div");
      node.className = "ds-message";
      if (withCursor) {
        const cursor = document.createElement("div");
        cursor.className = "ds-cursor";
        node.appendChild(cursor);
      }
      if (withButtons) {
        const button = document.createElement("div");
        button.setAttribute("role", "button");
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        button.appendChild(svg);
        node.appendChild(button);
      }
      document.body.appendChild(node);
      return node;
    }

    function seeStopButton() {
      const stopButton = document.createElement("div");
      stopButton.className = "ds-icon-stop";
      document.body.appendChild(stopButton);
      expect(isSystemGenerating()).toBe(true);
      stopButton.remove();
    }

    it("returns true when the stop button is visible", () => {
      const stopButton = document.createElement("div");
      stopButton.className = "ds-icon-stop";
      document.body.appendChild(stopButton);

      expect(isSystemGenerating()).toBe(true);
    });

    it("returns true while the composer has text and the latest assistant message keeps growing", () => {
      seeStopButton();
      mocks.findChatEditor.mockReturnValue(createTextarea("draft while generating"));
      const message = createAssistantMessage();
      mocks.findLatestAssistantMessageNode.mockReturnValue(message);

      expect(isSystemGenerating()).toBe(false);

      message.textContent = "streaming tokens...";
      expect(isSystemGenerating()).toBe(true);
    });

    it("returns true when the composer has text and the latest assistant message has a streaming cursor", () => {
      seeStopButton();
      mocks.findChatEditor.mockReturnValue(createTextarea("hello"));
      mocks.findLatestAssistantMessageNode.mockReturnValue(createAssistantMessage({ withCursor: true, withButtons: true }));

      expect(isSystemGenerating()).toBe(true);
    });

    it("returns false when the composer has text and the latest assistant message has action buttons", () => {
      seeStopButton();
      mocks.findChatEditor.mockReturnValue(createTextarea("hello while idle"));
      mocks.findLatestAssistantMessageNode.mockReturnValue(createAssistantMessage({ withButtons: true }));

      expect(isSystemGenerating()).toBe(false);
    });

    it("returns false when the composer is empty and no stop button is visible", () => {
      mocks.findChatEditor.mockReturnValue(createTextarea(""));

      expect(isSystemGenerating()).toBe(false);
    });

    it("returns false when there is no composer and no stop button", () => {
      mocks.findChatEditor.mockReturnValue(null);

      expect(isSystemGenerating()).toBe(false);
    });

    it("returns false on the first evaluation of a buttonless message (conservative init)", () => {
      seeStopButton();
      mocks.findChatEditor.mockReturnValue(createTextarea("draft"));
      mocks.findLatestAssistantMessageNode.mockReturnValue(createAssistantMessage());

      expect(isSystemGenerating()).toBe(false);
    });

    it("returns false when the latest assistant message stopped growing past the idle window", () => {
      seeStopButton();
      mocks.findChatEditor.mockReturnValue(createTextarea("draft"));
      const message = createAssistantMessage();
      mocks.findLatestAssistantMessageNode.mockReturnValue(message);

      expect(isSystemGenerating()).toBe(false);
      message.textContent = "final token";
      expect(isSystemGenerating()).toBe(true);

      vi.advanceTimersByTime(6000);
      expect(isSystemGenerating()).toBe(false);
    });

    it("returns false when the grace period after the last observed generation has expired", () => {
      seeStopButton();
      vi.advanceTimersByTime(31000);
      mocks.findChatEditor.mockReturnValue(createTextarea("draft"));
      mocks.findLatestAssistantMessageNode.mockReturnValue(createAssistantMessage());

      expect(isSystemGenerating()).toBe(false);
    });

    it("returns false when there is no latest assistant message", () => {
      seeStopButton();
      mocks.findChatEditor.mockReturnValue(createTextarea("draft"));
      mocks.findLatestAssistantMessageNode.mockReturnValue(null);

      expect(isSystemGenerating()).toBe(false);
    });
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

  it("opens destination questions while previous conversation questions are active", () => {
    const startingUrl = location.href;
    const listener = vi.fn();
    window.addEventListener("bds-ask-questions", listener);

    try {
      history.replaceState({}, "", "?conversation=first");
      const first = createMessageNode(
        '<BDS:ask_question>[{"id":"first","question":"First question","type":"input"}]</BDS:ask_question>',
      );
      processMessageNode(first);
      vi.advanceTimersByTime(3000);
      processMessageNode(first);
      expect(listener).toHaveBeenCalledOnce();
      expect(state.activeQuestionsUrl).toBe(location.href);

      history.replaceState({}, "", "?conversation=second");
      first.dataset.latest = "0";
      first.dataset.absoluteLast = "0";
      const second = createMessageNode(
        '<BDS:ask_question>[{"id":"second","question":"Second question","type":"input"}]</BDS:ask_question>',
      );
      processMessageNode(second);
      vi.advanceTimersByTime(3000);
      processMessageNode(second);

      expect(listener).toHaveBeenCalledTimes(2);
      expect(state.activeQuestions[0].id).toBe("second");
      expect(state.activeQuestionsUrl).toBe(location.href);

      // The old source can still be connected while the destination loads.
      state.activeQuestions = null;
      state.activeQuestionsUrl = null;
      first.dataset.latest = "1";
      first.dataset.absoluteLast = "1";
      first.dataset.rawText += " updated";
      processMessageNode(first);
      expect(listener).toHaveBeenCalledTimes(2);

      // A reused DOM node can carry a different question in the new conversation.
      first.dataset.rawText =
        '<BDS:ask_question>[{"id":"replacement","question":"Replacement question","type":"input"}]</BDS:ask_question>';
      processMessageNode(first);
      expect(listener).toHaveBeenCalledTimes(3);
      expect(state.activeQuestions[0].id).toBe("replacement");
    } finally {
      history.replaceState({}, "", startingUrl);
      window.removeEventListener("bds-ask-questions", listener);
    }
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

  it("removes BetterDeepSeek tags from nested collapsible-text DOM without leaking HTML tags into text", () => {
    const node = document.createElement("div");
    node.className = "ds-message";
    node.dataset.role = "user";
    node.dataset.rawText = "<BetterDeepSeek>System Instructions</BetterDeepSeek>create a visualizer for me";

    const collapsible = document.createElement("div");
    collapsible.className = "ds-collapsible-text";
    const innerDiv = document.createElement("div");
    const span = document.createElement("span");
    span.textContent = "<BetterDeepSeek>System Instructions</BetterDeepSeek>create a visualizer for me";
    innerDiv.appendChild(span);
    collapsible.appendChild(innerDiv);
    node.appendChild(collapsible);
    document.body.appendChild(node);

    processMessageNode(node);

    expect(span.textContent).toBe("create a visualizer for me");
    expect(span.textContent).not.toContain("<div");
    expect(span.textContent).not.toContain("<span");
    expect(span.textContent).not.toContain("BetterDeepSeek");
    expect(span.textContent).not.toContain("System Instructions");
  });

  it("preserves separate paragraph structure when stripping BDS tags from multi-node user messages", () => {
    const node = document.createElement("div");
    node.className = "ds-message";
    node.dataset.role = "user";
    node.dataset.rawText = "<BetterDeepSeek>System Instructions</BetterDeepSeek>Paragraph 1\nParagraph 2";

    const container = document.createElement("div");
    container.className = "ds-markdown";
    const p1 = document.createElement("p");
    p1.textContent = "<BetterDeepSeek>System Instructions</BetterDeepSeek>Paragraph 1";
    const p2 = document.createElement("p");
    p2.textContent = "Paragraph 2";
    container.appendChild(p1);
    container.appendChild(p2);
    node.appendChild(container);
    document.body.appendChild(node);

    processMessageNode(node);

    expect(p1.textContent).toBe("Paragraph 1");
    expect(p2.textContent).toBe("Paragraph 2");
    expect(container.querySelectorAll("p")).toHaveLength(2);
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

    streamReply(node);

    expect(speak).toHaveBeenCalledOnce();
    expect(speak.mock.calls[0][0].text).toBe("Hello there");
  });

  it("reads aloud the plain text, never the overlay's rich markup", () => {
    const speak = vi.fn();
    window.speechSynthesis = {
      cancel: vi.fn(),
      getVoices: () => [{ lang: "en-US" }],
      speak,
    };
    state.settings.voiceMode = true;
    const node = createMessageNode(
      "Formula\n<BDS:VISUALIZER><div>viz</div></BDS:VISUALIZER>",
    );
    node.dataset.rawText =
      "Formula $a^2 + b^2$ here\n<BDS:VISUALIZER><div>viz</div></BDS:VISUALIZER>";
    node.dataset.richText =
      'Formula <span class="katex"><style>#mermaid-svg-1{fill:#ccc;}</style>a2+b2</span> here\n<BDS:VISUALIZER><div>viz</div></BDS:VISUALIZER>';

    streamReply(node);

    expect(speak).toHaveBeenCalledOnce();
    const spoken = speak.mock.calls[0][0].text;
    expect(spoken).not.toContain("katex");
    expect(spoken).not.toContain("fill:#ccc");
    expect(spoken).not.toContain("a2+b2");
    expect(spoken).toContain("Formula $a^2 + b^2$ here");
  });

  it("re-checks the settle window on its own so auto-read fires without an external scan", () => {
    const speak = vi.fn();
    window.speechSynthesis = {
      cancel: vi.fn(),
      getVoices: () => [{ lang: "en-US" }],
      speak,
    };
    state.settings.voiceMode = true;
    // The scanner re-enters the processor when a queued scan fires.
    mocks.scheduleMessageScan.mockImplementation((n) => processMessageNode(n));

    const node = createMessageNode("Hello there");
    const cursor = document.createElement("span");
    cursor.className = "ds-cursor";
    node.appendChild(cursor);

    // First scan lands while the text is still fresh, so `isSettled` is false.
    processMessageNode(node);
    expect(speak).not.toHaveBeenCalled();

    // The stream ends — but nothing scans the DOM afterwards. In the real app
    // the stream has stopped mutating, so no scan is queued by the
    // MutationObserver; the only way the message can ever be read is a re-check
    // the processor arms itself.
    cursor.remove();
    vi.advanceTimersByTime(3000);

    expect(speak).toHaveBeenCalledOnce();
    expect(speak.mock.calls[0][0].text).toBe("Hello there");
  });

  it("does not arm settle re-checks while voice mode is off", () => {
    state.settings.voiceMode = false;
    const node = createMessageNode("Hello there");

    processMessageNode(node);
    vi.advanceTimersByTime(3000);

    expect(mocks.scheduleMessageScan).not.toHaveBeenCalled();
  });

  it("does not read the last reply of a conversation that was already there", () => {
    const speak = vi.fn();
    window.speechSynthesis = {
      cancel: vi.fn(),
      getVoices: () => [{ lang: "en-US" }],
      speak,
    };
    state.settings.voiceMode = true;

    // Nothing ever streams: this is the shape of opening an existing
    // conversation, whose final answer renders already complete.
    const node = createMessageNode("An answer from months ago");
    processMessageNode(node);
    vi.advanceTimersByTime(3000);
    processMessageNode(node);
    vi.advanceTimersByTime(3000);
    processMessageNode(node);

    expect(speak).not.toHaveBeenCalled();
    const lines = mocks.devLog.mock.calls.map((call) => String(call[1]));
    expect(lines.some((line) => line.includes("auto-read skipped"))).toBe(true);
  });

  it("reads a reply that grew while it was being watched", () => {
    const speak = vi.fn();
    window.speechSynthesis = {
      cancel: vi.fn(),
      getVoices: () => [{ lang: "en-US" }],
      speak,
    };
    state.settings.voiceMode = true;

    // A partial reply first, then the full text: the growth is what marks it as
    // generated here rather than loaded from history.
    const node = createMessageNode("Hello");
    processMessageNode(node);
    node.dataset.rawText = "Hello there";
    processMessageNode(node);
    vi.advanceTimersByTime(3000);
    processMessageNode(node);

    expect(speak).toHaveBeenCalledOnce();
    expect(speak.mock.calls[0][0].text).toBe("Hello there");
  });

  it("stops playback when the conversation changes", () => {
    const speak = vi.fn();
    const cancel = vi.fn();
    window.speechSynthesis = {
      cancel,
      getVoices: () => [{ lang: "en-US" }],
      speak,
    };
    state.settings.voiceMode = true;

    stopVoicePlayback();

    // Both engines have to be silenced: the native stream keeps decoding in the
    // background and Web Speech keeps talking otherwise.
    expect(mocks.stopNativeSpeech).toHaveBeenCalled();
    expect(cancel).toHaveBeenCalled();
  });

  describe("native voice", () => {
    /** Speak the node once and let the native promise chain settle. */
    async function speakOnce(node) {
      streamReply(node);
      for (let i = 0; i < 6; i++) await Promise.resolve();
    }

    function stubSpeech() {
      const speak = vi.fn();
      window.speechSynthesis = {
        cancel: vi.fn(),
        getVoices: () => [{ lang: "en-US" }],
        speak,
      };
      state.settings.voiceMode = true;
      state.settings.nativeVoice = true;
      return speak;
    }

    afterEach(() => {
      if (location.pathname !== "/") window.history.pushState({}, "", "/");
    });

    /** API messages for the "default" conversation the test URL resolves to. */
    function stubApiMessages(messages) {
      state.chatMessagesBySession.clear();
      if (messages) state.chatMessagesBySession.set("default", messages);
    }

    it("prefers DeepSeek's own voice and never reaches Web Speech", async () => {
      const speak = stubSpeech();
      mocks.isNativeVoiceSupported.mockReturnValue(true);
      mocks.speakNativeResponse.mockResolvedValue({ ok: true });
      stubApiMessages([
        { message_id: "m1", role: "USER" },
        { message_id: "m2", role: "ASSISTANT" },
      ]);

      await speakOnce(createMessageNode("Hello there"));

      expect(mocks.speakNativeResponse).toHaveBeenCalledWith({
        sessionId: "default",
        messageId: "m2",
      });
      expect(speak).not.toHaveBeenCalled();
    });

    it("takes the newest assistant id, not the newest entry", async () => {
      stubSpeech();
      mocks.isNativeVoiceSupported.mockReturnValue(true);
      mocks.speakNativeResponse.mockResolvedValue({ ok: true });
      stubApiMessages([
        { message_id: "m1", role: "ASSISTANT" },
        { message_id: "m2", role: "USER" },
      ]);

      await speakOnce(createMessageNode("Hello there"));

      expect(mocks.speakNativeResponse).toHaveBeenCalledWith({
        sessionId: "default",
        messageId: "m1",
      });
    });

    it("falls back to Web Speech when the native stream fails", async () => {
      const speak = stubSpeech();
      mocks.isNativeVoiceSupported.mockReturnValue(true);
      mocks.speakNativeResponse.mockResolvedValue({ ok: false, reason: "ticket: http 401" });
      stubApiMessages([{ message_id: "m2", role: "ASSISTANT" }]);

      await speakOnce(createMessageNode("Hello there"));

      expect(mocks.speakNativeResponse).toHaveBeenCalledOnce();
      expect(speak).toHaveBeenCalledOnce();
      expect(speak.mock.calls[0][0].text).toBe("Hello there");
    });

    it("falls back to Web Speech when native rejects", async () => {
      const speak = stubSpeech();
      mocks.isNativeVoiceSupported.mockReturnValue(true);
      mocks.speakNativeResponse.mockRejectedValue(new Error("boom"));
      stubApiMessages([{ message_id: "m2", role: "ASSISTANT" }]);

      await speakOnce(createMessageNode("Hello there"));

      expect(speak).toHaveBeenCalledOnce();
    });

    it("skips the native attempt when the browser cannot decode opus", async () => {
      const speak = stubSpeech();
      mocks.isNativeVoiceSupported.mockReturnValue(false);
      stubApiMessages([{ message_id: "m2", role: "ASSISTANT" }]);

      await speakOnce(createMessageNode("Hello there"));

      expect(mocks.speakNativeResponse).not.toHaveBeenCalled();
      expect(speak).toHaveBeenCalledOnce();
    });

    it("skips the native attempt when the session has no API message id", async () => {
      const speak = stubSpeech();
      mocks.isNativeVoiceSupported.mockReturnValue(true);
      stubApiMessages(null);

      await speakOnce(createMessageNode("Hello there"));

      expect(mocks.speakNativeResponse).not.toHaveBeenCalled();
      expect(speak).toHaveBeenCalledOnce();
    });

    it("skips the native attempt when the user turned the setting off", async () => {
      const speak = stubSpeech();
      state.settings.nativeVoice = false;
      mocks.isNativeVoiceSupported.mockReturnValue(true);
      stubApiMessages([{ message_id: "m2", role: "ASSISTANT" }]);

      await speakOnce(createMessageNode("Hello there"));

      expect(mocks.speakNativeResponse).not.toHaveBeenCalled();
      expect(speak).toHaveBeenCalledOnce();
    });

    it("keeps replies carrying BDS tags on Web Speech", async () => {
      const speak = stubSpeech();
      mocks.isNativeVoiceSupported.mockReturnValue(true);
      stubApiMessages([{ message_id: "m2", role: "ASSISTANT" }]);

      // DeepSeek synthesizes the *stored* text, so tags would be read verbatim.
      await speakOnce(
        createMessageNode("Intro\n<BDS:VISUALIZER><div>viz</div></BDS:VISUALIZER>"),
      );

      expect(mocks.speakNativeResponse).not.toHaveBeenCalled();
      expect(speak).toHaveBeenCalledOnce();
      expect(speak.mock.calls[0][0].text).not.toContain("BDS:VISUALIZER");
    });

    it("stops any previous native playback before starting a new one", async () => {
      stubSpeech();
      mocks.isNativeVoiceSupported.mockReturnValue(true);
      mocks.speakNativeResponse.mockResolvedValue({ ok: true });
      stubApiMessages([{ message_id: "m2", role: "ASSISTANT" }]);

      await speakOnce(createMessageNode("Hello there"));

      expect(mocks.stopNativeSpeech).toHaveBeenCalled();
    });

    it("asks for the API message ids in the background once the stream settles", () => {
      stubSpeech();
      mocks.isNativeVoiceSupported.mockReturnValue(true);
      stubApiMessages(null);

      const node = createMessageNode("Hello there");
      processMessageNode(node);

      // Not while the text is still fresh: the reply may not be persisted yet,
      // and `loadAllHistory` would cache that incomplete snapshot as final.
      expect(mocks.loadAllHistory).not.toHaveBeenCalled();

      vi.advanceTimersByTime(3000);

      // Without this the native path can never fire on a fresh session: nothing
      // else in the default configuration populates `chatMessagesBySession`.
      expect(mocks.loadAllHistory).toHaveBeenCalledOnce();
    });

    it("does not warm the API ids when the user turned the setting off", () => {
      stubSpeech();
      state.settings.nativeVoice = false;
      mocks.isNativeVoiceSupported.mockReturnValue(true);
      stubApiMessages(null);

      processMessageNode(createMessageNode("Hello there"));
      vi.advanceTimersByTime(3000);

      expect(mocks.loadAllHistory).not.toHaveBeenCalled();
    });

    it("does not warm the API ids when the browser cannot decode opus", () => {
      stubSpeech();
      mocks.isNativeVoiceSupported.mockReturnValue(false);
      stubApiMessages(null);

      processMessageNode(createMessageNode("Hello there"));
      vi.advanceTimersByTime(3000);

      expect(mocks.loadAllHistory).not.toHaveBeenCalled();
    });

    it("uses native voice once the warmed ids land", async () => {
      const speak = stubSpeech();
      mocks.isNativeVoiceSupported.mockReturnValue(true);
      mocks.speakNativeResponse.mockResolvedValue({ ok: true });
      stubApiMessages(null);
      mocks.loadAllHistory.mockImplementation(() => {
        state.chatMessagesBySession.set("default", [
          { message_id: "m9", role: "ASSISTANT" },
        ]);
        return Promise.resolve([]);
      });

      await speakOnce(createMessageNode("Hello there"));

      expect(mocks.speakNativeResponse).toHaveBeenCalledWith({
        sessionId: "default",
        messageId: "m9",
      });
      expect(speak).not.toHaveBeenCalled();
    });

    it("waits a short grace for the ids before settling for Web Speech", async () => {
      const speak = stubSpeech();
      mocks.isNativeVoiceSupported.mockReturnValue(true);
      mocks.speakNativeResponse.mockResolvedValue({ ok: true });
      stubApiMessages(null);
      mocks.loadAllHistory.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => {
              state.chatMessagesBySession.set("default", [
                { message_id: "m7", role: "ASSISTANT" },
              ]);
              resolve([]);
            }, 500);
          }),
      );

      const node = createMessageNode("Hello there");
      streamReply(node);

      // The read is held only for NATIVE_TARGET_GRACE_MS, not the 10s timeout
      // `loadAllHistory` carries internally.
      await vi.advanceTimersByTimeAsync(500);
      for (let i = 0; i < 6; i++) await Promise.resolve();

      expect(mocks.speakNativeResponse).toHaveBeenCalledWith({
        sessionId: "default",
        messageId: "m7",
      });
      expect(speak).not.toHaveBeenCalled();
    });

    it("falls back to Web Speech when the ids never arrive", async () => {
      const speak = stubSpeech();
      mocks.isNativeVoiceSupported.mockReturnValue(true);
      stubApiMessages(null);
      mocks.loadAllHistory.mockImplementation(() => new Promise(() => {}));

      const node = createMessageNode("Hello there");
      streamReply(node);

      // Bounded by the grace, so a hanging request cannot leave the reply mute.
      await vi.advanceTimersByTimeAsync(2500);
      for (let i = 0; i < 6; i++) await Promise.resolve();

      expect(mocks.speakNativeResponse).not.toHaveBeenCalled();
      expect(speak).toHaveBeenCalledOnce();
    });

    it("logs which gate kept the reply on Web Speech", async () => {
      const cases = [
        {
          name: "setting turned off",
          arm: () => { state.settings.nativeVoice = false; },
          expected: "setting turned off",
        },
        {
          name: "browser cannot decode opus",
          arm: () => { mocks.isNativeVoiceSupported.mockReturnValue(false); },
          expected: "cannot decode opus",
        },
        {
          name: "reply carries BDS tags",
          arm: () => {},
          text: "Intro\n<BDS:VISUALIZER><div>viz</div></BDS:VISUALIZER>",
          expected: "BDS tags",
        },
      ];

      for (const testCase of cases) {
        stubSpeech();
        mocks.isNativeVoiceSupported.mockReturnValue(true);
        stubApiMessages([{ message_id: "m2", role: "ASSISTANT" }]);
        mocks.devLog.mockClear();
        testCase.arm();

        await speakOnce(createMessageNode(testCase.text || "Hello there"));

        const lines = mocks.devLog.mock.calls.map((call) => String(call[1]));
        expect(
          lines.some((line) => line.includes(testCase.expected)),
          `expected a log mentioning "${testCase.expected}", got: ${lines.join(" | ")}`,
        ).toBe(true);
      }
    });

    it("logs when Web Speech actually speaks", async () => {
      stubSpeech();
      mocks.isNativeVoiceSupported.mockReturnValue(false);
      stubApiMessages(null);

      await speakOnce(createMessageNode("Hello there"));

      const lines = mocks.devLog.mock.calls.map((call) => String(call[1]));
      expect(lines.some((line) => line.includes("Web Speech speaking"))).toBe(true);
    });

    it("uses the id the completion stream reported, without fetching history", async () => {
      const speak = stubSpeech();
      mocks.isNativeVoiceSupported.mockReturnValue(true);
      mocks.speakNativeResponse.mockResolvedValue({ ok: true });
      stubApiMessages(null);
      state.assistantMessageIds.set("default", "m11");

      await speakOnce(createMessageNode("Hello there"));

      expect(mocks.speakNativeResponse).toHaveBeenCalledWith({
        sessionId: "default",
        messageId: "m11",
      });
      expect(speak).not.toHaveBeenCalled();
      // The stream id is enough on its own, so nothing needs to be requested.
      expect(mocks.loadAllHistory).not.toHaveBeenCalled();
    });

    it("prefers the stream id over a possibly stale API cache", async () => {
      stubSpeech();
      mocks.isNativeVoiceSupported.mockReturnValue(true);
      mocks.speakNativeResponse.mockResolvedValue({ ok: true });
      stubApiMessages([{ message_id: "stale-1", role: "ASSISTANT" }]);
      state.assistantMessageIds.set("default", "fresh-2");

      await speakOnce(createMessageNode("Hello there"));

      expect(mocks.speakNativeResponse).toHaveBeenCalledWith({
        sessionId: "default",
        messageId: "fresh-2",
      });
    });

    it("does not fall back to Web Speech when the read was cancelled", async () => {
      const speak = stubSpeech();
      mocks.isNativeVoiceSupported.mockReturnValue(true);
      stubApiMessages([{ message_id: "m2", role: "ASSISTANT" }]);

      // A native attempt that never reaches audio: the user leaves the chat
      // while the ticket round-trip is still in flight.
      let settleNative;
      mocks.speakNativeResponse.mockImplementation(
        () => new Promise((resolve) => { settleNative = resolve; }),
      );

      streamReply(createMessageNode("Hello there"));
      expect(mocks.speakNativeResponse).toHaveBeenCalledOnce();

      stopVoicePlayback();
      settleNative({ ok: false, reason: "stopped" });
      for (let i = 0; i < 6; i++) await Promise.resolve();

      // "stopped" is our own teardown, not a native failure — speaking the
      // reply now would talk over whatever replaced it.
      expect(speak).not.toHaveBeenCalled();
    });

    it("resolves the session id without swallowing a query string", async () => {
      const speak = stubSpeech();
      mocks.isNativeVoiceSupported.mockReturnValue(true);
      mocks.speakNativeResponse.mockResolvedValue({ ok: true });
      // `handleHistoryMessages` keys the cache by the id up to `?`/`#`; the
      // lookup here must use the same boundary or it never finds anything.
      state.chatMessagesBySession.clear();
      state.chatMessagesBySession.set("sess-1", [
        { message_id: "m5", role: "ASSISTANT" },
      ]);
      window.history.pushState({}, "", "/a/chat/s/sess-1?from=sidebar");

      await speakOnce(createMessageNode("Hello there"));

      expect(mocks.speakNativeResponse).toHaveBeenCalledWith({
        sessionId: "sess-1",
        messageId: "m5",
      });
      expect(speak).not.toHaveBeenCalled();
    });
  });

  it("does not re-parse when only the rich markup changes", () => {
    const node = createMessageNode(
      "Intro\n<BDS:VISUALIZER><div>viz</div></BDS:VISUALIZER>",
    );
    const plain = "Intro\n<BDS:VISUALIZER><div>viz</div></BDS:VISUALIZER>";
    node.dataset.rawText = plain;
    node.dataset.richText = `<span class="katex">v1</span>${plain}`;

    processMessageNode(node);
    expect(mocks.mount).toHaveBeenCalledOnce();

    // A page-side re-render can churn ids inside the rich markup (mermaid
    // numbers its SVGs); the change hash must not react to that alone.
    node.dataset.richText = `<span class="katex">v2</span>${plain}`;
    processMessageNode(node);

    expect(mocks.mount).toHaveBeenCalledOnce();
    expect(mocks.mount.mock.calls[0][1].props.text).toContain("v1");
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
    mocks.extractMessageTexts.mockImplementation((node) => {
      const plain = node.dataset.rawText || "";
      return { plain, rich: node.dataset.richText || plain };
    });
    mocks.mount.mockImplementation((component, { target, props }) => {
      const marker = document.createElement("div");
      marker.className = "mock-overlay";
      marker.textContent = props.text || "";
      target.appendChild(marker);
      return { component, props, target };
    });
    mocks.isNativeVoiceSupported.mockImplementation(() => false);
    mocks.speakNativeResponse.mockImplementation(() =>
      Promise.resolve({ ok: false, reason: "not stubbed" }),
    );
    mocks.stopNativeSpeech.mockImplementation(() => {});
    mocks.loadAllHistory.mockImplementation(() => Promise.resolve(null));
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

  it("renders a directory list result card for user messages", () => {
    const payload = JSON.stringify({
      path: "src",
      success: true,
      isDirectory: true,
      childCount: 2,
      entries: [
        { name: "utils/", type: "dir" },
        { name: "main.js", type: "file" },
      ],
      listing: "- DIR  utils/\n- FILE main.js\n",
    });
    const rawText =
      `<BetterDeepSeek>\n[BDS:AUTO_DIR_LIST_RESULT]\n${payload}\n[/BDS:AUTO_DIR_LIST_RESULT]\n` +
      '[BDS:AUTO] Directory listing for path: "src"\n</BetterDeepSeek>';
    const node = createMessageNode(rawText, "user");

    processMessageNode(node);

    expect(mocks.mount).toHaveBeenCalledOnce();
    const props = mocks.mount.mock.calls[0][1].props;
    expect(props.blocks).toHaveLength(1);
    expect(props.blocks[0].name).toBe("auto_dir_list_result");
    expect(props.blocks[0].attrs.path).toBe("src");
    expect(props.blocks[0].attrs.childCount).toBe("2");
    expect(JSON.parse(props.blocks[0].content)).toEqual([
      { name: "utils/", type: "dir" },
      { name: "main.js", type: "file" },
    ]);
  });

  it("renders a directory list result card with error for failed listings", () => {
    const payload = JSON.stringify({
      path: "missing",
      success: false,
      childCount: 0,
      entries: [],
      error: 'Directory "missing" was not found in the active codebase.',
    });
    const rawText =
      `<BetterDeepSeek>\n[BDS:AUTO_DIR_LIST_RESULT]\n${payload}\n[/BDS:AUTO_DIR_LIST_RESULT]\n` +
      '[BDS:AUTO] Directory listing requested for "missing", but it was not found in the active codebase.\n</BetterDeepSeek>';
    const node = createMessageNode(rawText, "user");

    processMessageNode(node);

    expect(mocks.mount).toHaveBeenCalledOnce();
    const props = mocks.mount.mock.calls[0][1].props;
    expect(props.blocks[0].name).toBe("auto_dir_list_result");
    expect(props.blocks[0].attrs.path).toBe("missing");
    expect(props.blocks[0].attrs.childCount).toBe("0");
    expect(props.blocks[0].attrs.error).toBe('Directory "missing" was not found in the active codebase.');
    expect(JSON.parse(props.blocks[0].content)).toEqual([]);
  });

  it("does not duplicate the directory list card on re-process", () => {
    const payload = JSON.stringify({
      path: "src",
      success: true,
      childCount: 1,
      entries: [{ name: "main.js", type: "file" }],
      listing: "- FILE main.js\n",
    });
    const rawText =
      `<BetterDeepSeek>\n[BDS:AUTO_DIR_LIST_RESULT]\n${payload}\n[/BDS:AUTO_DIR_LIST_RESULT]\n` +
      '[BDS:AUTO] Directory listing for path: "src"\n</BetterDeepSeek>';
    const node = createMessageNode(rawText, "user");

    processMessageNode(node);
    processMessageNode(node);

    expect(mocks.mount).toHaveBeenCalledOnce();
    expect(document.querySelectorAll(".mock-overlay")).toHaveLength(1);
  });

  describe("reasoning block collapse (Issue #180)", () => {
    function createMessageWithReasoning(isCollapsed = false) {
      const node = document.createElement("div");
      node.className = "ds-message";
      node.dataset.role = "assistant";
      node.dataset.latest = "1";
      node.dataset.absoluteLast = "1";
      node.dataset.rawText = "Hello from assistant";

      const container = document.createElement("div");
      container.className = "_74c0879";
      container.setAttribute("style", "--collapsible-area-title-height: 34px;");

      const headerRow = document.createElement("div");
      headerRow.className = "_245c867 _34a54ec";

      const headerInner = document.createElement("div");
      headerInner.className = "_5ab5d64";

      const icon = document.createElement("div");
      icon.className = "ds-icon _970ac5e";
      icon.innerHTML = '<svg width="16" height="16"><path d="M8.00192 6.64454C8.75026"></path></svg>';

      const title = document.createElement("span");
      title.className = "_5255ff8";
      title.textContent = "Thought for 5 seconds";

      headerInner.appendChild(icon);
      headerInner.appendChild(title);
      headerRow.appendChild(headerInner);
      container.appendChild(headerRow);

      if (!isCollapsed) {
        const thinkContent = document.createElement("div");
        thinkContent.className = "ds-think-content _767406f";
        thinkContent.textContent = "Analyzing user query...";
        container.appendChild(thinkContent);
      }

      node.appendChild(container);

      const markdown = document.createElement("div");
      markdown.className = "ds-markdown";
      markdown.textContent = "Hello from assistant";
      node.appendChild(markdown);

      document.body.appendChild(node);
      return { node, container, headerRow };
    }

    it("does not collapse reasoning blocks when keepReasoningBlocksOpen is true (default)", () => {
      state.settings.keepReasoningBlocksOpen = true;
      const { node, headerRow } = createMessageWithReasoning(false);
      const clickSpy = vi.fn();
      headerRow.addEventListener("click", clickSpy);

      processMessageNode(node);

      expect(clickSpy).not.toHaveBeenCalled();
    });

    it("automatically collapses open reasoning block when keepReasoningBlocksOpen is false", () => {
      state.settings.keepReasoningBlocksOpen = false;
      const { node, headerRow } = createMessageWithReasoning(false);
      const clickSpy = vi.fn();
      headerRow.addEventListener("click", clickSpy);

      processMessageNode(node);

      expect(clickSpy).toHaveBeenCalledOnce();
    });

    it("does not re-collapse if user manually expanded it afterwards", () => {
      state.settings.keepReasoningBlocksOpen = false;
      const { node, headerRow } = createMessageWithReasoning(false);
      const clickSpy = vi.fn();
      headerRow.addEventListener("click", clickSpy);

      // First run: auto-collapse triggered
      processMessageNode(node);
      expect(clickSpy).toHaveBeenCalledTimes(1);

      // Subsequent scan / mutation: reasoningCollapsed is true, so no re-collapse
      processMessageNode(node);
      expect(clickSpy).toHaveBeenCalledTimes(1);
    });

    it("collapseAllOpenReasoningBlocks clicks all open thinking block headers", () => {
      const msg1 = createMessageWithReasoning(false);
      const msg2 = createMessageWithReasoning(false);
      const clickSpy1 = vi.fn();
      const clickSpy2 = vi.fn();
      msg1.headerRow.addEventListener("click", clickSpy1);
      msg2.headerRow.addEventListener("click", clickSpy2);

      collapseAllOpenReasoningBlocks();

      expect(clickSpy1).toHaveBeenCalledOnce();
      expect(clickSpy2).toHaveBeenCalledOnce();
    });

    it("expandAllCollapsedReasoningBlocks clicks headers of collapsed thinking blocks", () => {
      const msg = createMessageWithReasoning(true); // isCollapsed = true
      const clickSpy = vi.fn();
      msg.headerRow.addEventListener("click", clickSpy);

      expandAllCollapsedReasoningBlocks();

      expect(clickSpy).toHaveBeenCalledOnce();
    });
  });
});
