/**
 * Playwright fixture that boots the mock DeepSeek page with a JS mock of
 * window.AndroidBridge installed before any extension code runs, then
 * injects the built dist-android bundle. Mirrors the Chrome E2E setup so
 * existing assertions can be reused with minimal adaptation.
 */
import fs from "node:fs";
import path from "node:path";
import { test as base, chromium, expect } from "@playwright/test";

const projectRoot = process.cwd();
const distDir = path.resolve(projectRoot, "dist-android");
const contentJsPath = path.join(distDir, "content.js");
const contentCssPath = path.join(distDir, "content.css");

const fixtureHtml = fs.readFileSync(
  path.resolve(projectRoot, "tests/e2e/fixtures/mock-deepseek.html"),
  "utf8",
);

function ensureBuildExists() {
  if (!fs.existsSync(contentJsPath)) {
    throw new Error(
      "Missing dist-android build. Run `npm run build:android` before " +
        "the Android Playwright suite.",
    );
  }
}

export async function reinjectAndroidContentBundle(page) {
  ensureBuildExists();
  const contentJs = fs.readFileSync(contentJsPath, "utf8");
  await page.evaluate(contentJs);
}

/**
 * Init script (runs in every page before any frame script). Installs an
 * in-memory mock of window.AndroidBridge that mirrors the @JavascriptInterface
 * contract from WebViewBridge.kt: synchronous get/set/remove against an
 * in-page Map, fetch() that returns JSON-encoded responses, downloadBlob()
 * that records calls into window.__bdsCapturedDownloads for assertions.
 */
function buildAndroidBridgeBootstrap() {
  return `
    (function () {
      if (window.AndroidBridge) return;
      const store = new Map();
      const downloads = [];
      window.__bdsCapturedDownloads = downloads;
      window.__bdsAndroidStore = store;
      window.AndroidBridge = {
        getStorage(key) {
          if (!key) return null;
          return store.has(key) ? store.get(key) : null;
        },
        setStorage(key, value) {
          if (!key) return;
          store.set(String(key), value == null ? "" : String(value));
        },
        removeStorage(key) {
          if (!key) return;
          store.delete(String(key));
        },
        getAssetUrl(path) {
          return "https://bds-asset.local/bds/" + (path || "");
        },
        fetch(payloadJson) {
          let payload = {};
          try { payload = JSON.parse(payloadJson || "{}"); } catch (_) {}
          // Honor per-test overrides registered via window.__bdsBridgeRoute.
          const handler = window.__bdsBridgeRoute && window.__bdsBridgeRoute[payload.type];
          if (typeof handler === "function") {
            try {
              return JSON.stringify(handler(payload));
            } catch (err) {
              return JSON.stringify({ ok: false, error: String(err) });
            }
          }
          return JSON.stringify({ ok: false, error: "no route for " + payload.type });
        },
        downloadBlob(base64, mimeType, fileName) {
          downloads.push({ base64, mimeType, fileName });
        },
        pickFiles(mode, requestId) {
          const handler = window.__bdsNativeFilePicker;
          setTimeout(function () {
            let detail;
            if (typeof handler === "function") {
              try {
                detail = handler(mode);
              } catch (err) {
                detail = { error: String(err), files: [] };
              }
            } else {
              detail = { error: "cancelled", files: [] };
            }
            window.dispatchEvent(
              new CustomEvent("__bds_native_files_picked_" + requestId, {
                detail,
              }),
            );
          }, 10);
        },
      };
    })();
  `;
}

async function routeFixtureRequests(context) {
  await context.route("https://chat.deepseek.com/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: fixtureHtml,
    });
  });
}

export const test = base.extend({
  context: async ({ browser }, use) => {
    ensureBuildExists();
    const context = await browser.newContext();

    // Pre-page: mock AndroidBridge.
    await context.addInitScript({ content: buildAndroidBridgeBootstrap() });

    // Pre-page: inject the built android content bundle. The bundle's IIFE
    // calls installChromePolyfill() at top-of-file because the Vite alias
    // resolves bds-platform-globals to globals-android.js. The page sees
    // chrome.* before any feature module touches it.
    const contentJs = fs.readFileSync(contentJsPath, "utf8");
    const contentCss = fs.existsSync(contentCssPath)
      ? fs.readFileSync(contentCssPath, "utf8")
      : "";

    if (contentCss) {
      const cssLiteral = JSON.stringify(contentCss);
      await context.addInitScript({
        content: `
          (function () {
            if (window.__bdsAndroidCssInjected) return;
            window.__bdsAndroidCssInjected = true;
            document.addEventListener("DOMContentLoaded", function () {
              const style = document.createElement("style");
              style.textContent = ${cssLiteral};
              document.head.appendChild(style);
            });
          })();
        `,
      });
    }

    // Defer content.js until DOMContentLoaded so the fixture's mock helpers
    // (window.__mockDeepSeek) initialize first — same ordering the Android
    // app uses (injection happens onPageFinished).
    await context.addInitScript({
      content: `
        (function () {
          document.addEventListener("DOMContentLoaded", function () {
            try {
              ${contentJs}
            } catch (err) {
              console.error("[BDS-Android sim] content.js failed:", err);
            }
          });
        })();
      `,
    });

    await routeFixtureRequests(context);

    try {
      await use(context);
    } finally {
      await context.close();
    }
  },

  page: async ({ context }, use) => {
    const page = await context.newPage();
    await page.goto("https://chat.deepseek.com/");
    await page.waitForSelector("#bds-toggle");
    await use(page);
  },
});

export { expect };
