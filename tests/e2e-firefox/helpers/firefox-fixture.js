/**
 * Firefox E2E fixture — Selenium WebDriver + BiDi network.provideResponse.
 *
 * Launches Firefox with BiDi, installs the unsigned dist-firefox extension,
 * and serves deterministic mock responses. Every intercepted URL must resolve;
 * unexpected URLs fail immediately.
 *
 * Requirements:
 *   - Firefox Stable (set FIREFOX_BIN to override).
 *   - dist-firefox built (`npm run build`).
 *   - Selenium Manager auto-provisions GeckoDriver.
 */

import fs from "node:fs";
import path from "node:path";
import { Builder } from "selenium-webdriver";
import firefox from "selenium-webdriver/firefox.js";

const projectRoot = process.cwd();
const extensionPath = path.resolve(projectRoot, "dist-firefox");
const manifestPath = path.join(extensionPath, "manifest.json");
const fixtureHtml = fs.readFileSync(
  path.resolve(projectRoot, "tests/e2e/fixtures/mock-deepseek.html"),
  "utf8",
);

import {
  pricingHtml,
  pricingJson,
  githubZip,
  githubCommits,
  remoteConfigFixture,
  remoteStatusFixture,
  makeLocaleFixture,
} from "../../e2e/fixtures/payloads.js";

function toBase64(body) {
  return typeof body === "string"
    ? Buffer.from(body).toString("base64")
    : Buffer.from(body).toString("base64");
}

// ── Single shared response resolver ──
function resolveResponse(url) {
  if (url.startsWith("https://chat.deepseek.com")) {
    return { statusCode: 200, body: fixtureHtml, mediaType: "text/html; charset=utf-8" };
  }
  if (url.startsWith("https://api-docs.deepseek.com")) {
    return { statusCode: 200, body: pricingHtml, mediaType: "text/html; charset=utf-8" };
  }
  if (url === "https://raw.githubusercontent.com/EdgeTypE/better-deepseek/main/extension/pricing.json") {
    return { statusCode: 200, body: pricingJson, mediaType: "application/json; charset=utf-8" };
  }
  if (url.startsWith("https://codeload.github.com/octocat/Hello-World/zip/refs/heads/")) {
    return { statusCode: 200, body: githubZip, mediaType: "application/zip" };
  }
  if (url.startsWith("https://api.github.com/repos/octocat/Hello-World/commits")) {
    return { statusCode: 200, body: JSON.stringify(githubCommits), mediaType: "application/json; charset=utf-8" };
  }
  if (url.startsWith("https://status.deepseek.com")) {
    return { statusCode: 200, body: '{"status":"ok"}', mediaType: "application/json; charset=utf-8" };
  }
  // ── Background updater routes (#108 fix) ──
  if (url.startsWith("https://raw.githubusercontent.com/EdgeTypE/better-deepseek/main/extension/remote-config.json")) {
    return { statusCode: 200, body: JSON.stringify(remoteConfigFixture), mediaType: "application/json; charset=utf-8" };
  }
  if (url.startsWith("https://raw.githubusercontent.com/EdgeTypE/better-deepseek/main/extension/status.json")) {
    return { statusCode: 200, body: JSON.stringify(remoteStatusFixture), mediaType: "application/json; charset=utf-8" };
  }
  const localeMatch = url.match(/\/src\/locales\/(en|tr|ru|zh-cn)\.json/);
  if (localeMatch) {
    const code = localeMatch[1];
    return { statusCode: 200, body: JSON.stringify(makeLocaleFixture(code)), mediaType: "application/json; charset=utf-8" };
  }
  // AWS WAF / captcha subdomains — must be intercepted to prevent challenge loops
  if (url.includes("awswaf.com") || url.includes("captcha")) {
    return { statusCode: 200, body: "", mediaType: "text/plain" };
  }
  // data: URLs and about: URLs are browser-internal, never intercepted
  if (url.startsWith("data:") || url.startsWith("about:")) return null;
  return null;
}

export async function createFirefoxFixture() {
  if (!fs.existsSync(manifestPath)) {
    throw new Error("Missing dist-firefox build. Run `npm run build` first.");
  }

  const firefoxBin = process.env.FIREFOX_BIN || undefined;
  if (firefoxBin) {
    // Validate: must be an absolute path to an existing executable.
    // Values like "firefox" (relative / command name) cause Selenium to fail.
    if (!path.isAbsolute(firefoxBin)) {
      throw new Error(
        `FIREFOX_BIN must be an absolute path, got "${firefoxBin}". ` +
        `Use the firefox-path output from browser-actions/setup-firefox in CI, ` +
        `or set FIREFOX_BIN to an absolute path (e.g. "C:\\Program Files\\Firefox\\firefox.exe").`
      );
    }
    if (!fs.existsSync(firefoxBin)) {
      throw new Error(`FIREFOX_BIN path does not exist: ${firefoxBin}`);
    }
  }
  const firefoxOpts = new firefox.Options();
  if (firefoxBin) firefoxOpts.setBinary(firefoxBin);
  firefoxOpts.enableBidi();
  if (process.env.CI) firefoxOpts.addArguments("--headless");
  firefoxOpts.setAcceptInsecureCerts(true);

  const driver = await new Builder()
    .forBrowser("firefox")
    .setFirefoxOptions(firefoxOpts)
    .build();

  let bidi = null;
  let extensionId = null;
  let fixtureError = null;

  // Register BiDi intercepts BEFORE extension install
  bidi = await driver.getBidi();

  await bidi.send({
    method: "network.addIntercept",
    params: {
      phases: ["beforeRequestSent"],
      urlPatterns: [
        { type: "pattern", hostname: "chat.deepseek.com" },
        { type: "pattern", hostname: "api-docs.deepseek.com" },
        { type: "pattern", hostname: "status.deepseek.com" },
        { type: "pattern", hostname: "raw.githubusercontent.com" },
        { type: "pattern", hostname: "codeload.github.com" },
        { type: "pattern", hostname: "api.github.com" },
      ],
    },
  });

  await bidi.subscribe("network.beforeRequestSent");

  bidi.on("network.beforeRequestSent", async (event) => {
    const url = event?.request?.url || "";
    // Skip browser-internal URLs
    if (url.startsWith("data:") || url.startsWith("about:")) return;

    const resolved = resolveResponse(url);
    if (!resolved) {
      // Unexpected URL — fail immediately
      const msg = `[Firefox E2E] Unmatched intercepted URL: ${url}`;
      fixtureError = new Error(msg);
      console.error(msg);
      // Still provide a terminal response so request doesn't hang
      try {
        await bidi.send({
          method: "network.provideResponse",
          params: {
            request: event.request.request,
            statusCode: 500,
            reasonPhrase: "Fixture Error",
            headers: [{ name: "Content-Type", value: { type: "string", value: "text/plain" } }],
            body: { type: "base64", value: toBase64(msg) },
          },
        });
      } catch { /* connection may be closing */ }
      return;
    }

    try {
      await bidi.send({
        method: "network.provideResponse",
        params: {
          request: event.request.request,
          statusCode: resolved.statusCode,
          reasonPhrase: "OK",
          headers: [
            { name: "Content-Type", value: { type: "string", value: resolved.mediaType } },
          ],
          body: { type: "base64", value: toBase64(resolved.body) },
        },
      });
    } catch (e) {
      fixtureError = new Error(`[Firefox E2E] provideResponse failed: ${e.message}`);
      console.error(fixtureError.message);
    }
  });

  // Install extension after intercepts are active
  extensionId = await driver.installAddon(extensionPath, true);

  // Navigate to fixture
  await driver.get("https://chat.deepseek.com/");

  // Wait for fixture DOM and extension bootstrap
  // The fixture HTML's inline <script> sets up __mockDeepSeek on DOMContentLoaded.
  // BiDi-served pages execute inline scripts in Firefox.
  await driver.sleep(4000);

  // Verify fixture loaded
  const pageTitle = await driver.getTitle();
  if (!pageTitle.includes("Mock DeepSeek")) {
    throw new Error(
      `Fixture did not load. Page title: "${pageTitle}". ` +
      `Check that Firefox + Selenium WebDriver BiDi interception works.`,
    );
  }

  // Verify mock API is available
  const hasApi = await driver.executeScript("return !!window.__mockDeepSeek;");
  if (!hasApi) {
    throw new Error("window.__mockDeepSeek not available after fixture load");
  }

  return {
    driver,
    bidi,
    extensionId,
    getFixtureError() {
      return fixtureError;
    },
    async close() {
      try { await driver.quit(); } catch { /* ignore */ }
    },
    async takeScreenshot(filename) {
      const raw = await driver.takeScreenshot();
      fs.writeFileSync(filename, raw, "base64");
    },
    async getPageHtml() {
      return driver.getPageSource();
    },
  };
}
