// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount, unmount } from "svelte";
import state from "../../src/content/state.js";
import { resetAppState } from "../helpers/app-state.js";
import { processMessageNode } from "../../src/content/message-processor.svelte.js";

const mocks = vi.hoisted(() => ({
  detectMessageRole: vi.fn((node) => node.dataset.role || "assistant"),
  isLatestAssistantMessage: vi.fn((node) => node.dataset.latest === "1"),
  isAbsoluteLastMessage: vi.fn((node) => node.dataset.absoluteLast === "1"),
  extractMessageRawText: vi.fn((node) => node.dataset.rawText || ""),
  mount: vi.fn((component, { target, props }) => {
    const marker = document.createElement("div");
    marker.className = "mock-overlay";
    marker.dataset.blockName = props.blocks?.[0]?.name;
    target.appendChild(marker);
    return { component, props, target };
  }),
  unmount: vi.fn(),
}));

vi.mock("../../src/content/scanner.js", () => ({
  detectMessageRole: mocks.detectMessageRole,
  isLatestAssistantMessage: mocks.isLatestAssistantMessage,
  isAbsoluteLastMessage: mocks.isAbsoluteLastMessage,
  scheduleScan: vi.fn(),
  collectMessageNodes: vi.fn(() => []),
}));

vi.mock("../../src/content/dom/message-text.js", () => ({
  extractMessageRawText: mocks.extractMessageRawText,
}));

vi.mock("svelte", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, mount: mocks.mount, unmount: mocks.unmount };
});

function createNode(rawText, role = "assistant") {
  const node = document.createElement("div");
  node.dataset.role = role;
  node.dataset.latest = "1";
  node.dataset.absoluteLast = "1";
  node.dataset.rawText = rawText;
  const markdown = document.createElement("div");
  markdown.className = "ds-markdown";
  node.appendChild(markdown);
  document.body.appendChild(node);
  return node;
}

describe("BDS:AUTO:CODE_RUNNER integration", () => {
  beforeEach(() => {
    resetAppState();
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("mounts AutoCodeRunnerCard for assistant request", () => {
    const node = createNode('<BDS:AUTO:CODE_RUNNER language="python">print(1)</BDS:AUTO:CODE_RUNNER>');
    processMessageNode(node);

    expect(mocks.mount).toHaveBeenCalledOnce();
    const props = mocks.mount.mock.calls[0][1].props;
    expect(props.blocks[0].name).toBe("auto:code_runner");
    expect(node.querySelector(".ds-markdown").classList.contains("bds-hidden-message")).toBe(true);
  });

  it("mounts AutoCodeResultCard for user result message", () => {
    const resultText = `
      <BetterDeepSeek>
      [BDS:AUTO] Code Runner Result (PYTHON)
      Status: SUCCESS
      Output:
      \`\`\`text
      Hello World
      \`\`\`
      </BetterDeepSeek>
    `;
    const node = createNode(resultText, "user");
    processMessageNode(node);

    expect(mocks.mount).toHaveBeenCalledOnce();
    const props = mocks.mount.mock.calls[0][1].props;
    expect(props.blocks[0].name).toBe("auto_code_result");
    expect(props.blocks[0].attrs.language).toBe("PYTHON");
    expect(props.blocks[0].attrs.status).toBe("SUCCESS");
    expect(props.blocks[0].content).toContain("Hello World");
    
    expect(node.querySelector(".ds-markdown").classList.contains("bds-hidden-message")).toBe(true);
  });

  it("mounts AutoCodeResultCard for user rejection message", () => {
    const rejectText = `
      <BetterDeepSeek>
      [BDS:AUTO] Code Runner Result (JS)
      Status: REJECTED
      Output:
      \`\`\`text
      Kullanıcı reddetti
      \`\`\`
      </BetterDeepSeek>
    `;
    const node = createNode(rejectText, "user");
    processMessageNode(node);

    expect(mocks.mount).toHaveBeenCalledOnce();
    expect(mocks.mount.mock.calls[0][1].props.blocks[0].attrs.status).toBe("REJECTED");
  });
});
