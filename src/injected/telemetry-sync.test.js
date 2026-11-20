// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  consumePreparedTimestamp,
  installInputTracker,
  patchSendBeacon,
  patchTelemetryStringify,
  recordActualPromptLength,
  recordComposerText,
  rewriteGatorBatchBody,
} from "./telemetry-sync.js";
import { mutatePayload } from "./payload-mutator.js";

function makeState(overrides = {}) {
  return {
    config: {
      systemPrompt: "SYSTEM_INSTRUCTIONS",
      systemPromptEntries: [],
      skills: [],
      memories: [],
      activeCharacter: null,
      mcpToolSchemas: [],
      injectSystemDateTime: false,
      ...overrides,
    },
    hasInjected: vi.fn(() => false),
    markInjected: vi.fn(),
    pendingQuoteContext: { text: "quoted snippet" },
  };
}

describe("telemetry-sync", () => {
  const originalStringify = JSON.stringify;

  afterEach(() => {
    JSON.stringify = originalStringify;
    document.body.innerHTML = "";
  });

  it("updates chatCompletionApi promptLength in JSON.stringify without consuming one-shot state", () => {
    const state = makeState();
    const restore = patchTelemetryStringify(state, JSON, document);

    expect(Function.prototype.toString.call(JSON.stringify)).toContain("[native code]");

    const rawPrompt = "Hello world";
    recordComposerText(state, rawPrompt);

    const serialized = JSON.stringify({
      event_name: "chatCompletionApi",
      event_params: {
        scene: "completion",
        chatSessionId: "sess-1",
        modelType: "default",
        promptLength: rawPrompt.length,
      },
    });

    const parsed = JSON.parse(serialized);
    // One-shot quote context and markInjected must NOT be consumed during preview
    expect(state.pendingQuoteContext).toEqual({ text: "quoted snippet" });
    expect(state.markInjected).not.toHaveBeenCalled();

    // Now run the real mutation with the staged timestamp and confirm exact length match
    const realPayload = {
      chat_session_id: "sess-1",
      parent_message_id: null,
      model_type: "default",
      prompt: rawPrompt,
    };
    const now = consumePreparedTimestamp(realPayload, state);
    mutatePayload(realPayload, state, { now });

    expect(parsed.event_params.promptLength).toBe(realPayload.prompt.length);
    expect(state.pendingQuoteContext).toBeNull();
    expect(state.markInjected).toHaveBeenCalledWith("sess-1");

    restore();
  });

  it("captures textarea input via installInputTracker and matches trimmed lengths", () => {
    const state = makeState();
    const ta = document.createElement("textarea");
    document.body.appendChild(ta);
    const cleanup = installInputTracker(state, document);

    ta.value = "  hi there  ";
    ta.dispatchEvent(new Event("input", { bubbles: true }));

    const restore = patchTelemetryStringify(state, JSON, document);
    const serialized = JSON.stringify({
      event_name: "chatCompletionApi",
      event_params: {
        scene: "completion",
        chatSessionId: "sess-2",
        modelType: "default",
        promptLength: "hi there".length,
      },
    });

    const parsed = JSON.parse(serialized);
    expect(parsed.event_params.promptLength).toBeGreaterThan("hi there".length);

    restore();
    cleanup();
    ta.remove();
  });

  it("rewrites ds_promptLength in gator.volces.com/list batches and sendBeacon", () => {
    const state = makeState();
    const payload = { chat_session_id: "sess-3", prompt: "test" };
    recordActualPromptLength(state, payload, 4, 512);

    const gatorBody = JSON.stringify([
      {
        events: [
          {
            event: "chatCompletionApi",
            params: JSON.stringify({
              ds_chatSessionId: "sess-3",
              ds_promptLength: 4,
              ds_scene: "completion",
            }),
          },
          {
            event: "SSENetReady",
            params: JSON.stringify({ ds_chat_session_id: "sess-3" }),
          },
        ],
      },
    ]);

    const rewritten = rewriteGatorBatchBody(gatorBody, state);
    const batches = JSON.parse(rewritten);
    const params = JSON.parse(batches[0].events[0].params);
    expect(params.ds_promptLength).toBe(512);

    const spy = vi.fn(() => true);
    const fakeNav = { sendBeacon: spy };
    const restoreBeacon = patchSendBeacon(state, fakeNav);
    expect(Function.prototype.toString.call(fakeNav.sendBeacon)).toContain("[native code]");

    fakeNav.sendBeacon("https://gator.volces.com/list", gatorBody);
    expect(spy).toHaveBeenCalledWith("https://gator.volces.com/list", rewritten);
    restoreBeacon();
  });

  it("treats brand-new chat with optimistic user + empty assistant placeholder as first turn", () => {
    const user = document.createElement("div");
    user.className = "ds-message d29f3d7d";
    user.textContent = "Hello";
    const placeholder = document.createElement("div");
    placeholder.className = "ds-message";
    document.body.append(user, placeholder);

    const state = makeState();
    const restore = patchTelemetryStringify(state, JSON, document);
    recordComposerText(state, "Hello");

    const serialized = JSON.stringify({
      event_name: "chatCompletionApi",
      event_params: {
        scene: "completion",
        chatSessionId: "new-sess",
        modelType: "default",
        promptLength: "Hello".length,
      },
    });
    const parsed = JSON.parse(serialized);

    const realPayload = {
      chat_session_id: "new-sess",
      parent_message_id: null,
      model_type: "default",
      prompt: "Hello",
    };
    const now = consumePreparedTimestamp(realPayload, state);
    mutatePayload(realPayload, state, { now });

    expect(parsed.event_params.promptLength).toBe(realPayload.prompt.length);
    expect(realPayload.prompt).toContain("SYSTEM_INSTRUCTIONS");
    restore();
  });

  it("matches multi-prompt schedule lengths after F5 reload on an existing chat", () => {
    for (let i = 0; i < 2; i++) {
      const u = document.createElement("div");
      u.className = "ds-message d29f3d7d";
      u.textContent = `U${i}`;
      const a = document.createElement("div");
      a.className = "ds-message";
      const md = document.createElement("div");
      md.className = "ds-markdown";
      md.textContent = `A${i}`;
      a.appendChild(md);
      document.body.append(u, a);
    }

    const state = makeState({
      systemPrompt: "",
      systemPromptEntries: [
        { id: "e1", content: "FIRST_ENTRY", enabled: true, schedule: { type: "first", everyNTurns: 1 } },
        { id: "e2", content: "ALWAYS_ENTRY", enabled: true, schedule: { type: "always", everyNTurns: 1 } },
        { id: "e3", content: "INTERVAL_3", enabled: true, schedule: { type: "interval", everyNTurns: 3 } },
      ],
    });
    state.getInjectedEntries = () => [];
    state.markEntryInjected = vi.fn();

    const restore = patchTelemetryStringify(state, JSON, document);
    recordComposerText(state, "Turn 3");

    const serialized = JSON.stringify({
      event_name: "chatCompletionApi",
      event_params: {
        scene: "completion",
        chatSessionId: "existing-sess",
        modelType: "default",
        promptLength: "Turn 3".length,
      },
    });
    const parsed = JSON.parse(serialized);

    const realPayload = {
      chat_session_id: "existing-sess",
      parent_message_id: 4,
      model_type: "default",
      prompt: "Turn 3",
    };
    const now = consumePreparedTimestamp(realPayload, state);
    mutatePayload(realPayload, state, { now });

    expect(parsed.event_params.promptLength).toBe(realPayload.prompt.length);
    expect(realPayload.prompt).toContain("ALWAYS_ENTRY");
    expect(realPayload.prompt).not.toContain("FIRST_ENTRY");
    expect(realPayload.prompt).not.toContain("INTERVAL_3");
    restore();
  });

  it("handles file-only zero-length prompts", () => {
    const state = makeState();
    const restore = patchTelemetryStringify(state, JSON, document);

    const serialized = JSON.stringify({
      event_name: "chatCompletionApi",
      event_params: {
        scene: "completion",
        chatSessionId: "file-only-sess",
        modelType: "default",
        promptLength: 0,
      },
    });
    const parsed = JSON.parse(serialized);
    const realPayload = {
      chat_session_id: "file-only-sess",
      parent_message_id: null,
      model_type: "default",
      prompt: "",
    };
    const now = consumePreparedTimestamp(realPayload, state);
    mutatePayload(realPayload, state, { now });

    expect(parsed.event_params.promptLength).toBe(realPayload.prompt.length);
    restore();
  });
});
