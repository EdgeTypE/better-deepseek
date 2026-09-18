// @vitest-environment jsdom
//
// Regression cover for the export/import round trip of the four data-management
// sections. Issue #153 reported that export produced .json while import only
// accepted .md; the round trip did work, but nothing in the suite proved it, and
// a JSON backup renamed to .md was silently imported as raw markdown.

import { beforeEach, describe, expect, it, vi } from "vitest";

const bridgeMocks = vi.hoisted(() => ({ pushConfigToPage: vi.fn() }));
const nativeFileInputMocks = vi.hoisted(() => ({ openNativeFilePicker: vi.fn() }));

vi.mock("../../../src/content/bridge.js", () => bridgeMocks);
vi.mock("../../../src/content/files/native-file-input.js", () => nativeFileInputMocks);

import CharacterList from "../../../src/content/ui/CharacterList.svelte";
import MemoryList from "../../../src/content/ui/MemoryList.svelte";
import SavedItems from "../../../src/content/ui/SavedItems.svelte";
import SkillList from "../../../src/content/ui/SkillList.svelte";
import state from "../../../src/content/state.js";
import { STORAGE_KEYS } from "../../../src/lib/constants.js";
import { resetAppState } from "../../helpers/app-state.js";
import { renderSvelte, flushUi } from "../../helpers/svelte.js";

const SKILL = {
  id: "s1",
  name: "Debugger",
  usage: "logs",
  content: "Inspect logs",
  active: true,
};

const PERSONA = {
  id: "c1",
  name: "Mage",
  usage: "rp",
  content: "wise",
  active: true,
};

const BOOKMARK = {
  id: "b1",
  type: "bookmark",
  title: "note",
  content: "hello world",
  messageType: "user",
  messageNodeId: "n1",
  createdAt: 1,
  updatedAt: 1,
  conversationTitle: "",
  conversationUrl: "",
};

async function uploadFile(input, file) {
  Object.defineProperty(input, "files", { configurable: true, value: [file] });
  input.dispatchEvent(new Event("change", { bubbles: true }));
  await flushUi();
  await new Promise((resolve) => setTimeout(resolve, 20));
}

function importButton(target) {
  return Array.from(target.querySelectorAll("button")).find((button) =>
    button.textContent.includes("Import"),
  );
}

function toasts() {
  return state.ui.showToast.mock.calls.map((call) => call[0]);
}

async function importMemory(target, json) {
  const originalFileReader = globalThis.FileReader;
  globalThis.FileReader = class {
    readAsText() {
      this.onload?.({ target: { result: json } });
    }
  };
  try {
    await uploadFile(target.querySelector('input[type="file"]'), {
      name: "bds_memories.json",
    });
  } finally {
    globalThis.FileReader = originalFileReader;
  }
}

async function importSavedItems(target, json) {
  let created = null;
  const originalCreateElement = document.createElement.bind(document);
  const spy = vi.spyOn(document, "createElement").mockImplementation((tag) => {
    const element = originalCreateElement(tag);
    if (String(tag).toLowerCase() === "input") created = element;
    return element;
  });

  importButton(target).click();
  await flushUi();
  spy.mockRestore();

  expect(created).not.toBeNull();
  await uploadFile(created, { name: "bds_saved_items.json", text: async () => json });
}

describe("export -> import round trip", () => {
  beforeEach(() => {
    resetAppState({
      ui: { showToast: vi.fn(), showConfirm: vi.fn(() => Promise.resolve(true)) },
    });
    bridgeMocks.pushConfigToPage.mockReset();
    document.body.innerHTML = "";
  });

  it("restores exported skills", async () => {
    state.skills = [SKILL];
    const backup = JSON.stringify(state.skills, null, 2);
    state.skills = [];

    const { target, cleanup } = renderSvelte(SkillList);
    await flushUi();
    await uploadFile(target.querySelector("#bds-skill-upload"), {
      name: "bds_skills.json",
      text: async () => backup,
    });

    expect(state.skills).toHaveLength(1);
    expect(state.skills[0]).toMatchObject({
      name: "Debugger",
      usage: "logs",
      content: "Inspect logs",
      active: true,
    });
    expect(toasts()).toContain("1 skill(s) imported.");
    cleanup();
  });

  it("restores exported personas", async () => {
    state.characters = [PERSONA];
    const backup = JSON.stringify(state.characters, null, 2);
    state.characters = [];

    const { target, cleanup } = renderSvelte(CharacterList);
    await flushUi();
    await uploadFile(target.querySelector("#bds-char-upload"), {
      name: "bds_characters.json",
      text: async () => backup,
    });

    expect(state.characters).toHaveLength(1);
    expect(state.characters[0]).toMatchObject({
      name: "Mage",
      usage: "rp",
      content: "wise",
    });
    expect(toasts()).toContain("1 persona(s) imported.");
    cleanup();
  });

  it("restores exported saved items", async () => {
    state.savedItems = [BOOKMARK];
    const backup = JSON.stringify(state.savedItems, null, 2);
    state.savedItems = [];

    const { target, cleanup } = renderSvelte(SavedItems);
    await flushUi();
    await importSavedItems(target, backup);

    expect(state.savedItems).toHaveLength(1);
    expect(state.savedItems[0]).toMatchObject({ id: "b1", content: "hello world" });
    expect(toasts()).toContain("Imported 1 items");
    cleanup();
  });

  it("restores exported memories", async () => {
    state.memories = { theme: { value: "dark", importance: "always" } };
    const backup = JSON.stringify(state.memories, null, 2);
    state.memories = {};

    const { target, cleanup } = renderSvelte(MemoryList);
    await flushUi();
    await importMemory(target, backup);

    expect(chrome.storage.local.set).toHaveBeenLastCalledWith({
      [STORAGE_KEYS.memories]: {
        theme: { value: "dark", importance: "always" },
      },
    });
    expect(toasts()).toContain("Memories imported successfully.");
    cleanup();
  });
});

describe("import format detection", () => {
  beforeEach(() => {
    resetAppState({
      ui: { showToast: vi.fn(), showConfirm: vi.fn(() => Promise.resolve(true)) },
    });
    bridgeMocks.pushConfigToPage.mockReset();
    document.body.innerHTML = "";
  });

  it("reads a JSON skill backup that was renamed to .md as JSON", async () => {
    state.skills = [SKILL];
    const backup = JSON.stringify(state.skills, null, 2);
    state.skills = [];

    const { target, cleanup } = renderSvelte(SkillList);
    await flushUi();
    await uploadFile(target.querySelector("#bds-skill-upload"), {
      name: "bds_skills.md",
      text: async () => backup,
    });

    expect(state.skills).toHaveLength(1);
    expect(state.skills[0].name).toBe("Debugger");
    expect(state.skills[0].content).toBe("Inspect logs");
    cleanup();
  });

  it("reads a JSON persona backup that was renamed to .md as JSON", async () => {
    state.characters = [PERSONA];
    const backup = JSON.stringify(state.characters, null, 2);
    state.characters = [];

    const { target, cleanup } = renderSvelte(CharacterList);
    await flushUi();
    await uploadFile(target.querySelector("#bds-char-upload"), {
      name: "bds_characters.md",
      text: async () => backup,
    });

    expect(state.characters).toHaveLength(1);
    expect(state.characters[0].name).toBe("Mage");
    cleanup();
  });

  it("still imports markdown as a single skill", async () => {
    const { target, cleanup } = renderSvelte(SkillList);
    await flushUi();
    await uploadFile(target.querySelector("#bds-skill-upload"), {
      name: "reviewer.md",
      text: async () => "# Reviewer\n\nCheck the diff carefully.",
    });

    expect(state.skills).toHaveLength(1);
    expect(state.skills[0]).toMatchObject({
      name: "reviewer",
      content: "# Reviewer\n\nCheck the diff carefully.",
      active: true,
    });
    cleanup();
  });

  it("rejects a file whose content is neither JSON nor markdown", async () => {
    state.skills = [SKILL];

    const { target, cleanup } = renderSvelte(SkillList);
    await flushUi();
    await uploadFile(target.querySelector("#bds-skill-upload"), {
      name: "notes.txt",
      text: async () => "plain notes",
    });

    expect(state.skills).toHaveLength(1);
    expect(toasts()).toContain("Only .md and .json files are supported for skills.");
    cleanup();
  });

  it("surfaces a read failure instead of leaving the input stuck", async () => {
    state.skills = [SKILL];

    const { target, cleanup } = renderSvelte(SkillList);
    await flushUi();
    const input = target.querySelector("#bds-skill-upload");
    await uploadFile(input, {
      name: "broken.md",
      text: async () => {
        throw new Error("read failed");
      },
    });

    expect(state.skills).toHaveLength(1);
    expect(toasts()).toContain("Failed to import skills. Invalid file format.");
    expect(input.value).toBe("");
    cleanup();
  });
});

describe("memory import semantics", () => {
  beforeEach(() => {
    resetAppState({
      ui: { showToast: vi.fn(), showConfirm: vi.fn(() => Promise.resolve(true)) },
    });
    document.body.innerHTML = "";
  });

  it("merges into existing memories instead of replacing them", async () => {
    state.memories = { keep: { value: "keep me", importance: "called" } };
    const backup = JSON.stringify({
      theme: { value: "dark", importance: "always" },
    });

    const { target, cleanup } = renderSvelte(MemoryList);
    await flushUi();
    await importMemory(target, backup);

    expect(chrome.storage.local.set).toHaveBeenLastCalledWith({
      [STORAGE_KEYS.memories]: {
        keep: { value: "keep me", importance: "called" },
        theme: { value: "dark", importance: "always" },
      },
    });
    cleanup();
  });

  it("lets the imported value win on a key collision", async () => {
    state.memories = { theme: { value: "light", importance: "called" } };
    const backup = JSON.stringify({
      theme: { value: "dark", importance: "always" },
    });

    const { target, cleanup } = renderSvelte(MemoryList);
    await flushUi();
    await importMemory(target, backup);

    expect(chrome.storage.local.set).toHaveBeenLastCalledWith({
      [STORAGE_KEYS.memories]: {
        theme: { value: "dark", importance: "always" },
      },
    });
    cleanup();
  });

  it("refuses a full backup instead of reporting a silent success", async () => {
    state.memories = { keep: { value: "keep me", importance: "called" } };

    const { target, cleanup } = renderSvelte(MemoryList);
    await flushUi();
    await importMemory(
      target,
      JSON.stringify({
        version: 1,
        exportedAt: "2026-09-18T00:00:00.000Z",
        skills: [{ id: "s1", name: "Debugger", content: "x", active: true }],
        memories: { theme: { value: "dark", importance: "always" } },
      }),
    );

    expect(state.memories).toEqual({ keep: { value: "keep me", importance: "called" } });
    expect(toasts()).toContain("No memory entries found in this file.");
    expect(toasts()).not.toContain("Memories imported successfully.");
    cleanup();
  });

  it("refuses an encrypted backup instead of reporting a silent success", async () => {
    state.memories = { keep: { value: "keep me", importance: "called" } };

    const { target, cleanup } = renderSvelte(MemoryList);
    await flushUi();
    await importMemory(
      target,
      JSON.stringify({ encrypted: true, salt: "abc", iv: "def", data: "ghi" }),
    );

    expect(state.memories).toEqual({ keep: { value: "keep me", importance: "called" } });
    expect(toasts()).toContain("No memory entries found in this file.");
    cleanup();
  });
});

describe("saved items import reporting", () => {
  beforeEach(() => {
    resetAppState({
      ui: { showToast: vi.fn(), showConfirm: vi.fn(() => Promise.resolve(true)) },
    });
    document.body.innerHTML = "";
  });

  it("reports how many items were actually added", async () => {
    state.savedItems = [BOOKMARK];
    const backup = JSON.stringify([BOOKMARK]);

    const { target, cleanup } = renderSvelte(SavedItems);
    await flushUi();
    await importSavedItems(target, backup);

    expect(state.savedItems).toHaveLength(1);
    expect(toasts()).toContain("Imported 0 items");
    cleanup();
  });
});
