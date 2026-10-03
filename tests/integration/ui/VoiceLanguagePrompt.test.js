// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import VoiceLanguagePrompt from "../../../src/content/ui/VoiceLanguagePrompt.svelte";
import { renderSvelte, flushUi } from "../../helpers/svelte.js";

describe("VoiceLanguagePrompt", () => {
  it("renders nothing while hidden", () => {
    const { target, cleanup } = renderSvelte(VoiceLanguagePrompt, { show: false });
    expect(target.querySelector(".bds-vlp-overlay")).toBeNull();
    cleanup();
  });

  it("lists languages with the saved one selected and confirms it", async () => {
    const onconfirm = vi.fn();
    const { target, cleanup } = renderSvelte(VoiceLanguagePrompt, {
      show: true,
      current: "tr-TR",
      onconfirm,
      oncancel: vi.fn(),
    });

    await flushUi();
    const select = target.querySelector("select.bds-select");
    expect(select).toBeTruthy();
    expect(select.value).toBe("tr-TR");
    expect([...select.options].some((o) => o.value === "tr-TR")).toBe(true);

    target.querySelector(".bds-vlp-actions .bds-btn").click();
    await flushUi();
    expect(onconfirm).toHaveBeenCalledWith("tr-TR");
    cleanup();
  });

  it("keeps an unlisted saved language selectable", () => {
    const { target, cleanup } = renderSvelte(VoiceLanguagePrompt, {
      show: true,
      current: "xx-XX",
      onconfirm: vi.fn(),
      oncancel: vi.fn(),
    });
    const select = target.querySelector("select.bds-select");
    expect([...select.options].some((o) => o.value === "xx-XX")).toBe(true);
    cleanup();
  });

  it("cancels when the backdrop is clicked", async () => {
    const oncancel = vi.fn();
    const { target, cleanup } = renderSvelte(VoiceLanguagePrompt, {
      show: true,
      current: "en-US",
      onconfirm: vi.fn(),
      oncancel,
    });
    target.querySelector(".bds-vlp-overlay").click();
    await flushUi();
    expect(oncancel).toHaveBeenCalled();
    cleanup();
  });
});
