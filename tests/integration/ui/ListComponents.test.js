// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const bridgeMocks = vi.hoisted(() => ({
  pushConfigToPage: vi.fn(),
}));

const nativeFileInputMocks = vi.hoisted(() => ({
  openNativeFilePicker: vi.fn(),
}));

vi.mock("../../../src/content/bridge.js", () => bridgeMocks);
vi.mock("../../../src/content/files/native-file-input.js", () => nativeFileInputMocks);

import CharacterList from "../../../src/content/ui/CharacterList.svelte";
import MemoryList from "../../../src/content/ui/MemoryList.svelte";
import SkillList from "../../../src/content/ui/SkillList.svelte";
import state from "../../../src/content/state.js";
import { resetAppState } from "../../helpers/app-state.js";
import { renderSvelte, flushUi } from "../../helpers/svelte.js";

async function triggerFileInput(input, file) {
  Object.defineProperty(input, "files", {
    configurable: true,
    value: [file],
  });
  input.dispatchEvent(new Event("change", { bubbles: true }));
  await flushUi();
  await new Promise((resolve) => setTimeout(resolve, 20));
}

function getButtonByText(target, text) {
  return Array.from(target.querySelectorAll("button")).find((button) =>
    button.textContent.includes(text),
  );
}

describe("memory, character, and skill components", () => {
  beforeEach(() => {
    resetAppState({
      ui: { showToast: vi.fn() },
    });
    bridgeMocks.pushConfigToPage.mockReset();
    nativeFileInputMocks.openNativeFilePicker.mockReset();
    document.body.innerHTML = "";
  });

  it("MemoryList deletes and imports memories", async () => {
    state.memories = {
      alpha: { value: "A", importance: "always" },
    };

    const { target, cleanup } = renderSvelte(MemoryList);
    target.querySelector(".bds-btn-danger").click();
    await flushUi();

    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      bds_memories: {},
    });

    const fileInput = target.querySelector('input[type="file"]');
    const file = { __text: '{"theme":{"value":"dark","importance":"always"}}' };
    const originalFileReader = globalThis.FileReader;
    globalThis.FileReader = class {
      readAsText(selectedFile) {
        this.onload?.({
          target: {
            result: selectedFile.__text,
          },
        });
      }
    };
    await triggerFileInput(fileInput, file);

    expect(chrome.storage.local.set).toHaveBeenLastCalledWith({
      bds_memories: {
        theme: { value: "dark", importance: "always" },
      },
    });
    globalThis.FileReader = originalFileReader;
    cleanup();
  });

  it("MemoryList import button keeps a single-file input", async () => {
    const { target, cleanup } = renderSvelte(MemoryList);
    await flushUi();
    const fileInput = target.querySelector('input[type="file"]');

    getButtonByText(target, "Import").click();
    await flushUi();

    expect(nativeFileInputMocks.openNativeFilePicker).toHaveBeenCalledWith(
      fileInput,
      { preferSingle: true },
    );
    expect(fileInput.multiple).toBe(false);
    cleanup();
  });

  it("CharacterList edits and uploads characters", async () => {
    state.characters = [
      { id: "c1", name: "Mage", usage: "rp", content: "wise", active: true },
    ];

    const { target, cleanup } = renderSvelte(CharacterList);

    getButtonByText(target, "Edit").click();
    await flushUi();
    const inputs = target.querySelectorAll(".bds-inline-editor .bds-input");
    inputs[0].value = "Wizard";
    inputs[0].dispatchEvent(new Event("input", { bubbles: true }));
    target.querySelector(".bds-inline-editor textarea").value = "arcane";
    target.querySelector(".bds-inline-editor textarea").dispatchEvent(
      new Event("input", { bubbles: true }),
    );
    target.querySelector(".bds-inline-editor .bds-btn").click();
    await flushUi();

    expect(chrome.storage.local.set).toHaveBeenCalled();
    expect(bridgeMocks.pushConfigToPage).toHaveBeenCalled();

    const uploadInput = target.querySelector("#bds-char-upload");
    const file = {
      name: "rogue.md",
      text: async () => "persona body",
    };
    await triggerFileInput(uploadInput, file);

    expect(state.characters.some((item) => item.name === "rogue")).toBe(true);
    cleanup();
  });

  it("CharacterList accepts lowercase .md persona uploads", async () => {
    const { target, cleanup } = renderSvelte(CharacterList);
    const uploadInput = target.querySelector("#bds-char-upload");
    const file = {
      name: "test.md",
      text: vi.fn(async () => "persona body"),
    };

    await triggerFileInput(uploadInput, file);

    expect(state.characters).toMatchObject([
      {
        name: "test",
        usage: "uploaded",
        content: "persona body",
        active: true,
      },
    ]);
    expect(state.ui.showToast).not.toHaveBeenCalledWith(
      "Only .md files are supported for persona uploads.",
    );
    cleanup();
  });

  it("CharacterList rejects non-.md persona uploads", async () => {
    state.characters = [
      { id: "c1", name: "Mage", usage: "rp", content: "wise", active: true },
    ];
    const initialCharacters = structuredClone(state.characters);
    const { target, cleanup } = renderSvelte(CharacterList);
    const uploadInput = target.querySelector("#bds-char-upload");
    const file = {
      name: "notes.txt",
      text: vi.fn(async () => "persona body"),
    };

    await triggerFileInput(uploadInput, file);

    expect(file.text).not.toHaveBeenCalled();
    expect(state.characters).toEqual(initialCharacters);
    expect(state.ui.showToast).toHaveBeenCalledWith(
      "Only .md files are supported for persona uploads.",
    );
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
    expect(bridgeMocks.pushConfigToPage).not.toHaveBeenCalled();
    cleanup();
  });

  it("CharacterList accepts uppercase .MD persona uploads", async () => {
    const { target, cleanup } = renderSvelte(CharacterList);
    const uploadInput = target.querySelector("#bds-char-upload");
    const file = {
      name: "TEST.MD",
      text: vi.fn(async () => "persona body"),
    };

    await triggerFileInput(uploadInput, file);

    expect(state.characters.some((item) => item.name === "TEST")).toBe(true);
    expect(state.ui.showToast).not.toHaveBeenCalledWith(
      "Only .md files are supported for persona uploads.",
    );
    cleanup();
  });

  it("CharacterList keeps import and persona uploads single-file", async () => {
    const { target, cleanup } = renderSvelte(CharacterList);
    await flushUi();
    const uploadInput = target.querySelector("#bds-char-upload");

    getButtonByText(target, "Import").click();
    await flushUi();

    expect(nativeFileInputMocks.openNativeFilePicker).toHaveBeenCalledWith(
      uploadInput,
      { preferSingle: true },
    );
    expect(uploadInput.multiple).toBe(false);
    expect(uploadInput.accept).toBe(".md");
    expect(target.querySelector('input[type="file"][accept=".json"]')).toBeNull();
    cleanup();
  });

  it("SkillList toggles, edits, and uploads skills", async () => {
    state.skills = [
      { id: "s1", name: "Debugger", content: "Inspect logs", active: true },
    ];

    const { target, cleanup } = renderSvelte(SkillList);

    const checkbox = target.querySelector('input[type="checkbox"]');
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event("change", { bubbles: true }));
    await flushUi();
    expect(chrome.storage.local.set).toHaveBeenCalled();

    getButtonByText(target, "Edit").click();
    await flushUi();
    target.querySelector(".bds-inline-editor input").value = "Reviewer";
    target.querySelector(".bds-inline-editor input").dispatchEvent(
      new Event("input", { bubbles: true }),
    );
    target.querySelector(".bds-inline-editor .bds-btn").click();
    await flushUi();

    const uploadInput = target.querySelector("#bds-skill-upload");
    const file = {
      name: "planner.md",
      text: async () => "skill body",
    };
    await triggerFileInput(uploadInput, file);

    expect(state.skills.some((item) => item.name === "planner")).toBe(true);
    expect(bridgeMocks.pushConfigToPage).toHaveBeenCalled();
    cleanup();
  });

  it("SkillList accepts lowercase .md skill uploads", async () => {
    const { target, cleanup } = renderSvelte(SkillList);
    const uploadInput = target.querySelector("#bds-skill-upload");
    const file = {
      name: "test.md",
      text: vi.fn(async () => "skill body"),
    };

    await triggerFileInput(uploadInput, file);

    expect(state.skills).toMatchObject([
      {
        name: "test",
        content: "skill body",
        active: true,
      },
    ]);
    expect(state.ui.showToast).not.toHaveBeenCalledWith(
      "Only .md files are supported for skills.",
    );
    cleanup();
  });

  it("SkillList rejects non-.md skill uploads", async () => {
    state.skills = [
      { id: "s1", name: "Debugger", content: "Inspect logs", active: true },
    ];
    const initialSkills = structuredClone(state.skills);
    const { target, cleanup } = renderSvelte(SkillList);
    const uploadInput = target.querySelector("#bds-skill-upload");
    const file = {
      name: "notes.txt",
      text: vi.fn(async () => "skill body"),
    };

    await triggerFileInput(uploadInput, file);

    expect(file.text).not.toHaveBeenCalled();
    expect(state.skills).toEqual(initialSkills);
    expect(state.ui.showToast).toHaveBeenCalledWith(
      "Only .md files are supported for skills.",
    );
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
    expect(bridgeMocks.pushConfigToPage).not.toHaveBeenCalled();
    cleanup();
  });

  it("SkillList accepts uppercase .MD skill uploads", async () => {
    const { target, cleanup } = renderSvelte(SkillList);
    const uploadInput = target.querySelector("#bds-skill-upload");
    const file = {
      name: "TEST.MD",
      text: vi.fn(async () => "skill body"),
    };

    await triggerFileInput(uploadInput, file);

    expect(state.skills.some((item) => item.name === "TEST")).toBe(true);
    expect(state.ui.showToast).not.toHaveBeenCalledWith(
      "Only .md files are supported for skills.",
    );
    cleanup();
  });

  it("SkillList keeps import and skill uploads single-file", async () => {
    const { target, cleanup } = renderSvelte(SkillList);
    await flushUi();
    const uploadInput = target.querySelector("#bds-skill-upload");

    getButtonByText(target, "Import").click();
    await flushUi();

    expect(nativeFileInputMocks.openNativeFilePicker).toHaveBeenCalledWith(
      uploadInput,
      { preferSingle: true },
    );
    expect(uploadInput.multiple).toBe(false);
    expect(uploadInput.accept).toBe(".md");
    expect(target.querySelector('input[type="file"][accept=".json"]')).toBeNull();
    cleanup();
  });
});
