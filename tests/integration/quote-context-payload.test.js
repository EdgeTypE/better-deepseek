// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { mutatePayload } from "../../src/injected/payload-mutator.js";
import { BRIDGE_EVENTS } from "../../src/lib/constants.js";

function makeInjectedState(pendingQuoteContext = null) {
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
    pendingQuoteContext,
  };
}

function payloadFor(text) {
  return {
    conversation_id: "conv_quote",
    messages: [{ role: "user", content: text }],
  };
}

describe("quote context payload mutation", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("attaches the excerpt to the outbound prompt and clears it", () => {
    const state = makeInjectedState({ text: "Retries are capped at three." });

    const result = mutatePayload(payloadFor("Can you expand on that?"), state);
    const content = result.payload.messages[0].content;

    expect(result.changed).toBe(true);
    expect(content).toContain("The user selected this excerpt from your previous answer");
    expect(content).toContain("Retries are capped at three.");
    expect(content).toContain("Can you expand on that?");
    expect(state.pendingQuoteContext).toBeNull();
  });

  it("never leaks the excerpt into a second request", () => {
    const state = makeInjectedState({ text: "Retries are capped at three." });
    mutatePayload(payloadFor("first"), state);

    const second = mutatePayload(payloadFor("second"), state);

    expect(second.payload.messages[0].content).not.toContain(
      "The user selected this excerpt",
    );
  });

  it("tells the content script the card can go away", () => {
    const state = makeInjectedState({ text: "quoted" });
    const listener = vi.fn();
    window.addEventListener(BRIDGE_EVENTS.quoteContextConsumed, listener, { once: true });

    mutatePayload(payloadFor("follow-up"), state);

    expect(listener).toHaveBeenCalledOnce();
  });

  it("stays silent when nothing is pending", () => {
    const state = makeInjectedState(null);
    const listener = vi.fn();
    window.addEventListener(BRIDGE_EVENTS.quoteContextConsumed, listener, { once: true });

    const result = mutatePayload(payloadFor("plain question"), state);

    expect(result.payload.messages[0].content).not.toContain("The user selected this excerpt");
    expect(listener).not.toHaveBeenCalled();
  });
});
