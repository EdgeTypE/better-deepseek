/**
 * Shared response payloads for browser E2E tests.
 * Consumed by Chromium Playwright routing and Firefox BiDi interception.
 */

import { zipSync, strToU8 } from "fflate";

export const pricingHtml = `<!DOCTYPE html>
<html>
  <body>
    <h1>Pricing</h1>
    <table>
      <tr><td>deepseek-v4-flash</td><td>$0.007</td><td>$0.22</td><td>$0.66</td></tr>
      <tr><td>deepseek-v4-pro</td><td>$0.022</td><td>$0.66</td><td>$1.98</td></tr>
    </table>
  </body>
</html>`;

export const pricingJson = JSON.stringify({
  updatedAt: "2026-08-13",
  models: {
    "deepseek-v4-flash": {
      displayName: "DeepSeek V4 Flash",
      inputPrice: 0.22,
      inputCacheHitPrice: 0.007,
      outputPrice: 0.66,
      contextLength: 1_000_000,
    },
    "deepseek-v4-pro": {
      displayName: "DeepSeek V4 Pro",
      inputPrice: 0.66,
      inputCacheHitPrice: 0.022,
      outputPrice: 1.98,
      contextLength: 1_000_000,
    },
  },
});

export const githubZip = Buffer.from(
  zipSync({
    "Hello-World-main/README.md": strToU8("# Hello World\n\nFixture repo.\n"),
    "Hello-World-main/src/index.js": strToU8('console.log("fixture repo");\n'),
    "Hello-World-main/.gitignore": strToU8("dist/\n"),
  }),
);

export const githubCommits = Array.from({ length: 3 }, (_, index) => ({
  sha: `abcdef${index}1234567890`,
  commit: {
    author: {
      name: `Fixture Author ${index + 1}`,
      date: `2026-05-0${index + 1}T10:00:00Z`,
    },
    message: `Fixture commit ${index + 1}`,
  },
}));

// ── Background updater fixtures (#108 fix) ──

export const remoteConfigFixture = {
  features: {
    attachMenu: { enabled: true },
    fileUpload: { enabled: true },
  },
  selectors: {},
  api: { statusUrl: "https://status.deepseek.com/api/v1/status" },
  modelMappings: {},
  meta: { version: 1 },
};

export const remoteStatusFixture = [];

export function makeLocaleFixture(code) {
  return { messages: { testKey: `fixture-locale-${code}` } };
}

/**
 * Route patterns used by both Playwright and BiDi interception.
 */
export const ROUTES = {
  deepseek: "https://chat.deepseek.com/**",
  pricingHtml: "https://api-docs.deepseek.com/**",
  pricingJson:
    "https://raw.githubusercontent.com/EdgeTypE/better-deepseek/main/extension/pricing.json",
  remoteConfig:
    "https://raw.githubusercontent.com/EdgeTypE/better-deepseek/main/extension/remote-config.json",
  remoteStatus:
    "https://raw.githubusercontent.com/EdgeTypE/better-deepseek/main/extension/status.json",
  locales:
    "https://raw.githubusercontent.com/EdgeTypE/better-deepseek/main/src/locales/*.json",
  githubZip: "https://codeload.github.com/octocat/Hello-World/zip/refs/heads/*",
  githubCommits: "https://api.github.com/repos/octocat/Hello-World/commits**",
};
