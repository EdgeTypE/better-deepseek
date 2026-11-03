// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import ActiveSkillsChip from "../../../src/content/ui/ActiveSkillsChip.svelte";
import SkillList from "../../../src/content/ui/SkillList.svelte";
import state from "../../../src/content/state.js";
import { resetAppState } from "../../helpers/app-state.js";
import { renderSvelte, flushUi } from "../../helpers/svelte.js";

describe("ActiveSkillsChip component", () => {
  beforeEach(() => {
    resetAppState();
    document.body.innerHTML = "";
    vi.restoreAllMocks();

    global.chrome = {
      storage: {
        local: {
          get: vi.fn((keys, cb) => cb ? cb({}) : Promise.resolve({})),
          set: vi.fn(() => Promise.resolve()),
          remove: vi.fn(() => Promise.resolve()),
        },
        onChanged: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
    };
  });

  it("renders nothing when no skills are active", async () => {
    state.skills = [
      { id: "s1", name: "Python Pro", active: false },
      { id: "s2", name: "Translator", active: false },
    ];

    const { target, cleanup } = renderSvelte(ActiveSkillsChip);
    await flushUi();

    const chip = target.querySelector('[data-testid="bds-skill-chip"]');
    expect(chip).toBeNull();
    cleanup();
  });

  it("renders chip with skill name when exactly one skill is active", async () => {
    state.skills = [
      { id: "s1", name: "Python Pro", active: true },
      { id: "s2", name: "Translator", active: false },
    ];

    const { target, cleanup } = renderSvelte(ActiveSkillsChip);
    await flushUi();

    const chip = target.querySelector('[data-testid="bds-skill-chip"]');
    expect(chip).toBeTruthy();
    expect(chip.classList.contains("ds-toggle-button")).toBe(true);
    expect(chip.classList.contains("ds-toggle-button--selected")).toBe(true);
    expect(chip.textContent).toContain("Python Pro");
    expect(chip.querySelector(".bds-skill-chip-dismiss")).toBeTruthy();
    cleanup();
  });

  it("quick dismiss disables single active skill and hides chip", async () => {
    state.skills = [
      { id: "s1", name: "Python Pro", active: true },
    ];
    state.ui = { showToast: vi.fn() };

    const { target, cleanup } = renderSvelte(ActiveSkillsChip);
    await flushUi();

    const dismissBtn = target.querySelector(".bds-skill-chip-dismiss");
    expect(dismissBtn).toBeTruthy();

    dismissBtn.click();
    await flushUi();

    expect(state.skills[0].active).toBe(false);
    expect(chrome.storage.local.set).toHaveBeenCalled();
    expect(state.ui.showToast).toHaveBeenCalledWith(expect.stringContaining("Python Pro"));

    // Chip should disappear
    const chip = target.querySelector('[data-testid="bds-skill-chip"]');
    expect(chip).toBeNull();
    cleanup();
  });

  it("renders count and chevron when multiple skills are active", async () => {
    state.skills = [
      { id: "s1", name: "Python Pro", active: true },
      { id: "s2", name: "Translator", active: true },
    ];

    const { target, cleanup } = renderSvelte(ActiveSkillsChip);
    await flushUi();

    const chip = target.querySelector('[data-testid="bds-skill-chip"]');
    expect(chip).toBeTruthy();
    expect(chip.textContent).toContain("2 Skills");
    expect(chip.querySelector(".bds-toggle-chevron")).toBeTruthy();
    cleanup();
  });

  it("clicking chip opens dropdown panel listing active skills", async () => {
    state.skills = [
      { id: "s1", name: "Python Pro", usage: "code review", active: true },
      { id: "s2", name: "Translator", usage: "es to en", active: true },
    ];

    const { target, cleanup } = renderSvelte(ActiveSkillsChip);
    await flushUi();

    const chip = target.querySelector('[data-testid="bds-skill-chip"]');
    chip.click();
    await flushUi();

    const panel = target.querySelector(".bds-skill-panel");
    expect(panel).toBeTruthy();

    const items = panel.querySelectorAll(".bds-skill-panel-item");
    expect(items.length).toBe(2);
    expect(items[0].textContent).toContain("Python Pro");
    expect(items[1].textContent).toContain("Translator");
    cleanup();
  });

  it("can disable individual skill from dropdown panel", async () => {
    state.skills = [
      { id: "s1", name: "Python Pro", active: true },
      { id: "s2", name: "Translator", active: true },
    ];
    state.ui = { showToast: vi.fn() };

    const { target, cleanup } = renderSvelte(ActiveSkillsChip);
    await flushUi();

    target.querySelector('[data-testid="bds-skill-chip"]').click();
    await flushUi();

    const removeBtns = target.querySelectorAll(".bds-skill-item-remove");
    expect(removeBtns.length).toBe(2);

    // Remove first skill
    removeBtns[0].click();
    await flushUi();

    expect(state.skills[0].active).toBe(false);
    expect(state.skills[1].active).toBe(true);

    // Now only 1 skill active, chip label becomes single name
    const chip = target.querySelector('[data-testid="bds-skill-chip"]');
    expect(chip.textContent).toContain("Translator");
    cleanup();
  });

  it("can disable all skills from dropdown panel", async () => {
    state.skills = [
      { id: "s1", name: "Python Pro", active: true },
      { id: "s2", name: "Translator", active: true },
    ];
    state.ui = { showToast: vi.fn() };

    const { target, cleanup } = renderSvelte(ActiveSkillsChip);
    await flushUi();

    target.querySelector('[data-testid="bds-skill-chip"]').click();
    await flushUi();

    const disableAllBtn = target.querySelector(".bds-btn-danger-text");
    expect(disableAllBtn).toBeTruthy();

    disableAllBtn.click();
    await flushUi();

    expect(state.skills.every((s) => !s.active)).toBe(true);
    expect(target.querySelector('[data-testid="bds-skill-chip"]')).toBeNull();
    cleanup();
  });

  it("dispatches bds:open-drawer when Manage Skills is clicked", async () => {
    state.skills = [{ id: "s1", name: "Python Pro", active: true }];

    const { target, cleanup } = renderSvelte(ActiveSkillsChip);
    await flushUi();

    target.querySelector('[data-testid="bds-skill-chip"]').click();
    await flushUi();

    let drawerEventDetail = null;
    window.addEventListener("bds:open-drawer", (e) => {
      drawerEventDetail = e.detail;
    });

    const manageBtn = target.querySelector(".bds-btn-primary-text");
    expect(manageBtn).toBeTruthy();
    manageBtn.click();
    await flushUi();

    expect(drawerEventDetail).toEqual({ section: "skills" });
    cleanup();
  });

  it("reacts to bds:skillsChanged event dynamically", async () => {
    state.skills = [{ id: "s1", name: "Python Pro", active: false }];

    const { target, cleanup } = renderSvelte(ActiveSkillsChip);
    await flushUi();

    expect(target.querySelector('[data-testid="bds-skill-chip"]')).toBeNull();

    // Activate skill externally
    state.skills[0].active = true;
    window.dispatchEvent(new CustomEvent("bds:skillsChanged"));
    await flushUi();

    const chip = target.querySelector('[data-testid="bds-skill-chip"]');
    expect(chip).toBeTruthy();
    expect(chip.textContent).toContain("Python Pro");
    cleanup();
  });

  it("hides chip when showSelectedSkillsOnComposer is false", async () => {
    state.settings.showSelectedSkillsOnComposer = false;
    state.skills = [{ id: "s1", name: "Python Pro", active: true }];

    const { target, cleanup } = renderSvelte(ActiveSkillsChip);
    await flushUi();

    expect(target.querySelector('[data-testid="bds-skill-chip"]')).toBeNull();

    // Turn setting back on
    state.settings.showSelectedSkillsOnComposer = true;
    window.dispatchEvent(new CustomEvent("bds:settingsChanged"));
    await flushUi();

    expect(target.querySelector('[data-testid="bds-skill-chip"]')).toBeTruthy();
    cleanup();
  });

  it("SkillList renders sub-drawer with both settings", async () => {
    const { target, cleanup } = renderSvelte(SkillList);
    await flushUi();

    const toggleBtn = target.querySelector('[data-testid="bds-skill-settings-toggle"]');
    expect(toggleBtn).toBeTruthy();
    expect(toggleBtn.textContent).toContain("Skill Settings");

    // Click to open sub-drawer
    toggleBtn.click();
    await flushUi();

    const subContent = target.querySelector(".bds-sub-content");
    expect(subContent.classList.contains("open")).toBe(true);

    const toggleRows = target.querySelectorAll(".bds-sub-content .bds-toggle-row");
    expect(toggleRows.length).toBe(2);
    expect(toggleRows[0].textContent).toContain("Reset Skills on New Chat");
    expect(toggleRows[1].textContent).toContain("Show Selected Skills on Composer");

    cleanup();
  });
});
