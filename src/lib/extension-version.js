/**
 * Resolve the version string this client reports to third parties.
 *
 * The MCP `initialize` handshake carries `clientInfo.version`. That value used
 * to be a literal in the source, which meant it silently drifted on every
 * release and only stayed correct by luck.
 *
 * Resolution order:
 *   1. `chrome.runtime.getManifest()` — authoritative in a live extension, and
 *      bumped by the store on every release, so it cannot go stale.
 *   2. `__BDS_VERSION__` — build-time constant injected by build.js from
 *      package.json. Covers contexts with no extension manifest at all, most
 *      notably the Android WebView shell whose `chrome.*` polyfill implements
 *      only storage/runtime messaging and has no `getManifest`.
 *   3. `"0.0.0"` — an honest "unknown" rather than a version number that used
 *      to be correct. Unit tests and un-bundled execution land here.
 *
 * Keeping package.json as the single source of truth means a release only has
 * to bump it; build.js propagates the value into every bundle.
 */

/** Reported when no manifest and no build-time constant are reachable. */
export const UNKNOWN_EXTENSION_VERSION = "0.0.0";

/**
 * @returns {string} the extension version, or `UNKNOWN_EXTENSION_VERSION`.
 */
export function getExtensionVersion() {
  try {
    const version = globalThis.chrome?.runtime?.getManifest?.()?.version;
    if (typeof version === "string" && version.trim()) return version.trim();
  } catch {
    // getManifest() throws when called outside an extension context.
  }

  // `typeof` on a bare identifier is safe even when it is never declared, so
  // this stays valid in Vitest where build.js has not run.
  if (typeof __BDS_VERSION__ === "string" && __BDS_VERSION__.trim()) {
    return __BDS_VERSION__.trim();
  }

  return UNKNOWN_EXTENSION_VERSION;
}
