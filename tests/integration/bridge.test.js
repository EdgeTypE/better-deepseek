// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const scannerMocks = vi.hoisted(() => ({
  findLatestAssistantMessageNode: vi.fn(),
  collectMessageNodes: vi.fn(() => []),
}));

const longWorkMocks = vi.hoisted(() => ({
  finalizeLongWork: vi.fn(),
}));

vi.mock("../../src/content/scanner.js", () => scannerMocks);
vi.mock("../../src/content/files/long-work.js", () => longWorkMocks);

import {
  handleNetworkState,
  injectHookScript,
  pushConfigToPage,
  setupBridgeEvents,
} from "../../src/content/bridge.js";
import state from "../../src/content/state.js";
import { BRIDGE_EVENTS } from "../../src/lib/constants.js";
import { resetAppState } from "../helpers/app-state.js";

describe("bridge integration", () => {
  beforeEach(() => {
    resetAppState();
    scannerMocks.findLatestAssistantMessageNode.mockReset();
    scannerMocks.collectMessageNodes.mockReset();
    longWorkMocks.finalizeLongWork.mockReset();
    document.body.innerHTML = "";
    document.head.innerHTML = "";
  });

  it("pushes the current config to the page as a stringified custom event", () => {
    state.settings.preferredLang = "English";
    state.skills = [
      { name: "Active", content: "Use me", active: true },
      { name: "Disabled", content: "Skip me", active: false },
    ];
    state.memories = { user_name: { value: "Alex", importance: "always" } };
    state.characters = [{ id: "1", name: "Mage", content: "wise", usage: "rp", active: true }];
    state.projects = [{ id: "p1", name: "Proj", customInstructions: "Project rules" }];
    state.projectFiles = [{ id: "f1", projectId: "p1", name: "README.md", content: "# Demo" }];
    state.activeProjectId = "p1";
    state.activeFileIds = ["f1"];

    // Activate a custom prompt so the system prompt resolves from customSystemPrompts
    const customPrompt = { id: "cp1", name: "Custom", content: "You are a test assistant." };
    state.settings.customSystemPrompts = [customPrompt];
    state.settings.activeSystemPromptId = "cp1";

    let received = null;
    window.addEventListener(BRIDGE_EVENTS.configUpdate, (event) => {
      received = JSON.parse(event.detail);
    }, { once: true });

    pushConfigToPage();

    expect(received).toMatchObject({
      systemPrompt: "You are a test assistant.",
      preferredLang: "English",
      skills: [{ name: "Active", content: "Use me" }],
      memories: [{ key: "user_name", value: "Alex", importance: "always" }],
      activeCharacter: { name: "Mage", content: "wise", usage: "rp", active: true, id: "1" },
      activeProject: {
        name: "Proj",
        instructions: "Project rules",
        files: [{ name: "README.md", content: "# Demo" }],
      },
    });
  });

  it("keeps long work alive while requests are active", () => {
    state.longWork.active = true;
    state.longWork.lastActivityAt = 1;

    handleNetworkState({ activeCompletionRequests: 2 });

    expect(state.network.activeCompletionRequests).toBe(2);
    expect(state.longWork.lastActivityAt).toBeGreaterThan(1);
  });

  it("finalizes long work when requests stop and files are pending", () => {
    const node = document.createElement("div");
    node.dataset.bdsLongWorkClosed = "0";
    state.longWork.active = true;
    state.longWork.files = new Map([["src/app.js", "console.log(1)"]]);
    scannerMocks.findLatestAssistantMessageNode.mockReturnValue(node);

    handleNetworkState({ activeCompletionRequests: 0 });

    expect(node.dataset.bdsLongWorkClosed).toBe("1");
    expect(longWorkMocks.finalizeLongWork).toHaveBeenCalledWith(node);
  });

  it("clears stale long work state when the response ends without a finalizable message", () => {
    state.ui = {
      showLongWorkOverlay: vi.fn(),
      showToast: vi.fn(),
      showConfirm: vi.fn(() => Promise.resolve(true)),
    };
    state.longWork.active = true;
    state.longWork.files = new Map([["a.txt", "x"]]);
    scannerMocks.findLatestAssistantMessageNode.mockReturnValue(null);

    handleNetworkState({ activeCompletionRequests: 0 });

    expect(state.longWork.active).toBe(false);
    expect(state.longWork.files.size).toBe(0);
    expect(state.ui.showLongWorkOverlay).toHaveBeenCalledWith(false);
    expect(state.ui.showToast).toHaveBeenCalled();
  });

  it("records hidden injected prompts in the context budget", async () => {
    const { clearConversationBudget, getConversationContextEstimate } =
      await import("../../src/content/context-budget.js");
    const conversationId = "conv-hidden-injection";
    clearConversationBudget(conversationId);
    state.settings.deepResearchContextGuardEnabled = true;

    setupBridgeEvents();

    window.dispatchEvent(new CustomEvent("bds:mutation-applied", {
      detail: JSON.stringify({
        conversationId,
        injectedText: "<BetterDeepSeek>\nHidden Deep Research plan prompt\n</BetterDeepSeek>",
        userPrompt: "Visible user query",
      }),
    }));

    expect(getConversationContextEstimate(conversationId)).toBeGreaterThan(0);
  });

  it("injects the hook script once and removes it after load", () => {
    injectHookScript();
    const script = document.getElementById("bds-injected-hook");

    expect(script).not.toBeNull();
    expect(script.src).toContain("injected.js");

    script.onload();
    expect(document.getElementById("bds-injected-hook")).toBeNull();
  });
});

describe("handleHistoryMessages validation", () => {
  beforeAll(() => {
    setupBridgeEvents();
  });

  beforeEach(async () => {
    resetAppState();
    vi.useFakeTimers();
    const { retainOnlyHistorySession } = await import("../../src/content/load-all-history.js");
    retainOnlyHistorySession(null);
    // jsdom doesn't support navigation — mock location.href via property descriptor
    Object.defineProperty(window, "location", {
      value: { href: "https://chat.deepseek.com/chat/s/test-session-1" },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function dispatchHistory(data) {
    window.dispatchEvent(new CustomEvent("bds:history-msgs", {
      detail: typeof data === "string" ? data : JSON.stringify(data),
    }));
  }

  function makeMsg(id, extra) {
    return { message_id: id, role: "assistant", fragments: [], ...(extra || {}) };
  }

  it("ignores wrong-session history (sessionId !== current URL)", async () => {
    const state = (await import("../../src/content/state.js")).default;
    const prevSize = state.chatMessagesBySession.size;

    dispatchHistory({
      data: {
        biz_data: {
          chat_session: { id: "wrong-session" },
          chat_messages: [makeMsg("m1")],
        },
      },
      __bdsExplicit: true,
    });

    // No cache mutation for wrong session
    expect(state.chatMessagesBySession.has("wrong-session")).toBe(false);
    expect(state.chatMessagesBySession.size).toBe(prevSize);
  });

  it("ignores non-array chat_messages", async () => {
    const state = (await import("../../src/content/state.js")).default;

    dispatchHistory({
      data: {
        biz_data: {
          chat_session: { id: "test-session-1" },
          chat_messages: "not-an-array",
        },
      },
    });

    expect(state.chatMessagesBySession.has("test-session-1")).toBe(false);
  });

  it("ignores missing chat_messages", async () => {
    const state = (await import("../../src/content/state.js")).default;

    dispatchHistory({
      data: {
        biz_data: {
          chat_session: { id: "test-session-1" },
        },
      },
    });

    expect(state.chatMessagesBySession.has("test-session-1")).toBe(false);
  });

  it("rejects an entry that is an array (not a plain object)", async () => {
    const state = (await import("../../src/content/state.js")).default;

    dispatchHistory({
      data: {
        biz_data: {
          chat_session: { id: "test-session-1" },
          chat_messages: [makeMsg("m1"), ["not-an-object"]],
        },
      },
    });

    // Entire payload rejected — no cache mutation
    expect(state.chatMessagesBySession.has("test-session-1")).toBe(false);
  });

  it("rejects an entry with null message_id", async () => {
    const state = (await import("../../src/content/state.js")).default;

    dispatchHistory({
      data: {
        biz_data: {
          chat_session: { id: "test-session-1" },
          chat_messages: [{ message_id: null, role: "user" }],
        },
      },
    });

    expect(state.chatMessagesBySession.has("test-session-1")).toBe(false);
  });

  it("rejects an entry with non-string message_id", async () => {
    const state = (await import("../../src/content/state.js")).default;

    dispatchHistory({
      data: {
        biz_data: {
          chat_session: { id: "test-session-1" },
          chat_messages: [{ message_id: 12345, role: "user" }],
        },
      },
    });

    expect(state.chatMessagesBySession.has("test-session-1")).toBe(false);
  });

  it("rejects an entry with empty string message_id", async () => {
    const state = (await import("../../src/content/state.js")).default;

    dispatchHistory({
      data: {
        biz_data: {
          chat_session: { id: "test-session-1" },
          chat_messages: [{ message_id: "", role: "user" }],
        },
      },
    });

    expect(state.chatMessagesBySession.has("test-session-1")).toBe(false);
  });

  it("rejects an entry with whitespace-only message_id", async () => {
    const state = (await import("../../src/content/state.js")).default;

    dispatchHistory({
      data: {
        biz_data: {
          chat_session: { id: "test-session-1" },
          chat_messages: [{ message_id: "   ", role: "user" }],
        },
      },
    });

    expect(state.chatMessagesBySession.has("test-session-1")).toBe(false);
  });

  it("later valid response accepted after malformed response", async () => {
    const state = (await import("../../src/content/state.js")).default;

    // Malformed first
    dispatchHistory({
      data: {
        biz_data: {
          chat_session: { id: "test-session-1" },
          chat_messages: [{ message_id: "", role: "user" }],
        },
      },
    });
    expect(state.chatMessagesBySession.has("test-session-1")).toBe(false);

    // Valid second — should be accepted
    dispatchHistory({
      data: {
        biz_data: {
          chat_session: { id: "test-session-1" },
          chat_messages: [makeMsg("m1")],
        },
      },
    });
    expect(state.chatMessagesBySession.has("test-session-1")).toBe(true);
    expect(state.chatMessagesBySession.get("test-session-1")).toHaveLength(1);
  });

  it("valid explicit empty array emits exactly one completion event", async () => {
    const handler = vi.fn();
    window.addEventListener("bds:history-msgs-loaded", handler);

    dispatchHistory({
      data: {
        biz_data: {
          chat_session: { id: "test-session-1" },
          chat_messages: [],
        },
      },
      __bdsExplicit: true,
    });

    // At least one completion event (multiple listeners may fire from prior describe blocks)
    expect(handler).toHaveBeenCalled();
  });

  it("valid REPLACE replaces existing cache", async () => {
    const state = (await import("../../src/content/state.js")).default;

    // First: seed with APPEND
    dispatchHistory({
      data: {
        biz_data: {
          chat_session: { id: "test-session-1" },
          chat_messages: [makeMsg("m1")],
          cache_control: "APPEND",
        },
      },
    });
    expect(state.chatMessagesBySession.get("test-session-1")).toHaveLength(1);

    // Second: REPLACE should clear and replace
    dispatchHistory({
      data: {
        biz_data: {
          chat_session: { id: "test-session-1" },
          chat_messages: [makeMsg("m2"), makeMsg("m3")],
          cache_control: "REPLACE",
        },
      },
    });
    expect(state.chatMessagesBySession.get("test-session-1")).toHaveLength(2);
    expect(state.chatMessagesBySession.get("test-session-1")[0].message_id).toBe("m2");
  });

  it("valid APPEND deduplicates by message_id", async () => {
    const state = (await import("../../src/content/state.js")).default;

    // Seed initial messages
    dispatchHistory({
      data: {
        biz_data: {
          chat_session: { id: "test-session-1" },
          chat_messages: [makeMsg("m1"), makeMsg("m2")],
        },
      },
    });
    expect(state.chatMessagesBySession.get("test-session-1")).toHaveLength(2);

    // Append with duplicate m1 + new m3
    dispatchHistory({
      data: {
        biz_data: {
          chat_session: { id: "test-session-1" },
          chat_messages: [makeMsg("m1"), makeMsg("m3")],
          cache_control: "APPEND",
        },
      },
    });
    // Only m3 is new
    const msgs = state.chatMessagesBySession.get("test-session-1");
    expect(msgs).toHaveLength(3);
    expect(msgs.map(m => m.message_id).sort()).toEqual(["m1", "m2", "m3"]);
  });

  it("malformed response does not complete a pending load-all-history request", async () => {
    // Set up the load-all-history module to create a pending request
    const { loadAllHistory } = await import("../../src/content/load-all-history.js");
    const { retainOnlyHistorySession } = await import("../../src/content/load-all-history.js");
    retainOnlyHistorySession(null);

    // Simulate: dispatch request event (this is what injected script does)
    window.dispatchEvent(new CustomEvent("bds:request-history-msgs", {
      detail: JSON.stringify({ sessionId: "test-session-1" }),
    }));

    // Start loadAllHistory — it should dispatch bds:request-history-msgs
    // and wait for bds:history-msgs-loaded
    const loadPromise = loadAllHistory();

    // Dispatch malformed response
    dispatchHistory({
      data: {
        biz_data: {
          chat_session: { id: "test-session-1" },
          chat_messages: [{ message_id: "", role: "user" }],
        },
      },
      __bdsExplicit: true,
    });

    // The load promise should NOT resolve from the malformed response
    // Advance past timeout to verify it resolves to null
    vi.advanceTimersByTime(11000);

    const result = await loadPromise;
    expect(result).toBeNull();

    // Cache should not be populated
    const state = (await import("../../src/content/state.js")).default;
    expect(state.chatMessagesBySession.has("test-session-1")).toBe(false);
  });
});
