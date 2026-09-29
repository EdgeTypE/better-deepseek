import { describe, it, expect, beforeEach, vi } from "vitest";
import { checkPendingContextPrompt, _resetProcessingForTesting } from "./pending-context-prompt.js";
import { resetChromeMock, setChromeStorage } from "../../../tests/mocks/chrome.js";

vi.mock("../auto.js", () => ({
  injectPureTextAndSend: vi.fn(),
}));

import { injectPureTextAndSend } from "../auto.js";

describe("pending-context-prompt", () => {
  beforeEach(() => {
    resetChromeMock();
    _resetProcessingForTesting?.();
    vi.clearAllMocks();
  });

  it("does nothing when there is no pending prompt", async () => {
    setChromeStorage({});
    await checkPendingContextPrompt();
    expect(injectPureTextAndSend).not.toHaveBeenCalled();
  });

  it("removes prompt and does not send if expired", async () => {
    setChromeStorage({
      bds_pending_context_prompt: {
        text: "Old prompt",
        timestamp: Date.now() - 70000,
      },
    });

    await checkPendingContextPrompt();
    expect(chrome.storage.local.remove).toHaveBeenCalledWith("bds_pending_context_prompt");
    expect(injectPureTextAndSend).not.toHaveBeenCalled();
  });

  it("skips execution if targeted for a different tab ID", async () => {
    setChromeStorage({
      bds_pending_context_prompt: {
        targetTabId: 999,
        text: "Different tab prompt",
        timestamp: Date.now(),
      },
    });

    chrome.runtime.sendMessage.mockResolvedValueOnce({ tabId: 111 });

    await checkPendingContextPrompt();
    expect(injectPureTextAndSend).not.toHaveBeenCalled();
    expect(chrome.storage.local.remove).not.toHaveBeenCalled();
  });

  it("sends prompt and removes from storage when valid", async () => {
    setChromeStorage({
      bds_pending_context_prompt: {
        targetTabId: 123,
        text: "Valid prompt to send",
        timestamp: Date.now(),
      },
    });

    chrome.runtime.sendMessage.mockResolvedValueOnce({ tabId: 123 });
    injectPureTextAndSend.mockResolvedValueOnce(true);

    await checkPendingContextPrompt();

    expect(chrome.storage.local.remove).toHaveBeenCalledWith("bds_pending_context_prompt");
    expect(injectPureTextAndSend).toHaveBeenCalledWith(
      "Valid prompt to send",
      "Context menu prompt"
    );
  });

  it("prevents duplicate executions when called concurrently (in-flight guard)", async () => {
    setChromeStorage({
      bds_pending_context_prompt: {
        targetTabId: 123,
        text: "Concurrent prompt",
        timestamp: Date.now(),
      },
    });

    chrome.runtime.sendMessage.mockResolvedValue({ tabId: 123 });
    injectPureTextAndSend.mockImplementation(async () => {
      // Simulate delay in sending
      await new Promise((r) => setTimeout(r, 20));
      return true;
    });

    // Fire two invocations concurrently without waiting
    const call1 = checkPendingContextPrompt();
    const call2 = checkPendingContextPrompt();

    await Promise.all([call1, call2]);

    // Should only have called injectPureTextAndSend ONCE
    expect(injectPureTextAndSend).toHaveBeenCalledTimes(1);
    expect(chrome.storage.local.remove).toHaveBeenCalledTimes(1);
  });
});
