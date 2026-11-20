// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { patchFetch } from "./fetch-patch.js";
import { patchXmlHttpRequest } from "./xhr-patch.js";

describe("fetch and XHR patch behavior", () => {
  const originalFetch = window.fetch;
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;

  afterEach(() => {
    window.fetch = originalFetch;
    XMLHttpRequest.prototype.open = originalOpen;
    XMLHttpRequest.prototype.send = originalSend;
    XMLHttpRequest.prototype.setRequestHeader = originalSetRequestHeader;
  });

  it("preserves native function descriptors and avoids instance expando properties", () => {
    const baseFetch = vi.fn().mockResolvedValue(new Response("{}"));
    window.fetch = baseFetch;

    const baseOpen = vi.fn();
    const baseSend = vi.fn();
    const baseSetHeader = vi.fn();
    XMLHttpRequest.prototype.open = baseOpen;
    XMLHttpRequest.prototype.send = baseSend;
    XMLHttpRequest.prototype.setRequestHeader = baseSetHeader;

    const state = {
      config: { systemPrompt: "", systemPromptEntries: [], skills: [], memories: [] },
      setAuthToken: vi.fn(),
      captureClientHeader: vi.fn(),
    };

    patchFetch(state, () => false, vi.fn(), vi.fn());
    patchXmlHttpRequest(state, (u) => u.includes("/api/v0/chat/completion"), vi.fn(), vi.fn());

    expect(Function.prototype.toString.call(Function.prototype.toString)).toContain("[native code]");
    expect(Function.prototype.toString.call(window.fetch)).toContain("[native code]");
    expect(Function.prototype.toString.call(XMLHttpRequest.prototype.open)).toContain("[native code]");
    expect(Function.prototype.toString.call(XMLHttpRequest.prototype.send)).toContain("[native code]");
    expect(Function.prototype.toString.call(XMLHttpRequest.prototype.setRequestHeader)).toContain("[native code]");

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "https://chat.deepseek.com/api/v0/chat/completion");
    xhr.setRequestHeader("Authorization", "Bearer tok-1");
    xhr.setRequestHeader("X-Client-Version", "2.8.0");
    xhr.send(JSON.stringify({ prompt: "hi" }));

    expect(Object.prototype.hasOwnProperty.call(xhr, "__bdsRequestMeta")).toBe(false);
    expect(state.setAuthToken).toHaveBeenCalledWith("Bearer tok-1");
    expect(state.captureClientHeader).toHaveBeenCalledWith("x-client-version", "2.8.0");
    expect(baseSend).toHaveBeenCalledTimes(1);
  });
});
