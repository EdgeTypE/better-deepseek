// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const autoMocks = vi.hoisted(() => ({
  handleAutoCodeRunnerResult: vi.fn(),
}));

vi.mock("../../../src/content/auto.js", () => autoMocks);

import AutoCodeRunnerCard from "../../../src/content/ui/AutoCodeRunnerCard.svelte";
import { renderSvelte, flushUi } from "../../helpers/svelte.js";

describe("AutoCodeRunnerCard integration", () => {
  beforeEach(() => {
    autoMocks.handleAutoCodeRunnerResult.mockReset();
    document.body.innerHTML = "";
  });

  it("renders pending card with Run Code, Reject and Show Code buttons in header", async () => {
    const { target, cleanup } = renderSvelte(AutoCodeRunnerCard, {
      content: "print('hello')",
      language: "python",
    });
    await flushUi();

    expect(target.textContent).toContain("Python");
    expect(target.querySelector(".bds-btn.run")).toBeTruthy();
    expect(target.querySelector(".bds-btn.reject")).toBeTruthy();
    expect(target.querySelector(".bds-btn-text.toggle")).toBeTruthy();
    // Header actions should not have copy button crowding it
    expect(target.querySelector(".bds-auto-runner-actions .bds-source-copy-btn")).toBeNull();
    cleanup();
  });

  it("shows Copy button in the top right of the code block when code is displayed", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    const { target, cleanup } = renderSvelte(AutoCodeRunnerCard, {
      content: "def add(a, b):\n    return a + b",
      language: "python",
    });
    await flushUi();

    // Toggle code to show it
    target.querySelector(".bds-btn-text.toggle").click();
    await flushUi();

    const copyBtn = target.querySelector(".bds-source-copy-btn");
    expect(copyBtn).toBeTruthy();
    expect(copyBtn.getAttribute("title")).toContain("Copy");
    expect(copyBtn.querySelector("svg")).toBeTruthy();

    copyBtn.click();
    await flushUi();

    expect(writeTextMock).toHaveBeenCalledWith("def add(a, b):\n    return a + b");
    expect(copyBtn.getAttribute("title")).toContain("Copied!");
    expect(copyBtn.querySelector("polyline")).toBeTruthy(); // checkmark

    vi.unstubAllGlobals();
    cleanup();
  });

  it("allows copying code when rejected", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    const { target, cleanup } = renderSvelte(AutoCodeRunnerCard, {
      content: "console.log('test')",
      language: "javascript",
    });
    await flushUi();

    // Reject the execution
    target.querySelector(".bds-btn.reject").click();
    await flushUi();

    expect(autoMocks.handleAutoCodeRunnerResult).toHaveBeenCalledWith(
      "javascript",
      "rejected",
      expect.any(Array),
    );

    // Open code drawer to inspect & copy
    target.querySelector(".bds-btn-text.toggle").click();
    await flushUi();

    const copyBtn = target.querySelector(".bds-source-copy-btn");
    expect(copyBtn).toBeTruthy();

    copyBtn.click();
    await flushUi();

    expect(writeTextMock).toHaveBeenCalledWith("console.log('test')");
    expect(copyBtn.getAttribute("title")).toContain("Copied!");

    vi.unstubAllGlobals();
    cleanup();
  });

  it("toggles code display", async () => {
    const { target, cleanup } = renderSvelte(AutoCodeRunnerCard, {
      content: "puts 'ruby test'",
      language: "ruby",
    });
    await flushUi();

    expect(target.querySelector(".bds-auto-runner-source")).toBeNull();

    target.querySelector(".bds-btn-text.toggle").click();
    await flushUi();

    expect(target.querySelector(".bds-auto-runner-source")).toBeTruthy();
    expect(target.querySelector(".bds-auto-runner-source pre").textContent).toBe("puts 'ruby test'");

    target.querySelector(".bds-btn-text.toggle").click();
    await flushUi();

    expect(target.querySelector(".bds-auto-runner-source")).toBeNull();
    cleanup();
  });

  it("runs code and posts to iframe", async () => {
    const { target, cleanup } = renderSvelte(AutoCodeRunnerCard, {
      content: "print(42)",
      language: "python",
    });
    await flushUi();

    const iframe = target.querySelector("iframe");
    const postMessage = vi.fn();
    Object.defineProperty(iframe, "contentWindow", {
      configurable: true,
      value: { postMessage },
    });

    target.querySelector(".bds-btn.run").click();
    await flushUi();

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "RUN_CODE",
        code: "print(42)",
      }),
      "*",
    );
    cleanup();
  });
});
