/**
 * E2E tests for BDS widget layout on large (desktop >= 768px) viewports.
 * Companion to the mobile-specific checks in tests/e2e-android/android.spec.js.
 * All tests run against the 1440x1100 Chrome viewport defined in the extension helper.
 */
import { test, expect } from "./helpers/extension.js";

test("toggle is visible in the top-right area on desktop", async ({ page }) => {
  const box = await page.locator("#bds-toggle").boundingBox();
  const vp = page.viewportSize();
  expect(box).not.toBeNull();
  expect(box.x).toBeGreaterThan(vp.width / 2);
  expect(box.y).toBeLessThan(200);
});

test("toggle shows full BDS label and hides short label on desktop", async ({ page }) => {
  const { fullDisplay, shortDisplay } = await page.evaluate(() => ({
    fullDisplay: getComputedStyle(document.querySelector("#bds-toggle .bds-toggle-full")).display,
    shortDisplay: getComputedStyle(document.querySelector("#bds-toggle .bds-toggle-short")).display,
  }));
  expect(fullDisplay).not.toBe("none");
  expect(shortDisplay).toBe("none");
});

test("toggle is fully opaque on desktop", async ({ page }) => {
  const opacity = await page.evaluate(() =>
    parseFloat(getComputedStyle(document.querySelector("#bds-toggle")).opacity),
  );
  expect(opacity).toBe(1);
});

test("bds-root is not full-width on desktop", async ({ page }) => {
  const rootWidth = await page.evaluate(() => document.querySelector("#bds-root").offsetWidth);
  const vp = page.viewportSize();
  expect(rootWidth).toBeLessThan(vp.width / 2);
});

test("bds-root uses fixed top-right positioning on desktop", async ({ page }) => {
  const { position, top, right } = await page.evaluate(() => {
    const cs = getComputedStyle(document.querySelector("#bds-root"));
    return { position: cs.position, top: cs.top, right: cs.right };
  });
  expect(position).toBe("fixed");
  expect(parseInt(top)).toBeLessThanOrEqual(32);
  expect(parseInt(right)).toBeLessThanOrEqual(32);
});

test("drawer is right-anchored when opened on desktop", async ({ page }) => {
  await page.locator("#bds-toggle").click();
  await expect(page.locator("#bds-drawer")).toHaveClass(/bds-open/);

  const drawerBox = await page.locator("#bds-drawer").boundingBox();
  const vp = page.viewportSize();
  expect(drawerBox).not.toBeNull();
  expect(drawerBox.x).toBeGreaterThan(vp.width / 2);
});

test("toggle carries correct aria-label on desktop", async ({ page }) => {
  await expect(page.locator("#bds-toggle")).toHaveAttribute("aria-label", "Better DeepSeek");
});
