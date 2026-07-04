// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const folderMocks = vi.hoisted(() => ({
  pickFolderAndConcatenate: vi.fn(),
}));

const githubMocks = vi.hoisted(() => ({
  fetchGitHubRepo: vi.fn(),
  parseGitHubUrl: vi.fn(),
}));

const githubCommitMocks = vi.hoisted(() => ({
  fetchGitHubCommits: vi.fn(),
  normalizeGitHubCommitCount: vi.fn((value) => {
    const parsed = Number.parseInt(String(value), 10);
    if (!Number.isFinite(parsed)) return 100;
    return Math.max(1, parsed);
  }),
  DEFAULT_GITHUB_COMMIT_COUNT: 100,
  MIN_GITHUB_COMMIT_COUNT: 1,
}));

const webMocks = vi.hoisted(() => ({
  fetchAndConvertWebPage: vi.fn(),
}));

const projectFileBuilderMocks = vi.hoisted(() => ({
  projectFilesToFile: vi.fn(),
}));

const projectManagerMocks = vi.hoisted(() => ({
  getFilesForProject: vi.fn(),
  setActiveProject: vi.fn(),
  clearActiveProject: vi.fn(),
  tickFile: vi.fn(),
  untickFile: vi.fn(),
  clearActiveFiles: vi.fn(),
}));

const bridgeMocks = vi.hoisted(() => ({
  pushConfigToPage: vi.fn(),
}));

vi.mock("../../../src/content/files/folder-reader.js", () => folderMocks);
vi.mock("../../../src/content/files/github-reader.js", () => githubMocks);
vi.mock("../../../src/content/files/github-commits.js", () => githubCommitMocks);
vi.mock("../../../src/content/files/web-reader.js", () => webMocks);
vi.mock("../../../src/content/files/project-file-builder.js", () => projectFileBuilderMocks);
vi.mock("../../../src/content/project-manager.js", () => projectManagerMocks);
vi.mock("../../../src/content/bridge.js", () => bridgeMocks);

import AttachMenu from "../../../src/content/ui/AttachMenu.svelte";
import state from "../../../src/content/state.js";
import { remoteConfig } from "../../../src/lib/remote-config.svelte.js";
import { resetAppState } from "../../helpers/app-state.js";
import { renderSvelte, flushUi } from "../../helpers/svelte.js";
import { dispatchPickResult } from "../../helpers/native-pick-protocol.js";

function setupNativeInput() {
  const nativeInput = document.createElement("input");
  nativeInput.type = "file";
  nativeInput.multiple = true;
  Object.defineProperty(nativeInput, "files", {
    configurable: true,
    writable: true,
    value: [],
  });
  nativeInput.click = vi.fn();
  document.body.appendChild(nativeInput);
  return nativeInput;
}

function getAttachItemByText(text) {
  return Array.from(document.querySelectorAll(".bds-attach-item")).find((item) =>
    item.textContent.includes(text),
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

function installModelSwitcher(selectedModel) {
  document.body.insertAdjacentHTML("beforeend", `
    <div role="radiogroup">
      <div role="radio" data-model-type="instant" aria-checked="${selectedModel === "instant"}">Instant</div>
      <div role="radio" data-model-type="vision" aria-checked="${selectedModel === "vision"}">Vision</div>
    </div>
  `);
}

async function flushNativePick() {
  await new Promise((resolve) => setTimeout(resolve, 20));
  await flushUi();
}

describe("AttachMenu integration", () => {
  beforeEach(() => {
    remoteConfig.resetToBuiltin();
    resetAppState({
      ui: { showToast: vi.fn() },
    });
    state.projects = [{ id: "p1", name: "Project One" }];
    state.activeProjectId = "p1";
    state.activeFileIds = ["f1"];
    projectManagerMocks.getFilesForProject.mockReset();
    projectManagerMocks.getFilesForProject.mockReturnValue([
      { id: "f1", name: "README.md", content: "# Demo" },
    ]);
    projectManagerMocks.setActiveProject.mockReset();
    projectManagerMocks.clearActiveProject.mockReset();
    projectManagerMocks.tickFile.mockReset();
    projectManagerMocks.untickFile.mockReset();
    githubMocks.fetchGitHubRepo.mockReset();
    githubMocks.parseGitHubUrl.mockReset();
    githubCommitMocks.fetchGitHubCommits.mockReset();
    webMocks.fetchAndConvertWebPage.mockReset();
    projectFileBuilderMocks.projectFilesToFile.mockReset();
    bridgeMocks.pushConfigToPage.mockReset();
    document.body.innerHTML = '<textarea id="chat-input"></textarea><button title="Send message"></button>';
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.BDS_TARGET;
    delete window.AndroidBridge;
    delete window.__testPickPayload;
  });

  async function flushModelWatcher() {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    await new Promise((resolve) => requestAnimationFrame(resolve));
    await flushUi();
  }

  it("opens the dropdown and triggers native file upload", async () => {
    const nativeInput = setupNativeInput();
    const { target, cleanup } = renderSvelte(AttachMenu, { nativeInput });

    target.querySelector(".bds-plus-btn").click();
    await flushUi();
    document.querySelector(".bds-attach-item").click();

    expect(nativeInput.click).toHaveBeenCalledOnce();
    cleanup();
  });

  it("keeps multiple enabled for the web Upload File flow", async () => {
    const nativeInput = setupNativeInput();
    nativeInput.click = vi.fn(() => {
      expect(nativeInput.multiple).toBe(true);
    });
    const { target, cleanup } = renderSvelte(AttachMenu, { nativeInput });

    target.querySelector(".bds-plus-btn").click();
    await flushUi();
    document.querySelector(".bds-attach-item").click();

    expect(nativeInput.click).toHaveBeenCalledOnce();
    expect(nativeInput.multiple).toBe(true);
    cleanup();
  });

  it("keeps safe Expert mode controls visible while hiding upload menu actions", async () => {
    document.body.insertAdjacentHTML("beforeend", `
      <div role="radiogroup">
        <div role="radio" data-model-type="instant" aria-checked="false">Instant</div>
        <div role="radio" data-model-type="expert" aria-checked="true">Expert</div>
      </div>
    `);
    const nativeInput = setupNativeInput();
    const { target, cleanup } = renderSvelte(AttachMenu, { nativeInput });

    await flushModelWatcher();

    expect(target.querySelector(".bds-attach-wrapper")).toBeTruthy();
    expect(target.querySelector(".bds-project-btn")).toBeTruthy();
    expect(target.querySelector(".bds-mic-btn")).toBeTruthy();
    expect(target.querySelector(".bds-plus-btn")).toBeNull();
    cleanup();
  });

  it("uses visionMode visibility flags when Vision mode is selected", async () => {
    document.body.insertAdjacentHTML("beforeend", `
      <div role="radiogroup">
        <div role="radio" data-model-type="instant" aria-checked="false">Instant</div>
        <div role="radio" data-model-type="vision" aria-checked="true">Vision</div>
      </div>
    `);
    remoteConfig.applyRemote({
      features: {
        attachMenu: {
          visionMode: {
            show: true,
            showPlus: false,
            showUploadFile: false,
            showUploadFolder: false,
            showGithub: false,
            showWeb: false,
            showProject: true,
            showVoice: true,
          },
        },
      },
    });
    const nativeInput = setupNativeInput();
    const { target, cleanup } = renderSvelte(AttachMenu, { nativeInput });

    await flushModelWatcher();

    expect(target.querySelector(".bds-attach-wrapper")).toBeTruthy();
    expect(target.querySelector(".bds-project-btn")).toBeTruthy();
    expect(target.querySelector(".bds-mic-btn")).toBeTruthy();
    expect(target.querySelector(".bds-plus-btn")).toBeNull();
    cleanup();
  });

  it("keeps the last detected model type when the switcher disappears", async () => {
    document.body.insertAdjacentHTML("beforeend", `
      <div role="radiogroup">
        <div role="radio" data-model-type="instant" aria-checked="false">Instant</div>
        <div role="radio" data-model-type="expert" aria-checked="true">Expert</div>
      </div>
    `);
    const nativeInput = setupNativeInput();
    const { target, cleanup } = renderSvelte(AttachMenu, { nativeInput });

    await flushModelWatcher();
    expect(target.querySelector(".bds-plus-btn")).toBeNull();

    document.querySelector('[role="radiogroup"]').remove();
    await flushModelWatcher();

    expect(target.querySelector(".bds-plus-btn")).toBeNull();
    cleanup();
  });

  it("re-detects after the switcher node is replaced", async () => {
    installModelSwitcher("instant");
    installAndroidBridgeMock(() => ({
      files: [{ name: "a.md", content: "# A" }],
      skipped: [],
    }));
    const nativeInput = setupNativeInput();
    const { target, cleanup } = renderSvelte(AttachMenu, { nativeInput });

    await flushModelWatcher();

    document.querySelector('[role="radiogroup"]').remove();
    document.body.insertAdjacentHTML("beforeend", `
      <div role="radiogroup">
        <div role="radio" data-model-type="instant" aria-checked="false">Instant</div>
        <div role="radio" data-model-type="vision" aria-checked="true">Vision</div>
      </div>
    `);
    await flushModelWatcher();

    target.querySelector(".bds-plus-btn").click();
    await flushUi();
    getAttachItemByText("Upload File").click();
    await flushNativePick();

    expect(window.AndroidBridge.pickFiles).toHaveBeenCalledWith("files+images", expect.any(String));
    cleanup();
  });

  it("fetches a github repo and injects the resulting file", async () => {
    const nativeInput = setupNativeInput();
    const file = new File(["repo"], "repo.txt", { type: "text/plain" });
    githubMocks.parseGitHubUrl.mockReturnValue({ owner: "owner", repo: "repo", branch: "main" });
    githubMocks.fetchGitHubRepo.mockResolvedValue(file);
    const { target, cleanup } = renderSvelte(AttachMenu, { nativeInput });

    target.querySelector(".bds-plus-btn").click();
    await flushUi();
    const items = Array.from(document.querySelectorAll(".bds-attach-item"));
    items.find((item) => item.textContent.includes("GitHub Repo")).click();
    await flushUi();

    const dialogInput = document.querySelector(".bds-github-input");
    dialogInput.value = "owner/repo";
    dialogInput.dispatchEvent(new Event("input", { bubbles: true }));
    await flushUi();
    document.querySelector(".bds-github-btn-import").click();
    await flushUi();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(githubMocks.fetchGitHubRepo).toHaveBeenCalledWith(
      "owner/repo",
      expect.any(Function),
      { token: "" },
    );
    expect(nativeInput.files).toHaveLength(1);
    expect(Array.from(nativeInput.files, (item) => item.name)).toEqual(["repo.txt"]);
    expect(githubCommitMocks.fetchGitHubCommits).not.toHaveBeenCalled();
    cleanup();
  });

  it("injects repo and commit files when commit history is enabled", async () => {
    const nativeInput = setupNativeInput();
    const repoFile = new File(["repo"], "repo.txt", { type: "text/plain" });
    Object.defineProperty(repoFile, "bdsGitHub", {
      value: { owner: "owner", repo: "repo", branch: "master" },
      configurable: true,
    });
    const commitFile = new File(["commits"], "repo_commits.txt", {
      type: "text/plain",
    });
    githubMocks.parseGitHubUrl.mockReturnValue({ owner: "owner", repo: "repo", branch: "main" });
    githubMocks.fetchGitHubRepo.mockResolvedValue(repoFile);
    githubCommitMocks.fetchGitHubCommits.mockResolvedValue(commitFile);
    const { target, cleanup } = renderSvelte(AttachMenu, { nativeInput });

    target.querySelector(".bds-plus-btn").click();
    await flushUi();
    const items = Array.from(document.querySelectorAll(".bds-attach-item"));
    items.find((item) => item.textContent.includes("GitHub Repo")).click();
    await flushUi();

    const dialogInput = document.querySelector(".bds-github-input");
    dialogInput.value = "owner/repo";
    dialogInput.dispatchEvent(new Event("input", { bubbles: true }));
    await flushUi();

    document.querySelector(".bds-github-checkbox input").click();
    await flushUi();
    document.querySelector(".bds-github-btn-import").click();
    await flushUi();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(githubCommitMocks.fetchGitHubCommits).toHaveBeenCalledWith(
      "owner/repo",
      100,
      expect.any(Function),
      { token: "", branch: "master" },
    );
    expect(Array.from(nativeInput.files, (item) => item.name)).toEqual([
      "repo.txt",
      "repo_commits.txt",
    ]);
    cleanup();
  });

  it("keeps the commit input blank while editing and defaults to 100 on fetch", async () => {
    const nativeInput = setupNativeInput();
    const repoFile = new File(["repo"], "repo.txt", { type: "text/plain" });
    Object.defineProperty(repoFile, "bdsGitHub", {
      value: { owner: "owner", repo: "repo", branch: "main" },
      configurable: true,
    });
    const commitFile = new File(["commits"], "repo_commits.txt", {
      type: "text/plain",
    });
    githubMocks.parseGitHubUrl.mockReturnValue({ owner: "owner", repo: "repo", branch: "main" });
    githubMocks.fetchGitHubRepo.mockResolvedValue(repoFile);
    githubCommitMocks.fetchGitHubCommits.mockResolvedValue(commitFile);
    const { target, cleanup } = renderSvelte(AttachMenu, { nativeInput });

    target.querySelector(".bds-plus-btn").click();
    await flushUi();
    const items = Array.from(document.querySelectorAll(".bds-attach-item"));
    items.find((item) => item.textContent.includes("GitHub Repo")).click();
    await flushUi();

    const dialogInput = document.querySelector(".bds-github-input");
    dialogInput.value = "owner/repo";
    dialogInput.dispatchEvent(new Event("input", { bubbles: true }));
    await flushUi();

    document.querySelector(".bds-github-checkbox input").click();
    await flushUi();

    const countInput = document.querySelector(".bds-github-number-input");
    expect(countInput.value).toBe("");
    expect(countInput.placeholder).toBe("100");

    countInput.value = "1000";
    countInput.dispatchEvent(new Event("input", { bubbles: true }));
    await flushUi();
    expect(countInput.value).toBe("1000");

    countInput.value = "";
    countInput.dispatchEvent(new Event("input", { bubbles: true }));
    await flushUi();
    expect(countInput.value).toBe("");

    document.querySelector(".bds-github-btn-import").click();
    await flushUi();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(githubCommitMocks.fetchGitHubCommits).toHaveBeenCalledWith(
      "owner/repo",
      100,
      expect.any(Function),
      { token: "", branch: "main" },
    );
    cleanup();
  });

  it("attaches selected project files and supports voice transcription", async () => {
    const nativeInput = setupNativeInput();
    const attachedFile = new File(["project"], "project.txt", { type: "text/plain" });
    projectFileBuilderMocks.projectFilesToFile.mockReturnValue(attachedFile);

    let recognitionInstance;
    window.SpeechRecognition = class {
      constructor() {
        recognitionInstance = this;
      }
      start() {
        this.onstart?.();
      }
      stop() {
        this.onend?.();
      }
    };

    const { target, cleanup } = renderSvelte(AttachMenu, { nativeInput });

    target.querySelector(".bds-project-btn").click();
    await flushUi();
    document.querySelector(".bds-pp-attach").click();
    await flushUi();

    expect(projectFileBuilderMocks.projectFilesToFile).toHaveBeenCalled();
    expect(nativeInput.files).toHaveLength(1);

    target.querySelector(".bds-mic-btn").click();
    recognitionInstance.onresult?.({
      results: [[{ transcript: "voice text" }]],
    });
    await flushUi();

    expect(document.querySelector("#chat-input").value).toBe("voice text");
    cleanup();
  });

  it("attaches native-picked files via the DOM input on Android", async () => {
    installAndroidBridgeMock(() => ({
      files: [{ name: "a.md", content: "# A" }],
      skipped: [],
    }));
    const nativeInput = setupNativeInput();
    const changeHandler = vi.fn();
    nativeInput.addEventListener("change", changeHandler);
    const { target, cleanup } = renderSvelte(AttachMenu, { nativeInput });

    target.querySelector(".bds-plus-btn").click();
    await flushUi();
    getAttachItemByText("Upload File").click();
    await flushNativePick();

    expect(window.AndroidBridge.pickFiles).toHaveBeenCalledWith("files", expect.any(String));
    expect(Array.from(nativeInput.files, (file) => file.name)).toEqual(["a.md"]);
    expect(changeHandler).toHaveBeenCalled();
    expect(state.ui.showToast).not.toHaveBeenCalled();
    cleanup();
  });

  it("requests files+images mode when model type is vision", async () => {
    installModelSwitcher("vision");
    installAndroidBridgeMock(() => ({
      files: [{ name: "a.md", content: "# A" }],
      skipped: [],
    }));
    const nativeInput = setupNativeInput();
    const { target, cleanup } = renderSvelte(AttachMenu, { nativeInput });

    await flushModelWatcher();
    target.querySelector(".bds-plus-btn").click();
    await flushUi();
    getAttachItemByText("Upload File").click();
    await flushNativePick();

    expect(window.AndroidBridge.pickFiles).toHaveBeenCalledWith("files+images", expect.any(String));
    cleanup();
  });

  it("injects native-picked images as typed Files on Android", async () => {
    installModelSwitcher("vision");
    installAndroidBridgeMock(() => ({
      files: [{ name: "photo.png", content: "AQID", encoding: "base64", mime: "image/png" }],
      skipped: [],
    }));
    const nativeInput = setupNativeInput();
    const { target, cleanup } = renderSvelte(AttachMenu, { nativeInput });

    await flushModelWatcher();
    target.querySelector(".bds-plus-btn").click();
    await flushUi();
    getAttachItemByText("Upload File").click();
    await flushNativePick();

    expect(Array.from(nativeInput.files, (file) => [file.name, file.type, file.size])).toEqual([
      ["photo.png", "image/png", 3],
    ]);
    cleanup();
  });

  it("toasts imagesRequireVision when native skips images outside Vision mode", async () => {
    installModelSwitcher("instant");
    installAndroidBridgeMock(() => ({
      files: [],
      skipped: [{ name: "photo.png", reason: "image-requires-vision" }],
    }));
    const nativeInput = setupNativeInput();
    const { target, cleanup } = renderSvelte(AttachMenu, { nativeInput });

    await flushModelWatcher();
    target.querySelector(".bds-plus-btn").click();
    await flushUi();
    getAttachItemByText("Upload File").click();
    await flushNativePick();

    expect(state.ui.showToast).toHaveBeenCalledWith(
      "Images can only be attached in Vision mode.",
    );
    cleanup();
  });

  it("injects native folder workspace plus separate image attachments in Vision mode", async () => {
    installModelSwitcher("vision");
    installAndroidBridgeMock(() => ({
      files: [
        { name: "src/index.js", content: "console.log('hi');" },
        { name: "assets/photo.png", content: "AQID", encoding: "base64", mime: "image/png" },
      ],
      folderName: "repo",
      skipped: [],
    }));
    const nativeInput = setupNativeInput();
    const { target, cleanup } = renderSvelte(AttachMenu, { nativeInput });

    await flushModelWatcher();
    target.querySelector(".bds-plus-btn").click();
    await flushUi();
    getAttachItemByText("Upload Folder").click();
    await flushNativePick();

    expect(window.AndroidBridge.pickFiles).toHaveBeenCalledWith("folder+images", expect.any(String));
    expect(Array.from(nativeInput.files, (file) => [file.name, file.type])).toEqual([
      ["repo_workspace.txt", "text/plain"],
      ["assets/photo.png", "image/png"],
    ]);
    cleanup();
  });

  it("toasts when the native pick returns zero files with skips", async () => {
    installAndroidBridgeMock(() => ({
      files: [],
      skipped: [{ name: "photo.png", reason: "unsupported-type" }],
    }));
    const nativeInput = setupNativeInput();
    const { target, cleanup } = renderSvelte(AttachMenu, { nativeInput });

    target.querySelector(".bds-plus-btn").click();
    await flushUi();
    getAttachItemByText("Upload File").click();
    await flushNativePick();

    expect(nativeInput.files).toHaveLength(0);
    expect(state.ui.showToast).toHaveBeenCalledWith(
      "Nothing was attached - the selected file(s) are unsupported, too large (over 2 MB), or binary.",
    );
    cleanup();
  });

  it("toasts a partial-skip summary", async () => {
    installAndroidBridgeMock(() => ({
      files: [{ name: "a.md", content: "# A" }],
      skipped: [{ name: "photo.png", reason: "unsupported-type" }],
    }));
    const nativeInput = setupNativeInput();
    const { target, cleanup } = renderSvelte(AttachMenu, { nativeInput });

    target.querySelector(".bds-plus-btn").click();
    await flushUi();
    getAttachItemByText("Upload File").click();
    await flushNativePick();

    expect(Array.from(nativeInput.files, (file) => file.name)).toEqual(["a.md"]);
    expect(state.ui.showToast).toHaveBeenCalledOnce();
    expect(state.ui.showToast.mock.calls[0][0]).toContain("1");
    expect(state.ui.showToast.mock.calls[0][0]).toContain("2");
    cleanup();
  });

  it("toasts folderNoTextFiles when a folder pick yields no files", async () => {
    installAndroidBridgeMock(() => ({
      files: [],
      folderName: "repo",
      skipped: [{ name: "photo.png", reason: "unsupported-type" }],
    }));
    const nativeInput = setupNativeInput();
    const { target, cleanup } = renderSvelte(AttachMenu, { nativeInput });

    target.querySelector(".bds-plus-btn").click();
    await flushUi();
    getAttachItemByText("Upload Folder").click();
    await flushNativePick();

    expect(state.ui.showToast).toHaveBeenCalledWith(
      "No supported text files were found in the selected folder.",
    );
    cleanup();
  });

  it("toasts pickTimeout when the picker rejects with picker-timeout", async () => {
    vi.useFakeTimers();
    process.env.BDS_TARGET = "android";
    window.AndroidBridge = { pickFiles: vi.fn() };
    const nativeInput = setupNativeInput();
    const { target, cleanup } = renderSvelte(AttachMenu, { nativeInput });

    target.querySelector(".bds-plus-btn").click();
    await flushUi();
    getAttachItemByText("Upload File").click();
    await vi.advanceTimersByTimeAsync(10000);
    await flushUi();

    expect(state.ui.showToast).toHaveBeenCalledWith(
      "The file picker did not return a result. Please try again.",
    );
    cleanup();
  });

  it("stays silent on user cancel", async () => {
    installAndroidBridgeMock(() => ({ error: "cancelled", files: [] }));
    const nativeInput = setupNativeInput();
    const { target, cleanup } = renderSvelte(AttachMenu, { nativeInput });

    target.querySelector(".bds-plus-btn").click();
    await flushUi();
    getAttachItemByText("Upload File").click();
    await flushNativePick();

    expect(nativeInput.files).toHaveLength(0);
    expect(state.ui.showToast).not.toHaveBeenCalled();
    cleanup();
  });

  describe("stale native input resolution (F1)", () => {
    it("re-resolves the native input when the mounted input is detached (Android)", async () => {
      installAndroidBridgeMock(() => ({
        files: [{ name: "a.md", content: "# A" }],
        skipped: [],
      }));
      const inputA = setupNativeInput();
      const { target, cleanup } = renderSvelte(AttachMenu, { nativeInput: inputA });

      inputA.remove();
      const inputB = setupNativeInput();

      target.querySelector(".bds-plus-btn").click();
      await flushUi();
      getAttachItemByText("Upload File").click();
      await flushNativePick();

      expect(Array.from(inputB.files, (file) => file.name)).toEqual(["a.md"]);
      expect(inputA.files).toHaveLength(0);
      cleanup();
    });

    it("second consecutive upload lands after DeepSeek swaps the input", async () => {
      installAndroidBridgeMock(() => ({
        files: [{ name: "a.md", content: "# A" }],
        skipped: [],
      }));
      const inputA = setupNativeInput();
      const { target, cleanup } = renderSvelte(AttachMenu, { nativeInput: inputA });

      target.querySelector(".bds-plus-btn").click();
      await flushUi();
      getAttachItemByText("Upload File").click();
      await flushNativePick();
      expect(Array.from(inputA.files, (file) => file.name)).toEqual(["a.md"]);

      inputA.remove();
      const inputB = setupNativeInput();

      target.querySelector(".bds-plus-btn").click();
      await flushUi();
      getAttachItemByText("Upload File").click();
      await flushNativePick();

      expect(Array.from(inputB.files, (file) => file.name)).toEqual(["a.md"]);
      cleanup();
    });

    it("web flow clicks a freshly resolved input when the original is detached", async () => {
      const inputA = setupNativeInput();
      const { target, cleanup } = renderSvelte(AttachMenu, { nativeInput: inputA });

      inputA.remove();
      const inputB = setupNativeInput();
      inputB.click = vi.fn();

      target.querySelector(".bds-plus-btn").click();
      await flushUi();
      getAttachItemByText("Upload File").click();
      await flushUi();

      expect(inputB.click).toHaveBeenCalledOnce();
      expect(inputA.click).not.toHaveBeenCalled();
      cleanup();
    });
  });
});
