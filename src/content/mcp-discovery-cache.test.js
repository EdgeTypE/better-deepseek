import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  MCP_DISCOVERY_TTL_MS,
  coalesceMcpDiscovery,
  evictMcpDiscovery,
  mcpDiscoveryKey,
  resetMcpDiscoveryCache,
} from "./mcp-discovery-cache.js";

/** Manually advanced clock, injected via the `now` option. */
function makeClock(start = 0) {
  let t = start;
  const clock = () => t;
  clock.advance = (ms) => {
    t += ms;
  };
  return clock;
}

describe("mcpDiscoveryKey", () => {
  it("returns an empty string for an empty or missing list", () => {
    expect(mcpDiscoveryKey([])).toBe("");
    expect(mcpDiscoveryKey(undefined)).toBe("");
    expect(mcpDiscoveryKey(null)).toBe("");
  });

  it("is independent of server order", () => {
    const a = [{ serverUrl: "https://a", apiKey: "k1" }];
    const b = [{ serverUrl: "https://b", apiKey: "k2" }];
    expect(mcpDiscoveryKey([...a, ...b])).toBe(mcpDiscoveryKey([...b, ...a]));
  });

  it("changes when a server URL changes", () => {
    expect(mcpDiscoveryKey([{ serverUrl: "https://a" }]))
      .not.toBe(mcpDiscoveryKey([{ serverUrl: "https://b" }]));
  });

  it("changes when only the API key changes", () => {
    expect(mcpDiscoveryKey([{ serverUrl: "https://a", apiKey: "k1" }]))
      .not.toBe(mcpDiscoveryKey([{ serverUrl: "https://a", apiKey: "k2" }]));
  });

  it("does not let a URL and API key boundary collide", () => {
    // Without a separator these would both flatten to "a\u0000b".
    const split = mcpDiscoveryKey([{ serverUrl: "a", apiKey: "b" }]);
    const merged = mcpDiscoveryKey([{ serverUrl: "a\u0000b", apiKey: "" }]);
    expect(split).not.toBe(merged);
  });

  it("tolerates servers with missing fields", () => {
    expect(() => mcpDiscoveryKey([{}, { serverUrl: "https://a" }])).not.toThrow();
    expect(mcpDiscoveryKey([{}])).not.toBe(mcpDiscoveryKey([{ serverUrl: "https://a" }]));
  });
});

describe("coalesceMcpDiscovery", () => {
  beforeEach(() => {
    resetMcpDiscoveryCache();
  });

  it("runs the factory on a miss and resolves with its value", async () => {
    const factory = vi.fn(async () => ["t1"]);
    await expect(coalesceMcpDiscovery("k", factory)).resolves.toEqual(["t1"]);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("reuses a completed result within the TTL", async () => {
    const clock = makeClock();
    const factory = vi.fn(async () => ["t1"]);

    await coalesceMcpDiscovery("k", factory, { ttlMs: 1000, now: clock });
    clock.advance(999);
    await coalesceMcpDiscovery("k", factory, { ttlMs: 1000, now: clock });

    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("re-runs the factory once the TTL has elapsed", async () => {
    const clock = makeClock();
    const factory = vi.fn(async () => ["t1"]);

    await coalesceMcpDiscovery("k", factory, { ttlMs: 1000, now: clock });
    clock.advance(1000);
    await coalesceMcpDiscovery("k", factory, { ttlMs: 1000, now: clock });

    expect(factory).toHaveBeenCalledTimes(2);
  });

  it("treats a different key as a miss", async () => {
    const factory = vi.fn(async () => ["t1"]);

    await coalesceMcpDiscovery("k1", factory);
    await coalesceMcpDiscovery("k2", factory);

    expect(factory).toHaveBeenCalledTimes(2);
  });

  it("stamps completion rather than dispatch", async () => {
    const clock = makeClock();
    const factory = vi.fn(async () => {
      clock.advance(1000); // a slow request
      return ["t1"];
    });

    await coalesceMcpDiscovery("k", factory, { ttlMs: 5000, now: clock });
    clock.advance(4500); // t=5500: 5500 since dispatch, but only 4500 since completion
    await coalesceMcpDiscovery("k", factory, { ttlMs: 5000, now: clock });

    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("returns the identical promise to concurrent callers", async () => {
    const factory = vi.fn(async () => ["t1"]);

    const first = coalesceMcpDiscovery("k", factory);
    const second = coalesceMcpDiscovery("k", factory);

    expect(second).toBe(first);
    await expect(first).resolves.toEqual(["t1"]);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("shares one round trip across a burst of synchronous callers", async () => {
    const factory = vi.fn(async () => ["t1"]);

    const all = await Promise.all([
      coalesceMcpDiscovery("k", factory),
      coalesceMcpDiscovery("k", factory),
      coalesceMcpDiscovery("k", factory),
    ]);

    expect(all).toEqual([["t1"], ["t1"], ["t1"]]);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("bypasses a fresh entry when force is set", async () => {
    const factory = vi.fn(async () => ["t1"]);

    await coalesceMcpDiscovery("k", factory);
    await coalesceMcpDiscovery("k", factory, { force: true });

    expect(factory).toHaveBeenCalledTimes(2);
  });

  it("bypasses an in-flight request when force is set", async () => {
    const factory = vi.fn(async () => ["t1"]);

    const first = coalesceMcpDiscovery("k", factory);
    const forced = coalesceMcpDiscovery("k", factory, { force: true });

    expect(forced).not.toBe(first);
    await Promise.all([first, forced]);
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it("keeps coalescing but drops reuse when ttlMs is 0", async () => {
    const clock = makeClock();
    const factory = vi.fn(async () => ["t1"]);

    const burst = [coalesceMcpDiscovery("k", factory, { ttlMs: 0, now: clock })];
    burst.push(coalesceMcpDiscovery("k", factory, { ttlMs: 0, now: clock }));
    await Promise.all(burst);
    expect(factory).toHaveBeenCalledTimes(1);

    await coalesceMcpDiscovery("k", factory, { ttlMs: 0, now: clock });
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it("does not cache a rejection, so the next call retries", async () => {
    const factory = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(["t1"]);

    await expect(coalesceMcpDiscovery("k", factory)).rejects.toThrow("boom");
    await expect(coalesceMcpDiscovery("k", factory)).resolves.toEqual(["t1"]);
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it("propagates a rejection to every joiner", async () => {
    const factory = vi.fn(async () => {
      throw new Error("boom");
    });

    const first = coalesceMcpDiscovery("k", factory);
    const second = coalesceMcpDiscovery("k", factory);

    await expect(first).rejects.toThrow("boom");
    await expect(second).rejects.toThrow("boom");
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("exposes a five minute default TTL", () => {
    expect(MCP_DISCOVERY_TTL_MS).toBe(300_000);
  });
});

describe("evictMcpDiscovery", () => {
  beforeEach(() => {
    resetMcpDiscoveryCache();
  });

  it("drops a matching entry so the next call re-runs the factory", async () => {
    const factory = vi.fn(async () => ["t1"]);

    await coalesceMcpDiscovery("k", factory);
    evictMcpDiscovery("k");
    await coalesceMcpDiscovery("k", factory);

    expect(factory).toHaveBeenCalledTimes(2);
  });

  it("leaves a non-matching entry intact", async () => {
    const factory = vi.fn(async () => ["t1"]);

    await coalesceMcpDiscovery("k", factory);
    evictMcpDiscovery("other");
    await coalesceMcpDiscovery("k", factory);

    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("is a no-op when nothing is cached", () => {
    expect(() => evictMcpDiscovery("k")).not.toThrow();
  });

  it("evicts an in-flight entry", async () => {
    const factory = vi.fn(async () => ["t1"]);

    const first = coalesceMcpDiscovery("k", factory);
    evictMcpDiscovery("k");
    const second = coalesceMcpDiscovery("k", factory);

    expect(second).not.toBe(first);
    await Promise.all([first, second]);
    expect(factory).toHaveBeenCalledTimes(2);
  });
});

describe("resetMcpDiscoveryCache", () => {
  beforeEach(() => {
    resetMcpDiscoveryCache();
  });

  it("clears any cached entry", async () => {
    const factory = vi.fn(async () => ["t1"]);

    await coalesceMcpDiscovery("k", factory);
    resetMcpDiscoveryCache();
    await coalesceMcpDiscovery("k", factory);

    expect(factory).toHaveBeenCalledTimes(2);
  });
});
