// @vitest-environment jsdom

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { resetAppState } from "../helpers/app-state.js";

const mountMock = vi.hoisted(() => vi.fn(() => ({})));
const deepResearchToggleMock = vi.hoisted(() => ({ name: "DeepResearchToggle" }));
const attachMenuMock = vi.hoisted(() => ({ name: "AttachMenu" }));
const expandToggleMock = vi.hoisted(() => ({ name: "ExpandToggle" }));
const ragPreviewMock = vi.hoisted(() => ({ name: "RagPreview" }));

const processMessageNodeMock = vi.hoisted(() => vi.fn());
const disposeMessageNodeMock = vi.hoisted(() => vi.fn());
const disposeDetachedMessageOverlaysMock = vi.hoisted(() => vi.fn());
const isSystemGeneratingMock = vi.hoisted(() => vi.fn(() => false));

vi.mock("svelte", () => ({
  mount: mountMock,
}));

vi.mock("../../src/content/message-processor.svelte.js", () => ({
  processMessageNode: processMessageNodeMock,
  disposeMessageNode: disposeMessageNodeMock,
  disposeDetachedMessageOverlays: disposeDetachedMessageOverlaysMock,
  isSystemGenerating: isSystemGeneratingMock,
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

  it("rejects login/auth form — no deep research mount", async () => {
    document.body.innerHTML = `
      <div id="login-form">
        <input type="text" placeholder="Email or phone number" />
        <input type="password" placeholder="Password" />
        <button type="submit">Log in</button>
      </div>
    `;
    const { scanInputArea } = await import("../../src/content/scanner.js");

    scanInputArea();

    expect(document.querySelector(".bds-deep-research-mount")).toBeNull();
    expect(mountMock).not.toHaveBeenCalled();
  });

  it("mounts deep research on root URL chat composer when chat markers present", async () => {
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

    expect(document.querySelector(".bds-deep-research-mount")).toBeTruthy();
    expect(mountMock).toHaveBeenCalled();
  });
});

describe("scanner #bds-root isolation", () => {
  beforeEach(async () => {
    resetAppState();
    vi.useFakeTimers();
    mountMock.mockClear();
    processMessageNodeMock.mockClear();
    disposeMessageNodeMock.mockClear();
    disposeDetachedMessageOverlaysMock.mockClear();
    isSystemGeneratingMock.mockReturnValue(false);
    document.body.innerHTML = "";
    const { resetIncrementalState } = await import("../../src/content/scanner.js");
    resetIncrementalState();
  });

  afterEach(async () => {
    const state = (await import("../../src/content/state.js")).default;
    if (state.observer) {
      state.observer.disconnect();
      state.observer = null;
    }
    if (state.scanTimer) {
      clearTimeout(state.scanTimer);
      state.scanTimer = 0;
    }
    const { resetIncrementalState } = await import("../../src/content/scanner.js");
    resetIncrementalState();
    vi.useRealTimers();
  });

  function makeMessage(role, text = "Hello") {
    const div = document.createElement("div");
    div.className = "ds-message _63c77b1";
    div.dataset.role = role;
    div.dataset.rawText = text;
    if (role === "user") div.classList.add("d29f3d7d");
    return div;
  }

  it("adding #bds-root to body arms no timer", async () => {
    const { observeChatDom } = await import("../../src/content/scanner.js");
    const state = (await import("../../src/content/state.js")).default;
    observeChatDom();

    const root = document.createElement("div");
    root.id = "bds-root";
    document.body.appendChild(root);
    await Promise.resolve();

    // No timer armed — scanTimer should still be 0
    expect(state.scanTimer).toBe(0);
  });

  it("removing #bds-root arms no timer", async () => {
    const { observeChatDom } = await import("../../src/content/scanner.js");
    const state = (await import("../../src/content/state.js")).default;

    const root = document.createElement("div");
    root.id = "bds-root";
    document.body.appendChild(root);

    observeChatDom();
    await Promise.resolve();

    root.remove();
    await Promise.resolve();

    expect(state.scanTimer).toBe(0);
  });

  it("changes wholly within #bds-root remain ignored", async () => {
    const { observeChatDom } = await import("../../src/content/scanner.js");
    const state = (await import("../../src/content/state.js")).default;

    const root = document.createElement("div");
    root.id = "bds-root";
    document.body.appendChild(root);

    observeChatDom();
    await Promise.resolve();

    // Add a child element inside #bds-root
    const child = document.createElement("span");
    child.className = "ds-message _63c77b1";
    root.appendChild(child);
    await Promise.resolve();

    expect(state.scanTimer).toBe(0);
    expect(processMessageNodeMock).not.toHaveBeenCalled();
  });

  it("batch with root + external message schedules one scan", async () => {
    const { observeChatDom } = await import("../../src/content/scanner.js");
    const state = (await import("../../src/content/state.js")).default;

    const root = document.createElement("div");
    root.id = "bds-root";
    document.body.appendChild(root);

    observeChatDom();
    await Promise.resolve();

    // Simultaneous: add child to root + add external message
    const rootChild = document.createElement("span");
    root.appendChild(rootChild);

    const extMsg = makeMessage("assistant", "external");
    document.body.appendChild(extMsg);

    await Promise.resolve();

    // Timer should be armed exactly once
    expect(state.scanTimer).toBeTruthy();
    // Only external message should be processed (after timer fires)
    vi.advanceTimersByTime(200);
    expect(processMessageNodeMock).toHaveBeenCalledTimes(1);
    expect(processMessageNodeMock).toHaveBeenCalledWith(
      extMsg, expect.any(Number), expect.any(Array), expect.any(Object),
    );
    // Root child should not be processed
    // Only extMsg should have been passed to processMessageNode
    expect(processMessageNodeMock).toHaveBeenCalledTimes(1);
    expect(processMessageNodeMock).toHaveBeenCalledWith(
      extMsg, expect.any(Number), expect.any(Array), expect.any(Object),
    );
  });
});

describe("scanner scheduling", () => {
  beforeEach(async () => {
    resetAppState();
    vi.useFakeTimers();
    mountMock.mockClear();
    processMessageNodeMock.mockClear();
    disposeMessageNodeMock.mockClear();
    disposeDetachedMessageOverlaysMock.mockClear();
    isSystemGeneratingMock.mockReturnValue(false);
    document.body.innerHTML = "";
    // Reset module-level scan state between tests
    const { resetIncrementalState } = await import("../../src/content/scanner.js");
    resetIncrementalState();
  });

  afterEach(async () => {
    // Disconnect any observer and clear timers to prevent cross-test leaks
    const state = (await import("../../src/content/state.js")).default;
    if (state.observer) {
      state.observer.disconnect();
      state.observer = null;
    }
    if (state.scanTimer) {
      clearTimeout(state.scanTimer);
      state.scanTimer = 0;
    }
    const { resetIncrementalState } = await import("../../src/content/scanner.js");
    resetIncrementalState();
    vi.useRealTimers();
  });

  function makeMessage(role, text = "Hello") {
    const div = document.createElement("div");
    div.className = "ds-message _63c77b1";
    div.dataset.role = role;
    div.dataset.rawText = text;
    if (role === "user") div.classList.add("d29f3d7d");
    return div;
  }

  it("explicit scheduleScan processes all messages exactly once", async () => {
    const msg1 = makeMessage("user", "hi");
    const msg2 = makeMessage("assistant", "hello");
    document.body.append(msg1, msg2);

    const { scheduleScan } = await import("../../src/content/scanner.js");
    scheduleScan();

    vi.advanceTimersByTime(200);

    expect(processMessageNodeMock).toHaveBeenCalledTimes(2);
  });

  it("scheduleMessageScan processes bounded set not every message", async () => {
    const messages = [];
    for (let i = 0; i < 50; i++) {
      const msg = makeMessage(i % 2 === 0 ? "user" : "assistant", `msg${i}`);
      document.body.appendChild(msg);
      messages.push(msg);
    }

    const { scheduleMessageScan } = await import("../../src/content/scanner.js");
    scheduleMessageScan(messages[10]);

    vi.advanceTimersByTime(200);

    // Should process only the target + transition nodes (latest assistant, absolute last),
    // not all 50. In a list of 50 messages alternating user/assistant:
    // - target: messages[10] (user at idx 10)
    // - latestAssistant: messages[49] (assistant at idx 49)
    // - absoluteLast: messages[49] (idx 49)
    // Max 3 nodes expected.
    const callCount = processMessageNodeMock.mock.calls.length;
    expect(callCount).toBeLessThanOrEqual(3);
    expect(callCount).toBeGreaterThanOrEqual(1);
    // The target node must be among the processed nodes
    const processedNodes = processMessageNodeMock.mock.calls.map(c => c[0]);
    expect(processedNodes).toContain(messages[10]);
  });

  it("observer-driven append processes only new message plus transitions among 2000", async () => {
    const { observeChatDom } = await import("../../src/content/scanner.js");

    // Seed 2000 messages
    for (let i = 0; i < 2000; i++) {
      const msg = makeMessage(i % 2 === 0 ? "user" : "assistant", `msg${i}`);
      document.body.appendChild(msg);
    }
    // Run a full scan first so all are processed and transition state is set
    const { scheduleScan } = await import("../../src/content/scanner.js");
    scheduleScan();
    vi.advanceTimersByTime(200);
    processMessageNodeMock.mockClear();

    // Now set up the observer and append one new message
    observeChatDom();
    await Promise.resolve();

    const newMsg = makeMessage("assistant", "new-message");
    document.body.appendChild(newMsg);
    await Promise.resolve();

    vi.advanceTimersByTime(200);

    // Should process only the new message + transition nodes, never all 2000
    const callCount = processMessageNodeMock.mock.calls.length;
    expect(callCount).toBeLessThanOrEqual(3);
    expect(callCount).toBeGreaterThanOrEqual(1);
    const processedNodes = processMessageNodeMock.mock.calls.map(c => c[0]);
    expect(processedNodes).toContain(newMsg);
  });

  it("scheduleMessageScan ignores null", async () => {
    const { scheduleMessageScan } = await import("../../src/content/scanner.js");
    const state = (await import("../../src/content/state.js")).default;

    scheduleMessageScan(null);
    // No timer armed
    expect(state.scanTimer).toBe(0);
  });

  it("scheduleMessageScan ignores text nodes", async () => {
    const { scheduleMessageScan } = await import("../../src/content/scanner.js");
    const state = (await import("../../src/content/state.js")).default;

    const textNode = document.createTextNode("hello");
    scheduleMessageScan(textNode);
    expect(state.scanTimer).toBe(0);
  });

  it("scheduleMessageScan ignores non-message elements", async () => {
    const { scheduleMessageScan } = await import("../../src/content/scanner.js");
    const state = (await import("../../src/content/state.js")).default;

    const div = document.createElement("div");
    div.className = "not-a-message";
    scheduleMessageScan(div);
    // Arm happens even for non-message elements (it adds to dirty set and arms timer)
    // But when scan runs, it won't find a message
    expect(state.scanTimer).toBeTruthy();
    vi.advanceTimersByTime(200);
    expect(processMessageNodeMock).not.toHaveBeenCalled();
  });

  it("scheduleMessageScan ignores elements within #bds-root", async () => {
    const { scheduleMessageScan } = await import("../../src/content/scanner.js");
    const state = (await import("../../src/content/state.js")).default;

    const root = document.createElement("div");
    root.id = "bds-root";
    document.body.appendChild(root);
    const inner = document.createElement("div");
    inner.className = "ds-message _63c77b1";
    root.appendChild(inner);

    scheduleMessageScan(inner);
    expect(state.scanTimer).toBe(0);
  });

  it("scheduleMessageScan ignores detached elements", async () => {
    const { scheduleMessageScan } = await import("../../src/content/scanner.js");
    const detached = makeMessage("assistant", "detached");
    // Not appended to document

    scheduleMessageScan(detached);
    vi.advanceTimersByTime(200);
    // Detached at flush time → disposed (not processed)
    expect(disposeMessageNodeMock).toHaveBeenCalledWith(detached);
    expect(processMessageNodeMock).not.toHaveBeenCalled();
  });

  it("full scan supersedes targeted work", async () => {
    const messages = [];
    for (let i = 0; i < 20; i++) {
      const msg = makeMessage("user", `msg${i}`);
      document.body.appendChild(msg);
      messages.push(msg);
    }

    const { scheduleMessageScan, scheduleScan } = await import("../../src/content/scanner.js");
    scheduleMessageScan(messages[5]);
    scheduleScan(); // full scan should supersede

    vi.advanceTimersByTime(200);

    // Full scan: all 20 messages processed
    expect(processMessageNodeMock).toHaveBeenCalledTimes(20);
  });

  it("removed node is disposed even when full scan supersedes targeted", async () => {
    const msg1 = makeMessage("user", "hi");
    const msg2 = makeMessage("assistant", "hello");
    document.body.append(msg1, msg2);

    const { scheduleScan, observeChatDom } = await import("../../src/content/scanner.js");

    // Set up observer to track mutations
    observeChatDom();

    // Remove msg2 from DOM
    msg2.remove();

    // Flush microtasks so MutationObserver callback fires and populates removedNodes
    await Promise.resolve();

    // Full scan supersedes
    scheduleScan();

    vi.advanceTimersByTime(200);

    // msg2 was removed — should be disposed
    expect(disposeMessageNodeMock).toHaveBeenCalledWith(msg2);
  });

  it("reparented node still connected at flush is not disposed", async () => {
    const msg1 = makeMessage("user", "hi");
    document.body.appendChild(msg1);

    const { scheduleScan, observeChatDom } = await import("../../src/content/scanner.js");
    observeChatDom();

    // Remove then re-add to simulate move
    msg1.remove();
    document.body.appendChild(msg1);

    // Flush microtasks so observer processes the remove/add
    await Promise.resolve();

    scheduleScan();
    vi.advanceTimersByTime(200);

    // msg1 is still connected — should NOT be disposed
    expect(disposeMessageNodeMock).not.toHaveBeenCalledWith(msg1);
  });

  it("processMessageNode receives context with systemGenerating", async () => {
    isSystemGeneratingMock.mockReturnValue(true);
    const msg1 = makeMessage("assistant", "streaming");
    document.body.appendChild(msg1);

    const { scheduleScan } = await import("../../src/content/scanner.js");
    scheduleScan();
    vi.advanceTimersByTime(200);

    const callArgs = processMessageNodeMock.mock.calls[0];
    const context = callArgs[3];
    expect(context).toBeDefined();
    expect(context.systemGenerating).toBe(true);
    expect(context.latestAssistantNode).toBeDefined();
    expect(context.absoluteLastNode).toBeDefined();
  });

  it("duplicate scheduleMessageScan calls for same node deduplicate", async () => {
    const msg1 = makeMessage("assistant", "hello");
    document.body.appendChild(msg1);

    const { scheduleMessageScan } = await import("../../src/content/scanner.js");

    // Call scheduleMessageScan twice for same node
    scheduleMessageScan(msg1);
    scheduleMessageScan(msg1);

    vi.advanceTimersByTime(200);

    // Should process the node only once despite being scheduled twice
    const calls = processMessageNodeMock.mock.calls.filter(c => c[0] === msg1);
    expect(calls.length).toBe(1);
  });

  it("appending a message refreshes latest-assistant and absolute-last state", async () => {
    const msg1 = makeMessage("assistant", "first");
    document.body.appendChild(msg1);

    const { scheduleScan } = await import("../../src/content/scanner.js");
    scheduleScan();
    vi.advanceTimersByTime(200);
    expect(processMessageNodeMock).toHaveBeenCalledTimes(1);

    processMessageNodeMock.mockClear();

    // Append a new user message
    const msg2 = makeMessage("user", "second");
    document.body.appendChild(msg2);

    scheduleScan();
    vi.advanceTimersByTime(200);

    // Both messages should be re-processed in a full scan
    expect(processMessageNodeMock).toHaveBeenCalledTimes(2);
  });
});
