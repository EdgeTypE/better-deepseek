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

## Playwright workflow (Chrome)

1. Build the extension first with `npm run build:chrome`.
2. Playwright loads `dist-chrome/` as an unpacked Chromium extension.
3. Requests to `https://chat.deepseek.com/*` are fulfilled with the local mock fixture at [tests/e2e/fixtures/mock-deepseek.html](/d:/Creative%20Corner/Projects/Software/better-deepseek/tests/e2e/fixtures/mock-deepseek.html).
4. The E2E suite then drives the real content script, sidebar injectors, and UI overlay behavior.

## Selenium WebDriver workflow (Firefox)

1. Build both extensions with `npm run build`.
2. Selenium Manager auto-provisions GeckoDriver. Set `FIREFOX_BIN` to override the Firefox binary.
3. Firefox launches with BiDi enabled and the unsigned `dist-firefox/` extension installed temporarily via `installAddon(path, true)`.
4. BiDi `network.addIntercept` + `network.provideResponse` serve the same deterministic fixture HTML and API payloads as the Chrome lane (shared `tests/e2e/fixtures/payloads.js`).
5. `npm run test:e2e:firefox` invokes Vitest with `vitest.firefox.config.js`, running tests from `tests/e2e-firefox/`.
6. In CI, Firefox runs headless. Selenium caches at `~/.cache/selenium` — cache this directory for faster runs.
7. Test results are written to `test-results-firefox/` on failure.

### Firefox contracts

1. **Boot**: Extension boots on the mock fixture and exposes `#bds-toggle`, `.bds-plus-btn`.
2. **Storage quiescence (#108)**: A unique `replaceRemote` produces exactly one `bds:remote-config-updated` event and exactly one `chrome.storage.onChanged` event for the remoteConfig key. Repeating the identical replacement produces zero additional events or storage writes. A 500 ms idle window shows stable counts. Verified via extension-realm storage probe (`startStorageProbe`/`getStorageProbe`/`stopStorageProbe` debug API methods).
3. **Performance (#105)**: 200-message baseline and 2000-message scale. All five samples at each scale must complete; each append under 2,000 ms. Median ratio ≤ 2.5×, absolute median increase ≤ 750 ms. Uses observable `waitForAllMessagesProcessed` and `appendAndMeasureProcessing` helpers (no fixed sleeps).
4. **Host wrapper box model**: `create_file` message produces `.bds-download-card` inside `.bds-host-wrapper`. Wrapper `display` is not `contents`; both `width` and `height` are greater than zero.

### Chrome contracts (matching)

The Chrome Playwright lane runs the identical performance (#105), storage (#108), and host-wrapper contracts using the same shared mock fixture helpers (`waitForAllMessagesProcessed`, `appendAndMeasureProcessing`, debug API storage probe).

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
- The web lane builds `dist-chrome/`, runs `npm run test:unit`, then runs `npm run test:e2e` (Chrome Playwright).
- The Firefox lane builds `dist-firefox/` on `ubuntu-latest` with Node 20, installs Firefox Stable via `browser-actions/setup-firefox@v1`, caches `~/.cache/selenium`, runs `npm run test:e2e:firefox`, and uploads `test-results-firefox/` on failure.
- The Android lane builds `dist-android/`, assembles the debug APK, runs `npm run test:e2e:android`, then runs `npm run android:test`.
- Coverage, Playwright reports, Android artifacts, and Firefox test results are uploaded on every CI run.
- `npm test` builds (`pretest`) before running the unit + Chrome + Firefox suites — works from a clean checkout with no pre-existing `dist-chrome/` or `dist-firefox/`.
