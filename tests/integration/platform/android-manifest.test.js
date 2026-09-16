/**
 * Android manifest invariants for the WebView host Activity.
 *
 * MainActivity is a single-WebView host: onCreate always builds a fresh WebView
 * and calls loadUrl(bds_target_url), and there is no onConfigurationChanged
 * override and no saveState/restoreState. Android therefore destroys and
 * recreates the Activity for any configuration change that is not listed in
 * android:configChanges, which reloads the WebView onto the DeepSeek home
 * screen and drops the user out of the conversation they were in.
 *
 * Issue #123: attaching or detaching an external keyboard raised the "keyboard"
 * configuration change. "keyboard" was not declared, so the Activity restarted
 * and the app jumped to the home screen. These assertions keep the peripheral
 * flags declared so that regression cannot come back silently.
 *
 * See https://developer.android.com/guide/topics/manifest/activity-element
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const MANIFEST_PATH = path.resolve(
  process.cwd(),
  "android/app/src/main/AndroidManifest.xml",
);

/**
 * Every value Android accepts for android:configChanges, per the activity
 * element documentation. A typo here is silently ignored by the platform —
 * the Activity just restarts — so the list is asserted explicitly.
 */
const VALID_CONFIG_CHANGE_FLAGS = new Set([
  "colorMode",
  "density",
  "fontScale",
  "fontWeightAdjustment",
  "grammaticalGender",
  "keyboard",
  "keyboardHidden",
  "layoutDirection",
  "locale",
  "mcc",
  "mnc",
  "navigation",
  "orientation",
  "screenLayout",
  "screenSize",
  "smallestScreenSize",
  "touchscreen",
  "uiMode",
]);

/**
 * Flags Android raises when an input peripheral is attached or detached.
 * None of them may restart the Activity.
 */
const PERIPHERAL_FLAGS = ["keyboard", "keyboardHidden", "navigation", "touchscreen"];

/**
 * Flags declared before issue #123 was fixed. They must not be dropped while
 * adding new ones — losing "orientation" would restart the Activity on rotate.
 */
const PRE_EXISTING_FLAGS = [
  "orientation",
  "screenSize",
  "screenLayout",
  "smallestScreenSize",
  "uiMode",
  "density",
  "fontScale",
];

function readMainActivityTag() {
  const xml = fs.readFileSync(MANIFEST_PATH, "utf8");
  // [^>] also matches newlines, so this spans the multi-line <activity> tag.
  const match = xml.match(/<activity\b[^>]*android:name="\.MainActivity"[^>]*>/);
  return match ? match[0] : null;
}

function readConfigChanges() {
  const tag = readMainActivityTag();
  if (!tag) return null;
  const match = tag.match(/android:configChanges="([^"]*)"/);
  if (!match) return null;
  return match[1].split("|").map((flag) => flag.trim());
}

describe("AndroidManifest MainActivity configChanges", () => {
  it("declares the MainActivity activity element", () => {
    expect(readMainActivityTag()).not.toBeNull();
  });

  it("declares android:configChanges at all", () => {
    expect(readConfigChanges()).not.toBeNull();
  });

  it.each(PERIPHERAL_FLAGS)(
    "handles the %s configuration change so the WebView is never reloaded",
    (flag) => {
      expect(readConfigChanges()).toContain(flag);
    },
  );

  it("keeps every configuration flag that was already declared", () => {
    const flags = readConfigChanges();
    for (const flag of PRE_EXISTING_FLAGS) {
      expect(flags).toContain(flag);
    }
  });

  it("only declares flags Android recognises", () => {
    const unknown = readConfigChanges().filter(
      (flag) => !VALID_CONFIG_CHANGE_FLAGS.has(flag),
    );
    expect(unknown).toEqual([]);
  });

  it("does not declare the same flag twice", () => {
    const flags = readConfigChanges();
    expect(flags).toHaveLength(new Set(flags).size);
  });
});
