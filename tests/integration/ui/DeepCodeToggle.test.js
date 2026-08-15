// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import DeepCodeToggle from "../../../src/content/ui/DeepCodeToggle.svelte";
import { renderSvelte, flushUi } from "../../helpers/svelte.js";

vi.mock("../../../src/content/deep-code.js", () => ({
  setDeepCodeEnabled: vi.fn(),
  toggleDeepCodeEnabled: vi.fn(),
  selectRecentDirectory: vi.fn().mockResolvedValue({ needsPicker: false }),
  removeRecentDirectory: vi.fn().mockResolvedValue(true),
  isDeepCodeOnboarded: vi.fn().mockResolvedValue(true),
  markDeepCodeOnboarded: vi.fn().mockResolvedValue(true),
}));

describe("DeepCodeToggle", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("renders inactive state with DeepSeek toggle structure", async () => {
    const { target, cleanup } = renderSvelte(DeepCodeToggle, {
      enabled: false,
    });
    await flushUi();

    const btn = target.querySelector('[data-testid="deep-code-toggle"]');
    expect(btn).toBeTruthy();
    expect(btn.classList.contains("ds-toggle-button")).toBe(true);
    expect(btn.classList.contains("ds-toggle-button--m")).toBe(true);
    expect(btn.classList.contains("ds-toggle-button--selected")).toBe(false);
    expect(btn.getAttribute("aria-pressed")).toBe("false");
    expect(btn.querySelector(".ds-toggle-button__icon .ds-icon svg")).toBeTruthy();
    expect(btn.querySelector(".bds-toggle-label")?.textContent).toBe("DeepCode");
    expect(btn.querySelector(".bds-toggle-chevron svg")).toBeTruthy();
    expect(btn.querySelector(".ds-focus-ring")).toBeTruthy();

    cleanup();
  });

  it("renders active state when enabled", async () => {
    const { target, cleanup } = renderSvelte(DeepCodeToggle, {
      enabled: true,
    });
    await flushUi();

    const btn = target.querySelector('[data-testid="deep-code-toggle"]');
    expect(btn).toBeTruthy();
    expect(btn.classList.contains("ds-toggle-button--selected")).toBe(true);
    expect(btn.getAttribute("aria-pressed")).toBe("true");

    cleanup();
  });

  it("opens popover menu when clicked and closes on close button", async () => {
    const { target, cleanup } = renderSvelte(DeepCodeToggle, {
      enabled: false,
    });
    await flushUi();

    const btn = target.querySelector('[data-testid="deep-code-toggle"]');
    expect(target.querySelector(".bds-dc-panel")).toBeNull();

    btn.click();
    await flushUi();

    const panel = target.querySelector(".bds-dc-panel");
    expect(panel).toBeTruthy();
    expect(panel.querySelector(".bds-dc-title")?.textContent).toBe("DeepCode");
    expect(panel.querySelector(".bds-toggle-row")).toBeTruthy();
    expect(panel.querySelector(".bds-add-btn")).toBeTruthy();
    expect(panel.querySelector(".bds-dc-footer")).toBeTruthy();

    const chevron = btn.querySelector(".bds-toggle-chevron");
    expect(chevron.classList.contains("bds-toggle-chevron--open")).toBe(true);

    const closeBtn = panel.querySelector(".bds-close-btn");
    closeBtn.click();
    await flushUi();

    expect(target.querySelector(".bds-dc-panel")).toBeNull();
    expect(chevron.classList.contains("bds-toggle-chevron--open")).toBe(false);

    cleanup();
  });
});
