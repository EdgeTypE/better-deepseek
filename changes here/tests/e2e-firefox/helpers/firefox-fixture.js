/**
 * Firefox E2E fixture — Selenium WebDriver + BiDi network.provideResponse.
 *
 * Launches Firefox with BiDi, installs the unsigned dist-firefox extension,
 * and serves deterministic mock responses through the shared fixture resolver.
 */

import fs from "node:fs";
import path from "node:path";
import { Builder } from "selenium-webdriver";
import firefox from "selenium-webdriver/firefox.js";
import { resolveFixtureRequest, createRequestLedger } from "../../e2e/fixtures/fixture-resolver.js";

const projectRoot = process.cwd();
const extensionPath = path.resolve(projectRoot, "dist-firefox");
const manifestPath = path.join(extensionPath, "manifest.json");

// ── Firefox binary resolution ──

/**
 * Resolve the Firefox binary path from FIREFOX_BIN or Selenium Manager.
 * @returns {string|undefined} absolute path or undefined
 * @throws {Error} when FIREFOX_BIN is relative or nonexistent
 */
function resolveFirefoxBin() {
  const raw = process.env.FIREFOX_BIN || undefined;
  if (!raw) return undefined;

  if (!path.isAbsolute(raw)) {
    throw new Error(
      `FIREFOX_BIN must be an absolute path, got "${raw}". ` +
      `Use the firefox-path output from browser-actions/setup-firefox in CI, ` +
      `or set FIREFOX_BIN to an absolute path (e.g. "C:\\Program Files\\Firefox\\firefox.exe").`
    );
  }
  if (!fs.existsSync(raw)) {
    throw new Error(`FIREFOX_BIN path does not exist: ${raw}`);
  }
  return raw;
}

function toBase64(body) {
  return typeof body === "string"
    ? Buffer.from(body).toString("base64")
    : Buffer.from(body).toString("base64");
}

// Per-fixture ledger
let fixtureLedger = null;

export async function createFirefoxFixture() {
  if (!fs.existsSync(manifestPath)) {
    throw new Error("Missing dist-firefox build. Run `npm run build` first.");
  }

  fixtureLedger = createRequestLedger();

  const firefoxBin = resolveFirefoxBin();
  const firefoxOpts = new firefox.Options();
  if (firefoxBin) firefoxOpts.setBinary(firefoxBin);
  firefoxOpts.enableBidi();
  if (process.env.CI) firefoxOpts.addArguments("--headless");
  firefoxOpts.setAcceptInsecureCerts(true);

  // Build driver — wrap failures
  let driver;
  try {
    driver = await new Builder()
      .forBrowser("firefox")
      .setFirefoxOptions(firefoxOpts)
      .build();
  } catch (e) {
    throw new Error(`Failed to create Firefox driver: ${e.message}`);
  }

  let bidi = null;
  let extensionId = null;
  let fixtureError = null;
  let closed = false;

  async function safeClose() {
    if (closed) return;
    closed = true;
    try {
      await driver.quit();
    } catch (e) {
      const msg = e?.message || "";
      if (
        msg.includes("closed") ||
        msg.includes("No such session") ||
        msg.includes("Invalid session ID") ||
        msg.includes("Connection refused")
      ) {
        // Already closed — safe to ignore
      } else {
        throw e;
      }
    }
  }

  try {
    // Register BiDi intercepts
    bidi = await driver.getBidi();
  } catch (e) {
    await safeClose();
    throw new Error(`Failed to get BiDi: ${e.message}`);
  }

  try {
    await bidi.send({
      method: "network.addIntercept",
      params: {
        phases: ["beforeRequestSent"],
        urlPatterns: [
          { type: "pattern", protocol: "http" },
          { type: "pattern", protocol: "https" },
        ],
      },
    });

    await bidi.subscribe("network.beforeRequestSent");

    bidi.on("network.beforeRequestSent", async (event) => {
      const url = event?.request?.url || "";
      // Skip browser-internal URLs
      if (
        url.startsWith("data:") ||
        url.startsWith("about:") ||
        url.startsWith("moz-extension:") ||
        url.startsWith("chrome:")
      ) {
        return;
      }

      try {
        const resolved = resolveFixtureRequest(url);
        if (!resolved) {
          await bidi.send({
            method: "network.continueRequest",
            params: { request: event.request.request },
          });
          return;
        }

        fixtureLedger.record(url, resolved.routeName, resolved.statusCode);

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
      } catch (err) {
        fixtureLedger.record(url, "unmatched", 500, err.message);
        fixtureError = new Error(
          `[Firefox E2E] Unmatched intercepted URL: ${url}\n${err.message}`
        );
        console.error(fixtureError.message);
        // Provide terminal response
        try {
          await bidi.send({
            method: "network.provideResponse",
            params: {
              request: event.request.request,
              statusCode: 500,
              reasonPhrase: "Fixture Error",
              headers: [{ name: "Content-Type", value: { type: "string", value: "text/plain" } }],
              body: { type: "base64", value: toBase64(fixtureError.message) },
            },
          });
        } catch {}
      }
    });
  } catch (e) {
    await safeClose();
    throw new Error(`Failed to register BiDi intercepts: ${e.message}`);
  }

  // Install extension
  try {
    extensionId = await driver.installAddon(extensionPath, true);
  } catch (e) {
    await safeClose();
    throw new Error(`Failed to install Firefox add-on: ${e.message}`);
  }

  // Navigate to fixture
  try {
    await driver.get("https://chat.deepseek.com/");
  } catch (e) {
    await safeClose();
    throw new Error(`Failed to navigate to fixture: ${e.message}`);
  }

  // Verify fixture loaded + extension bootstrapped
  try {
    const pageTitle = await driver.getTitle();
    if (!pageTitle.includes("Mock DeepSeek")) {
      throw new Error(
        `Fixture did not load. Page title: "${pageTitle}". ` +
        `Check that Firefox + Selenium WebDriver BiDi interception works.`
      );
    }

    const hasApi = await driver.executeScript("return !!window.__mockDeepSeek;");
    if (!hasApi) {
      throw new Error("window.__mockDeepSeek not available after fixture load");
    }

    // Wait for extension bootstrap — #bds-toggle must be present
    await driver.wait(
      async () => {
        try {
          await driver.findElement({ css: "#bds-toggle" });
          return true;
        } catch { return false; }
      },
      15000,
      "Extension did not bootstrap: #bds-toggle not found within 15s",
    );

    // Wait for composer injection — .bds-plus-btn is extension-injected
    await driver.wait(
      async () => {
        try {
          await driver.findElement({ css: ".bds-plus-btn" });
          return true;
        } catch { return false; }
      },
      10000,
      "Extension composer not injected: .bds-plus-btn not found within 10s",
    );
  } catch (e) {
    await safeClose();
    throw e;
  }

  return {
    driver,
    bidi,
    extensionId,
    getFixtureError() {
      return fixtureError;
    },
    getRequestLedger() {
      return fixtureLedger ? fixtureLedger.entries() : [];
    },
    async close() {
      await safeClose();
    },
    async takeScreenshot(filename) {
      const raw = await driver.takeScreenshot();
      const dir = path.dirname(filename);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(filename, raw, "base64");
    },
    async getPageHtml() {
      return driver.getPageSource();
    },
    async getPageUrl() {
      return driver.getCurrentUrl();
    },
    async getPageTitle() {
      return driver.getTitle();
    },
    async isDriverHealthy() {
      try {
        await driver.getTitle();
        return true;
      } catch {
        return false;
      }
    },
  };
}
