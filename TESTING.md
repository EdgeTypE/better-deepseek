# Testing

## Test stack

- `Vitest` drives unit and integration coverage.
- `jsdom` is used for DOM-bound module and Svelte component tests.
- `Playwright` runs end-to-end tests against the built Chrome extension.
- Chrome extension APIs are mocked centrally in [tests/mocks/chrome.js](/d:/Creative%20Corner/Projects/Software/better-deepseek/tests/mocks/chrome.js).

## Commands

```bash
npm run build:chrome
npm run test:unit
npm run test:e2e
npm run test
```

Useful variants:

- `npm run test:watch` runs Vitest in watch mode.
- `npm run test:ui` opens the Vitest UI.
- `npm run test:ci` builds the Chrome target, runs Vitest, then runs Playwright.

## Suite layout

- Unit tests live next to the source file when the module is mostly pure.
- Integration tests live under `tests/integration/`.
- E2E tests live under `tests/e2e/`.
- Shared DOM helpers live under `tests/helpers/`.

## Vitest conventions

- Keep tests independent. Reset mutable state in `beforeEach`.
- Use the AAA pattern.
- Prefer `vi.mock(...)` over source edits when isolating dependencies.
- For Svelte 5 components, mount via `mount()` through [tests/helpers/svelte.js](/d:/Creative%20Corner/Projects/Software/better-deepseek/tests/helpers/svelte.js).
- If a test touches browser-extension APIs, extend the shared chrome mock instead of creating one-off mocks.

## Playwright workflow

1. Build the extension first with `npm run build:chrome`.
2. Playwright loads `dist-chrome/` as an unpacked Chromium extension.
3. Requests to `https://chat.deepseek.com/*` are fulfilled with the local mock fixture at [tests/e2e/fixtures/mock-deepseek.html](/d:/Creative%20Corner/Projects/Software/better-deepseek/tests/e2e/fixtures/mock-deepseek.html).
4. The E2E suite then drives the real content script, sidebar injectors, and UI overlay behavior.

## Adding tests

- For pure functions, add co-located `*.test.js` files.
- For content-script modules with side effects, prefer integration tests under `tests/integration/` and mock the smallest stable boundary.
- For new UI components, render them through the shared Svelte helper and assert only on public DOM behavior.
- For new extension flows, add them to the mock DeepSeek fixture only if the real selector contract requires it.

## CI

- GitHub Actions builds the Chrome extension, runs `npm run test:unit`, then runs `npm run test:e2e`.
- Coverage, Playwright reports, and test artifacts are uploaded on every CI run.
