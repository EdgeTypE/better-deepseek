// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const svelteMocks = vi.hoisted(() => ({
  mount: vi.fn((component, { target, props }) => {
    const marker = document.createElement("div");
    marker.className = "bds-download-card";
    marker.dataset.fileName = props.fileName;
    target.appendChild(marker);
    return { component, props, target };
  }),
}));

const downloadMocks = vi.hoisted(() => ({
  triggerBlobDownload: vi.fn(),
}));

vi.mock("svelte", async () => {
  const actual = await vi.importActual("svelte");
  return { ...actual, mount: svelteMocks.mount };
});
vi.mock("../../src/lib/utils/download.js", () => downloadMocks);

import state from "../../src/content/state.js";
import { resetAppState } from "../helpers/app-state.js";
import {
  collectLongWorkFiles,
  emitZipForFiles,
  finalizeLongWork,
} from "../../src/content/files/long-work.js";
import { emitStandaloneFiles } from "../../src/content/files/standalone.js";

describe("file emission integration", () => {
  beforeEach(() => {
    resetAppState();
    svelteMocks.mount.mockClear();
    downloadMocks.triggerBlobDownload.mockClear();
    document.body.innerHTML = "";
  });

  it("collects long work files by normalized path", () => {
    collectLongWorkFiles([
      { fileName: "src\\app.js", content: "console.log(1)" },
      { fileName: "../README.md", content: "# Demo" },
    ]);

    expect(Array.from(state.longWork.files.keys())).toEqual(["src/app.js", "README.md"]);
  });

  it("finalizes long work and mounts a download card", () => {
    const node = document.createElement("div");
    document.body.appendChild(node);
    state.longWork.active = true;
    state.longWork.files = new Map([["src/app.js", "x"]]);
    state.ui = { showToast: vi.fn() };

    finalizeLongWork(node);

    expect(state.longWork.active).toBe(false);
    expect(svelteMocks.mount).toHaveBeenCalledOnce();
    expect(state.ui.showToast).toHaveBeenCalledWith("LONG_WORK complete: 1 files zipped.");
  });

  it("emits standalone files once per unique content signature", () => {
    const node = document.createElement("div");
    document.body.appendChild(node);

    emitStandaloneFiles(node, [
      { fileName: "src/app.js", content: "console.log(1)" },
      { fileName: "src/app.js", content: "console.log(1)" },
      { fileName: "README.md", content: "# Demo" },
    ]);

    expect(svelteMocks.mount).toHaveBeenCalledTimes(2);
  });

  it("auto-downloads standalone files when enabled", () => {
    const node = document.createElement("div");
    document.body.appendChild(node);
    state.settings.autoDownloadFiles = true;

    emitStandaloneFiles(node, [{ fileName: "README.md", content: "# Demo" }]);

    expect(downloadMocks.triggerBlobDownload).toHaveBeenCalledOnce();
  });

  it("emits zip cards for historical long work entries", () => {
    const node = document.createElement("div");
    document.body.appendChild(node);

    expect(emitZipForFiles(node, [{ path: "src/app.js", content: "console.log(1)" }])).toBe(true);
    expect(svelteMocks.mount).toHaveBeenCalledOnce();
  });
});
