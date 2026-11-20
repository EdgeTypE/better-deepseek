// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { mutatePayload, stripInjectedBlocks } from "./payload-mutator.js";

describe("stripInjectedBlocks", () => {
  it("removes hidden context blocks", () => {
    expect(stripInjectedBlocks("<BetterDeepSeek>secret</BetterDeepSeek>hello")).toBe("hello");
    expect(stripInjectedBlocks("<BDS:SKILLS>x</BDS:SKILLS>hello")).toBe("hello");
    expect(stripInjectedBlocks("<BDS:RP>x</BDS:RP>hello")).toBe("hello");
    expect(stripInjectedBlocks("<BDS:PROJECT>x</BDS:PROJECT>hello")).toBe("hello");
    expect(stripInjectedBlocks("<BDS:PROJECT_CONTEXT>x</BDS:PROJECT_CONTEXT>hello")).toBe("hello");
  });

  it("keeps explicit tool-control messages the model must see", () => {
    const auto = "<BetterDeepSeek>[BDS:AUTO]do it</BetterDeepSeek>";
    expect(stripInjectedBlocks(auto)).toBe(auto);

    const research = "<BetterDeepSeek>[BDS:DEEP_RESEARCH]go</BetterDeepSeek>";
    expect(stripInjectedBlocks(research)).toBe(research);

    const memory = '<BetterDeepSeek><BDS:memory_calls id="1"></BetterDeepSeek>';
    expect(stripInjectedBlocks(memory)).toBe(memory);
  });

  // Regression guard for the `[^>]*` in the paired strips: they are safe only
  // because the matching close tag anchors the removal region. If someone turns
  // them into self-contained strips, the tail of the tag leaks into the prompt.
  it("fully strips paired blocks whose attributes contain '>'", () => {
    expect(stripInjectedBlocks('A<BDS:memory_calls args="a>b">body</BDS:memory_calls>B')).toBe("AB");
    expect(stripInjectedBlocks('A<BDS:PROJECT id="1 > 2">body</BDS:PROJECT>B')).toBe("AB");
  });
});

describe("system prompt scheduling across F5 reloads", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  function appendCompletedTurns(count) {
    for (let i = 0; i < count; i++) {
      const user = document.createElement("div");
      user.className = "ds-message d29f3d7d";
      user.textContent = `User ${i + 1}`;
      const assistant = document.createElement("div");
      assistant.className = "ds-message";
      const md = document.createElement("div");
      md.className = "ds-markdown";
      md.textContent = `Reply ${i + 1}`;
      assistant.appendChild(md);
      document.body.append(user, assistant);
    }
  }

  it("does not re-inject every_x system prompt immediately after F5 on turn 2", () => {
    appendCompletedTurns(1);
    const state = {
      config: {
        systemPrompt: "CORE_SYS",
        systemPromptEntries: [],
        skills: [],
        memories: [],
        systemPromptInjectionFrequency: "every_x",
        systemPromptInjectionInterval: 3,
        injectSystemDateTime: false,
      },
      sessionUserMsgCounts: {},
    };

    const payload = { chat_session_id: "s1", parent_message_id: 2, prompt: "Follow-up" };
    const res = mutatePayload(payload, state);
    expect(res.changed).toBe(false);
    expect(payload.prompt).toBe("Follow-up");
    expect(state.sessionUserMsgCounts["s1"]).toBe(2);
  });

  it("does not inject multi-prompt first/interval entries mid-chat when injection cache is missing", () => {
    appendCompletedTurns(2); // Next turn is #3
    const state = {
      config: {
        systemPrompt: "",
        systemPromptEntries: [
          { id: "e-first", content: "FIRST_ONLY", enabled: true, schedule: { type: "first", everyNTurns: 1 } },
          { id: "e-int", content: "EVERY_3", enabled: true, schedule: { type: "interval", everyNTurns: 3 } },
          { id: "e-always", content: "ALWAYS_ON", enabled: true, schedule: { type: "always", everyNTurns: 1 } },
        ],
        skills: [],
        memories: [],
        injectSystemDateTime: false,
      },
      sessionUserMsgCounts: {},
      getInjectedEntries: () => [],
      markEntryInjected: vi.fn(),
    };

    // Turn 3: only "always" should inject (not "first", not "interval" every 3)
    const turn3 = { chat_session_id: "s2", parent_message_id: 4, prompt: "Turn 3" };
    mutatePayload(turn3, state);
    expect(turn3.prompt).toContain("ALWAYS_ON");
    expect(turn3.prompt).not.toContain("FIRST_ONLY");
    expect(turn3.prompt).not.toContain("EVERY_3");

    // Turn 4: (4 - 1) % 3 === 0 -> "interval" should inject alongside "always"
    const turn4 = { chat_session_id: "s2", parent_message_id: 6, prompt: "Turn 4" };
    mutatePayload(turn4, state);
    expect(turn4.prompt).toContain("ALWAYS_ON");
    expect(turn4.prompt).toContain("EVERY_3");
    expect(turn4.prompt).not.toContain("FIRST_ONLY");
  });
});

describe("followUpSuggestions prompt injection", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("injects follow-up instructions on first turn when enabled and skips when disabled or in Live mode", () => {
    const baseConfig = {
      systemPrompt: "",
      systemPromptEntries: [],
      skills: [],
      memories: [],
      injectSystemDateTime: false,
    };

    const enabledPayload = { chat_session_id: "fu-1", parent_message_id: null, prompt: "Hello" };
    mutatePayload(enabledPayload, { config: { ...baseConfig, followUpSuggestions: true }, sessionUserMsgCounts: {} });
    expect(enabledPayload.prompt).toContain("<BDS:follow_up");

    const disabledPayload = { chat_session_id: "fu-2", parent_message_id: null, prompt: "Hello" };
    mutatePayload(disabledPayload, { config: { ...baseConfig, followUpSuggestions: false }, sessionUserMsgCounts: {} });
    expect(disabledPayload.prompt).not.toContain("<BDS:follow_up");

    const livePayload = { chat_session_id: "fu-3", parent_message_id: null, prompt: "Hello" };
    mutatePayload(livePayload, { config: { ...baseConfig, followUpSuggestions: true, isLiveMode: true }, sessionUserMsgCounts: {} });
    expect(livePayload.prompt).not.toContain("<BDS:follow_up");
  });
});
