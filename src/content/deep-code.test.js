// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi } from "vitest";
import state from "./state.js";
import { addRecentDirectory } from "./deep-code.js";

function flushPromises() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("addRecentDirectory", () => {
  beforeEach(() => {
    state.deepCode.recentDirectories = [];
    state.deepCode.manualPath = "";
    state.deepCode.activeDirectory = null;
    vi.spyOn(window, "dispatchEvent").mockImplementation(() => true);
  });

  it("accumulates multiple distinct directories", async () => {
    await addRecentDirectory("asistan", "A:/Users/Edige/GitHub/asistan", 44);
    await addRecentDirectory("DOOMonSystemTray", "A:/Users/Edige/GitHub/DOOMonSystemTray", 24);
    await flushPromises();

    expect(state.deepCode.recentDirectories).toHaveLength(2);
    expect(state.deepCode.recentDirectories[0].name).toBe("DOOMonSystemTray");
    expect(state.deepCode.recentDirectories[1].name).toBe("asistan");
  });

  it("keeps distinct directories even when path is empty", async () => {
    await addRecentDirectory("proje-a", "", 5);
    await addRecentDirectory("proje-b", "", 3);
    await flushPromises();

    expect(state.deepCode.recentDirectories).toHaveLength(2);
  });

  it("deduplicates by name on re-add", async () => {
    await addRecentDirectory("asistan", "A:/Users/Edige/GitHub/asistan", 44);
    await addRecentDirectory("asistan", "A:/Users/Edige/GitHub/asistan", 50);
    await flushPromises();

    expect(state.deepCode.recentDirectories).toHaveLength(1);
    expect(state.deepCode.recentDirectories[0].fileCount).toBe(50);
  });

  it("deduplicates by path for differently-named entries of the same directory", async () => {
    await addRecentDirectory("asistan", "A:/Users/Edige/GitHub/asistan", 44);
    await addRecentDirectory("Asistan", "A:/Users/Edige/GitHub/asistan", 44);
    await flushPromises();

    expect(state.deepCode.recentDirectories).toHaveLength(1);
  });

  it("caps the list at 10 entries", async () => {
    for (let i = 0; i < 12; i++) {
      await addRecentDirectory(`proje-${i}`, `A:/dirs/proje-${i}`, i);
    }
    await flushPromises();

    expect(state.deepCode.recentDirectories).toHaveLength(10);
  });
});