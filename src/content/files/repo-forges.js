/**
 * Repository forge registry.
 *
 * The Attach Menu's "Other" submenu is data-driven from this list so adding a
 * forge means adding a reader + one entry here, not another hand-written dialog.
 * Each entry must resolve to a keyless endpoint (see `repo-hosts.js`) — either
 * a bulk archive or, for forges without one, a tree + raw-file API walk.
 */

import { fetchGitLabRepo } from "./gitlab-reader.js";
import { fetchCodebergRepo } from "./codeberg-reader.js";
import { fetchHuggingFaceRepo } from "./huggingface-reader.js";

/**
 * i18n keys deliberately live in this file rather than being inlined, so the
 * UI can render every forge label without importing locale state.
 */
export const REPO_FORGES = Object.freeze([
  {
    key: "gitlab",
    labelKey: "attachMenu.forgeGitLab",
    placeholderKey: "attachMenu.gitlabPlaceholder",
    invalidKey: "attachMenu.invalidGitlabUrl",
    failedKey: "attachMenu.repoFailed",
    fetch: fetchGitLabRepo,
  },
  {
    key: "codeberg",
    labelKey: "attachMenu.forgeCodeberg",
    placeholderKey: "attachMenu.codebergPlaceholder",
    invalidKey: "attachMenu.invalidCodebergUrl",
    failedKey: "attachMenu.repoFailed",
    fetch: fetchCodebergRepo,
  },
  {
    key: "huggingface",
    labelKey: "attachMenu.forgeHuggingFace",
    placeholderKey: "attachMenu.huggingfacePlaceholder",
    invalidKey: "attachMenu.invalidHuggingfaceUrl",
    failedKey: "attachMenu.repoFailed",
    fetch: fetchHuggingFaceRepo,
  },
]);

/** Look up a forge descriptor by its key. */
export function getRepoForge(key) {
  return REPO_FORGES.find((forge) => forge.key === key) || null;
}

/**
 * Resolve a pasted URL to one of the registered forges by hostname.
 * Returns null when nothing matches (caller decides how to fail).
 */
export function resolveRepoForgeKey(url) {
  let hostname;
  try {
    hostname = new URL(String(url || "").trim()).hostname.toLowerCase();
  } catch {
    return null;
  }

  if (hostname === "gitlab.com") return "gitlab";
  if (hostname === "codeberg.org") return "codeberg";
  if (hostname === "huggingface.co" || hostname === "hf.co") return "huggingface";
  return null;
}

/** Human-readable expected URL shape for a forge, used in error toasts. */
export function describeRepoForgeUrl(key) {
  if (key === "gitlab") return "https://gitlab.com/namespace/project";
  if (key === "codeberg") return "https://codeberg.org/owner/repo";
  if (key === "huggingface") return "https://huggingface.co/owner/model";
  return "https://example.com/owner/repo";
}

/**
 * True when the input is a forge *shorthand* rather than a URL: at least
 * `owner/repo`, no scheme, and no dot in the first segment.
 *
 * ⚠️ The dot rule is load-bearing. `gitlab.com/a/b` carries no scheme, but it is
 * meant as a host — and every reader's shorthand branch would happily read
 * `gitlab.com` as the namespace and import the wrong thing. Such input is not
 * shorthand, so the caller refuses it instead.
 *
 * Note that a shorthand cannot name a forge: `owner/repo` is valid for all of
 * them, so the caller resolves it against the dialog the user already opened.
 *
 * @param {string} input
 */
export function isRepoShorthand(input) {
  const trimmed = String(input || "").trim();
  if (!trimmed) return false;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return false; // explicit scheme

  const parts = trimmed.replace(/\.git$/, "").split("/").filter(Boolean);
  if (parts.length < 2) return false;
  if (parts[0].includes(".")) return false; // a bare hostname, not a namespace
  return true;
}
