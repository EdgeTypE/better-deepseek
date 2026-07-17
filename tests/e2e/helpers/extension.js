import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test as base, chromium, expect } from "@playwright/test";
import {
  pricingHtml,
  pricingJson,
  githubZip,
  githubCommits,
} from "../fixtures/payloads.js";

const projectRoot = process.cwd();
const extensionPath = path.resolve(projectRoot, "dist-chrome");
const manifestPath = path.join(extensionPath, "manifest.json");
const fixtureHtml = fs.readFileSync(
  path.resolve(projectRoot, "tests/e2e/fixtures/mock-deepseek.html"),
  "utf8",
);

async function routeFixtureRequests(context) {
  await context.route("https://chat.deepseek.com/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: fixtureHtml,
    });
  });

  await context.route("https://api-docs.deepseek.com/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: pricingHtml,
    });
  });

  await context.route(
    "https://raw.githubusercontent.com/EdgeTypE/better-deepseek/main/extension/pricing.json",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: pricingJson,
      });
    },
  );

  await context.route(
    "https://codeload.github.com/octocat/Hello-World/zip/refs/heads/*",
    async (route) => {
      await route.fulfill({
        status: 200,
        headers: {
          "content-type": "application/zip",
          "content-length": String(githubZip.length),
        },
        body: githubZip,
      });
    },
  );

  await context.route(
    "https://api.github.com/repos/octocat/Hello-World/commits**",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify(githubCommits),
      });
    },
  );
}

async function createExtensionContext() {
  if (!fs.existsSync(manifestPath)) {
    throw new Error("Missing dist-chrome build. Run `npm run build:chrome` before Playwright.");
  }

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "bds-playwright-"));
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: "chromium",
    headless: !!process.env.CI,
    viewport: { width: 1440, height: 1100 },
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });

  await routeFixtureRequests(context);

  return { context, userDataDir };
}

export const test = base.extend({
  context: async ({}, use) => {
    const { context, userDataDir } = await createExtensionContext();
    try {
      await use(context);
    } finally {
      try {
        await context.close();
      } catch {
        // On Windows, a race in libuv's async-handle cleanup can cause the
        // browser process to exit before context.close() resolves, surfacing
        // "Target page, context or browser has been closed". This is a
        // Playwright/Chromium Windows-only issue unrelated to test correctness.
      }
      // Retry removal on Windows where file locks may persist briefly
      const maxRetries = 5;
      const retryDelay = 500;
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          fs.rmSync(userDataDir, { recursive: true, force: true });
          break;
        } catch (e) {
          if (attempt === maxRetries - 1) throw e;
          await new Promise((r) => setTimeout(r, retryDelay));
        }
      }
    }
  },

  page: async ({ context }, use) => {
    const existingPage = context.pages()[0];
    const page = existingPage || (await context.newPage());

    await page.goto("https://chat.deepseek.com/");
    await page.waitForSelector("#bds-toggle");
    await page.waitForSelector(".bds-plus-btn");

    await use(page);
  },
});

export { expect };
