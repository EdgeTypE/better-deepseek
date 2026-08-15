// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import DirListResultCard from "../../../src/content/ui/DirListResultCard.svelte";
import { renderSvelte, flushUi } from "../../helpers/svelte.js";

describe("DirListResultCard", () => {
  it("renders directories and files with a header", async () => {
    const entries = JSON.stringify([
      { name: "utils/", type: "dir" },
      { name: "main.js", type: "file" }
    ]);
    const { target, cleanup } = renderSvelte(DirListResultCard, {
      path: "src/components",
      count: 2,
      entries
    });
    await flushUi();

    expect(target.querySelector(".bds-dir-list-title").textContent).toContain("src/components");
    expect(target.querySelector(".bds-dir-list-subtitle").textContent).toContain("2");
    const names = [...target.querySelectorAll(".bds-dir-list-entry-name")].map((n) => n.textContent);
    expect(names).toEqual(["utils/", "main.js"]);
    expect(target.querySelector(".bds-dir-list-entry-dir")).toBeTruthy();
    expect(target.querySelector(".bds-dir-list-entry-dir .bds-dir-list-entry-name").textContent).toBe("utils/");

    cleanup();
  });

  it("shows the empty state when there are no entries", async () => {
    const { target, cleanup } = renderSvelte(DirListResultCard, {
      path: "src",
      count: 0,
      entries: "[]"
    });
    await flushUi();

    expect(target.querySelector(".bds-dir-list-empty")).toBeTruthy();

    cleanup();
  });

  it("renders the error state when a listing fails", async () => {
    const { target, cleanup } = renderSvelte(DirListResultCard, {
      path: "missing",
      count: 0,
      entries: "[]",
      error: "Directory \"missing\" was not found in the active codebase."
    });
    await flushUi();

    expect(target.querySelector(".bds-dir-list-error")).toBeTruthy();
    expect(target.querySelector(".bds-dir-list-error-msg").textContent).toContain("was not found");
    expect(target.querySelector(".bds-dir-list-empty")).toBeNull();

    cleanup();
  });

  it("falls back to an empty state for non-JSON entries", async () => {
    const { target, cleanup } = renderSvelte(DirListResultCard, {
      path: "src",
      count: 0,
      entries: "not json"
    });
    await flushUi();

    expect(target.querySelector(".bds-dir-list-empty")).toBeTruthy();

    cleanup();
  });
});