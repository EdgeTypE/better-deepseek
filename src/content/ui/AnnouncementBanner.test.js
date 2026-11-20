// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, unmount, tick } from "svelte";
import appState from "../state.js";
import AnnouncementBanner from "./AnnouncementBanner.svelte";

let component = null;

function mountBanner() {
  const target = document.createElement("div");
  document.body.appendChild(target);
  component = mount(AnnouncementBanner, { target });
  return target;
}

beforeEach(() => {
  document.body.innerHTML = "";
  appState.remoteAnnouncements = [];
  appState.dismissedAnnouncements = [];
  vi.mocked(chrome.storage.local.set).mockClear();
});

afterEach(() => {
  if (component) {
    unmount(component);
    component = null;
  }
});

describe("AnnouncementBanner", () => {
  it("hides the history button when there are no past announcements", async () => {
    appState.remoteAnnouncements = [
      { id: "active-1", show: true, message: "Active announcement", type: "info" },
    ];

    mountBanner();
    await tick();

    expect(document.querySelectorAll(".bds-announcement")).toHaveLength(1);
    expect(document.querySelector(".bds-announcement-history-btn")).toBeNull();
  });

  it("toggles past announcements panel and renders past items newest-first", async () => {
    appState.remoteAnnouncements = [
      { id: "old-1", show: false, message: "Oldest warning", type: "warning" },
      { id: "old-2", show: false, message: "Newer [link](https://example.com)", type: "info" },
      { id: "active-1", show: true, message: "Current announcement", type: "info" },
    ];

    mountBanner();
    await tick();

    const historyBtn = document.querySelector(".bds-announcement-history-btn");
    expect(historyBtn).not.toBeNull();
    expect(historyBtn.getAttribute("aria-expanded")).toBe("false");
    expect(document.querySelector(".bds-announcement-history")).toBeNull();

    historyBtn.click();
    await tick();

    expect(historyBtn.getAttribute("aria-expanded")).toBe("true");
    const historyPanel = document.querySelector(".bds-announcement-history");
    expect(historyPanel).not.toBeNull();

    const items = historyPanel.querySelectorAll(".bds-announcement-history-item");
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain("Newer link");
    expect(items[0].querySelector("a")?.getAttribute("href")).toBe("https://example.com");
    expect(items[1].textContent).toContain("Oldest warning");

    // Close via header close button
    historyPanel.querySelector(".bds-announcement-close").click();
    await tick();
    expect(document.querySelector(".bds-announcement-history")).toBeNull();
  });

  it("keeps history panel open and includes dismissed announcement when active banner is dismissed", async () => {
    appState.remoteAnnouncements = [
      { id: "old-1", show: false, message: "Older announcement", type: "info" },
      { id: "active-1", show: true, message: "Current announcement", type: "info" },
    ];

    mountBanner();
    await tick();

    document.querySelector(".bds-announcement-history-btn").click();
    await tick();

    const dismissBtn = document.querySelector(".bds-announcement .bds-announcement-close");
    dismissBtn.click();
    await tick();

    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      bds_dismissed_announcements: ["active-1"],
    });
    expect(document.querySelectorAll(".bds-announcement")).toHaveLength(0);

    const items = document.querySelectorAll(".bds-announcement-history-item");
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain("Current announcement");
    expect(items[1].textContent).toContain("Older announcement");
  });

  it("opens past announcements panel when bds:open-announcement-history is dispatched even with no active banner", async () => {
    appState.remoteAnnouncements = [
      { id: "old-1", show: false, message: "Archived notice", type: "info" },
    ];

    mountBanner();
    await tick();

    expect(document.querySelector(".bds-announcement-history")).toBeNull();

    window.dispatchEvent(new CustomEvent("bds:open-announcement-history"));
    await tick();

    const historyPanel = document.querySelector(".bds-announcement-history");
    expect(historyPanel).not.toBeNull();
    expect(historyPanel.textContent).toContain("Archived notice");
  });
});
