// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/content/auto.js", () => ({
  injectPureTextAndSend: vi.fn(),
}));

import appState from "../../../src/content/state.js";
import { STORAGE_KEYS } from "../../../src/lib/constants.js";
import { resetAppState } from "../../helpers/app-state.js";
import { renderSvelte, flushUi } from "../../helpers/svelte.js";
import SavedItems from "../../../src/content/ui/SavedItems.svelte";

const mockBookmarks = [
  { id: "b1", type: "bookmark", title: "First bookmark", content: "Hello world", messageType: "assistant", messageNodeId: "m1", createdAt: 1000, updatedAt: 1000, conversationTitle: "Conv A", conversationUrl: "https://ex.com/chat/s/c1" },
  { id: "b2", type: "bookmark", title: "Second bookmark", content: "Another message", messageType: "user", messageNodeId: "m2", createdAt: 2000, updatedAt: 2000, conversationTitle: "", conversationUrl: "" },
];

const mockSnippets = [
  { id: "s1", type: "snippet", title: "My prompt", content: "You are a helpful assistant", messageType: null, messageNodeId: "", createdAt: 3000, updatedAt: 3000, conversationTitle: "", conversationUrl: "" },
];

function setupSavedItems(bookmarks = [], snippets = []) {
  appState.savedItems = [...bookmarks, ...snippets];
  appState.ui = { showToast: vi.fn() };
}

describe("SavedItems", () => {
  beforeEach(() => {
    resetAppState();
    document.body.innerHTML = "";
  });

  it("renders empty state when no bookmarks exist", async () => {
    setupSavedItems();
    const { target, cleanup } = renderSvelte(SavedItems);
    await flushUi();
    expect(target.textContent).toContain("No bookmarks yet");
    cleanup();
  });

  it("shows bookmark items in bookmarks tab", async () => {
    setupSavedItems(mockBookmarks);
    const { target, cleanup } = renderSvelte(SavedItems);
    await flushUi();
    const items = target.querySelectorAll(".bds-saved-item");
    expect(items).toHaveLength(2);
    expect(target.textContent).toContain("First bookmark");
    expect(target.textContent).toContain("Second bookmark");
    cleanup();
  });

  it("switching to snippets tab shows snippet items", async () => {
    setupSavedItems(mockBookmarks, mockSnippets);
    const { target, cleanup } = renderSvelte(SavedItems);
    await flushUi();
    const snippetTab = target.querySelectorAll(".bds-saved-tab")[1];
    snippetTab.click();
    await flushUi();
    const items = target.querySelectorAll(".bds-saved-item");
    expect(items).toHaveLength(1);
    expect(target.textContent).toContain("My prompt");
    cleanup();
  });

  it("search filters items by title", async () => {
    setupSavedItems(mockBookmarks);
    const { target, cleanup } = renderSvelte(SavedItems);
    await flushUi();
    const searchInput = target.querySelector(".bds-saved-search");
    searchInput.value = "Second";
    searchInput.dispatchEvent(new Event("input", { bubbles: true }));
    await flushUi();
    const items = target.querySelectorAll(".bds-saved-item");
    expect(items).toHaveLength(1);
    expect(items[0].textContent).toContain("Second bookmark");
    cleanup();
  });

  it("new snippet button appears in snippets tab", async () => {
    setupSavedItems();
    const { target, cleanup } = renderSvelte(SavedItems);
    await flushUi();
    const snippetTab = target.querySelectorAll(".bds-saved-tab")[1];
    snippetTab.click();
    await flushUi();
    const newBtn = target.querySelector(".bds-snippet-new-btn");
    expect(newBtn).not.toBeNull();
    expect(newBtn.textContent).toContain("New Snippet");
    cleanup();
  });

  it("delete removes item from state and chrome storage", async () => {
    setupSavedItems(mockBookmarks);
    const { target, cleanup } = renderSvelte(SavedItems);
    await flushUi();
    const delBtn = target.querySelector(".bds-saved-del-btn");
    delBtn.click();
    await flushUi();
    expect(appState.savedItems).toHaveLength(1);
    expect(appState.savedItems[0].id).toBe("b1");
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      [STORAGE_KEYS.savedItems]: appState.savedItems,
    });
    cleanup();
  });

  it("export button triggers file download", async () => {
    setupSavedItems(mockBookmarks);
    const { target, cleanup } = renderSvelte(SavedItems);
    await flushUi();
    const exportBtn = Array.from(target.querySelectorAll("button")).find(b => b.textContent.includes("Export"));
    expect(exportBtn).not.toBeNull();
    cleanup();
  });
});
