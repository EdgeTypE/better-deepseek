// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const bridgeMocks = vi.hoisted(() => ({
  pushConfigToPage: vi.fn(),
}));

const projectManagerMocks = vi.hoisted(() => ({
  getActiveProject: vi.fn(),
  updateProject: vi.fn(),
}));

vi.mock("../../../src/content/bridge.js", () => bridgeMocks);
vi.mock("../../../src/content/project-manager.js", () => projectManagerMocks);

import SettingsPanel from "../../../src/content/ui/SettingsPanel.svelte";
import state from "../../../src/content/state.js";
import { resetAppState } from "../../helpers/app-state.js";
import { renderSvelte, flushUi } from "../../helpers/svelte.js";

describe("SettingsPanel integration", () => {
  beforeEach(() => {
    resetAppState({
      ui: { showToast: vi.fn() },
    });
    state.settings.systemPrompt = "Initial prompt";
    state.settings.githubToken = "ghp_secret";
    bridgeMocks.pushConfigToPage.mockReset();
    projectManagerMocks.getActiveProject.mockReset();
    projectManagerMocks.updateProject.mockReset();
    projectManagerMocks.getActiveProject.mockReturnValue({
      id: "p1",
      name: "Project One",
      customInstructions: "Initial project instructions",
    });
    document.body.innerHTML = "";
  });

  it("adds a custom system prompt and saves settings to chrome storage", async () => {
    const { target, cleanup } = renderSvelte(SettingsPanel);

    target.querySelector(".bds-add-prompt-btn").click();
    await flushUi();

    const nameInput = target.querySelector(".bds-modal-body input");
    nameInput.value = "My Rules";
    nameInput.dispatchEvent(new Event("input", { bubbles: true }));

    const contentArea = target.querySelector(".bds-modal-body textarea");
    contentArea.value = "Be concise and helpful";
    contentArea.dispatchEvent(new Event("input", { bubbles: true }));

    target.querySelector(".bds-modal-footer .bds-btn").click();
    await flushUi();

    target.querySelector(".bds-advanced-toggle").click();
    await flushUi();
    target.querySelector("#bds-preferred-lang").value = "Turkish";
    target.querySelector("#bds-preferred-lang").dispatchEvent(
      new Event("input", { bubbles: true }),
    );

    target.querySelector("#bds-save-settings").click();
    await flushUi();

    expect(chrome.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({
        bds_settings: expect.objectContaining({
          customSystemPrompts: expect.arrayContaining([
            expect.objectContaining({
              name: "My Rules",
              content: "Be concise and helpful",
            }),
          ]),
          activeSystemPromptId: expect.any(String),
          preferredLang: "Turkish",
        }),
      }),
    );
    expect(bridgeMocks.pushConfigToPage).toHaveBeenCalled();
    expect(state.ui.showToast).toHaveBeenCalledWith("Settings saved.");
    cleanup();
  });

  it("toggles github token visibility and clears the token", async () => {
    const { target, cleanup } = renderSvelte(SettingsPanel);

    target.querySelector(".bds-advanced-toggle").click();
    await flushUi();

    const tokenInput = target.querySelector("#bds-github-token");
    const buttons = Array.from(target.querySelectorAll(".bds-token-btn"));

    expect(tokenInput.readOnly).toBe(true);
    buttons[0].click();
    await flushUi();
    expect(tokenInput.readOnly).toBe(false);

    buttons[1].click();
    await flushUi();
    expect(tokenInput.value).toBe("");
    cleanup();
  });

  it("auto-saves active project instructions", async () => {
    vi.useFakeTimers();
    const { target, cleanup } = renderSvelte(SettingsPanel);

    const projectInstructions = target.querySelector("#bds-project-instructions");
    projectInstructions.value = "Updated project rules";
    projectInstructions.dispatchEvent(new Event("input", { bubbles: true }));

    await vi.advanceTimersByTimeAsync(700);

    expect(projectManagerMocks.updateProject).toHaveBeenCalledWith("p1", {
      customInstructions: "Updated project rules",
    });
    expect(bridgeMocks.pushConfigToPage).toHaveBeenCalledOnce();
    cleanup();
  });
});
