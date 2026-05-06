import { beforeEach, describe, expect, it, vi } from "vitest";

const bridgeMocks = vi.hoisted(() => ({
  pushConfigToPage: vi.fn(),
  setMaxChatSessions: vi.fn(),
}));

const messageTextMocks = vi.hoisted(() => ({
  setHtmlToMarkdownMaxDepth: vi.fn(),
}));

vi.mock("../../src/content/bridge.js", () => bridgeMocks);
vi.mock("../../src/content/dom/message-text.js", () => messageTextMocks);

import state from "../../src/content/state.js";
import {
  bindStorageChangeListener,
  loadStateFromStorage,
  normalizeCharacters,
  normalizeMemories,
  normalizeProjectFiles,
  normalizeProjects,
  normalizeSkills,
} from "../../src/content/storage.js";
import {
  DEFAULT_SETTINGS,
  DEFAULT_SYSTEM_PROMPT,
  DOWNLOAD_BEHAVIOR_VERSION,
  STORAGE_KEYS,
  SYSTEM_PROMPT_TEMPLATE_VERSION,
} from "../../src/lib/constants.js";
import { resetAppState } from "../helpers/app-state.js";
import { emitStorageChange, setChromeStorage } from "../mocks/chrome.js";

describe("storage integration", () => {
  beforeEach(() => {
    resetAppState();
    bridgeMocks.pushConfigToPage.mockReset();
    bridgeMocks.setMaxChatSessions.mockReset();
    messageTextMocks.setHtmlToMarkdownMaxDepth.mockReset();
  });

  it("loads state from storage and normalizes persisted collections", async () => {
    setChromeStorage({
      [STORAGE_KEYS.settings]: {
        preferredLang: "English",
        htmlToMarkdownMaxDepth: 120,
        maxChatSessions: 64,
        systemPromptTemplateVersion: SYSTEM_PROMPT_TEMPLATE_VERSION,
        downloadBehaviorVersion: DOWNLOAD_BEHAVIOR_VERSION,
      },
      [STORAGE_KEYS.skills]: [{ id: "1", name: "Skill", content: "Do X", active: true }],
      [STORAGE_KEYS.memories]: [{ key: "user_name", value: "Alex", importance: "always" }],
      [STORAGE_KEYS.characters]: [{ id: "2", name: "Mage", content: "wise", active: true }],
      [STORAGE_KEYS.projects]: [{ id: "p1", name: "Proj", description: 1 }],
      [STORAGE_KEYS.projectFiles]: [{ id: "f1", projectId: "p1", name: "README.md", content: "# x" }],
    });

    await loadStateFromStorage();

    expect(state.settings.preferredLang).toBe("English");
    expect(messageTextMocks.setHtmlToMarkdownMaxDepth).toHaveBeenCalledWith(120);
    expect(bridgeMocks.setMaxChatSessions).toHaveBeenCalledWith(64);
    expect(state.skills).toEqual([{ id: "1", name: "Skill", content: "Do X", active: true }]);
    expect(state.memories).toEqual({
      user_name: { value: "Alex", importance: "always" },
    });
    expect(state.characters[0].name).toBe("Mage");
    expect(state.projects[0].name).toBe("Proj");
    expect(state.projectFiles[0].projectId).toBe("p1");
  });

  it("upgrades legacy system prompts and download behavior", async () => {
    setChromeStorage({
      [STORAGE_KEYS.settings]: {
        systemPrompt: "You are Better DeepSeek, an output-focused assistant with tool tags.",
        systemPromptTemplateVersion: 1,
        downloadBehaviorVersion: 0,
      },
    });

    await loadStateFromStorage();

    expect(state.settings.systemPrompt).toBe(DEFAULT_SYSTEM_PROMPT);
    expect(state.settings.systemPromptTemplateVersion).toBe(
      SYSTEM_PROMPT_TEMPLATE_VERSION,
    );
    expect(state.settings.autoDownloadFiles).toBe(false);
    expect(state.settings.autoDownloadLongWorkZip).toBe(false);
    expect(chrome.storage.local.set).toHaveBeenCalled();
  });

  it("binds storage change listeners and refreshes ui slices", () => {
    state.ui = {
      refreshSettings: vi.fn(),
      refreshSkills: vi.fn(),
      refreshMemories: vi.fn(),
      refreshCharacters: vi.fn(),
      refreshProjects: vi.fn(),
    };

    bindStorageChangeListener();

    emitStorageChange({
      [STORAGE_KEYS.settings]: { newValue: { preferredLang: "TR", maxChatSessions: 77, htmlToMarkdownMaxDepth: 44 } },
      [STORAGE_KEYS.skills]: { newValue: [{ name: "S", content: "X" }] },
      [STORAGE_KEYS.memories]: { newValue: { user_name: { value: "Ren", importance: "always" } } },
      [STORAGE_KEYS.characters]: { newValue: [{ name: "Bot", content: "Friendly" }] },
      [STORAGE_KEYS.projects]: { newValue: [{ id: "p1", name: "Proj" }] },
      [STORAGE_KEYS.projectFiles]: { newValue: [{ id: "f1", projectId: "p1", content: "X" }] },
    });

    expect(state.settings.preferredLang).toBe("TR");
    expect(state.skills).toHaveLength(1);
    expect(state.memories.user_name.value).toBe("Ren");
    expect(state.characters).toHaveLength(1);
    expect(state.projects).toHaveLength(1);
    expect(state.projectFiles).toHaveLength(1);
    expect(state.ui.refreshSettings).toHaveBeenCalledOnce();
    expect(state.ui.refreshSkills).toHaveBeenCalledOnce();
    expect(state.ui.refreshMemories).toHaveBeenCalledOnce();
    expect(state.ui.refreshCharacters).toHaveBeenCalledOnce();
    expect(state.ui.refreshProjects).toHaveBeenCalledTimes(2);
    expect(bridgeMocks.pushConfigToPage).toHaveBeenCalledOnce();
  });

  it("normalizes corrupt persisted structures defensively", () => {
    expect(normalizeSkills([{ name: "", content: "" }, { name: "A", content: "ok" }])).toHaveLength(1);
    expect(normalizeMemories([{ key: " bad key ", value: "x" }])).toEqual({
      badkey: { value: "x", importance: "called" },
    });
    expect(normalizeCharacters([{ content: "", active: "yes" }, { name: "A", content: "B" }])).toHaveLength(1);
    expect(normalizeProjects([{ id: "p1", name: "P" }, null])).toHaveLength(1);
    expect(normalizeProjectFiles([{ id: "f1", projectId: "p1", content: "body" }, {}])).toHaveLength(1);
  });
});
