// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

import { flushUi, renderSvelte } from "../../helpers/svelte.js";
import SnippetDialog from "../../../src/content/ui/SnippetDialog.svelte";

describe("SnippetDialog", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("renders empty form for a new snippet", async () => {
    const onsave = vi.fn();
    const oncancel = vi.fn();
    const { target, cleanup } = renderSvelte(SnippetDialog, { item: null, onsave, oncancel });
    await flushUi();
    expect(target.textContent).toContain("New Snippet");
    const input = target.querySelector(".bds-snippet-input");
    expect(input.value).toBe("");
    const textarea = target.querySelector(".bds-snippet-textarea");
    expect(textarea.value).toBe("");
    cleanup();
  });

  it("pre-fills fields when editing an existing snippet", async () => {
    const item = { title: "My Prompt", content: "You are helpful" };
    const onsave = vi.fn();
    const oncancel = vi.fn();
    const { target, cleanup } = renderSvelte(SnippetDialog, { item, onsave, oncancel });
    await flushUi();
    expect(target.textContent).toContain("Edit Snippet");
    const input = target.querySelector(".bds-snippet-input");
    expect(input.value).toBe("My Prompt");
    const textarea = target.querySelector(".bds-snippet-textarea");
    expect(textarea.value).toBe("You are helpful");
    cleanup();
  });

  it("shows validation error when title is empty", async () => {
    const onsave = vi.fn();
    const oncancel = vi.fn();
    const { target, cleanup } = renderSvelte(SnippetDialog, { item: null, onsave, oncancel });
    await flushUi();
    const saveBtn = Array.from(target.querySelectorAll("button")).find(b => b.textContent.includes("Save"));
    saveBtn.click();
    await flushUi();
    expect(target.textContent).toContain("Title is required");
    expect(onsave).not.toHaveBeenCalled();
    cleanup();
  });

  it("shows validation error when content is empty", async () => {
    const onsave = vi.fn();
    const oncancel = vi.fn();
    const { target, cleanup } = renderSvelte(SnippetDialog, { item: null, onsave, oncancel });
    await flushUi();
    const input = target.querySelector(".bds-snippet-input");
    input.value = "Test Title";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await flushUi();
    const saveBtn = Array.from(target.querySelectorAll("button")).find(b => b.textContent.includes("Save"));
    saveBtn.click();
    await flushUi();
    expect(target.textContent).toContain("Content is required");
    expect(onsave).not.toHaveBeenCalled();
    cleanup();
  });

  it("calls onsave with title and content on valid submit", async () => {
    const onsave = vi.fn();
    const oncancel = vi.fn();
    const { target, cleanup } = renderSvelte(SnippetDialog, { item: null, onsave, oncancel });
    await flushUi();
    const input = target.querySelector(".bds-snippet-input");
    input.value = "Test Title";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    const textarea = target.querySelector(".bds-snippet-textarea");
    textarea.value = "Test content";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    await flushUi();
    const saveBtn = Array.from(target.querySelectorAll("button")).find(b => b.textContent.includes("Save"));
    saveBtn.click();
    await flushUi();
    expect(onsave).toHaveBeenCalledWith({ title: "Test Title", content: "Test content" });
    cleanup();
  });

  it("calls oncancel when cancel button is clicked", async () => {
    const onsave = vi.fn();
    const oncancel = vi.fn();
    const { target, cleanup } = renderSvelte(SnippetDialog, { item: null, onsave, oncancel });
    await flushUi();
    const cancelBtn = Array.from(target.querySelectorAll("button")).find(b => b.textContent.includes("Cancel"));
    cancelBtn.click();
    await flushUi();
    expect(oncancel).toHaveBeenCalledOnce();
    cleanup();
  });
});
