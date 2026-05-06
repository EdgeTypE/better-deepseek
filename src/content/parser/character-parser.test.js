// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import state from "../state.js";
import { resetAppState } from "../../../tests/helpers/app-state.js";
import { upsertCharacters } from "./character-parser.js";

describe("upsertCharacters", () => {
  it("adds a new active character and persists it", async () => {
    resetAppState({
      ui: { refreshCharacters: vi.fn() },
    });
    vi.useFakeTimers();

    upsertCharacters([{ name: "Mage", usage: "rp", content: "wise" }]);
    await vi.runAllTimersAsync();

    expect(state.characters).toHaveLength(1);
    expect(state.characters[0]).toMatchObject({
      name: "Mage",
      usage: "rp",
      content: "wise",
      active: true,
    });
    expect(chrome.storage.local.set).toHaveBeenCalledOnce();
  });

  it("reactivates an existing matching character instead of duplicating it", async () => {
    resetAppState();
    state.characters = [
      { id: "1", name: "Mage", usage: "rp", content: "wise", active: false },
      { id: "2", name: "Knight", usage: "rp", content: "brave", active: true },
    ];
    vi.useFakeTimers();

    upsertCharacters([{ name: "Mage", usage: "rp", content: "wise" }]);
    await vi.runAllTimersAsync();

    expect(state.characters).toHaveLength(2);
    expect(state.characters[0].active).toBe(true);
    expect(state.characters[1].active).toBe(false);
  });
});
