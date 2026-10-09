// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ATTACH_ITEM_KEYS,
  TARGET_KEYS,
  isOverridden,
  normalizeComposerVisibility,
  normalizeOverride,
  pickVisibility,
  readComposerDefaults,
  resolveComposerVisibility,
  resolveVisibility,
} from "./composer-visibility.js";
import { remoteConfig } from "./remote-config.svelte.js";
import { DEFAULT_REMOTE_CONFIG } from "./constants.js";

const ALL_ON = {
  attachMenu: true,
  deepResearch: true,
  deepCode: true,
  attachItems: Object.fromEntries(ATTACH_ITEM_KEYS.map((k) => [k, true])),
};

/**
 * Apply remote composer defaults to the test target's branch. Tests run with
 * BDS_TARGET unset, which resolves to "chrome" (see currentTarget()); the
 * per-target branch — not the shared keys — is what the client reads.
 */
const applyComposerDefaults = (branch) =>
  remoteConfig.applyRemote({
    features: { composerButtons: { targets: { chrome: branch } } },
  });

describe("composer-visibility", () => {
  beforeEach(() => {
    remoteConfig.resetToBuiltin();
  });

  describe("normalizeOverride", () => {
    it("passes booleans through and maps everything else to null", () => {
      expect(normalizeOverride(true)).toBe(true);
      expect(normalizeOverride(false)).toBe(false);
      expect(normalizeOverride(null)).toBe(null);
      expect(normalizeOverride(undefined)).toBe(null);
      expect(normalizeOverride("true")).toBe(null);
      expect(normalizeOverride(0)).toBe(null);
    });
  });

  describe("pickVisibility", () => {
    it("prefers an explicit override over the fallback", () => {
      expect(pickVisibility(true, false)).toBe(true);
      expect(pickVisibility(false, true)).toBe(false);
    });

    it("falls back to the default when there is no override", () => {
      expect(pickVisibility(null, true)).toBe(true);
      expect(pickVisibility(undefined, false)).toBe(false);
    });
  });

  describe("normalizeComposerVisibility", () => {
    it("fills every key with null for junk input", () => {
      const out = normalizeComposerVisibility(undefined);
      expect(out.attachMenu).toBe(null);
      expect(out.deepResearch).toBe(null);
      expect(out.deepCode).toBe(null);
      expect(Object.keys(out.attachItems).sort()).toEqual([...ATTACH_ITEM_KEYS].sort());
      expect(Object.values(out.attachItems).every((v) => v === null)).toBe(true);
    });

    it("drops unknown keys and coerces non-boolean values to null", () => {
      const out = normalizeComposerVisibility({
        attachMenu: "yes",
        deepResearch: true,
        bogus: true,
        attachItems: { showGithub: false, nope: true },
      });
      expect(out.attachMenu).toBe(null);
      expect(out.deepResearch).toBe(true);
      expect(out).not.toHaveProperty("bogus");
      expect(out.attachItems.showGithub).toBe(false);
      expect(out.attachItems).not.toHaveProperty("nope");
    });

    it("returns a fresh object that never aliases the input", () => {
      const input = { attachMenu: true, attachItems: { showWeb: true } };
      const out = normalizeComposerVisibility(input);
      out.attachItems.showWeb = false;
      out.attachMenu = false;
      expect(input.attachMenu).toBe(true);
      expect(input.attachItems.showWeb).toBe(true);
    });
  });

  describe("resolveVisibility", () => {
    it("returns the defaults when nothing is overridden", () => {
      const vis = resolveVisibility(normalizeComposerVisibility(undefined), ALL_ON);
      expect(vis.attachMenu).toBe(true);
      expect(vis.deepResearch).toBe(true);
      expect(vis.deepCode).toBe(true);
      expect(vis.attachItems.showGithub).toBe(true);
    });

    it("lets an explicit override win in both directions", () => {
      const vis = resolveVisibility(
        normalizeComposerVisibility({
          attachMenu: false,
          deepCode: true,
          attachItems: { showGithub: false },
        }),
        ALL_ON,
      );
      expect(vis.attachMenu).toBe(false);
      expect(vis.deepCode).toBe(true);
      expect(vis.attachItems.showGithub).toBe(false);
      // Untouched items still follow the defaults.
      expect(vis.deepResearch).toBe(true);
      expect(vis.attachItems.showWeb).toBe(true);
    });

    it("tolerates a missing defaults object", () => {
      const vis = resolveVisibility({ attachMenu: true }, undefined);
      expect(vis.attachMenu).toBe(true);
      expect(vis.deepResearch).toBe(false);
      expect(vis.attachItems.showWeb).toBe(false);
    });

    it("treats Voice Prompt and Live Mode as independent switches", () => {
      // Both start from the same default (on), but overriding one must not
      // drag the other along.
      const voiceOff = resolveVisibility(
        normalizeComposerVisibility({ attachItems: { showVoice: false } }),
        ALL_ON,
      );
      expect(voiceOff.attachItems.showVoice).toBe(false);
      expect(voiceOff.attachItems.showLiveMode).toBe(true);

      const liveOff = resolveVisibility(
        normalizeComposerVisibility({ attachItems: { showLiveMode: false } }),
        ALL_ON,
      );
      expect(liveOff.attachItems.showLiveMode).toBe(false);
      expect(liveOff.attachItems.showVoice).toBe(true);
    });
  });

  describe("readComposerDefaults", () => {
    it("reads the built-in features.composerButtons defaults", () => {
      const defaults = readComposerDefaults();
      expect(defaults.attachMenu).toBe(true);
      expect(defaults.deepResearch).toBe(true);
      expect(defaults.deepCode).toBe(true);
      for (const key of ATTACH_ITEM_KEYS) {
        expect(defaults.attachItems[key]).toBe(true);
      }
    });

    it("reflects a remote override of the defaults", () => {
      applyComposerDefaults({ deepCode: false, attachItems: { showWeb: false } });
      const defaults = readComposerDefaults();
      expect(defaults.deepCode).toBe(false);
      expect(defaults.attachItems.showWeb).toBe(false);
      expect(defaults.attachMenu).toBe(true);
    });

    it("reads the branch for the bundle's own target", () => {
      vi.stubEnv("BDS_TARGET", "firefox");
      const defaults = readComposerDefaults();
      expect(defaults.attachItems.showVoice).toBe(false);
      expect(defaults.attachItems.showLiveMode).toBe(false);
      // The rest of the branch still applies.
      expect(defaults.attachItems.showWeb).toBe(true);
      expect(defaults.attachMenu).toBe(true);
      vi.unstubAllEnvs();
    });

    it("keeps chrome and android untouched by the firefox exceptions", () => {
      for (const target of ["chrome", "android"]) {
        vi.stubEnv("BDS_TARGET", target);
        const defaults = readComposerDefaults();
        expect(defaults.attachItems.showVoice).toBe(true);
        expect(defaults.attachItems.showLiveMode).toBe(true);
      }
      vi.unstubAllEnvs();
    });

    it("falls back to the shared keys for a target with no branch", () => {
      // A future/unrecognised target must not resolve to "everything hidden".
      vi.stubEnv("BDS_TARGET", "opera");
      const defaults = readComposerDefaults();
      expect(defaults.attachMenu).toBe(true);
      expect(defaults.attachItems.showVoice).toBe(true);
      vi.unstubAllEnvs();
    });

    it("ignores a branch that is not a plain object", () => {
      vi.stubEnv("BDS_TARGET", "firefox");
      applyComposerDefaults({});
      remoteConfig.applyRemote({
        features: { composerButtons: { targets: { firefox: null } } },
      });
      // Null branch → shared keys, not a crash and not all-false.
      expect(readComposerDefaults().attachItems.showVoice).toBe(true);
      vi.unstubAllEnvs();
    });
  });

  describe("target branch integrity", () => {
    it("gives every built-in branch a complete key set", () => {
      const branches = DEFAULT_REMOTE_CONFIG.features.composerButtons.targets;
      expect(Object.keys(branches).sort()).toEqual([...TARGET_KEYS].sort());
      for (const target of TARGET_KEYS) {
        const branch = branches[target];
        for (const key of ["attachMenu", "deepResearch", "deepCode"]) {
          expect(typeof branch[key]).toBe("boolean");
        }
        // A branch replaces the shared keys entirely, so a missing item would
        // silently hide a button on that target only.
        expect(Object.keys(branch.attachItems).sort()).toEqual([...ATTACH_ITEM_KEYS].sort());
        expect(Object.values(branch.attachItems).every((v) => typeof v === "boolean")).toBe(true);
      }
    });

    it("keeps extension/remote-config.json in step with the built-in branches", () => {
      const json = JSON.parse(
        readFileSync(
          resolve(dirname(fileURLToPath(import.meta.url)), "../../extension/remote-config.json"),
          "utf8",
        ),
      );
      const shipped = json.features.composerButtons;
      const builtin = DEFAULT_REMOTE_CONFIG.features.composerButtons;

      // Same branch names and same key sets (values may differ intentionally,
      // e.g. deepCode ships off in remote config but on in the built-in).
      expect(Object.keys(shipped.targets).sort()).toEqual(Object.keys(builtin.targets).sort());
      expect(Object.keys(shipped.attachItems).sort()).toEqual(Object.keys(builtin.attachItems).sort());
      for (const target of TARGET_KEYS) {
        expect(Object.keys(shipped.targets[target]).sort())
          .toEqual(Object.keys(builtin.targets[target]).sort());
        expect(Object.keys(shipped.targets[target].attachItems).sort())
          .toEqual([...ATTACH_ITEM_KEYS].sort());
      }

      // The Firefox exception is the reason this layer exists — pin it.
      expect(shipped.targets.firefox.attachItems.showVoice).toBe(false);
      expect(shipped.targets.firefox.attachItems.showLiveMode).toBe(false);
      expect(shipped.targets.chrome.attachItems.showVoice).toBe(true);
      expect(shipped.targets.android.attachItems.showLiveMode).toBe(true);
    });
  });

  describe("resolveComposerVisibility", () => {
    it("resolves settings overrides against the live remote defaults", () => {
      applyComposerDefaults({ attachMenu: false, deepResearch: false });
      const vis = resolveComposerVisibility({
        composerVisibility: normalizeComposerVisibility({
          deepResearch: true,
        }),
      });
      expect(vis.attachMenu).toBe(false); // follows remote
      expect(vis.deepResearch).toBe(true); // user override wins
    });

    it("keeps a user override stable when remote config changes underneath it", () => {
      // Remote default: DeepCode hidden.
      applyComposerDefaults({ deepCode: false });
      const settings = {
        composerVisibility: normalizeComposerVisibility({ deepCode: true }),
      };
      expect(resolveComposerVisibility(settings).deepCode).toBe(true);

      // Remote flips on, then back off — the override holds throughout.
      applyComposerDefaults({ deepCode: true });
      expect(resolveComposerVisibility(settings).deepCode).toBe(true);
      applyComposerDefaults({ deepCode: false });
      expect(resolveComposerVisibility(settings).deepCode).toBe(true);
    });

    it("follows remote config when the override is null", () => {
      applyComposerDefaults({ deepCode: false });
      const vis = resolveComposerVisibility({
        composerVisibility: normalizeComposerVisibility({ deepCode: null }),
      });
      expect(vis.deepCode).toBe(false);
    });
  });

  describe("isOverridden", () => {
    it("reports which paths carry an explicit override", () => {
      const ov = normalizeComposerVisibility({
        attachMenu: false,
        attachItems: { showWeb: true },
      });
      expect(isOverridden(ov, "attachMenu")).toBe(true);
      expect(isOverridden(ov, "attachItems.showWeb")).toBe(true);
      expect(isOverridden(ov, "deepCode")).toBe(false);
      expect(isOverridden(ov, "attachItems.showGithub")).toBe(false);
    });

    it("does not mutate the override object it inspects", () => {
      const ov = normalizeComposerVisibility(undefined);
      isOverridden(ov, "attachMenu");
      expect(ov.attachMenu).toBe(null);
    });
  });
});
