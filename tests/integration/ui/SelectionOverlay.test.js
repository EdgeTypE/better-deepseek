// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const exporterMocks = vi.hoisted(() => ({
  exportSession: vi.fn(),
  collectMessages: vi.fn(() => []),
}));

const scannerMocks = vi.hoisted(() => ({
  scheduleScan: vi.fn(),
}));

const historyMocks = vi.hoisted(() => ({
  readCachedMessages: vi.fn(),
  getSessionIdFromUrl: vi.fn(() => "session-1"),
}));

const loadHistoryMocks = vi.hoisted(() => ({
  loadAllHistory: vi.fn(),
}));

vi.mock("../../../src/content/tools/exporter.js", () => exporterMocks);
vi.mock("../../../src/content/scanner.js", () => scannerMocks);
vi.mock("../../../src/content/tools/history-cache.js", () => historyMocks);
vi.mock("../../../src/content/load-all-history.js", () => loadHistoryMocks);

import SelectionOverlay from "../../../src/content/ui/SelectionOverlay.svelte";
import appState from "../../../src/content/state.js";
import { resetAppState } from "../../helpers/app-state.js";
import { renderSvelte, flushUi } from "../../helpers/svelte.js";

/**
 * Mirror of `injectSelectionCheckbox` in message-processor: the checkbox owns a
 * DOM id and reports toggles through `bds:selectionChanged`.
 */
function addRenderedMessage(domId) {
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "bds-selection-checkbox";
  checkbox.setAttribute("data-bds-message-id", domId);
  checkbox.addEventListener("change", (event) => {
    if (event.target.checked) appState.selectedMessageIds.add(domId);
    else appState.selectedMessageIds.delete(domId);
    window.dispatchEvent(new CustomEvent("bds:selectionChanged"));
  });
  document.body.appendChild(checkbox);
  return checkbox;
}

function cachedHit(count) {
  return {
    status: "hit",
    chatMessages: Array.from({ length: count }, (_, i) => ({
      message_id: i + 1,
      role: i % 2 === 0 ? "USER" : "ASSISTANT",
      fragments: [{ type: "REQUEST", content: `m${i + 1}` }],
    })),
  };
}

function selectAllButton() {
  return document.querySelector(".bds-btn-ghost");
}

function markdownButton() {
  return document.querySelector(".bds-export-btn");
}

/** Select All awaits the cache reader, so let the microtask queue drain. */
async function settle() {
  await flushUi();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await flushUi();
}

async function selectAllAndExport() {
  selectAllButton().click();
  await settle();
  markdownButton().click();
  await settle();
}

describe("SelectionOverlay Select All", () => {
  let cleanup = () => {};

  beforeEach(() => {
    resetAppState();
    document.body.innerHTML = "";
    appState.selectionMode = true;
    appState.selectedMessageIds.clear();
    appState.settings.loadAllHistoryOnSession = false;
    exporterMocks.exportSession.mockClear();
    historyMocks.readCachedMessages.mockReset();
    historyMocks.getSessionIdFromUrl.mockReturnValue("session-1");
    loadHistoryMocks.loadAllHistory.mockReset();
  });

  afterEach(() => {
    cleanup();
    appState.selectionMode = false;
    appState.selectedMessageIds.clear();
  });

  function mount() {
    cleanup = renderSvelte(SelectionOverlay).cleanup;
  }

  it("selects the whole session from the cache, not just the rendered messages", async () => {
    historyMocks.readCachedMessages.mockResolvedValue(cachedHit(5));
    addRenderedMessage("msg-a");
    addRenderedMessage("msg-b");
    mount();
    await flushUi();

    await selectAllAndExport();

    expect(historyMocks.readCachedMessages).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({ waitMs: expect.any(Number) })
    );
    // No id filter: exportSession exports everything the cache holds.
    expect(exporterMocks.exportSession).toHaveBeenCalledWith("markdown", null);
  });

  it("checks every rendered checkbox after selecting the whole session", async () => {
    historyMocks.readCachedMessages.mockResolvedValue(cachedHit(5));
    const first = addRenderedMessage("msg-a");
    const second = addRenderedMessage("msg-b");
    mount();
    await settle();

    selectAllButton().click();
    await settle();

    expect(first.checked).toBe(true);
    expect(second.checked).toBe(true);
    expect(document.querySelector(".bds-selection-count").textContent).toBe("5");
    expect(selectAllButton().textContent.trim()).toBe("Deselect All");
  });

  it("falls back to the rendered messages when the cache is unavailable", async () => {
    historyMocks.readCachedMessages.mockResolvedValue({ status: "unavailable" });
    addRenderedMessage("msg-a");
    addRenderedMessage("msg-b");
    mount();
    await flushUi();

    await selectAllAndExport();

    expect(exporterMocks.exportSession).toHaveBeenCalledWith("markdown", ["msg-a", "msg-b"]);
  });

  it("uses the API ids when the cache misses and history loading is on", async () => {
    historyMocks.readCachedMessages.mockResolvedValue({ status: "missing" });
    appState.settings.loadAllHistoryOnSession = true;
    loadHistoryMocks.loadAllHistory.mockResolvedValue([
      { message_id: 7, role: "USER" },
      { message_id: 8, role: "ASSISTANT" },
    ]);
    addRenderedMessage("msg-a");
    mount();
    await flushUi();

    await selectAllAndExport();

    expect(loadHistoryMocks.loadAllHistory).toHaveBeenCalled();
    expect(exporterMocks.exportSession).toHaveBeenCalledWith("markdown", null);
  });

  it("narrows a whole-session selection to the rendered messages when one is unticked", async () => {
    historyMocks.readCachedMessages.mockResolvedValue(cachedHit(5));
    const first = addRenderedMessage("msg-a");
    addRenderedMessage("msg-b");
    mount();
    await settle();

    selectAllButton().click();
    await settle();

    first.checked = false;
    first.dispatchEvent(new Event("change"));
    await settle();

    expect(Array.from(appState.selectedMessageIds)).toEqual(["msg-b"]);
    expect(document.querySelector(".bds-selection-count").textContent).toBe("1");

    markdownButton().click();
    await settle();
    expect(exporterMocks.exportSession).toHaveBeenCalledWith("markdown", ["msg-b"]);
  });

  it("clears the selection when Select All is pressed again", async () => {
    historyMocks.readCachedMessages.mockResolvedValue(cachedHit(5));
    addRenderedMessage("msg-a");
    mount();
    await settle();

    selectAllButton().click();
    await settle();
    selectAllButton().click();
    await settle();

    expect(appState.selectedMessageIds.size).toBe(0);
    expect(document.querySelector(".bds-selection-count").textContent).toBe("0");
    expect(selectAllButton().textContent.trim()).toBe("Select All");
  });
});
