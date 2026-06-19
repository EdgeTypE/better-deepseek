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

  it("renders and saves Deep Research context guard settings", async () => {
    const { target, cleanup } = renderSvelte(SettingsPanel);

    // Open advanced settings
    target.querySelector(".bds-advanced-toggle").click();
    await flushUi();

    // Context guard toggle should be present and enabled by default
    const guardToggle = target.querySelector("#bds-context-guard-enabled");
    expect(guardToggle).toBeTruthy();
    expect(guardToggle.checked).toBe(true);

    // Context limit input should be visible
    const limitInput = target.querySelector("#bds-context-guard-limit");
    expect(limitInput).toBeTruthy();
    expect(Number(limitInput.value)).toBe(128000);

    // Stop percent slider should be visible
    const percentSlider = target.querySelector(".bds-slider-group input[type=\"range\"]");
    expect(percentSlider).toBeTruthy();

    // Change context limit
    limitInput.value = "64000";
    limitInput.dispatchEvent(new Event("input", { bubbles: true }));

    // Save settings
    target.querySelector("#bds-save-settings").click();
    await flushUi();

    expect(chrome.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({
        bds_settings: expect.objectContaining({
          deepResearchContextGuardEnabled: true,
          deepResearchContextLimitTokens: 64000,
          deepResearchContextStopPercent: 70,
        }),
      }),
    );
    expect(bridgeMocks.pushConfigToPage).toHaveBeenCalled();
    expect(state.ui.showToast).toHaveBeenCalledWith("Settings saved.");
    cleanup();
  });

  it("clamps invalid context guard values on save", async () => {
    const { target, cleanup } = renderSvelte(SettingsPanel);

    target.querySelector(".bds-advanced-toggle").click();
    await flushUi();

    const limitInput = target.querySelector("#bds-context-guard-limit");
    limitInput.value = "100"; // Below minimum 16000
    limitInput.dispatchEvent(new Event("input", { bubbles: true }));

    const percentSlider = target.querySelector(".bds-slider-group input[type=\"range\"]");
    // Set percent to 100 via the slider (should be clamped to 95)
    percentSlider.value = "100";
    percentSlider.dispatchEvent(new Event("input", { bubbles: true }));

    target.querySelector("#bds-save-settings").click();
    await flushUi();

    expect(chrome.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({
        bds_settings: expect.objectContaining({
          deepResearchContextLimitTokens: 16000, // Clamped up from 100
          deepResearchContextStopPercent: 95, // Clamped down from 100
        }),
      }),
    );
    cleanup();
  });

  it("persists context guard values only on explicit save", async () => {
    state.settings.deepResearchContextGuardEnabled = true;
    state.settings.deepResearchContextLimitTokens = 64000;
    state.settings.deepResearchContextStopPercent = 80;

    const { target, cleanup } = renderSvelte(SettingsPanel);

    target.querySelector(".bds-advanced-toggle").click();
    await flushUi();

    // Verify initial values from state are reflected
    const limitInput = target.querySelector("#bds-context-guard-limit");
    expect(Number(limitInput.value)).toBe(64000);

    // Change but don't save — close and reopen
    limitInput.value = "32000";
    limitInput.dispatchEvent(new Event("input", { bubbles: true }));

    // State should still have old values (only save() persists)
    expect(state.settings.deepResearchContextLimitTokens).toBe(64000);

    cleanup();
  });
});
