/**
 * Playwright config for the Android WebView simulator.
 *
 * Reuses the same mock-deepseek fixture as the Chrome extension suite, but
 * boots the page in a regular Chromium context (mobile viewport) and pre-
 * injects a JS-only mock of window.AndroidBridge so the built dist-android/
 * bundle can run unchanged. The goal is a 1:1 functional parity check for
 * Android — no native runtime required in CI.
 *
 * Prerequisites: `npm run build:android` must have produced dist-android/
 * before this config runs.
 */
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e-android",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report-android", open: "never" }],
  ],
  use: {
    actionTimeout: 10_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    // Android-class viewport so any breakpoint-dependent UI matches what the
    // app would render inside a phone WebView.
    ...devices["Pixel 5"],
  },
});
