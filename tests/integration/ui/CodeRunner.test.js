// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const downloadMocks = vi.hoisted(() => ({
  triggerTextDownload: vi.fn(),
}));

vi.mock("../../../src/lib/utils/download.js", () => downloadMocks);

import CodeRunner from "../../../src/content/ui/CodeRunner.svelte";
import { renderSvelte, flushUi } from "../../helpers/svelte.js";

describe("CodeRunner integration", () => {
  beforeEach(() => {
    downloadMocks.triggerTextDownload.mockReset();
    document.body.innerHTML = "";
  });

  it("posts code to the sandbox iframe when run is clicked", async () => {
    const { target, cleanup } = renderSvelte(CodeRunner, {
      content: "console.log('hi')",
      language: "javascript",
    });
    const iframe = target.querySelector("iframe");
    const postMessage = vi.fn();
    Object.defineProperty(iframe, "contentWindow", {
      configurable: true,
      value: { postMessage },
    });

    target.querySelector(".bds-code-editor").value = "console.log('updated')";
    target.querySelector(".bds-code-editor").dispatchEvent(new Event("input", { bubbles: true }));
    await flushUi();

    target.querySelector(".bds-run-btn").click();

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "RUN_CODE",
        code: "console.log('updated')",
      }),
      "*",
    );
    cleanup();
  });

  it("renders console output from sandbox messages", async () => {
    const { target, cleanup } = renderSvelte(CodeRunner, {
      content: "console.log('hi')",
      language: "javascript",
    });
    await flushUi();

    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          type: "CONSOLE_LOG",
          data: { method: "log", args: ["done"] },
        },
      }),
    );
    await flushUi();

    expect(target.textContent).toContain("done");
    cleanup();
  });

  it("downloads the current script", () => {
    const { target, cleanup } = renderSvelte(CodeRunner, {
      content: "print('x')",
      language: "python",
    });

    target.querySelector(".bds-btn-small").click();

    expect(downloadMocks.triggerTextDownload).toHaveBeenCalledWith(
      "print('x')",
      expect.stringMatching(/^script-\d+\.py$/),
    );
    cleanup();
  });
});
