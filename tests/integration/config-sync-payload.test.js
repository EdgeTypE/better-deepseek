// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { mutatePayload } from "../../src/injected/payload-mutator.js";
import { BRIDGE_EVENTS } from "../../src/lib/constants.js";

const BLOCK = [
  '<BDS:CONFIG v="1" enc="gz" bytes="42" sum="deadbeefdeadbeef">',
  "H4sIAAAAAAAAA6tWKkktLlGyUjA0MDAwqgUAAAD//wMA",
  "</BDS:CONFIG>",
].join("\n");

function makeInjectedState(pendingConfigSync = null) {
  return {
    config: {
      systemPrompt: "",
      systemPromptEntries: [],
      skills: [],
      memories: [],
      activeCharacter: null,
      activeProject: null,
      projectRagEnabled: false,
      deepResearch: { enabled: false, runId: "" },
      deepCode: { enabled: false },
      mcpToolSchemas: [],
    },
    sessionUserMsgCounts: {},
    pendingQuoteContext: null,
    pendingConfigSync,
  };
}

function payloadFor(text) {
  return {
    conversation_id: "conv_sync",
    messages: [{ role: "user", content: text }],
  };
}

describe("settings transfer payload mutation", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("attaches the block and its instruction, then clears it", () => {
    const state = makeInjectedState(BLOCK);

    const result = mutatePayload(payloadFor("Syncing my settings."), state);
    const content = result.payload.messages[0].content;

    expect(result.changed).toBe(true);
    expect(content).toContain("<BDS:CONFIG_NOTE>");
    expect(content).toContain("<BDS:CONFIG v=\"1\"");
    expect(content).toContain("Syncing my settings.");
    expect(state.pendingConfigSync).toBeNull();
  });

  it("never re-sends the block on a later turn", () => {
    const state = makeInjectedState(BLOCK);
    const first = mutatePayload(payloadFor("Syncing my settings."), state);
    const sent = first.payload.messages[0].content;

    // The stored message comes back in the history of the next request.
    const second = mutatePayload(
      {
        conversation_id: "conv_sync",
        messages: [
          { role: "user", content: sent },
          { role: "assistant", content: "Received." },
          { role: "user", content: "Thanks" },
        ],
      },
      state,
    );

    const history = second.payload.messages.map((m) => m.content).join("\n");
    expect(history).not.toContain("<BDS:CONFIG");
    expect(history).not.toContain("BDS:CONFIG_NOTE");
    // ...but the visible text of that message survives.
    expect(second.payload.messages[0].content).toContain("Syncing my settings.");
    expect(second.payload.messages[2].content).toContain("Thanks");
  });

  it("tells the content script the staged block was consumed", () => {
    const state = makeInjectedState(BLOCK);
    const listener = vi.fn();
    window.addEventListener(BRIDGE_EVENTS.configSyncConsumed, listener, { once: true });

    mutatePayload(payloadFor("Syncing my settings."), state);

    expect(listener).toHaveBeenCalledOnce();
  });

  it("stays silent when nothing is staged", () => {
    const state = makeInjectedState(null);
    const listener = vi.fn();
    window.addEventListener(BRIDGE_EVENTS.configSyncConsumed, listener, { once: true });

    const result = mutatePayload(payloadFor("plain question"), state);

    expect(result.payload.messages[0].content).not.toContain("<BDS:CONFIG");
    expect(listener).not.toHaveBeenCalled();
  });

  it("keeps the quote excerpt and the transfer block independent", () => {
    const state = makeInjectedState(BLOCK);
    state.pendingQuoteContext = { text: "an earlier answer" };

    const result = mutatePayload(payloadFor("Syncing my settings."), state);
    const content = result.payload.messages[0].content;

    expect(content).toContain("an earlier answer");
    expect(content).toContain("<BDS:CONFIG v=\"1\"");
    expect(state.pendingQuoteContext).toBeNull();
    expect(state.pendingConfigSync).toBeNull();
  });
});
