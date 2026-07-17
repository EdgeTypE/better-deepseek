import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

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
  normalizeSavedItems,
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
import { emitStorageChange, setChromeStorage, resetChromeMock, installChromeMock } from "../mocks/chrome.js";

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
      [STORAGE_KEYS.savedItems]: [
        { id: "b1", type: "bookmark", title: "Test", content: "Hello", messageType: "assistant", messageNodeId: "m1", conversationTitle: "Conv1", conversationUrl: "https://example.com/chat/s/c1" },
      ],
    });

    await loadStateFromStorage();

    expect(state.settings.preferredLang).toBe("English");
    expect(messageTextMocks.setHtmlToMarkdownMaxDepth).toHaveBeenCalledWith(120);
    expect(bridgeMocks.setMaxChatSessions).toHaveBeenCalledWith(64);
    expect(state.skills).toEqual([{ id: "1", name: "Skill", usage: "", content: "Do X", active: true }]);
    expect(state.memories).toEqual({
      user_name: { value: "Alex", importance: "always" },
    });
    expect(state.characters[0].name).toBe("Mage");
    expect(state.projects[0].name).toBe("Proj");
    expect(state.projectFiles[0].projectId).toBe("p1");
    expect(state.savedItems).toHaveLength(1);
    expect(state.savedItems[0].id).toBe("b1");
    expect(state.savedItems[0].type).toBe("bookmark");
    expect(state.savedItems[0].conversationTitle).toBe("Conv1");
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
      refreshSavedItems: vi.fn(),
      showConfirm: vi.fn(() => Promise.resolve(true)),
    };

    bindStorageChangeListener();

    emitStorageChange({
      [STORAGE_KEYS.settings]: { newValue: { preferredLang: "TR", maxChatSessions: 77, htmlToMarkdownMaxDepth: 44 } },
      [STORAGE_KEYS.skills]: { newValue: [{ name: "S", content: "X" }] },
      [STORAGE_KEYS.memories]: { newValue: { user_name: { value: "Ren", importance: "always" } } },
      [STORAGE_KEYS.characters]: { newValue: [{ name: "Bot", content: "Friendly" }] },
      [STORAGE_KEYS.projects]: { newValue: [{ id: "p1", name: "Proj" }] },
      [STORAGE_KEYS.projectFiles]: { newValue: [{ id: "f1", projectId: "p1", content: "X" }] },
      [STORAGE_KEYS.savedItems]: { newValue: [{ id: "s1", type: "snippet", title: "S", content: "C" }] },
    });

    expect(state.settings.preferredLang).toBe("TR");
    expect(state.skills).toHaveLength(1);
    expect(state.memories.user_name.value).toBe("Ren");
    expect(state.characters).toHaveLength(1);
    expect(state.projects).toHaveLength(1);
    expect(state.projectFiles).toHaveLength(1);
    expect(state.savedItems).toHaveLength(1);
    expect(state.savedItems[0].id).toBe("s1");
    expect(state.savedItems[0].type).toBe("snippet");
    expect(state.ui.refreshSettings).toHaveBeenCalledOnce();
    expect(state.ui.refreshSkills).toHaveBeenCalledOnce();
    expect(state.ui.refreshMemories).toHaveBeenCalledOnce();
    expect(state.ui.refreshCharacters).toHaveBeenCalledOnce();
    expect(state.ui.refreshProjects).toHaveBeenCalledTimes(2);
    expect(state.ui.refreshSavedItems).toHaveBeenCalledOnce();
    expect(bridgeMocks.pushConfigToPage).toHaveBeenCalledOnce();
  });

  it("normalizes saved items defensively", () => {
    const valid = normalizeSavedItems([
      { id: "b1", type: "bookmark", title: "Msg", content: "Hello", messageType: "assistant", messageNodeId: "m1", conversationTitle: "C1", conversationUrl: "https://ex.com" },
      { id: "s1", type: "snippet", title: "P", content: "prompt" },
    ]);
    expect(valid).toHaveLength(2);
    expect(valid[0].type).toBe("bookmark");
    expect(valid[0].messageType).toBe("assistant");
    expect(valid[1].type).toBe("snippet");
    expect(valid[1].messageType).toBeNull();

    const withGarbage = normalizeSavedItems([
      null,
      { id: "b2" }, // missing content
      { content: "x" }, // missing id
      { id: "b3", content: "ok" },
    ]);
    expect(withGarbage).toHaveLength(1);
    expect(withGarbage[0].id).toBe("b3");
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

describe("storage loop prevention", () => {
  beforeEach(() => {
    resetAppState();
    bridgeMocks.pushConfigToPage.mockReset();
    bridgeMocks.setMaxChatSessions.mockReset();
    messageTextMocks.setHtmlToMarkdownMaxDepth.mockReset();
  });

  afterEach(() => {
    state.ui = null;
  });

  it("remote-config storage event writes zero times to storage (no re-entrant loop)", () => {
    bindStorageChangeListener();

    const setCallsBefore = chrome.storage.local.set.mock.calls.length;
    emitStorageChange({
      [STORAGE_KEYS.remoteConfig]: { newValue: { features: { attachMenu: { enabled: false } } } },
    });

    // syncFromStorage must never call set — zero new writes
    expect(chrome.storage.local.set.mock.calls.length).toBe(setCallsBefore);
  });

  it("remote-config storage removal restores builtins without storage write", async () => {
    // Seed remote so removal has an effect — await the import
    const { remoteConfig } = await import("../../src/lib/remote-config.svelte.js");
    remoteConfig.syncFromStorage({ features: { attachMenu: { enabled: false } } });
    expect(remoteConfig.getFlag("features.attachMenu.enabled")).toBe(false);

    bindStorageChangeListener();
    const setCallsBefore = chrome.storage.local.set.mock.calls.length;

    emitStorageChange({
      [STORAGE_KEYS.remoteConfig]: { newValue: undefined },
    });

    // syncFromStorage never writes — zero new set calls
    expect(chrome.storage.local.set.mock.calls.length).toBe(setCallsBefore);
    // Built-ins restored
    expect(remoteConfig.getFlag("features.attachMenu.enabled")).toBe(true);
  });

  it("re-entrant same-value event terminates without second write", () => {
    bindStorageChangeListener();

    // First event — sets remote with new data
    emitStorageChange({
      [STORAGE_KEYS.remoteConfig]: { newValue: { features: { test: true } } },
    });

    const setCallsAfterFirst = chrome.storage.local.set.mock.calls.length;

    // Second event — same value. Must NOT cause another write.
    emitStorageChange({
      [STORAGE_KEYS.remoteConfig]: { newValue: { features: { test: true } } },
    });

    expect(chrome.storage.local.set.mock.calls.length).toBe(setCallsAfterFirst);
  });

  it("remote-config storage removal restores builtins and emits zero writes", () => {
    bindStorageChangeListener();

    const setCallsBefore = chrome.storage.local.set.mock.calls.length;

    emitStorageChange({
      [STORAGE_KEYS.remoteConfig]: { newValue: undefined },
    });

    // Removal must not write to storage
    expect(chrome.storage.local.set.mock.calls.length).toBe(setCallsBefore);
  });

  it("relevant storage keys push page config once; irrelevant keys push zero times", () => {
    bindStorageChangeListener();

    // settings = relevant → should push
    bridgeMocks.pushConfigToPage.mockClear();
    emitStorageChange({
      [STORAGE_KEYS.settings]: { newValue: { preferredLang: "FR" } },
    });
    expect(bridgeMocks.pushConfigToPage).toHaveBeenCalledOnce();

    // skills = relevant
    bridgeMocks.pushConfigToPage.mockClear();
    emitStorageChange({
      [STORAGE_KEYS.skills]: { newValue: [{ name: "S", content: "X" }] },
    });
    expect(bridgeMocks.pushConfigToPage).toHaveBeenCalledOnce();

    // savedItems = irrelevant (not injected into page config)
    bridgeMocks.pushConfigToPage.mockClear();
    emitStorageChange({
      [STORAGE_KEYS.savedItems]: { newValue: [{ id: "x", content: "y" }] },
    });
    expect(bridgeMocks.pushConfigToPage).not.toHaveBeenCalled();

    // chatTags = irrelevant
    bridgeMocks.pushConfigToPage.mockClear();
    emitStorageChange({
      [STORAGE_KEYS.chatTags]: { newValue: { s1: ["tag1"] } },
    });
    expect(bridgeMocks.pushConfigToPage).not.toHaveBeenCalled();

    // remoteConfig = irrelevant (has dedicated notification path)
    bridgeMocks.pushConfigToPage.mockClear();
    emitStorageChange({
      [STORAGE_KEYS.remoteConfig]: { newValue: { features: { test: true } } },
    });
    expect(bridgeMocks.pushConfigToPage).not.toHaveBeenCalled();
  });
});

describe("storage mock contracts (#108)", () => {
  beforeEach(() => {
    resetChromeMock();
    installChromeMock();
    resetAppState();
    bridgeMocks.pushConfigToPage.mockReset();
    bridgeMocks.setMaxChatSessions.mockReset();
    messageTextMocks.setHtmlToMarkdownMaxDepth.mockReset();
  });

  afterEach(async () => {
    state.ui = null;
    // Flush any pending notifications to avoid cross-test leaks
    const { flushStorageChanges } = await import("../mocks/chrome.js");
    await flushStorageChanges();
  });

  it("local replaceRemote performs exactly one write", async () => {
    const { remoteConfig } = await import("../../src/lib/remote-config.svelte.js");
    remoteConfig.resetToBuiltin();
    chrome.storage.local.set.mockClear();

    remoteConfig.replaceRemote({ features: { attachMenu: { enabled: false } } });

    expect(chrome.storage.local.set).toHaveBeenCalledTimes(1);
  });

  it("replaceRemote write emits exactly one remote-config storage event", async () => {
    const { remoteConfig } = await import("../../src/lib/remote-config.svelte.js");
    const { flushStorageChanges } = await import("../mocks/chrome.js");
    remoteConfig.resetToBuiltin();

    // Register an onChanged listener
    const events = [];
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes[STORAGE_KEYS.remoteConfig]) {
        events.push(changes[STORAGE_KEYS.remoteConfig]);
      }
    });

    remoteConfig.replaceRemote({ features: { attachMenu: { enabled: false } } });
    await flushStorageChanges();

    expect(events).toHaveLength(1);
    expect(events[0].newValue).toEqual({ features: { attachMenu: { enabled: false } } });
  });

  it("repeating identical replacement performs zero writes and zero events", async () => {
    const { remoteConfig } = await import("../../src/lib/remote-config.svelte.js");
    const { flushStorageChanges } = await import("../mocks/chrome.js");
    remoteConfig.resetToBuiltin();

    const data = { features: { attachMenu: { enabled: false } } };
    remoteConfig.replaceRemote(data);
    await flushStorageChanges();

    // Register spy AFTER first event
    const events = [];
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes[STORAGE_KEYS.remoteConfig]) {
        events.push(changes[STORAGE_KEYS.remoteConfig]);
      }
    });

    chrome.storage.local.set.mockClear();
    remoteConfig.replaceRemote(data);
    await flushStorageChanges();

    expect(chrome.storage.local.set).not.toHaveBeenCalled();
    expect(events).toHaveLength(0);
  });

  it("removing stored config restores built-ins without write-back", async () => {
    const { remoteConfig } = await import("../../src/lib/remote-config.svelte.js");
    const { flushStorageChanges } = await import("../mocks/chrome.js");
    remoteConfig.resetToBuiltin();

    // Seed remote config via replaceRemote (writes to storage)
    remoteConfig.replaceRemote({ features: { attachMenu: { enabled: false } } });
    await flushStorageChanges();
    expect(remoteConfig.getFlag("features.attachMenu.enabled")).toBe(false);

    // Now remove from storage
    chrome.storage.local.set.mockClear();
    await chrome.storage.local.remove(STORAGE_KEYS.remoteConfig);
    await flushStorageChanges();

    // bindStorageChangeListener should process the removal via syncFromStorage
    bindStorageChangeListener();
    // Simulate the removal event (syncFromStorage sees empty/undefined value)
    remoteConfig.syncFromStorage({});
    expect(remoteConfig.getFlag("features.attachMenu.enabled")).toBe(true);

    // No write-back — built-ins restored without persistence
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });

  it("external synchronization performs zero writes", async () => {
    const { remoteConfig } = await import("../../src/lib/remote-config.svelte.js");
    const { flushStorageChanges } = await import("../mocks/chrome.js");
    remoteConfig.resetToBuiltin();

    chrome.storage.local.set.mockClear();
    remoteConfig.syncFromStorage({ features: { attachMenu: { enabled: false } } });
    await flushStorageChanges();

    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });

  it("invalid remote-config roots normalize without loop (array)", async () => {
    const { remoteConfig } = await import("../../src/lib/remote-config.svelte.js");
    const { flushStorageChanges } = await import("../mocks/chrome.js");
    remoteConfig.resetToBuiltin();

    chrome.storage.local.set.mockClear();
    remoteConfig.syncFromStorage([]);
    await flushStorageChanges();

    // Should normalize to default, no crash, no writes
    expect(remoteConfig.getFlag("features.attachMenu.enabled")).toBe(true);
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });

  it("invalid remote-config roots normalize without loop (primitive)", async () => {
    const { remoteConfig } = await import("../../src/lib/remote-config.svelte.js");
    const { flushStorageChanges } = await import("../mocks/chrome.js");
    remoteConfig.resetToBuiltin();

    chrome.storage.local.set.mockClear();
    remoteConfig.syncFromStorage("not-an-object");
    await flushStorageChanges();

    expect(remoteConfig.getFlag("features.attachMenu.enabled")).toBe(true);
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });

  it("invalid remote-config roots normalize without loop (null)", async () => {
    const { remoteConfig } = await import("../../src/lib/remote-config.svelte.js");
    const { flushStorageChanges } = await import("../mocks/chrome.js");
    remoteConfig.resetToBuiltin();

    chrome.storage.local.set.mockClear();
    remoteConfig.syncFromStorage(null);
    await flushStorageChanges();

    expect(remoteConfig.getFlag("features.attachMenu.enabled")).toBe(true);
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });

  it("invalid remote-config roots normalize without loop (undefined)", async () => {
    const { remoteConfig } = await import("../../src/lib/remote-config.svelte.js");
    const { flushStorageChanges } = await import("../mocks/chrome.js");
    remoteConfig.resetToBuiltin();

    chrome.storage.local.set.mockClear();
    remoteConfig.syncFromStorage(undefined);
    await flushStorageChanges();

    expect(remoteConfig.getFlag("features.attachMenu.enabled")).toBe(true);
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });

  it("identical writes produce no onChange event", async () => {
    const { flushStorageChanges } = await import("../mocks/chrome.js");

    const events = [];
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local") events.push(changes);
    });

    // Write value
    await chrome.storage.local.set({ test: { a: 1 } });
    await flushStorageChanges();
    expect(events).toHaveLength(1);

    // Identical write — no event
    await chrome.storage.local.set({ test: { a: 1 } });
    await flushStorageChanges();
    expect(events).toHaveLength(1);
  });

  it("remove emits changes only for keys that existed", async () => {
    const { flushStorageChanges } = await import("../mocks/chrome.js");

    await chrome.storage.local.set({ keep: 1, removeMe: 2 });
    await flushStorageChanges();

    const events = [];
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local") events.push(changes);
    });

    await chrome.storage.local.remove(["removeMe", "neverExisted"]);
    await flushStorageChanges();

    // Only "removeMe" was in storage — only one change
    expect(events).toHaveLength(1);
    expect(Object.keys(events[0])).toEqual(["removeMe"]);
    expect(events[0].removeMe.newValue).toBeUndefined();
  });

  it("clear emits one change record for each removed key", async () => {
    const { flushStorageChanges } = await import("../mocks/chrome.js");

    await chrome.storage.local.set({ a: 1, b: 2, c: 3 });
    await flushStorageChanges();

    const events = [];
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local") events.push(changes);
    });

    await chrome.storage.local.clear();
    await flushStorageChanges();

    expect(events).toHaveLength(1);
    expect(Object.keys(events[0]).sort()).toEqual(["a", "b", "c"]);
  });

  it("listeners receive cloned values — mutating the change does not affect storage", async () => {
    const { flushStorageChanges } = await import("../mocks/chrome.js");

    const mutations = [];
    chrome.storage.onChanged.addListener((changes) => {
      // Attempt to mutate the received change object
      for (const key of Object.keys(changes)) {
        if (changes[key].newValue && typeof changes[key].newValue === "object") {
          changes[key].newValue.mutated = true;
          mutations.push(key);
        }
      }
    });

    await chrome.storage.local.set({ config: { original: true } });
    await flushStorageChanges();

    expect(mutations).toHaveLength(1);
    // Storage should still have the original value
    const stored = await chrome.storage.local.get("config");
    expect(stored.config).toEqual({ original: true });
    expect(stored.config.mutated).toBeUndefined();
  });
});
