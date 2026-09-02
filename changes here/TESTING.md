# Testing

## Test stack

- `Vitest` drives unit and integration coverage.
- `jsdom` is used for DOM-bound module and Svelte component tests.
- `Playwright` runs end-to-end tests against the built Chrome extension.
- `Selenium WebDriver` with BiDi runs end-to-end tests against the built Firefox extension.
- `Playwright` also runs Android WebView simulator parity tests against the built `dist-android/` bundle.
- `Gradle` runs Kotlin unit tests and APK assembly checks for the Android shell.
- Chrome extension APIs are mocked centrally in [tests/mocks/chrome.js](/d:/Creative%20Corner/Projects/Software/better-deepseek/tests/mocks/chrome.js).

## Commands

```bash
npm run build:chrome
npm run build:firefox
npm run build:android
npm run test:unit
npm run test:e2e
npm run test:e2e:firefox
npm run test:e2e:android
npm run android:test
npm run android:assemble:debug
npm run test:ci:web
npm run test:ci:android
npm run test
npm run test:ci
```

Useful variants:

- `npm run test:watch` runs Vitest in watch mode.
- `npm run test:ui` opens the Vitest UI.
- `npm run test:android` builds `dist-android/` and runs the Android simulator Playwright suite.
- `npm run test:ci:web` mirrors the web GitHub Actions job (Chrome + Firefox).
- `npm run test:ci:android` mirrors the Android GitHub Actions job.
- `npm run test:ci` runs both CI-equivalent jobs locally.

## Suite layout

- Unit tests live next to the source file when the module is mostly pure.
- Integration tests live under `tests/integration/`.
- Chrome E2E tests live under `tests/e2e/`.
- Firefox E2E tests live under `tests/e2e-firefox/`.
- Android simulator E2E tests live under `tests/e2e-android/`.
- Shared DOM helpers live under `tests/helpers/`.
- Shared response payloads live in `tests/e2e/fixtures/payloads.js`.

## Vitest conventions

- Keep tests independent. Reset mutable state in `beforeEach`.
- Use the AAA pattern.
- Prefer `vi.mock(...)` over source edits when isolating dependencies.
- For Svelte 5 components, mount via `mount()` through [tests/helpers/svelte.js](/d:/Creative%20Corner/Projects/Software/better-deepseek/tests/helpers/svelte.js).
- If a test touches browser-extension APIs, extend the shared chrome mock instead of creating one-off mocks.

## Playwright workflow (Chrome-target Chromium)

1. Build the extension first with `npm run build:chrome`.
2. Playwright loads the exact `dist-chrome/` build as an unpacked extension in its bundled Chromium using `channel: "chromium"`.
3. All HTTP(S) requests are intercepted via a catch-all route and resolved through the shared `tests/e2e/fixtures/fixture-resolver.js`. Unmatched external URLs receive a terminal 500 response and fail the test.
4. The E2E suite then drives the real content script, sidebar injectors, and UI overlay behavior.

This lane is intentionally named Chrome-target Chromium, not branded Chrome Stable. Current Chrome and Edge releases removed the command-line flags Playwright needs to side-load unpacked extensions, so [Playwright requires its bundled Chromium for extension automation](https://playwright.dev/docs/chrome-extensions). Release verification for a store-installed build in branded Chrome remains a manual check; the same production source is exercised automatically here and independently in Firefox.

## Selenium WebDriver workflow (Firefox)

1. Build both extensions with `npm run build`.
2. Selenium Manager auto-provisions GeckoDriver. Set `FIREFOX_BIN` to an **absolute path** to override. Relative paths or command names (e.g. `firefox`) are rejected with an actionable error before driver construction.
3. Firefox launches with BiDi enabled and the unsigned `dist-firefox/` extension installed temporarily via `installAddon(path, true)`.
4. Catch-all HTTP(S) BiDi interception plus `network.provideResponse` resolves every external request through the same shared `tests/e2e/fixtures/fixture-resolver.js` as Chromium. Unknown external URLs receive a terminal 500 response and mark the fixture failed.
5. Extension bootstrap is verified via WebDriver waits for `#bds-toggle` and `.bds-plus-btn` (no fixed sleeps).
6. `npm run test:e2e:firefox` invokes Vitest with `vitest.firefox.config.js`, running tests from `tests/e2e-firefox/`.
7. In CI, Firefox runs headless. Selenium caches at `~/.cache/selenium` — cache this directory for faster runs. The CI job uses `${{ steps.setup-firefox.outputs.firefox-path }}` for the absolute binary path.
8. Test results are written to `test-results-firefox/` on failure.

### Firefox contracts

1. **Boot**: Extension boots and exposes `#bds-toggle`, `.bds-plus-btn`. Driver health checked before each test.
2. **Storage quiescence (#108)**: `waitForStartup` first awaits background config/status and content locale persistence. A fresh probe must then remain at `total === 0`, `remoteConfig === 0` for an observed quiet window. Correlated debug writes await storage completion. One unique `replaceRemote` produces exactly one total/remote event; a reordered repeat produces none; a second quiet window proves stability.
3. **Performance (#105)**: 200/2000 message baselines with `waitForAllMessagesProcessed`. All 5 samples at each scale required via `appendAndMeasureProcessing`. Each < 2000ms, median ratio ≤ 2.5×, absolute increase ≤ 750ms.
4. **Host wrapper**: `.bds-download-card` is a descendant of `.bds-host-wrapper` (`wrapper.contains(card)`). Wrapper has nonzero width and height, display is not `contents`.

### Chrome-target Chromium contracts (matching)

The Chromium Playwright lane runs the identical performance (#105), startup/storage-quiescence (#108), and exact host-ownership contracts using the same shared fixture resolver. Its fixture teardown fails the test if any external request was unmatched.

## Android simulator

1. Build the Android bundle first with `npm run build:android`.
2. Playwright loads the same mock DeepSeek fixture in a mobile Chromium context.
3. `tests/e2e-android/helpers/android.js` installs a JS mock of `window.AndroidBridge` before the app bundle runs.
4. The suite then verifies Android-specific platform gating, download routing, and storage persistence without needing a device farm.

## Adding tests

- For pure functions, add co-located `*.test.js` files.
- For content-script modules with side effects, prefer integration tests under `tests/integration/` and mock the smallest stable boundary.
- For new UI components, render them through the shared Svelte helper and assert only on public DOM behavior.
- For new extension flows, add them to the mock DeepSeek fixture only if the real selector contract requires it.
- For shared response payloads (pricing, GitHub ZIP, etc.), add them to `tests/e2e/fixtures/payloads.js` so both Chrome and Firefox lanes consume the same data.

## CI

- GitHub Actions runs three jobs: **Web / Extension** (Chrome + unit), **Firefox E2E**, and **Android**.
- The web lane builds `dist-chrome/`, runs `npm run test:unit`, then runs `npm run test:e2e` (Chrome-target Playwright Chromium).
- The Firefox lane builds `dist-firefox/` on `ubuntu-latest` with Node 20, installs Firefox Stable via `browser-actions/setup-firefox@v1`, caches `~/.cache/selenium`, runs `npm run test:e2e:firefox`, and uploads `test-results-firefox/` on failure.
- The Android lane builds `dist-android/`, assembles the debug APK, runs `npm run test:e2e:android`, then runs `npm run android:test`.
- Coverage, Playwright reports, Android artifacts, and Firefox test results are uploaded on every CI run.
- `npm test` builds (`pretest`) before running the unit + Chrome + Firefox suites — works from a clean checkout with no pre-existing `dist-chrome/` or `dist-firefox/`.
