// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import state from "../state.js";
import { STORAGE_KEYS } from "../../lib/constants.js";
import { chromeMockState, resetChromeMock } from "../../../tests/mocks/chrome.js";
import {
  addTag,
  discoverTags,
  getTags,
  removeTag,
  setTags,
} from "./tag-manager.js";
import { hideTagsInSidebar } from "./tag-hider.js";

/**
 * Sidebar DOM shaped like DeepSeek's: link > title span, the three-dot menu
 * button `updateSessionTitle` clicks, the dropdown option it looks for, and
 * the rename input it types into.
 */
function mountSidebar({ id, title, renameLabel = "Rename", onMenuClick }) {
  document.body.innerHTML = `
    <a class="_546d736" href="/chat/s/${id}">
      <span class="c08e6e93">${title}</span>
      <div class="_2090548">menu</div>
    </a>
    <div class="ds-dropdown-menu-option">${renameLabel}</div>
    <input class="ds-input__input" />
  `;
  if (onMenuClick) {
    document.querySelector("._2090548").addEventListener("click", onMenuClick);
  }
  // DeepSeek's router swallows clicks on the row; without this jsdom tries to
  // follow the href when the three-dot button's click bubbles up.
  document.querySelector("a._546d736").addEventListener("click", (e) => e.preventDefault());
}

const titleEl = () => document.querySelector(".c08e6e93");
const storedFullTitle = () => titleEl().getAttribute("data-bds-full-title");
const storedTags = () => chromeMockState.storageData[STORAGE_KEYS.chatTags] || {};

beforeEach(() => {
  resetChromeMock();
  state.chatTags = {};
  state.chatSessions = [];
  document.body.innerHTML = "";
});

describe("tag removal vs. tag discovery (#213)", () => {
  it("clears the title cache synchronously, before any await", () => {
    const id = "a1b2c3d4-0001";
    mountSidebar({ id, title: "My Chat &lt;work&gt;" });
    hideTagsInSidebar();
    expect(getTags(id)).toEqual(["work"]);
    expect(storedFullTitle()).toBe("My Chat <work>");

    const pending = removeTag(id, "work");

    // No await yet: the scan can run at any moment from here on.
    expect(getTags(id)).toEqual([]);
    expect(storedFullTitle()).toBe(null);
    expect(titleEl().textContent).toBe("My Chat");

    return pending;
  });

  it("does not resurrect the tag when a scan runs while the rename is in flight", async () => {
    const id = "a1b2c3d4-0002";
    // The menu click is a DOM mutation, so the page-wide scan lands inside
    // `updateSessionTitle`'s ~250ms of waits. Standing in for it here.
    mountSidebar({
      id,
      title: "My Chat &lt;work&gt;",
      onMenuClick: () => hideTagsInSidebar(),
    });
    hideTagsInSidebar();

    await removeTag(id, "work");

    expect(getTags(id)).toEqual([]);
    expect(state.chatTags[id]).toBeUndefined();
    expect(storedTags()[id]).toBeUndefined();
    expect(storedFullTitle()).toBe(null);
  });

  it("keeps a removed tag gone across repeated scans of the stale title", async () => {
    const id = "a1b2c3d4-0003";
    mountSidebar({ id, title: "My Chat &lt;work&gt;" });
    hideTagsInSidebar();

    await removeTag(id, "work");

    // Simulate the DOM cache being rewritten to the old title by a re-render
    // that predates the rename, then scanned again.
    titleEl().setAttribute("data-bds-full-title", "My Chat <work>");
    hideTagsInSidebar();
    hideTagsInSidebar();

    expect(getTags(id)).toEqual([]);
  });

  it("ignores titles coming from the session-list API while a write is in flight", async () => {
    const id = "a1b2c3d4-0004";
    mountSidebar({ id, title: "My Chat &lt;work&gt;" });
    hideTagsInSidebar();

    const pending = removeTag(id, "work");
    // bridge.js feeds `discoverTags` straight from the session-list payload,
    // which still carries the pre-rename title.
    await discoverTags(id, "My Chat <work>");
    expect(getTags(id)).toEqual([]);

    await pending;
    expect(getTags(id)).toEqual([]);
  });

  it("does not re-apply the same title on every scan", async () => {
    const id = "a1b2c3d4-0005";
    mountSidebar({ id, title: "My Chat &lt;work&gt;" });
    hideTagsInSidebar();
    expect(getTags(id)).toEqual(["work"]);

    // A local clear that did not go through setTags (e.g. a settings import).
    delete state.chatTags[id];

    hideTagsInSidebar();
    expect(getTags(id)).toEqual([]);
  });
});

describe("tag discovery still works (#213 regression)", () => {
  it("seeds tags from a title seen for the first time", async () => {
    const id = "b1b2c3d4-0001";
    mountSidebar({ id, title: "Remote Chat &lt;design&gt;" });

    hideTagsInSidebar();
    await Promise.resolve();

    expect(getTags(id)).toEqual(["design"]);
    expect(storedTags()[id]).toEqual(["design"]);
  });

  it("seeds tags from a session-list payload", async () => {
    const id = "b1b2c3d4-0002";

    await discoverTags(id, "From Another Device <rp>");

    expect(getTags(id)).toEqual(["rp"]);
  });

  it("picks up a genuinely new title", async () => {
    const id = "b1b2c3d4-0003";
    mountSidebar({ id, title: "Chat &lt;one&gt;" });
    hideTagsInSidebar();
    expect(getTags(id)).toEqual(["one"]);

    titleEl().textContent = "Chat <two>";
    hideTagsInSidebar();
    await Promise.resolve();

    expect(getTags(id)).toEqual(["two"]);
  });
});

describe("adding tags", () => {
  it("writes the tag into the title cache and keeps it", async () => {
    const id = "c1b2c3d4-0001";
    mountSidebar({ id, title: "My Chat" });

    await addTag(id, "work");

    expect(getTags(id)).toEqual(["work"]);
    expect(storedFullTitle()).toBe("My Chat <work>");
    expect(titleEl().textContent).toBe("My Chat");
  });

  it("keeps the base title when replacing the tag set", async () => {
    const id = "c1b2c3d4-0002";
    mountSidebar({ id, title: "My Chat &lt;work&gt;" });
    hideTagsInSidebar();

    await setTags(id, ["rp", "günlük"]);

    expect(getTags(id)).toEqual(["rp", "günlük"]);
    expect(storedFullTitle()).toBe("My Chat <rp> <günlük>");
    expect(titleEl().textContent).toBe("My Chat");
  });
});
