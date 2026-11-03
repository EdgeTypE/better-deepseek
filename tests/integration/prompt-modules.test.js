// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const autoMocks = vi.hoisted(() => ({
  injectPureTextAndSend: vi.fn(),
}));

vi.mock("../../src/content/auto.js", () => ({
  injectPureTextAndSend: autoMocks.injectPureTextAndSend,
}));

async function importHandler() {
  vi.resetModules();
  return await import("../../src/content/prompt-modules.js");
}

describe("prompt module request handler", () => {
  beforeEach(() => {
    autoMocks.injectPureTextAndSend.mockReset();
    autoMocks.injectPureTextAndSend.mockResolvedValue(true);
  });

  it("injects the requested reference as a hidden control message", async () => {
    const { handlePromptModuleRequest } = await importHandler();

    await handlePromptModuleRequest("midi", "conv-1");

    expect(autoMocks.injectPureTextAndSend).toHaveBeenCalledOnce();
    const message = autoMocks.injectPureTextAndSend.mock.calls[0][0];

    expect(message).toContain("[BDS:PROMPT_MODULE] midi");
    expect(message).toContain("HARD CONSTRAINTS");
    expect(message.startsWith("<BetterDeepSeek>")).toBe(true);
    expect(message.trimEnd().endsWith("</BetterDeepSeek>")).toBe(true);
  });

  it("loads a module only once per conversation", async () => {
    const { handlePromptModuleRequest } = await importHandler();

    await handlePromptModuleRequest("midi", "conv-1");
    await handlePromptModuleRequest("system prompt midi", "conv-1");

    expect(autoMocks.injectPureTextAndSend).toHaveBeenCalledOnce();
  });

  it("keeps conversations independent", async () => {
    const { handlePromptModuleRequest } = await importHandler();

    await handlePromptModuleRequest("midi", "conv-1");
    await handlePromptModuleRequest("midi", "conv-2");

    expect(autoMocks.injectPureTextAndSend).toHaveBeenCalledTimes(2);
  });

  it("answers unknown modules with the available list", async () => {
    const { handlePromptModuleRequest } = await importHandler();

    await handlePromptModuleRequest("pdf", "conv-1");

    const message = autoMocks.injectPureTextAndSend.mock.calls[0][0];
    expect(message).toContain("[BDS:PROMPT_MODULE] unknown");
    expect(message).toContain("midi, docx, xlsx, pptx, office");
    expect(message).toContain("Do not request it again");
  });

  it("retries a failed send", async () => {
    const { handlePromptModuleRequest } = await importHandler();
    autoMocks.injectPureTextAndSend.mockResolvedValueOnce(false);

    await handlePromptModuleRequest("midi", "conv-1");
    await handlePromptModuleRequest("midi", "conv-1");

    expect(autoMocks.injectPureTextAndSend).toHaveBeenCalledTimes(2);
  });

  it("stops retrying a send that keeps failing", async () => {
    const { handlePromptModuleRequest } = await importHandler();
    autoMocks.injectPureTextAndSend.mockResolvedValue(false);

    for (let i = 0; i < 6; i++) {
      await handlePromptModuleRequest("midi", "conv-1");
    }

    expect(autoMocks.injectPureTextAndSend).toHaveBeenCalledTimes(3);
  });

  it("ignores a duplicate while the first send is still in flight", async () => {
    const { handlePromptModuleRequest } = await importHandler();
    let release;
    autoMocks.injectPureTextAndSend.mockImplementation(
      () => new Promise((resolve) => { release = resolve; }),
    );

    const first = handlePromptModuleRequest("midi", "conv-1");
    const second = handlePromptModuleRequest("midi", "conv-1");
    release(true);
    await Promise.all([first, second]);

    expect(autoMocks.injectPureTextAndSend).toHaveBeenCalledOnce();
  });
});
