import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test as base, chromium, expect } from "@playwright/test";
import { resolveFixtureRequest, createRequestLedger } from "../fixtures/fixture-resolver.js";

const projectRoot = process.cwd();
const extensionPath = path.resolve(projectRoot, "dist-chrome");
const manifestPath = path.join(extensionPath, "manifest.json");

const fixtureLedger = createRequestLedger();

async function routeFixtureRequests(context) {
  // Catch-all: intercept every external request and resolve through shared resolver
  await context.route("**/*", async (route) => {
    const url = route.request().url();
    // Skip browser-internal URLs
    if (
      url.startsWith("data:") ||
      url.startsWith("about:") ||
      url.startsWith("chrome-extension:") ||
      url.startsWith("chrome:") ||
      url.startsWith("blob:") ||
      url.includes("://localhost")
    ) {
      return route.continue();
    }

    try {
      const resolved = resolveFixtureRequest(url);
      if (!resolved) {
        // Internal URL — continue without interception
        return route.continue();
      }
      fixtureLedger.record(url, resolved.routeName, resolved.statusCode);
      await route.fulfill({
        status: resolved.statusCode,
        contentType: resolved.mediaType,
        body: resolved.binary ? undefined : resolved.body,
        ...(resolved.binary ? { body: resolved.body } : {}),
      });
    } catch (err) {
      fixtureLedger.record(url, "unmatched", 500, err.message);
      console.error(err.message);
      await route.fulfill({
        status: 500,
        contentType: "text/plain",
        body: err.message,
      });
    }
  });
}

async function createExtensionContext() {
  if (!fs.existsSync(manifestPath)) {
    throw new Error("Missing dist-chrome build. Run `npm run build:chrome` before Playwright.");
  }

  fixtureLedger.reset();

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "bds-playwright-"));
  let context;
  try {
    context = await chromium.launchPersistentContext(userDataDir, {
      channel: "chromium",
      headless: !!process.env.CI,
      viewport: { width: 1440, height: 1100 },
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });
  } catch (e) {
    // Cleanup on launch failure
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {}
    throw e;
  }

  try {
    await routeFixtureRequests(context);
  } catch (e) {
    try { await context.close(); } catch {}
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {}
    throw e;
  }

  return { context, userDataDir };
}

export const test = base.extend({
  context: async ({}, use) => {
    const { context, userDataDir } = await createExtensionContext();
    try {
      await use(context);
    } finally {
      const teardownErrors = [];
      try {
        await context.close();
      } catch (e) {
        // Suppress only known already-closed errors on Windows
        const msg = e?.message || "";
        if (
          msg.includes("Target page, context or browser has been closed") ||
          msg.includes("Browser has been closed") ||
          msg.includes("Connection closed")
        ) {
          // Expected teardown race on Windows — safe to ignore
        } else teardownErrors.push(e);
      }
      // Retry removal on Windows where file locks may persist briefly
      const maxRetries = 5;
      const retryDelay = 500;
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          fs.rmSync(userDataDir, { recursive: true, force: true });
          break;
        } catch {
          if (attempt === maxRetries - 1) {
            teardownErrors.push(new Error(`Failed to remove temp dir: ${userDataDir}`));
          }
          await new Promise((r) => setTimeout(r, retryDelay));
        }
      }

      const unmatched = fixtureLedger.entries().filter((entry) => entry.statusCode >= 500);
      if (unmatched.length > 0) {
        teardownErrors.push(new Error(
          `[Fixture] ${unmatched.length} unmatched external request(s):\n` +
          unmatched.map((entry) => `${entry.url}: ${entry.error || entry.statusCode}`).join("\n"),
        ));
      }
      if (teardownErrors.length > 0) {
        throw new AggregateError(teardownErrors, "Extension fixture teardown failed");
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

export { expect, fixtureLedger };
