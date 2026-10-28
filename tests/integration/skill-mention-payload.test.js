// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import { mutatePayload } from "../../src/injected/payload-mutator.js";

function makeInjectedState(skills) {
  return {
    config: {
      systemPrompt: "",
      systemPromptEntries: [],
      skills,
      memories: [],
      activeCharacter: null,
      activeProject: null,
      projectRagEnabled: false,
      deepResearch: { enabled: false, runId: "" },
      deepCode: { enabled: false },
      mcpToolSchemas: [],
    },
    sessionUserMsgCounts: {},
  };
}

function payloadFor(messages) {
  return {
    conversation_id: "conv_mentions",
    messages: messages.map((content) => ({ role: "user", content })),
  };
}

function countOccurrences(haystack, needle) {
  return String(haystack).split(needle).length - 1;
}

describe("@skill mention injection", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("injects an inactive skill that the message mentions", () => {
    const state = makeInjectedState([
      { name: "review", content: "REVIEW BODY", active: false },
    ]);

    const result = mutatePayload(payloadFor(["@review take a look"]), state);
    const content = result.payload.messages[0].content;

    expect(content).toContain("REVIEW BODY");
    // The mention itself stays in the visible text.
    expect(content).toContain("@review take a look");
  });

  it("leaves the fingerprint off the per-message block", () => {
    const state = makeInjectedState([
      { name: "review", content: "REVIEW BODY", active: false },
    ]);

    const result = mutatePayload(payloadFor(["@review take a look"]), state);

    expect(result.payload.messages[0].content).toContain("<BDS:SKILLS>");
    expect(result.payload.messages[0].content).not.toMatch(/<BDS:SKILLS fingerprint=/);
  });

  it("does not repeat a skill that is already active", () => {
    const state = makeInjectedState([
      { name: "review", content: "REVIEW BODY", active: true },
    ]);

    const result = mutatePayload(payloadFor(["@review take a look"]), state);

    expect(countOccurrences(result.payload.messages[0].content, "REVIEW BODY")).toBe(1);
  });

  it("carries the mention block on that message only", () => {
    const state = makeInjectedState([
      { name: "review", content: "REVIEW BODY", active: false },
    ]);

    const first = mutatePayload(payloadFor(["@review take a look"]), state);
    const firstContent = first.payload.messages[0].content;

    const second = mutatePayload(
      payloadFor([firstContent, "now something else"]),
      state,
    );
    const secondContent = second.payload.messages[1].content;

    expect(secondContent).toBe("now something else");
    expect(secondContent).not.toContain("REVIEW BODY");
  });

  it("matches longer skill names first", () => {
    const state = makeInjectedState([
      { name: "code", content: "CODE BODY", active: false },
      { name: "code review", content: "CODE REVIEW BODY", active: false },
    ]);

    const result = mutatePayload(payloadFor(["@code review this"]), state);
    const content = result.payload.messages[0].content;

    expect(content).toContain("CODE REVIEW BODY");
    expect(content).not.toContain("CODE BODY");
  });

  it("injects every mentioned skill, in order", () => {
    const state = makeInjectedState([
      { name: "alpha", content: "ALPHA BODY", active: false },
      { name: "beta", content: "BETA BODY", active: false },
    ]);

    const result = mutatePayload(payloadFor(["@beta then @alpha"]), state);
    const content = result.payload.messages[0].content;

    expect(content).toContain("ALPHA BODY");
    expect(content).toContain("BETA BODY");
    expect(content.indexOf("BETA BODY")).toBeLessThan(content.indexOf("ALPHA BODY"));
  });
});
