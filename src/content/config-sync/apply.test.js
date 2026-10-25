// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import { applyConfigPayload, availableSections } from "./apply.js";
import state from "../state.js";
import { DEFAULT_SYSTEM_PROMPT, STORAGE_KEYS } from "../../lib/constants.js";
import { chromeMockState } from "../../../tests/mocks/chrome.js";

const BASE_SETTINGS = {
  theme: "dark",
  githubToken: "local-token",
  systemPrompt: "LOCAL PROMPT",
  activeSystemPromptId: "default",
  systemPromptBackupDone: true,
  systemPromptTemplateVersion: 16,
  downloadBehaviorVersion: 2,
  customSystemPrompts: [{ id: "local", name: "Local", content: "local" }],
};

beforeEach(() => {
  state.settings = { ...BASE_SETTINGS };
  state.skills = [];
  state.memories = {};
  state.mcpServers = [];
  state.savedItems = [];
  chromeMockState.storageData = {};
});

function payload(overrides = {}) {
  return {
    version: 1,
    settings: { theme: "light", githubToken: "", systemPromptBackupDone: false },
    systemPromptIsDefault: true,
    skills: [{ id: "k1" }],
    savedItems: [{ id: "s1" }],
    ...overrides,
  };
}

describe("availableSections", () => {
  it("lists only the sections the payload actually carries", () => {
    expect(availableSections(payload())).toEqual(["settings", "skills", "savedItems"]);
  });

  it("honours the caller's selection", () => {
    expect(availableSections(payload(), ["skills"])).toEqual(["skills"]);
  });

  it("returns nothing for an empty payload", () => {
    expect(availableSections(null)).toEqual([]);
  });
});

describe("applyConfigPayload", () => {
  it("keeps the destination's token and migration flags", async () => {
    await applyConfigPayload(payload(), ["settings"]);

    expect(state.settings.theme).toBe("light");
    expect(state.settings.githubToken).toBe("local-token");
    expect(state.settings.systemPromptBackupDone).toBe(true);
    expect(state.settings.systemPromptTemplateVersion).toBe(16);
  });

  it("falls back to this build's default prompt when the source never edited it", async () => {
    await applyConfigPayload(payload(), ["settings"]);

    expect(state.settings.activeSystemPromptId).toBe("default");
    expect(state.settings.systemPrompt).toBe(DEFAULT_SYSTEM_PROMPT);
  });

  it("keeps a custom prompt that travelled as text", async () => {
    await applyConfigPayload(
      payload({
        systemPromptIsDefault: false,
        settings: { activeSystemPromptId: "p1", systemPrompt: "be terse" },
      }),
      ["settings"],
    );

    expect(state.settings.activeSystemPromptId).toBe("p1");
    expect(state.settings.systemPrompt).toBe("be terse");
  });

  it("never lets the settings blob overwrite the prompt list", async () => {
    await applyConfigPayload(
      payload({ settings: { theme: "light", customSystemPrompts: [] } }),
      ["settings"],
    );

    expect(state.settings.customSystemPrompts).toEqual(BASE_SETTINGS.customSystemPrompts);
  });

  it("only touches the selected sections", async () => {
    const result = await applyConfigPayload(payload(), ["skills"]);

    expect(result.applied).toEqual(["skills"]);
    expect(state.skills).toEqual([{ id: "k1" }]);
    expect(state.savedItems).toEqual([]);
    expect(state.settings.theme).toBe("dark");
    expect(chromeMockState.storageData[STORAGE_KEYS.settings]).toBeUndefined();
  });

  it("persists every applied section under its own storage key", async () => {
    await applyConfigPayload(payload(), ["settings", "skills", "savedItems"]);

    expect(chromeMockState.storageData[STORAGE_KEYS.settings].theme).toBe("light");
    expect(chromeMockState.storageData[STORAGE_KEYS.skills]).toEqual([{ id: "k1" }]);
    expect(chromeMockState.storageData[STORAGE_KEYS.savedItems]).toEqual([{ id: "s1" }]);
  });

  it("ignores unknown section keys instead of writing them to state", async () => {
    const result = await applyConfigPayload(payload({ nope: [1, 2, 3] }), ["nope"]);

    expect(result.applied).toEqual([]);
    expect(state.nope).toBeUndefined();
  });

  it("does nothing for a missing payload", async () => {
    expect(await applyConfigPayload(null, ["settings"])).toEqual({ applied: [] });
  });
});
