/**
 * Request coalescing and short-lived caching for MCP `tools/list` discovery.
 *
 * `discoverMcpToolSchemas()` is reachable from ~50 `pushConfigToPage()` call
 * sites, and on the settings screen a single user action reaches it several
 * times: `testMcpServer` lists tools directly, then runs discovery, then calls
 * `pushConfigToPage()` which discovers a third time. Each discovery issues one
 * `tools/list` round trip per enabled server, so one click could hit a server
 * three times with byte-identical requests.
 *
 * Two independent mechanisms address this:
 *
 *   - **In-flight coalescing** — concurrent callers share one promise. This is
 *     always safe: nothing observable changes between them.
 *   - **A TTL cache** — completed results are reused for `ttlMs`. This trades
 *     freshness for latency, so the window is kept short and callers that
 *     represent an explicit user intent pass `force` to bypass it.
 *
 * The cache is keyed by the exact set of enabled servers *and* their
 * credentials, so adding, removing, editing or toggling a server invalidates
 * it with no explicit bookkeeping.
 *
 * This module holds policy only — no network, no `chrome.*`, no DOM — so it
 * can be exercised directly in unit tests.
 */

/** How long a completed discovery result may be reused. */
export const MCP_DISCOVERY_TTL_MS = 5 * 60 * 1000;

/** @type {{ key: string, promise: Promise<any>, at: number|null } | null} */
let entry = null;

/**
 * Derive a cache key from the servers that will be queried.
 *
 * Order-independent, and uses control characters as separators so that no
 * combination of URL and API key can collide with another. An empty list
 * yields an empty string.
 *
 * @param {Array<{serverUrl?: string, apiKey?: string}>} servers
 * @returns {string}
 */
export function mcpDiscoveryKey(servers) {
  if (!Array.isArray(servers) || servers.length === 0) return "";
  return servers
    .map((server) => `${server?.serverUrl || ""}\u0000${server?.apiKey || ""}`)
    .sort()
    .join("\u0001");
}

/**
 * Return a cached discovery promise for `key`, or run `factory` and cache it.
 *
 * @template T
 * @param {string} key            Cache key, normally from `mcpDiscoveryKey()`.
 * @param {() => Promise<T>} factory  Produces the value on a miss.
 * @param {object} [options]
 * @param {boolean} [options.force]  Bypass both the TTL and any in-flight
 *   request. Use for explicit user actions that should really hit the network.
 * @param {number}  [options.ttlMs]  Reuse window. `0` keeps coalescing but
 *   disables reuse of completed results.
 * @param {() => number} [options.now]  Injectable clock, for tests. Used both
 *   to read the age of an entry and to stamp a completed one.
 * @returns {Promise<T>}
 */
export function coalesceMcpDiscovery(key, factory, options = {}) {
  const {
    force = false,
    ttlMs = MCP_DISCOVERY_TTL_MS,
    now = Date.now,
  } = options;

  const current = entry;
  if (current && current.key === key && !force) {
    // `at === null` means the request is still in flight — join it regardless
    // of the TTL so a burst of callers shares a single round trip.
    if (current.at === null || now() - current.at < ttlMs) {
      return current.promise;
    }
  }

  const record = { key, at: null, promise: null };
  record.promise = Promise.resolve()
    .then(factory)
    .then(
      (value) => {
        // Stamp completion rather than dispatch, so a slow request does not
        // spend its own latency out of the reuse window.
        if (entry === record) record.at = now();
        return value;
      },
      (error) => {
        // Never cache a rejection — the next caller must be able to retry.
        if (entry === record) entry = null;
        throw error;
      }
    );

  entry = record;
  return record.promise;
}

/**
 * Drop the cached entry, but only when it belongs to `key`. Evicting a
 * mismatched entry would discard work another caller just completed.
 *
 * @param {string} key
 */
export function evictMcpDiscovery(key) {
  if (entry && entry.key === key) entry = null;
}

/** Drop any cached entry. */
export function resetMcpDiscoveryCache() {
  entry = null;
}
