/**
 * Android WebView simulator E2E suite.
 *
 * These tests load the same mock-deepseek fixture used by the Chrome suite,
 * but run the dist-android bundle on top of a JS mock of window.AndroidBridge.
 * They guard the parity contract between Chrome and Android so a future shim
 * regression is caught without needing a device farm.
 *
 * NOTE: The mock-deepseek fixture uses a desktop grid layout (280px sidebar +
 * main), which at the 412px Pixel 5 viewport may cause Playwright to report
 * that underlying elements intercept pointer events on BDS fixed-position
 * controls. Clicks that trigger the actionability check are run with
 * { force: true } when they legitimately target BDS-injected elements.
 */
import { test, expect } from "./helpers/android.js";

async function addAssistantMessage(page, text) {
  await page.evaluate((rawText) => {
    window.__mockDeepSeek.addAssistantMessage(rawText);
  }, text);
}

async function openDrawer(page) {
  const drawer = page.locator("#bds-drawer");
  if (await drawer.evaluate((node) => node.classList.contains("bds-open"))) return;
  // force true: desktop fixture may overlap the fixed toggle at mobile viewport
  await page.locator("#bds-toggle").click({ force: true });
  await expect(drawer).toHaveClass(/bds-open/);
}

test("loads the bundle and surfaces the BDS toggle inside the WebView simulator", async ({ page }) => {
  await expect(page.locator("#bds-toggle")).toBeVisible();
});

test("hides the folder upload menu item on Android", async ({ page }) => {
  await page.locator(".bds-plus-btn").click({ force: true });
  await expect(page.locator(".bds-attach-dropdown")).toBeVisible();
  await expect(
    page.locator(".bds-attach-dropdown .bds-attach-item").filter({ hasText: "Upload Folder" }),
  ).toHaveCount(0);
  await expect(
    page.locator(".bds-attach-dropdown .bds-attach-item").filter({ hasText: "GitHub Repo" }),
  ).toBeVisible();
});

test("hides the voice prompt mic button on Android", async ({ page }) => {
  await expect(page.locator(".bds-mic-btn")).toHaveCount(0);
});

test("renders standalone create_file download cards", async ({ page }) => {
  await addAssistantMessage(
    page,
    '<BDS:create_file fileName="notes.txt">android body</BDS:create_file>',
  );
  await expect(page.locator(".bds-download-card")).toContainText("notes.txt");
});

test("routes blob downloads through AndroidBridge.downloadBlob", async ({ page }) => {
  await addAssistantMessage(
    page,
    '<BDS:create_file fileName="hello.txt">routed-via-bridge</BDS:create_file>',
  );
  await expect(page.locator(".bds-download-card")).toContainText("hello.txt");

  await page.locator(".bds-download-card .bds-btn").click({ force: true });

  await expect
    .poll(async () =>
      page.evaluate(() => (window.__bdsCapturedDownloads || []).length),
    )
    .toBeGreaterThan(0);

  const captured = await page.evaluate(() => window.__bdsCapturedDownloads[0]);
  expect(captured.fileName).toBe("hello.txt");
  expect(captured.base64.length).toBeGreaterThan(0);
});

test("persists settings via the AndroidBridge storage mock", async ({ page }) => {
  await openDrawer(page);
  await page.locator("#bds-system-prompt").fill("Android sim prompt");
  await page.locator("#bds-save-settings").click({ force: true });

  const stored = await page.evaluate(() => {
    const store = window.__bdsAndroidStore;
    for (const [k, v] of store.entries()) {
      if (typeof v === "string" && v.includes("Android sim prompt")) return k;
    }
    return null;
  });
  expect(stored).not.toBeNull();
});
