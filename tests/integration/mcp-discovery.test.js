// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

import state from "../../src/content/state.js";
import { discoverMcpToolSchemas } from "../../src/content/bridge.js";
import { resetMcpDiscoveryCache } from "../../src/content/mcp-discovery-cache.js";

function server(id, serverUrl, extra = {}) {
  return {
    id,
    name: `server-${id}`,
    serverUrl,
    apiKey: "",
    enabled: true,
    tools: [],
    ...extra,
  };
}

/**
 * Answer every `bds-mcp-list-tools` request with one tool named after the
 * server, so results are distinguishable per server.
 */
function respondWithTools() {
  chrome.runtime.sendMessage.mockImplementation((message, callback) => {
    callback({
      ok: true,
      tools: [{ name: `tool_${message.serverUrl}`, description: "d", inputSchema: { type: "object" } }],
    });
  });
}

describe("discoverMcpToolSchemas request coalescing", () => {
  beforeEach(() => {
    resetMcpDiscoveryCache();
    state.mcpServers = [];
    state.mcpToolSchemas = [];
    vi.spyOn(console, "warn").mockImplementation(() => {});
    respondWithTools();
  });

  it("makes no round trips when no server is enabled", async () => {
    state.mcpServers = [server("1", "https://a", { enabled: false })];

    await expect(discoverMcpToolSchemas()).resolves.toEqual([]);
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
    expect(state.mcpToolSchemas).toEqual([]);
  });

  it("issues one request per enabled server", async () => {
    state.mcpServers = [server("1", "https://a"), server("2", "https://b")];

    await discoverMcpToolSchemas();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(2);
  });

  it("shares a single round trip across concurrent callers", async () => {
    // Mirrors testMcpServer -> discover -> pushConfigToPage firing in one tick.
    state.mcpServers = [server("1", "https://a")];

    await Promise.all([
      discoverMcpToolSchemas(),
      discoverMcpToolSchemas(),
      discoverMcpToolSchemas(),
    ]);

    expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);
  });

  it("reuses the result on a later sequential call", async () => {
    state.mcpServers = [server("1", "https://a")];

    await discoverMcpToolSchemas();
    await discoverMcpToolSchemas();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);
  });

  it("re-queries when force is set", async () => {
    state.mcpServers = [server("1", "https://a")];

    await discoverMcpToolSchemas();
    await discoverMcpToolSchemas({ force: true });

    expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(2);
  });

  it("re-queries when a server is added", async () => {
    state.mcpServers = [server("1", "https://a")];
    await discoverMcpToolSchemas();

    state.mcpServers = [server("1", "https://a"), server("2", "https://b")];
    await discoverMcpToolSchemas();

    // One for the first pass, then one per server on the second.
    expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(3);
  });

  it("re-queries when a server URL is edited", async () => {
    state.mcpServers = [server("1", "https://a")];
    await discoverMcpToolSchemas();

    state.mcpServers = [server("1", "https://a-moved")];
    await discoverMcpToolSchemas();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(2);
  });

  it("re-queries when only an API key changes", async () => {
    state.mcpServers = [server("1", "https://a")];
    await discoverMcpToolSchemas();

    state.mcpServers = [server("1", "https://a", { apiKey: "sk-new" })];
    await discoverMcpToolSchemas();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(2);
  });

  it("reuses the result when a server is merely renamed", async () => {
    state.mcpServers = [server("1", "https://a")];
    await discoverMcpToolSchemas();

    state.mcpServers = [server("1", "https://a", { name: "renamed" })];
    await discoverMcpToolSchemas();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);
  });

  it("does not cache a partial failure, so a recovered server is retried", async () => {
    state.mcpServers = [server("1", "https://up"), server("2", "https://down")];
    chrome.runtime.sendMessage.mockImplementation((message, callback) => {
      if (message.serverUrl === "https://down") callback({ ok: false, error: "unreachable" });
      else callback({ ok: true, tools: [{ name: "t1" }] });
    });

    await discoverMcpToolSchemas();
    await discoverMcpToolSchemas();

    // Two servers per pass, and the degraded first pass must not be reused.
    expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(4);
  });

  it("flattens tool lists into the schema shape payload-mutator expects", async () => {
    state.mcpServers = [server("1", "https://a")];

    const schemas = await discoverMcpToolSchemas();

    expect(schemas).toEqual([
      {
        serverName: "server-1",
        serverUrl: "https://a",
        toolName: "tool_https://a",
        description: "d",
        inputSchema: { type: "object" },
      },
    ]);
    expect(state.mcpToolSchemas).toEqual(schemas);
  });

  it("accepts a tools/list payload wrapped in a result object", async () => {
    state.mcpServers = [server("1", "https://a")];
    chrome.runtime.sendMessage.mockImplementation((message, callback) => {
      callback({ ok: true, tools: { tools: [{ name: "wrapped" }] } });
    });

    const schemas = await discoverMcpToolSchemas();

    expect(schemas.map((s) => s.toolName)).toEqual(["wrapped"]);
    expect(schemas[0].description).toBe("");
    expect(schemas[0].inputSchema).toEqual({});
  });
});
