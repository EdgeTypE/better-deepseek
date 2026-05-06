// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const downloadMocks = vi.hoisted(() => ({
  triggerBlobDownload: vi.fn(),
}));

vi.mock("../../../src/lib/utils/download.js", () => downloadMocks);

import DownloadCard from "../../../src/content/ui/DownloadCard.svelte";
import ToastStack from "../../../src/content/ui/ToastStack.svelte";
import { renderSvelte, flushUi } from "../../helpers/svelte.js";

describe("simple ui cards", () => {
  beforeEach(() => {
    downloadMocks.triggerBlobDownload.mockReset();
    document.body.innerHTML = "";
  });

  it("shows toast messages", async () => {
    const { target, cleanup } = renderSvelte(ToastStack, {
      toasts: [{ id: 1, message: "Saved" }, { id: 2, message: "Done" }],
    });
    await flushUi();

    expect(target.textContent).toContain("Saved");
    expect(target.textContent).toContain("Done");
    cleanup();
  });

  it("downloads files from DownloadCard", () => {
    const blob = new Blob(["demo"], { type: "text/plain" });
    const { target, cleanup } = renderSvelte(DownloadCard, {
      title: "Generated file",
      description: "README.md",
      fileName: "README.md",
      blob,
    });

    target.querySelector("button").click();

    expect(downloadMocks.triggerBlobDownload).toHaveBeenCalledWith(blob, "README.md");
    cleanup();
  });
});
