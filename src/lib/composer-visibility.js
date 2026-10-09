/**
 * Composer button visibility — remote-config defaults + per-user overrides.
 *
 * History: attach-menu visibility used to live entirely in remote config
 * (`features.attachMenu.*`), so only the remote author could show or hide a
 * button and a remote update silently overwrote any local expectation. That
 * model is deprecated.
 *
 * The current model layers two sources:
 *   1. `features.composerButtons.*` (remote config) — the defaults. These are
 *      per build target: `targets.<chrome|firefox|android>` holds the set for
 *      that bundle, so a button that cannot work on a platform (e.g. voice on
 *      Firefox, where the Web Speech API is disabled by default) is hidden by
 *      configuration rather than by sniffing browser APIs.
 *   2. `settings.composerVisibility.*` (user) — tri-state overrides.
 *
 * Override values are tri-state:
 *   - `null`      → follow remote config (no override)
 *   - `true`      → force show
 *   - `false`     → force hide
 *
 * An explicit override always wins, so a remote-config update can never
 * clobber a choice the user made (the "turn DeepCode on, remote flips it off"
 * case). The legacy `features.attachMenu.*` keys stay in remote config for
 * older clients but are no longer read here.
 */

import { getConfig, getFlag } from "./remote-config.svelte.js";

/**
 * Attach-menu sub-items that can be individually overridden. Names match the
 * legacy per-mode remote-config flags so the migration is mechanical.
 *
 * `showVoice` (the mic / voice-prompt button) and `showLiveMode` (the Live
 * Voice Mode button) are deliberately separate: they used to share one flag,
 * which made it impossible to keep one without the other.
 */
export const ATTACH_ITEM_KEYS = [
  "showPlus",
  "showUploadFile",
  "showUploadFolder",
  "showGithub",
  "showWeb",
  "showOther",
  "showProject",
  "showVoice",
  "showLiveMode",
];

/** Top-level composer buttons covered by the advanced setting. */
export const COMPOSER_BUTTON_KEYS = ["attachMenu", "deepResearch", "deepCode"];

const REMOTE_PREFIX = "features.composerButtons";

/**
 * Build targets whose branch under `features.composerButtons.targets` may
 * override the shared defaults. Mirrors the three bundles produced by
 * `build.js --target=...`.
 */
export const TARGET_KEYS = ["chrome", "firefox", "android"];

/**
 * The build target this bundle was compiled for. Vite's `define` inlines the
 * literal (see build.js sharedDefine); in Vitest it is undefined, so the
 * `"chrome"` fallback mirrors the default extension target.
 *
 * Read lazily rather than at module scope so tests can stub the env var.
 */
export function currentTarget() {
  return process.env.BDS_TARGET || "chrome";
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Collapse an override to one of null | true | false. */
export function normalizeOverride(value) {
  if (value === true) return true;
  if (value === false) return false;
  return null;
}

/** Resolve a single value: an override wins, otherwise the remote default. */
export function pickVisibility(override, fallback) {
  return override === null || override === undefined
    ? Boolean(fallback)
    : Boolean(override);
}

/**
 * Build a fresh, fully-populated override object from any stored shape.
 * Unknown keys are dropped, missing keys become `null` (follow remote), and
 * the returned object is never aliased to the input.
 */
export function normalizeComposerVisibility(value) {
  const src =
    value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const itemsSrc =
    src.attachItems &&
    typeof src.attachItems === "object" &&
    !Array.isArray(src.attachItems)
      ? src.attachItems
      : {};

  const attachItems = {};
  for (const key of ATTACH_ITEM_KEYS) {
    attachItems[key] = normalizeOverride(itemsSrc[key]);
  }

  return {
    attachMenu: normalizeOverride(src.attachMenu),
    deepResearch: normalizeOverride(src.deepResearch),
    deepCode: normalizeOverride(src.deepCode),
    attachItems,
  };
}

/**
 * Read the remote-config defaults for every composer button and sub-item.
 *
 * Defaults are per build target: when `features.composerButtons.targets.<target>`
 * exists it *is* the default set for this bundle, replacing the shared keys at
 * the top level entirely. The shared keys are the fallback for a target with no
 * branch of its own — an unrecognised/future target, or a stored config that
 * predates the target layer — so a missing branch degrades to the shared values
 * instead of hiding everything. Every branch must therefore be complete;
 * `composer-visibility.test.js` asserts that.
 */
export function readComposerDefaults() {
  const branch = getConfig(`${REMOTE_PREFIX}.targets.${currentTarget()}`);
  const scoped = isPlainObject(branch) ? branch : null;

  const attachItems = {};
  for (const key of ATTACH_ITEM_KEYS) {
    attachItems[key] = scoped
      ? Boolean(scoped.attachItems?.[key])
      : getFlag(`${REMOTE_PREFIX}.attachItems.${key}`);
  }

  const flag = (key) =>
    scoped ? Boolean(scoped[key]) : getFlag(`${REMOTE_PREFIX}.${key}`);

  return {
    attachMenu: flag("attachMenu"),
    deepResearch: flag("deepResearch"),
    deepCode: flag("deepCode"),
    attachItems,
  };
}

/**
 * Pure resolution: overrides layered on top of defaults. Kept free of any
 * remote-config access so it can be unit-tested directly.
 */
export function resolveVisibility(overrides, defaults) {
  const ov =
    overrides && typeof overrides === "object" ? overrides : {};
  const itemOv =
    ov.attachItems &&
    typeof ov.attachItems === "object" &&
    !Array.isArray(ov.attachItems)
      ? ov.attachItems
      : {};
  const defItems =
    defaults && defaults.attachItems ? defaults.attachItems : {};

  const attachItems = {};
  for (const key of ATTACH_ITEM_KEYS) {
    attachItems[key] = pickVisibility(itemOv[key], defItems[key]);
  }

  return {
    attachMenu: pickVisibility(ov.attachMenu, defaults?.attachMenu),
    deepResearch: pickVisibility(ov.deepResearch, defaults?.deepResearch),
    deepCode: pickVisibility(ov.deepCode, defaults?.deepCode),
    attachItems,
  };
}

/** Effective visibility for the current settings + remote config. */
export function resolveComposerVisibility(settings) {
  return resolveVisibility(
    settings?.composerVisibility,
    readComposerDefaults(),
  );
}

/** True when the given path is explicitly overridden (not following remote). */
export function isOverridden(overrides, path) {
  const ov = normalizeComposerVisibility(overrides);
  if (path.startsWith("attachItems.")) {
    return ov.attachItems[path.slice("attachItems.".length)] !== null;
  }
  return ov[path] !== null;
}
