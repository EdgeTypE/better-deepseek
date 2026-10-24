// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  searchActiveProjectRAG: vi.fn(() => []),
  getActiveProject: vi.fn(() => ({ id: "project-1", name: "project" })),
  getFilesForProject: vi.fn(() => [{ path: "a.js" }]),
  getActiveFiles: vi.fn(() => []),
}));

vi.mock("../../src/lib/rag-engine.js", () => ({
  searchActiveProjectRAG: mocks.searchActiveProjectRAG,
}));

vi.mock("../../src/content/project-manager.js", () => ({
  getActiveProject: mocks.getActiveProject,
  getFilesForProject: mocks.getFilesForProject,
  getActiveFiles: mocks.getActiveFiles,
}));

vi.mock("../../src/content/state.js", () => ({
  default: { settings: { projectRagEnabled: true, projectRagLimit: 5 } },
}));

vi.mock("../../src/lib/i18n.svelte.js", () => ({
  t: (key, params) => (params?.count === undefined ? key : `${key}=${params.count}`),
}));

const SEARCH_SETTLE_MS = 450;

// jsdom has no Web Animations API, and `slide` drives every expand/collapse
// through it. Resolve the transition immediately so the DOM settles.
if (!Element.prototype.animate) {
  Element.prototype.animate = function animate() {
    const animation = {
      cancel: () => {},
      finish: () => {},
      play: () => {},
      pause: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      finished: Promise.resolve(),
    };
    let onfinish = null;
    Object.defineProperty(animation, "onfinish", {
      get: () => onfinish,
      set: (fn) => {
        onfinish = fn;
        if (fn) setTimeout(fn, 0);
      },
    });
    return animation;
  };
}

function chunk(fileName) {
  return {
    fileName,
    startLine: 1,
    endLine: 10,
    content: `// ${fileName}`,
  };
}

async function typeQuery(query = "how does the scanner mount controls") {
  const textarea = document.querySelector("textarea");
  textarea.value = query;
  textarea.dispatchEvent(new Event("input"));
  await new Promise((resolve) => setTimeout(resolve, SEARCH_SETTLE_MS));
}

describe("RagPreview", () => {
  let renderSvelte;
  let flushUi;
  let cleanup = null;

  beforeEach(async () => {
    vi.resetModules();
    mocks.searchActiveProjectRAG.mockReset();
    mocks.getFilesForProject.mockReset();
    mocks.getFilesForProject.mockReturnValue([{ path: "a.js" }]);
    document.body.innerHTML = `
      <div id="chat">
        <textarea id="chat-input"></textarea>
      </div>
    `;
    ({ renderSvelte, flushUi } = await import("../helpers/svelte.js"));
  });

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    document.body.innerHTML = "";
  });

  async function mountPanel() {
    const { default: RagPreview } = await import("../../src/content/ui/RagPreview.svelte");
    const rendered = renderSvelte(RagPreview);
    cleanup = rendered.cleanup;
    return rendered;
  }

  it("stays collapsed until the header is clicked", async () => {
    mocks.searchActiveProjectRAG.mockReturnValue([chunk("a.js"), chunk("b.js")]);
    await mountPanel();

    await typeQuery();

    expect(document.querySelector(".bds-rag-preview.visible")).toBeTruthy();
    expect(document.querySelector(".bds-rag-files")).toBeNull();
  });

  it("lists at most three files and offers the rest behind a count", async () => {
    mocks.searchActiveProjectRAG.mockReturnValue(
      ["a.js", "b.js", "c.js", "d.js", "e.js"].map(chunk),
    );
    await mountPanel();

    await typeQuery();
    document.querySelector(".bds-rag-header").click();
    await flushUi();

    expect(document.querySelectorAll(".bds-rag-file-group").length).toBe(3);
    const showAll = document.querySelector(".bds-rag-show-all");
    expect(showAll).toBeTruthy();
    expect(showAll.textContent.trim()).toBe("ragPreview.showAll=2");

    showAll.click();
    await flushUi();

    expect(document.querySelectorAll(".bds-rag-file-group").length).toBe(5);
    expect(document.querySelector(".bds-rag-show-all")).toBeNull();
  });

  it("collapses the extra files again when the panel is closed", async () => {
    mocks.searchActiveProjectRAG.mockReturnValue(
      ["a.js", "b.js", "c.js", "d.js"].map(chunk),
    );
    await mountPanel();

    await typeQuery();
    document.querySelector(".bds-rag-header").click();
    await flushUi();
    document.querySelector(".bds-rag-show-all").click();
    await flushUi();
    expect(document.querySelectorAll(".bds-rag-file-group").length).toBe(4);

    document.querySelector(".bds-rag-header").click();
    await flushUi();
    document.querySelector(".bds-rag-header").click();
    await flushUi();

    expect(document.querySelectorAll(".bds-rag-file-group").length).toBe(3);
  });
});
