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

  it("renders steps from TodoCard content", async () => {
    const { default: TodoCard } = await import("../../../src/content/ui/TodoCard.svelte");
    const content = `
### Step 1: Design Assets
Create logo and select color palette.

### Step 2: Setup Workspace
Initialize repository and configure CI/CD.
    `.trim();

    const { target, cleanup } = renderSvelte(TodoCard, { content });
    await flushUi();

    expect(target.textContent).toContain("Design Assets");
    expect(target.textContent).toContain("Create logo and select color palette.");
    expect(target.textContent).toContain("Setup Workspace");
    expect(target.textContent).toContain("Initialize repository and configure CI/CD.");
    expect(target.textContent).toContain("1");
    expect(target.textContent).toContain("2");

    cleanup();
  });

  it("downloads todo list as markdown from TodoCard", async () => {
    const { default: TodoCard } = await import("../../../src/content/ui/TodoCard.svelte");
    const content = `
### Design Assets
Create logo and select color palette.
    `.trim();

    const { target, cleanup } = renderSvelte(TodoCard, { content });
    await flushUi();

    const buttons = target.querySelectorAll("button");
    const downloadBtn = buttons[buttons.length - 1]; // Last button is download
    downloadBtn.click();

    expect(downloadMocks.triggerBlobDownload).toHaveBeenCalled();
    const [blobArg, filenameArg] = downloadMocks.triggerBlobDownload.mock.calls[0];
    expect(filenameArg).toBe("todo-list.md");
    
    const reader = new FileReader();
    const blobTextPromise = new Promise((resolve) => {
      reader.onload = () => resolve(reader.result);
    });
    reader.readAsText(blobArg);
    const blobText = await blobTextPromise;
    expect(blobText).toContain("# To-Do List");
    expect(blobText).toContain("### 1. Design Assets");
    expect(blobText).toContain("Create logo and select color palette.");

    cleanup();
  });

  it("copies todo list to clipboard", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    const { default: TodoCard } = await import("../../../src/content/ui/TodoCard.svelte");
    const content = `
### Design Assets
Create logo and select color palette.
    `.trim();

    const { target, cleanup } = renderSvelte(TodoCard, { content });
    await flushUi();

    const buttons = target.querySelectorAll("button");
    const copyBtn = buttons[0]; // First button is copy
    copyBtn.click();
    await flushUi();

    expect(writeTextMock).toHaveBeenCalled();
    const copiedText = writeTextMock.mock.calls[0][0];
    expect(copiedText).toContain("# To-Do List");
    expect(copiedText).toContain("### 1. Design Assets");

    vi.unstubAllGlobals();
    cleanup();
  });
});
