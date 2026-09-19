/**
 * Single shared fixture request resolver consumed by both Playwright (Chrome)
 * and Selenium BiDi (Firefox) adapters.
 *
 * Every intercepted HTTP(S) request resolves through this module. Unknown
 * external URLs receive a terminal response and mark the fixture failed.
 */

import fs from "node:fs";
import path from "node:path";
import {
  pricingHtml,
  pricingJson,
  githubZip,
  githubCommits,
  remoteConfigFixture,
  remoteStatusFixture,
  makeLocaleFixture,
} from "./payloads.js";

// ── Locale code discovery from actual source files ──

const LOCALES_DIR = path.resolve(
  process.cwd(),
  "src",
  "locales",
);

/** @type {string[]} */
let _localeCodes = null;
function getLocaleCodes() {
  if (_localeCodes) return _localeCodes;
  try {
    _localeCodes = fs
      .readdirSync(LOCALES_DIR)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""));
  } catch {
    _localeCodes = ["en", "tr", "ru", "zh-cn"];
  }
  return _localeCodes;
}

// ── Fixture HTML (read once) ──

let _fixtureHtml = null;
function getFixtureHtml() {
  if (_fixtureHtml) return _fixtureHtml;
  _fixtureHtml = fs.readFileSync(
    path.resolve(process.cwd(), "tests/e2e/fixtures/mock-deepseek.html"),
    "utf8",
  );
  return _fixtureHtml;
}

// ── URL matching ──

/**
 * Strip cache-busting query parameters for route matching.
 * Returns { base, qs } where base is the URL without `?t=...` etc.
 */
function parseUrl(url) {
  try {
    const u = new URL(url);
    const t = u.searchParams.get("t");
    if (t) u.searchParams.delete("t");
    const qs = u.searchParams.toString();
    return { base: u.origin + u.pathname + (qs ? "?" + qs : ""), raw: url };
  } catch {
    return { base: url, raw: url };
  }
}

const ROUTES = [
  {
    name: "deepseek-page",
    match: (url) => url.startsWith("https://chat.deepseek.com"),
    response: () => ({
      statusCode: 200,
      mediaType: "text/html; charset=utf-8",
      body: getFixtureHtml(),
    }),
  },
  {
    name: "pricing-html",
    match: (url) => url.startsWith("https://api-docs.deepseek.com"),
    response: () => ({
      statusCode: 200,
      mediaType: "text/html; charset=utf-8",
      body: pricingHtml,
    }),
  },
  {
    name: "pricing-json",
    match: (url) =>
      url.startsWith(
        "https://raw.githubusercontent.com/EdgeTypE/better-deepseek/main/extension/pricing.json",
      ),
    response: () => ({
      statusCode: 200,
      mediaType: "application/json; charset=utf-8",
      body: pricingJson,
    }),
  },
  {
    name: "remote-config",
    match: (url) =>
      url.startsWith(
        "https://raw.githubusercontent.com/EdgeTypE/better-deepseek/main/extension/remote-config.json",
      ),
    response: () => ({
      statusCode: 200,
      mediaType: "application/json; charset=utf-8",
      body: JSON.stringify(remoteConfigFixture),
    }),
  },
  {
    name: "remote-status",
    match: (url) =>
      url.startsWith(
        "https://raw.githubusercontent.com/EdgeTypE/better-deepseek/main/extension/status.json",
      ),
    response: () => ({
      statusCode: 200,
      mediaType: "application/json; charset=utf-8",
      body: JSON.stringify(remoteStatusFixture),
    }),
  },
  {
    name: "github-zip",
    match: (url) =>
      url.startsWith("https://codeload.github.com/octocat/Hello-World/zip/refs/heads/"),
    response: () => ({
      statusCode: 200,
      mediaType: "application/zip",
      body: githubZip,
      binary: true,
    }),
  },
  {
    name: "github-commits",
    match: (url) =>
      url.startsWith("https://api.github.com/repos/octocat/Hello-World/commits"),
    response: () => ({
      statusCode: 200,
      mediaType: "application/json; charset=utf-8",
      body: JSON.stringify(githubCommits),
    }),
  },
  {
    name: "status-check",
    match: (url) => url.startsWith("https://status.deepseek.com"),
    response: () => ({
      statusCode: 200,
      mediaType: "application/json; charset=utf-8",
      body: '{"status":"ok"}',
    }),
  },
  {
    name: "google-fonts-css",
    match: (url) => url.startsWith("https://fonts.googleapis.com/"),
    response: () => ({
      statusCode: 200,
      mediaType: "text/css; charset=utf-8",
      body: "",
    }),
  },
];

/**
 * Resolve a fixture response for an intercepted request URL.
 *
 * @param {string} url - full URL including query string
 * @returns {{
 *   statusCode: number,
 *   mediaType: string,
 *   body: string|Buffer,
 *   binary?: boolean,
 *   routeName: string
 * } | null}
 *   null when the URL is internal (data:, about:, chrome-extension:, moz-extension:)
 * @throws {Error} on unmatched external URL
 */
export function resolveFixtureRequest(url) {
  // Browser-internal URLs — never intercepted
  if (
    url.startsWith("data:") ||
    url.startsWith("about:") ||
    url.startsWith("chrome-extension:") ||
    url.startsWith("moz-extension:") ||
    url.startsWith("chrome:") ||
    url.includes("://localhost")
  ) {
    return null;
  }

  // AWS WAF / captcha — harmless no-ops
  if (url.includes("awswaf.com") || url.includes("captcha")) {
    return {
      statusCode: 200,
      mediaType: "text/plain",
      body: "",
      routeName: "captcha-noop",
    };
  }

  const { base } = parseUrl(url);

  // Check static routes
  for (const route of ROUTES) {
    if (route.match(base)) {
      return { ...route.response(), routeName: route.name };
    }
  }

  // Dynamic locale routes — derived from actual locale files
  const localeMatch = base.match(
    /\/src\/locales\/([a-z]{2}(-[a-z]{2})?)\.json$/,
  );
  if (localeMatch) {
    const code = localeMatch[1];
    if (!getLocaleCodes().includes(code)) {
      throw new Error(`[Fixture] Unknown locale code: ${code}`);
    }
    return {
      statusCode: 200,
      mediaType: "application/json; charset=utf-8",
      body: JSON.stringify(makeLocaleFixture(code)),
      routeName: `locale-${code}`,
    };
  }

  throw new Error(
    `[Fixture] Unmatched external URL: ${url}\n` +
    `Parsed base: ${base}\n` +
    `Known routes: ${ROUTES.map((r) => r.name).join(", ")}, locales (${getLocaleCodes().join(", ")})`,
  );
}

/**
 * Request ledger for tracking all intercepted requests.
 */
export function createRequestLedger() {
  /** @type {Array<{url: string, routeName: string, statusCode: number, error?: string}>} */
  const entries = [];

  return {
    record(url, routeName, statusCode, error) {
      entries.push({ url, routeName, statusCode, error });
    },
    entries() {
      return [...entries];
    },
    unmatchedCount() {
      return entries.filter((e) => e.statusCode >= 500).length;
    },
    reset() {
      entries.length = 0;
    },
  };
}
