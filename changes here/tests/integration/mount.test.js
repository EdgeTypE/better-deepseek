import { describe, expect, it } from "vitest";
import { computePreviewRight } from "../../src/content/ui/mount.js";

const MOBILE = 768;
const DEFAULT_RIGHT = 16;
const GAP = 8;

describe("computePreviewRight", () => {
  it("returns null below mobile breakpoint (portrait phone)", () => {
    expect(computePreviewRight(375, MOBILE, null, DEFAULT_RIGHT, GAP)).toBeNull();
  });

  it("returns null at the top of the mobile range (767px)", () => {
    expect(computePreviewRight(767, MOBILE, null, DEFAULT_RIGHT, GAP)).toBeNull();
  });

  it("returns null even when panel is present on mobile", () => {
    const panelRect = { left: 200 };
    expect(computePreviewRight(375, MOBILE, panelRect, DEFAULT_RIGHT, GAP)).toBeNull();
  });

  it("returns defaultRight at exactly the breakpoint (768px = desktop threshold)", () => {
    expect(computePreviewRight(768, MOBILE, null, DEFAULT_RIGHT, GAP)).toBe(DEFAULT_RIGHT);
  });

  it("returns defaultRight on desktop with no preview panel", () => {
    expect(computePreviewRight(1440, MOBILE, null, DEFAULT_RIGHT, GAP)).toBe(DEFAULT_RIGHT);
  });

  it("returns offset based on panel position when panel is open on desktop", () => {
    // innerWidth=1200, panel.left=900 → 1200 - 900 + 8 = 308
    const panelRect = { left: 900 };
    expect(computePreviewRight(1200, MOBILE, panelRect, DEFAULT_RIGHT, GAP)).toBe(308);
  });

  it("clamps to defaultRight when panel is flush with the right edge", () => {
    // innerWidth=1200, panel.left=1185 → 1200 - 1185 + 8 = 23 > 16 → 23
    const panelRect = { left: 1185 };
    expect(computePreviewRight(1200, MOBILE, panelRect, DEFAULT_RIGHT, GAP)).toBe(23);
  });

  it("clamps to defaultRight when panel is beyond the right edge", () => {
    // innerWidth=1200, panel.left=1200 → 1200 - 1200 + 8 = 8, clamped to 16
    const panelRect = { left: 1200 };
    expect(computePreviewRight(1200, MOBILE, panelRect, DEFAULT_RIGHT, GAP)).toBe(DEFAULT_RIGHT);
  });

  it("returns defaultRight on wide desktop with no panel (1440px)", () => {
    expect(computePreviewRight(1440, MOBILE, null, DEFAULT_RIGHT, GAP)).toBe(DEFAULT_RIGHT);
  });

  it("returns null on 414px (large phone) with panel present", () => {
    expect(computePreviewRight(414, MOBILE, { left: 200 }, DEFAULT_RIGHT, GAP)).toBeNull();
  });
});
