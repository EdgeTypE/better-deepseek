import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test as base, chromium, expect } from "@playwright/test";
import { zipSync, strToU8 } from "fflate";

const projectRoot = process.cwd();
const extensionPath = path.resolve(projectRoot, "dist-chrome");
const manifestPath = path.join(extensionPath, "manifest.json");
const fixtureHtml = fs.readFileSync(
  path.resolve(projectRoot, "tests/e2e/fixtures/mock-deepseek.html"),
  "utf8",
);

const pricingHtml = `<!DOCTYPE html>
<html>
  <body>
    <h1>Pricing</h1>
    <table>
      <tr><td>deepseek-v4-flash</td><td>$0.0028</td><td>$0.14</td><td>$0.28</td></tr>
      <tr><td>deepseek-v4-pro</td><td>$0.0145</td><td>$0.435</td><td>$0.87</td></tr>
    </table>
  </body>
</html>`;

const pricingJson = JSON.stringify({
  updatedAt: "2026-05-06",
  models: {
    "deepseek-v4-flash": {
      displayName: "DeepSeek V4 Flash",
      inputPrice: 0.14,
      inputCacheHitPrice: 0.0028,
      outputPrice: 0.28,
      contextLength: 1_000_000,
    },
    "deepseek-v4-pro": {
      displayName: "DeepSeek V4 Pro",
      inputPrice: 0.435,
      inputCacheHitPrice: 0.0145,
      outputPrice: 0.87,
      contextLength: 1_000_000,
    },
  },
});

const githubZip = Buffer.from(
  zipSync({
    "Hello-World-main/README.md": strToU8("# Hello World\n\nFixture repo.\n"),
    "Hello-World-main/src/index.js": strToU8('console.log("fixture repo");\n'),
    "Hello-World-main/.gitignore": strToU8("dist/\n"),
  }),
);

const githubCommits = Array.from({ length: 3 }, (_, index) => ({
  sha: `abcdef${index}1234567890`,
  commit: {
    author: {
      name: `Fixture Author ${index + 1}`,
      date: `2026-05-0${index + 1}T10:00:00Z`,
    },
    message: `Fixture commit ${index + 1}`,
  },
}));

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
      await context.close();
      fs.rmSync(userDataDir, { recursive: true, force: true });
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
