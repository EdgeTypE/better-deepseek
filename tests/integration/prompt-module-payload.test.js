// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import {
  mutatePayload,
  stripInjectedBlocks,
} from "../../src/injected/payload-mutator.js";

const MODULE_MESSAGE = [
  "<BetterDeepSeek>",
  "[BDS:PROMPT_MODULE] midi",
  "The extension loaded the reference you requested.",
  "## <BDS:midi> — MIDI Music Generator",
  "HARD CONSTRAINTS:",
  "</BetterDeepSeek>",
].join("\n");

function makeState(overrides = {}) {
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
      ...overrides,
    },
    sessionUserMsgCounts: {},
  };
}

function payloadFor(text) {
  return {
    conversation_id: "conv_modules",
    messages: [{ role: "user", content: text }],
  };
}

describe("prompt module payload", () => {
  it("keeps the loaded reference in the outgoing request", () => {
    const result = mutatePayload(payloadFor(MODULE_MESSAGE), makeState());
    const content = result.payload.messages[0].content;

    expect(content).toContain("[BDS:PROMPT_MODULE] midi");
    expect(content).toContain("HARD CONSTRAINTS");
  });

  it("still strips ordinary hidden blocks", () => {
    const plain = "<BetterDeepSeek>\ninternal note\n</BetterDeepSeek>\nreal question";

    expect(stripInjectedBlocks(plain)).toBe("real question");
  });

  it("no longer injects office library docs from prompt keywords", () => {
    const result = mutatePayload(
      payloadFor("Build me an Excel spreadsheet with the sales numbers"),
      makeState({ systemPrompt: "You are Better DeepSeek." }),
    );
    const content = result.payload.messages[0].content;

    expect(content).toContain("You are Better DeepSeek.");
    expect(content).not.toContain("XLSX.writeFile");
    expect(content).not.toContain("OFFICE SKILL");
  });
});
