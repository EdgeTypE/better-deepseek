// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { mutatePayload, buildDeepCodeBlock } from "../../src/injected/payload-mutator.js";

const FILE_TREE = [
  "<BDS:DEEP_CODE_FILE_TREE root=\"my-project\">",
  "- README.md",
  "- package.json",
  "- src/",
  "- src/index.js",
  "- src/utils/helpers.js",
  "</BDS:DEEP_CODE_FILE_TREE>",
].join("\n");

function makeInjectedState() {
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
      deepCode: {
        enabled: true,
        activeDirectory: "my-project",
        manualPath: "A:/code/my-project",
        pendingReport: null,
        fileTree: FILE_TREE,
      },
    },
    sessionUserMsgCounts: {},
  };
}

describe("DeepCode payload mutation", () => {
  it("builds the DeepCode block including the file tree", () => {
    const block = buildDeepCodeBlock(makeInjectedState());

    expect(block).toContain("[DEEP_CODE_MODE_ACTIVE]");
    expect(block).toContain('<BDS:HARNESS_TASK cwd="A:/code/my-project">');
    expect(block).toContain("<BDS:DEEP_CODE_FILE_TREE");
    expect(block).toContain("- src/");
    expect(block).toContain("- src/index.js");
    expect(block).toContain("ORIENTATION MAP");
  });

  it("omits the file tree from the block when it is empty", () => {
    const state = makeInjectedState();
    state.config.deepCode.fileTree = "";

    const block = buildDeepCodeBlock(state);

    expect(block).toContain("[DEEP_CODE_MODE_ACTIVE]");
    expect(block).not.toContain("DEEP_CODE_FILE_TREE");
    expect(block).not.toContain("ORIENTATION MAP");
  });

  it("does not render the DeepCode block when disabled", () => {
    const state = makeInjectedState();
    state.config.deepCode.enabled = false;

    expect(buildDeepCodeBlock(state)).toBe("");
  });

  it("injects the file tree into the outbound user prompt via mutatePayload", () => {
    const state = makeInjectedState();
    const payload = {
      conversation_id: "conv_project",
      messages: [
        {
          role: "user",
          content: "Review the auth module.",
        },
      ],
    };

    const result = mutatePayload(payload, state);
    const content = result.payload.messages[0].content;

    expect(result.changed).toBe(true);
    expect(content).toContain("[DEEP_CODE_MODE_ACTIVE]");
    expect(content).toContain("<BDS:DEEP_CODE_FILE_TREE");
    expect(content).toContain("- src/");
    expect(content).toContain("- src/index.js");
    expect(content).toContain("Review the auth module.");
  });
});