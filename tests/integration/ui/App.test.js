// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const bridgeMocks = vi.hoisted(() => ({
  pushConfigToPage: vi.fn(),
}));

const projectManagerMocks = vi.hoisted(() => ({
  getActiveProject: vi.fn(() => null),
  getActiveProjects: vi.fn(() => []),
  updateProject: vi.fn(),
  createProject: vi.fn(),
  deleteProject: vi.fn(),
  addProjectFilesBatch: vi.fn(),
  deleteProjectFile: vi.fn(),
  getFilesForProject: vi.fn(() => []),
  setActiveProject: vi.fn(),
  clearActiveProject: vi.fn(),
  tickFile: vi.fn(),
  untickFile: vi.fn(),
  clearActiveFiles: vi.fn(),
}));

const scannerMocks = vi.hoisted(() => ({
  scheduleScan: vi.fn(),
  collectMessageNodes: vi.fn(() => []),
  detectMessageRole: vi.fn(),
}));

const exporterMocks = vi.hoisted(() => ({
  exportSession: vi.fn(),
  collectMessages: vi.fn(() => []),
}));

const folderPickerMocks = vi.hoisted(() => ({
  pickFolderSelection: vi.fn(),
  pickFolderAndConcatenate: vi.fn(),
}));

vi.mock("../../../src/content/bridge.js", () => bridgeMocks);
vi.mock("../../../src/content/project-manager.js", () => projectManagerMocks);
vi.mock("../../../src/content/scanner.js", () => scannerMocks);
vi.mock("../../../src/content/tools/exporter.js", () => exporterMocks);
vi.mock("../../../src/lib/utils/folder-picker.js", () => folderPickerMocks);

import App from "../../../src/content/ui/App.svelte";
import { resetAppState } from "../../helpers/app-state.js";
import { renderSvelte, flushUi } from "../../helpers/svelte.js";

describe("App toggle button", () => {
  beforeEach(() => {
    resetAppState({ ui: { showToast: vi.fn() } });
    bridgeMocks.pushConfigToPage.mockReset();
    document.body.innerHTML = "";
  });

  it("renders #bds-toggle with aria-label", async () => {
    const { target, cleanup } = renderSvelte(App);
    await flushUi();

    const toggle = target.querySelector("#bds-toggle");
    expect(toggle).not.toBeNull();
    expect(toggle.getAttribute("aria-label")).toBe("Better DeepSeek");

    cleanup();
  });

  it("toggle contains a platform icon and short label", async () => {
    const { target, cleanup } = renderSvelte(App);
    await flushUi();

    const toggle = target.querySelector("#bds-toggle");
    expect(toggle).not.toBeNull();
    expect(toggle.querySelector("svg")).not.toBeNull();

    const label = toggle.querySelector(".bds-toggle-label");
    expect(label).not.toBeNull();
    expect(label.textContent).toBeTruthy();

    cleanup();
  });

  it("clicking toggle opens the drawer", async () => {
    const { target, cleanup } = renderSvelte(App);
    await flushUi();

    const drawer = target.querySelector("#bds-drawer");
    expect(drawer.className).toContain("bds-closed");

    target.querySelector("#bds-toggle").click();
    await flushUi();

    expect(drawer.className).toContain("bds-open");
    expect(drawer.className).not.toContain("bds-closed");

    cleanup();
  });

  it("clicking toggle twice closes the drawer", async () => {
    const { target, cleanup } = renderSvelte(App);
    await flushUi();

    const toggle = target.querySelector("#bds-toggle");
    const drawer = target.querySelector("#bds-drawer");

    toggle.click();
    await flushUi();
    expect(drawer.className).toContain("bds-open");

    toggle.click();
    await flushUi();
    expect(drawer.className).toContain("bds-closed");

    cleanup();
  });

  it("close button inside drawer closes it", async () => {
    const { target, cleanup } = renderSvelte(App);
    await flushUi();

    target.querySelector("#bds-toggle").click();
    await flushUi();
    expect(target.querySelector("#bds-drawer").className).toContain("bds-open");

    target.querySelector("#bds-close").click();
    await flushUi();
    expect(target.querySelector("#bds-drawer").className).toContain("bds-closed");

    cleanup();
  });
});
