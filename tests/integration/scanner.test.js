// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetAppState } from "../helpers/app-state.js";

const mountMock = vi.hoisted(() => vi.fn(() => ({})));
const deepResearchToggleMock = vi.hoisted(() => ({ name: "DeepResearchToggle" }));
const attachMenuMock = vi.hoisted(() => ({ name: "AttachMenu" }));
const expandToggleMock = vi.hoisted(() => ({ name: "ExpandToggle" }));
const ragPreviewMock = vi.hoisted(() => ({ name: "RagPreview" }));

vi.mock("svelte", () => ({
  mount: mountMock,
}));

vi.mock("../../src/content/message-processor.svelte.js", () => ({
  processMessageNode: vi.fn(),
}));

vi.mock("../../src/content/ui/AttachMenu.svelte", () => ({
  default: attachMenuMock,
}));

vi.mock("../../src/content/ui/ExpandToggle.svelte", () => ({
  default: expandToggleMock,
}));

vi.mock("../../src/content/ui/RagPreview.svelte", () => ({
  default: ragPreviewMock,
}));

vi.mock("../../src/content/ui/DeepResearchToggle.svelte", () => ({
  default: deepResearchToggleMock,
}));

vi.mock("../../src/content/ui/SidebarSearch.js", () => ({
  injectSearchInput: vi.fn(),
}));

vi.mock("../../src/content/tools/pending-export.js", () => ({
  checkPendingExport: vi.fn(),
}));

vi.mock("../../src/content/tags/tag-hider.js", () => ({
  hideTagsInHeader: vi.fn(),
  hideTagsInSidebar: vi.fn(),
}));

vi.mock("../../src/content/deep-research.js", () => ({
  setDeepResearchEnabled: vi.fn(),
}));

describe("scanner input controls", () => {
  beforeEach(() => {
    resetAppState();
    mountMock.mockClear();
    document.body.innerHTML = "";
    vi.stubGlobal("location", { hostname: "chat.deepseek.com" });
  });

  it("mounts Deep Research before the attach menu when the composer was already partially mounted", async () => {
    document.body.innerHTML = `
      <div id="composer" data-bds-attach-menu-mounted="true">
        <div role="button" tabindex="0"></div>
        <div class="bds-attach-menu-mount" data-bds-mounted="1">
          <div class="bds-attach-wrapper"></div>
        </div>
        <input type="file" multiple />
      </div>
    `;
    const { scanInputArea } = await import("../../src/content/scanner.js");

    scanInputArea();

    const wrapper = document.querySelector("#composer");
    const fileInput = document.querySelector('input[type="file"][multiple]');
    const deepResearchMount = wrapper.querySelector(".bds-deep-research-mount");
    const attachMount = wrapper.querySelector(".bds-attach-menu-mount");
    const children = Array.from(wrapper.children);

    expect(deepResearchMount).toBeTruthy();
    expect(children.indexOf(deepResearchMount)).toBeLessThan(children.indexOf(attachMount));
    expect(children.indexOf(deepResearchMount)).toBeLessThan(children.indexOf(fileInput));
    expect(deepResearchMount.dataset.bdsMounted).toBe("1");
    expect(mountMock.mock.calls[0][0]).toBe(deepResearchToggleMock);
    expect(mountMock.mock.calls[0][1].target).toBe(deepResearchMount);
  });

  it("hides only the native upload trigger directly associated with the file input", async () => {
    document.body.innerHTML = `
      <div id="composer">
        <button id="native-upload" type="button"></button>
        <input type="file" multiple />
      </div>
    `;
    const { scanInputArea } = await import("../../src/content/scanner.js");

    scanInputArea();

    expect(document.querySelector("#native-upload").style.display).toBe("none");
  });

  it("mounts attach controls on the visible composer when stale upload inputs remain", async () => {
    document.body.innerHTML = `
      <div id="stale-composer" style="display: none">
        <button id="stale-upload" type="button"></button>
        <input type="file" multiple />
      </div>
      <div id="active-composer">
        <button id="active-upload" type="button"></button>
        <input type="file" multiple />
      </div>
    `;
    const { scanInputArea } = await import("../../src/content/scanner.js");

    scanInputArea();

    expect(document.querySelector("#stale-composer .bds-attach-menu-mount")).toBeNull();
    expect(document.querySelector("#active-composer .bds-attach-menu-mount")).toBeTruthy();
    expect(document.querySelector("#active-upload").style.display).toBe("none");
    expect(document.querySelector("#stale-upload").style.display).not.toBe("none");
  });

  it("does not hide unrelated composer buttons when mounting controls", async () => {
    document.body.innerHTML = `
      <div id="composer">
        <div id="model-option" role="button" tabindex="0">Expert</div>
        <span></span>
        <input type="file" multiple />
      </div>
    `;
    const { scanInputArea } = await import("../../src/content/scanner.js");

    scanInputArea();

    expect(document.querySelector("#model-option").style.display).not.toBe("none");
  });

  it("mounts Deep Research in the prompt action row when Expert mode has no native file input", async () => {
    document.body.innerHTML = `
      <div id="composer">
        <textarea id="chat-input" placeholder="Message DeepSeek"></textarea>
        <div id="prompt-actions">
          <button id="deepthink" type="button">DeepThink</button>
        </div>
        <div id="send-cluster">
          <button id="send" title="Send message" type="button"></button>
        </div>
      </div>
    `;
    const { scanInputArea } = await import("../../src/content/scanner.js");

    scanInputArea();

    const promptActions = document.querySelector("#prompt-actions");
    const sendCluster = document.querySelector("#send-cluster");
    const deepResearchMount = promptActions.querySelector(".bds-deep-research-mount");
    const children = Array.from(promptActions.children);

    expect(deepResearchMount).toBeTruthy();
    expect(children.indexOf(deepResearchMount)).toBeLessThan(
      children.indexOf(document.querySelector("#deepthink")),
    );
    expect(sendCluster.querySelector(".bds-deep-research-mount")).toBeNull();
    expect(document.querySelector(".bds-attach-menu-mount")).toBeNull();
    expect(mountMock.mock.calls[0][0]).toBe(deepResearchToggleMock);
  });

  it("does not reinsert the Deep Research mount when rescanning an unchanged action row", async () => {
    document.body.innerHTML = `
      <div id="composer">
        <textarea id="chat-input" placeholder="Message DeepSeek"></textarea>
        <div id="prompt-actions">
          <button id="deepthink" type="button">DeepThink</button>
        </div>
      </div>
    `;
    const { scanInputArea } = await import("../../src/content/scanner.js");

    scanInputArea();
    const promptActions = document.querySelector("#prompt-actions");
    const insertSpy = vi.spyOn(promptActions, "insertBefore");

    scanInputArea();

    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("keeps Deep Research out of the send cluster when Expert mode still exposes a file input", async () => {
    document.body.innerHTML = `
      <div id="composer">
        <textarea id="chat-input" placeholder="Message DeepSeek"></textarea>
        <div id="composer-actions">
          <button id="deepthink" type="button">DeepThink</button>
          <div id="send-cluster">
            <button id="send" title="Send message" type="button"></button>
            <button id="native-upload" type="button"></button>
            <input type="file" multiple />
          </div>
        </div>
      </div>
    `;
    const { scanInputArea } = await import("../../src/content/scanner.js");

    scanInputArea();

    const actionRow = document.querySelector("#composer-actions");
    const sendCluster = document.querySelector("#send-cluster");
    const deepResearchMount = actionRow.querySelector(":scope > .bds-deep-research-mount");

    expect(deepResearchMount).toBeTruthy();
    expect(sendCluster.querySelector(".bds-deep-research-mount")).toBeNull();
    expect(sendCluster.querySelector(".bds-attach-menu-mount")).toBeTruthy();
    expect(document.querySelector("#native-upload").style.display).toBe("none");
  });

  it("falls back to the send button cluster when no prompt action row exists", async () => {
    document.body.innerHTML = `
      <div id="composer">
        <button id="send" title="Send message" type="button"></button>
      </div>
    `;
    const { scanInputArea } = await import("../../src/content/scanner.js");

    scanInputArea();

    const wrapper = document.querySelector("#composer");
    const deepResearchMount = wrapper.querySelector(".bds-deep-research-mount");

    expect(deepResearchMount).toBeTruthy();
    expect(mountMock.mock.calls[0][0]).toBe(deepResearchToggleMock);
  });

  it("mounts Deep Research in prompt action row when DeepThink is in Turkish ('Derin Düşünme' and class/SVG match)", async () => {
    document.body.innerHTML = `
      <div id="composer">
        <textarea id="chat-input" placeholder="Mesaj Gönder"></textarea>
        <div id="prompt-actions">
          <button id="deepthink" class="ds-toggle-button" type="button">
            <svg viewBox="0 0 14 14"><path d="M7.06431 5.93342C7.68763 5.93342 8.19307 6.43904 8.19322 7.06233"></path></svg>
            Derin Düşünme
          </button>
        </div>
        <div id="send-cluster">
          <button id="send" title="Send message" type="button"></button>
        </div>
      </div>
    `;
    const { scanInputArea } = await import("../../src/content/scanner.js");

    scanInputArea();

    const promptActions = document.querySelector("#prompt-actions");
    const deepResearchMount = promptActions.querySelector(".bds-deep-research-mount");

    expect(deepResearchMount).toBeTruthy();
    expect(mountMock.mock.calls[0][0]).toBe(deepResearchToggleMock);
  });

  it("mounts Deep Research in prompt action row when DeepThink is matched via SVG path", async () => {
    document.body.innerHTML = `
      <div id="composer">
        <textarea id="chat-input" placeholder="Message"></textarea>
        <div id="prompt-actions">
          <button id="deepthink" type="button">
            <svg viewBox="0 0 14 14"><path d="M7.06431 5.93342C7.68763 5.93342 8.19307 6.43904 8.19322 7.06233"></path></svg>
            Some Random Text
          </button>
        </div>
        <div id="send-cluster">
          <button id="send" title="Send message" type="button"></button>
        </div>
      </div>
    `;
    const { scanInputArea } = await import("../../src/content/scanner.js");

    scanInputArea();

    const promptActions = document.querySelector("#prompt-actions");
    const deepResearchMount = promptActions.querySelector(".bds-deep-research-mount");

    expect(deepResearchMount).toBeTruthy();
    expect(mountMock.mock.calls[0][0]).toBe(deepResearchToggleMock);
  });

  it("does not mount Deep Research on non-DeepSeek sites", async () => {
    vi.stubGlobal("location", { hostname: "claude.ai" });
    document.body.innerHTML = `
      <div id="composer">
        <button id="native-upload" type="button"></button>
        <input type="file" multiple />
      </div>
    `;
    const { scanInputArea } = await import("../../src/content/scanner.js");

    scanInputArea();

    expect(document.querySelector(".bds-deep-research-mount")).toBeNull();
    expect(document.querySelector("#native-upload").style.display).not.toBe("none");
  });
});
