// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const projectManagerMocks = vi.hoisted(() => ({
  createProject: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
  addProjectFilesBatch: vi.fn(),
  deleteProjectFile: vi.fn(),
  getFilesForProject: vi.fn(),
}));

const bridgeMocks = vi.hoisted(() => ({
  pushConfigToPage: vi.fn(),
}));

const folderMocks = vi.hoisted(() => ({
  pickFolderSelection: vi.fn(),
}));

vi.mock("../../../src/content/project-manager.js", () => projectManagerMocks);
vi.mock("../../../src/content/bridge.js", () => bridgeMocks);
vi.mock("../../../src/lib/utils/folder-picker.js", () => folderMocks);

import ProjectsManager from "../../../src/content/ui/ProjectsManager.svelte";
import state from "../../../src/content/state.js";
import { resetAppState } from "../../helpers/app-state.js";
import { renderSvelte, flushUi } from "../../helpers/svelte.js";
import { dispatchPickResult } from "../../helpers/native-pick-protocol.js";

function getButtonByText(target, text) {
  return Array.from(target.querySelectorAll("button")).find((button) =>
    button.textContent.includes(text),
  );
}

function installAndroidBridgeMock(handler = () => window.__testPickPayload) {
  process.env.BDS_TARGET = "android";
  window.AndroidBridge = {
    pickFiles: vi.fn((mode, requestId) => {
      setTimeout(() => {
        const payload = handler(mode, requestId);
        dispatchPickResult(requestId, payload);
      }, 0);
    }),
  };
}

async function flushNativePick() {
  await new Promise((resolve) => setTimeout(resolve, 20));
  await flushUi();
}

async function openProjectDetail(target) {
  target.querySelector(".bds-skill-item").click();
  await flushUi();
}

describe("ProjectsManager integration", () => {
  beforeEach(() => {
    resetAppState();
    state.projects = [
      {
        id: "p1",
        name: "Project One",
        description: "Demo",
        customInstructions: "Initial",
      },
    ];
    state.projectFiles = [
      {
        id: "f1",
        projectId: "p1",
        name: "README.md",
        content: "# Demo",
        size: 6,
        createdAt: Date.now(),
      },
    ];
    projectManagerMocks.createProject.mockReset();
    projectManagerMocks.updateProject.mockReset();
    projectManagerMocks.deleteProject.mockReset();
    projectManagerMocks.addProjectFilesBatch.mockReset();
    projectManagerMocks.deleteProjectFile.mockReset();
    projectManagerMocks.getFilesForProject.mockReset();
    projectManagerMocks.getFilesForProject.mockReturnValue(state.projectFiles);
    bridgeMocks.pushConfigToPage.mockReset();
    folderMocks.pickFolderSelection.mockReset();
    document.body.innerHTML = "";
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.BDS_TARGET;
    delete window.AndroidBridge;
    delete window.__testPickPayload;
  });

  it("creates a new project from the list view", async () => {
    const { target, cleanup } = renderSvelte(ProjectsManager, { onback: vi.fn() });

    target.querySelector(".bds-btn").click();
    await flushUi();
    const inputs = target.querySelectorAll(".bds-inline-editor .bds-input");
    inputs[0].value = "New Project";
    inputs[0].dispatchEvent(new Event("input", { bubbles: true }));
    inputs[1].value = "Description";
    inputs[1].dispatchEvent(new Event("input", { bubbles: true }));
    target.querySelector(".bds-inline-editor .bds-btn").click();
    await flushUi();

    expect(projectManagerMocks.createProject).toHaveBeenCalledWith(
      "New Project",
      "Description",
    );
    cleanup();
  });

  it("updates project details after entering the detail view", async () => {
    vi.useFakeTimers();
    const { target, cleanup } = renderSvelte(ProjectsManager, { onback: vi.fn() });

    target.querySelector(".bds-skill-item").click();
    await flushUi();
    const nameInput = target.querySelector("#pm-name");
    nameInput.value = "Renamed Project";
    nameInput.dispatchEvent(new Event("input", { bubbles: true }));
    await vi.advanceTimersByTimeAsync(700);

    expect(projectManagerMocks.updateProject).toHaveBeenCalledWith(
      "p1",
      expect.objectContaining({ name: "Renamed Project" }),
    );
    cleanup();
  });

  it("uploads files and deletes a project", async () => {
    const { target, cleanup } = renderSvelte(ProjectsManager, { onback: vi.fn() });
    target.querySelector(".bds-skill-item").click();
    await flushUi();

    const fileInput = target.querySelector('input[type="file"][multiple]');
    const file = {
      name: "notes.txt",
      size: 5,
      text: async () => "hello",
    };
    Object.defineProperty(fileInput, "files", {
      configurable: true,
      value: [file],
    });
    fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    await flushUi();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(projectManagerMocks.addProjectFilesBatch).toHaveBeenCalledWith("p1", [
      { name: "notes.txt", content: "hello" },
    ]);

    getButtonByText(target, "Delete Project").click();
    await flushUi();
    target.querySelector(".bds-confirm-danger .bds-btn-danger").click();
    await flushUi();

    expect(projectManagerMocks.deleteProject).toHaveBeenCalledWith("p1");
    expect(bridgeMocks.pushConfigToPage).toHaveBeenCalled();
    cleanup();
  });

  it("keeps multiple enabled for the project Upload File flow", async () => {
    const { target, cleanup } = renderSvelte(ProjectsManager, { onback: vi.fn() });
    target.querySelector(".bds-skill-item").click();
    await flushUi();

    const fileInput = target.querySelector('input[type="file"][multiple]');
    fileInput.click = vi.fn(() => {
      expect(fileInput.multiple).toBe(true);
    });

    getButtonByText(target, "Upload File").click();
    await flushUi();

    expect(fileInput.click).toHaveBeenCalledOnce();
    expect(fileInput.multiple).toBe(true);
    cleanup();
  });

  it("toasts when a native project file pick returns zero files", async () => {
    state.ui = { showToast: vi.fn() };
    installAndroidBridgeMock(() => ({
      files: [],
      skipped: [{ name: "photo.png", reason: "unsupported-type" }],
    }));
    const { target, cleanup } = renderSvelte(ProjectsManager, { onback: vi.fn() });
    await openProjectDetail(target);

    getButtonByText(target, "Upload File").click();
    await flushNativePick();

    expect(state.ui.showToast).toHaveBeenCalledWith(
      "Nothing was attached - the selected file(s) are unsupported, too large (over 2 MB), or binary.",
    );
    expect(projectManagerMocks.addProjectFilesBatch).not.toHaveBeenCalled();
    cleanup();
  });

  it("toasts a partial-skip summary for project file picks", async () => {
    state.ui = { showToast: vi.fn() };
    installAndroidBridgeMock(() => ({
      files: [{ name: "a.md", content: "# A" }],
      skipped: [{ name: "photo.png", reason: "unsupported-type" }],
    }));
    const { target, cleanup } = renderSvelte(ProjectsManager, { onback: vi.fn() });
    await openProjectDetail(target);
    Object.defineProperty(target.querySelector('input[type="file"][multiple]'), "files", {
      configurable: true,
      writable: true,
      value: [],
    });

    getButtonByText(target, "Upload File").click();
    await flushNativePick();

    expect(state.ui.showToast).toHaveBeenCalledOnce();
    expect(state.ui.showToast.mock.calls[0][0]).toContain("1");
    expect(state.ui.showToast.mock.calls[0][0]).toContain("2");
    cleanup();
  });

  it("surfaces folderNoTextFiles in fileError when a project folder pick yields nothing", async () => {
    state.ui = { showToast: vi.fn() };
    installAndroidBridgeMock(() => ({
      files: [],
      folderName: "repo",
      skipped: [{ name: "photo.png", reason: "unsupported-type" }],
    }));
    const { target, cleanup } = renderSvelte(ProjectsManager, { onback: vi.fn() });
    await openProjectDetail(target);

    getButtonByText(target, "Upload Folder").click();
    await flushNativePick();

    expect(target.textContent).toContain(
      "No supported text files were found in the selected folder.",
    );
    cleanup();
  });

  it("maps picker-timeout to the localized message", async () => {
    vi.useFakeTimers();
    state.ui = { showToast: vi.fn() };
    process.env.BDS_TARGET = "android";
    window.AndroidBridge = { pickFiles: vi.fn() };
    const { target, cleanup } = renderSvelte(ProjectsManager, { onback: vi.fn() });
    await openProjectDetail(target);

    getButtonByText(target, "Upload File").click();
    await vi.advanceTimersByTimeAsync(10000);
    await flushUi();

    expect(state.ui.showToast).toHaveBeenCalledWith(
      "The file picker did not return a result. Please try again.",
    );
    cleanup();
  });
});
