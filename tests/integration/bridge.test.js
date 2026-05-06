// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const scannerMocks = vi.hoisted(() => ({
  findLatestAssistantMessageNode: vi.fn(),
  collectMessageNodes: vi.fn(() => []),
}));

const longWorkMocks = vi.hoisted(() => ({
  finalizeLongWork: vi.fn(),
}));

vi.mock("../../src/content/scanner.js", () => scannerMocks);
vi.mock("../../src/content/files/long-work.js", () => longWorkMocks);

import {
  handleNetworkState,
  injectHookScript,
  pushConfigToPage,
} from "../../src/content/bridge.js";
import state from "../../src/content/state.js";
import { BRIDGE_EVENTS } from "../../src/lib/constants.js";
import { resetAppState } from "../helpers/app-state.js";

describe("bridge integration", () => {
  beforeEach(() => {
    resetAppState();
    scannerMocks.findLatestAssistantMessageNode.mockReset();
    scannerMocks.collectMessageNodes.mockReset();
    longWorkMocks.finalizeLongWork.mockReset();
    document.body.innerHTML = "";
    document.head.innerHTML = "";
  });

  it("pushes the current config to the page as a stringified custom event", () => {
    state.settings.systemPrompt = "Prompt";
    state.settings.preferredLang = "English";
    state.skills = [
      { name: "Active", content: "Use me", active: true },
      { name: "Disabled", content: "Skip me", active: false },
    ];
    state.memories = { user_name: { value: "Alex", importance: "always" } };
    state.characters = [{ id: "1", name: "Mage", content: "wise", usage: "rp", active: true }];
    state.projects = [{ id: "p1", name: "Proj", customInstructions: "Project rules" }];
    state.projectFiles = [{ id: "f1", projectId: "p1", name: "README.md", content: "# Demo" }];
    state.activeProjectId = "p1";
    state.activeFileIds = ["f1"];

    let received = null;
    window.addEventListener(BRIDGE_EVENTS.configUpdate, (event) => {
      received = JSON.parse(event.detail);
    }, { once: true });

    pushConfigToPage();

    expect(received).toMatchObject({
      systemPrompt: "Prompt",
      preferredLang: "English",
      skills: [{ name: "Active", content: "Use me" }],
      memories: [{ key: "user_name", value: "Alex", importance: "always" }],
      activeCharacter: { name: "Mage", content: "wise", usage: "rp", active: true, id: "1" },
      activeProject: {
        name: "Proj",
        instructions: "Project rules",
        files: [{ name: "README.md", content: "# Demo" }],
      },
    });
  });

  it("keeps long work alive while requests are active", () => {
    state.longWork.active = true;
    state.longWork.lastActivityAt = 1;

    handleNetworkState({ activeCompletionRequests: 2 });

    expect(state.network.activeCompletionRequests).toBe(2);
    expect(state.longWork.lastActivityAt).toBeGreaterThan(1);
  });

  it("finalizes long work when requests stop and files are pending", () => {
    const node = document.createElement("div");
    node.dataset.bdsLongWorkClosed = "0";
    state.longWork.active = true;
    state.longWork.files = new Map([["src/app.js", "console.log(1)"]]);
    scannerMocks.findLatestAssistantMessageNode.mockReturnValue(node);

    handleNetworkState({ activeCompletionRequests: 0 });

    expect(node.dataset.bdsLongWorkClosed).toBe("1");
    expect(longWorkMocks.finalizeLongWork).toHaveBeenCalledWith(node);
  });

  it("clears stale long work state when the response ends without a finalizable message", () => {
    state.ui = {
      showLongWorkOverlay: vi.fn(),
      showToast: vi.fn(),
    };
    state.longWork.active = true;
    state.longWork.files = new Map([["a.txt", "x"]]);
    scannerMocks.findLatestAssistantMessageNode.mockReturnValue(null);

    handleNetworkState({ activeCompletionRequests: 0 });

    expect(state.longWork.active).toBe(false);
    expect(state.longWork.files.size).toBe(0);
    expect(state.ui.showLongWorkOverlay).toHaveBeenCalledWith(false);
    expect(state.ui.showToast).toHaveBeenCalled();
  });

  it("injects the hook script once and removes it after load", () => {
    injectHookScript();
    const script = document.getElementById("bds-injected-hook");

    expect(script).not.toBeNull();
    expect(script.src).toContain("injected.js");

    script.onload();
    expect(document.getElementById("bds-injected-hook")).toBeNull();
  });
});
