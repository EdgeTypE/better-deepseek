// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("youtube-transcript", () => ({
  fetchTranscript: vi.fn(),
}));

import {
  mcpFetch,
  mcpEnsureInitialized,
  mcpJsonRpcRequest,
  listMcpTools,
  mcpCallTool,
  mcpClearInit,
  MCP_REQUEST_TIMEOUT_MS,
} from "../../src/background/index.js";

function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      ...headers,
    },
  });
}

function sseResponse(events, status = 200, headers = {}) {
  const text = events
    .map((e) => (e === "[DONE]" ? "data: [DONE]" : `data: ${JSON.stringify(e)}`))
    .join("\n") + "\n";
  return new Response(text, {
    status,
    headers: {
      "content-type": "text/event-stream",
      ...headers,
    },
  });
}

describe("mcpFetch", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = vi.fn();
  });

  it("parses JSON response and returns result with null sessionId", async () => {
    fetch.mockImplementation(() => jsonResponse({ jsonrpc: "2.0", result: { tools: ["t1"] } }));
    const { result, sessionId } = await mcpFetch("https://mcp.example.com", {
      jsonrpc: "2.0", method: "tools/list",
    }, "sk-test");
    expect(result).toEqual({ tools: ["t1"] });
    expect(sessionId).toBeNull();
  });

  it("sends only Authorization: Bearer header (no x-api-key)", async () => {
    fetch.mockImplementation(() => jsonResponse({ jsonrpc: "2.0", result: {} }));
    await mcpFetch("https://mcp.example.com", { jsonrpc: "2.0", method: "ping" }, "sk-test");
    const headers = fetch.mock.calls[0][1].headers;
    expect(headers["Authorization"]).toBe("Bearer sk-test");
    expect(headers["x-api-key"]).toBeUndefined();
  });

  it("parses SSE response and returns last result", async () => {
    fetch.mockImplementation(() => sseResponse([
      { jsonrpc: "2.0", id: 1, result: { progress: 0.5 } },
      { jsonrpc: "2.0", id: 1, result: { tools: ["a", "b"] } },
    ]));
    const { result } = await mcpFetch("https://mcp.example.com", {
      jsonrpc: "2.0", method: "tools/list",
    }, "");
    expect(result).toEqual({ tools: ["a", "b"] });
  });

  it("skips [DONE] events in SSE stream", async () => {
    fetch.mockImplementation(() => sseResponse([
      { jsonrpc: "2.0", id: 1, result: { content: "hello" } },
      "[DONE]",
    ]));
    const { result } = await mcpFetch("https://mcp.example.com", {
      jsonrpc: "2.0", method: "tools/call",
    }, "");
    expect(result).toEqual({ content: "hello" });
  });

  it("skips non-JSON SSE lines", async () => {
    fetch.mockImplementation(() => sseResponse([
      { jsonrpc: "2.0", id: 1, result: { done: true } },
    ]));
    const { result } = await mcpFetch("https://mcp.example.com", {
      jsonrpc: "2.0", method: "tools/call",
    }, "");
    expect(result).toEqual({ done: true });
  });

  it("throws on SSE error event", async () => {
    fetch.mockImplementation(() => sseResponse([
      { jsonrpc: "2.0", id: 1, error: { message: "Tool not found" } },
    ]));
    await expect(mcpFetch("https://mcp.example.com", {
      jsonrpc: "2.0", method: "tools/call",
    }, "")).rejects.toThrow("Tool not found");
  });

  it("throws on JSON-RPC error in JSON response", async () => {
    fetch.mockImplementation(() => jsonResponse({
      jsonrpc: "2.0", error: { message: "Method not found" },
    }));
    await expect(mcpFetch("https://mcp.example.com", {
      jsonrpc: "2.0", method: "bad_method",
    }, "")).rejects.toThrow("Method not found");
  });

  it("throws on non-2xx status", async () => {
    fetch.mockImplementation(() => new Response("Internal error", {
      status: 500,
      statusText: "Internal Server Error",
      headers: { "content-type": "text/plain" },
    }));
    await expect(mcpFetch("https://mcp.example.com", {
      jsonrpc: "2.0", method: "tools/list",
    }, "")).rejects.toThrow("MCP server returned 500: Internal error");
  });

  it("captures Mcp-Session-Id from response headers", async () => {
    fetch.mockImplementation(() => jsonResponse(
      { jsonrpc: "2.0", result: {} },
      200,
      { "Mcp-Session-Id": "sess_abc123" },
    ));
    const { sessionId } = await mcpFetch("https://mcp.example.com", {
      jsonrpc: "2.0", method: "tools/list",
    }, "");
    expect(sessionId).toBe("sess_abc123");
  });

  it("sends Mcp-Session-Id header when sessionId is provided", async () => {
    fetch.mockImplementation(() => jsonResponse({ jsonrpc: "2.0", result: {} }));
    await mcpFetch("https://mcp.example.com", { jsonrpc: "2.0", method: "tools/list" }, "", { sessionId: "sess_xyz" });
    const headers = fetch.mock.calls[0][1].headers;
    expect(headers["Mcp-Session-Id"]).toBe("sess_xyz");
  });

  it("rejects with timeout error when server does not respond", async () => {
    vi.useFakeTimers();
    fetch.mockImplementation((url, opts) => {
      return new Promise((resolve, reject) => {
        if (opts.signal) {
          opts.signal.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        }
      });
    });

    const mcpPromise = mcpFetch("https://slow.example.com", { jsonrpc: "2.0", method: "ping" }, "");
    vi.advanceTimersByTime(MCP_REQUEST_TIMEOUT_MS + 100);

    await expect(mcpPromise).rejects.toThrow("MCP server did not respond within 30s");
    vi.useRealTimers();
  });
});

describe("mcpEnsureInitialized and session lifecycle", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = vi.fn();
    mcpClearInit("https://mcp.example.com", "sk-test");
  });

  it("performs initialize handshake once per (url, apiKey)", async () => {
    fetch.mockImplementation(() => jsonResponse({ jsonrpc: "2.0", result: {} }));
    const r1 = await mcpEnsureInitialized("https://mcp.example.com", "sk-test");
    const r2 = await mcpEnsureInitialized("https://mcp.example.com", "sk-test");

    expect(fetch).toHaveBeenCalledTimes(2); // initialize + notifications/initialized
    expect(r1.sessionId).toBeNull();
    expect(r2.sessionId).toBeNull();
  });

  it("captures session ID from initialize and reuses it", async () => {
    const initResp = jsonResponse({ jsonrpc: "2.0", result: {} }, 200, { "Mcp-Session-Id": "sess_keep" });
    const notifResp = jsonResponse({ jsonrpc: "2.0", result: {} });
    fetch
      .mockImplementationOnce(() => initResp)
      .mockImplementationOnce(() => notifResp);

    const result = await mcpEnsureInitialized("https://mcp.example.com", "sk-test");
    expect(result.sessionId).toBe("sess_keep");

    const initCallHeaders = fetch.mock.calls[0][1].headers;
    expect(initCallHeaders["Mcp-Session-Id"]).toBeUndefined();
  });

  it("sends session ID on notifications/initialized", async () => {
    const initResp = jsonResponse({ jsonrpc: "2.0", result: {} }, 200, { "Mcp-Session-Id": "sess_keep" });
    const notifResp = jsonResponse({ jsonrpc: "2.0", result: {} });
    fetch
      .mockImplementationOnce(() => initResp)
      .mockImplementationOnce(() => notifResp);

    await mcpEnsureInitialized("https://mcp.example.com", "sk-test");
    await vi.waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    const notifHeaders = fetch.mock.calls[1][1].headers;
    expect(notifHeaders["Mcp-Session-Id"]).toBe("sess_keep");
  });

  it("clears cache and re-initializes on initialize failure", async () => {
    fetch
      .mockRejectedValueOnce(new Error("Connection refused"))
      .mockImplementation(() => jsonResponse({ jsonrpc: "2.0", result: {} }));

    await expect(mcpEnsureInitialized("https://mcp.example.com", "sk-test")).rejects.toThrow("Connection refused");
    const r2 = await mcpEnsureInitialized("https://mcp.example.com", "sk-test");
    expect(r2.sessionId).toBeNull();
    // 1 failed init + 1 successful init + 1 notification = 3
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});

describe("mcpJsonRpcRequest", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = vi.fn();
    mcpClearInit("https://mcp.example.com", "");
  });

  it("sends JSON-RPC request and returns result", async () => {
    fetch.mockImplementation(() => jsonResponse({ jsonrpc: "2.0", result: { content: ["ok"] } }));
    const result = await mcpJsonRpcRequest("https://mcp.example.com", "tools/call", { name: "test" }, "");
    expect(result).toEqual({ content: ["ok"] });
  });

  it("forwards session ID from initialization to the actual request", async () => {
    fetch
      .mockResolvedValueOnce(jsonResponse({ jsonrpc: "2.0", result: {} }, 200, { "Mcp-Session-Id": "sess_req" }))
      .mockResolvedValueOnce(jsonResponse({ jsonrpc: "2.0", result: {} }))
      .mockResolvedValueOnce(jsonResponse({ jsonrpc: "2.0", result: { tools: [] } }));

    const result = await mcpJsonRpcRequest("https://mcp.example.com", "tools/list", {}, "");
    expect(result).toEqual({ tools: [] });
    expect(fetch).toHaveBeenCalledTimes(3); // init + notif + list

    const listHeaders = fetch.mock.calls[2][1].headers;
    expect(listHeaders["Mcp-Session-Id"]).toBe("sess_req");
  });
});

describe("listMcpTools and mcpCallTool - session expiry retry", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = vi.fn();
    mcpClearInit("https://mcp.example.com", "");
  });

  it("listMcpTools retries on 404 by re-initializing", async () => {
    const init1 = jsonResponse({ jsonrpc: "2.0", result: {} }, 200, { "Mcp-Session-Id": "sess_exp" });
    const notif1 = jsonResponse({ jsonrpc: "2.0", result: {} });
    const errResp = new Response("Session not found", { status: 404 });
    const init2 = jsonResponse({ jsonrpc: "2.0", result: {} }, 200, { "Mcp-Session-Id": "sess_new" });
    const notif2 = jsonResponse({ jsonrpc: "2.0", result: {} });
    const listResp = jsonResponse({ jsonrpc: "2.0", result: { tools: ["retried"] } });
    fetch
      .mockImplementationOnce(() => init1)
      .mockImplementationOnce(() => notif1)
      .mockImplementationOnce(() => errResp)
      .mockImplementationOnce(() => init2)
      .mockImplementationOnce(() => notif2)
      .mockImplementationOnce(() => listResp);

    const tools = await listMcpTools("https://mcp.example.com", "");
    expect(tools).toEqual({ tools: ["retried"] });
    // 3 for first init + 3 for re-init + re-list = 6 total
    expect(fetch).toHaveBeenCalledTimes(6);
  });

  it("mcpCallTool retries on 400 by re-initializing", async () => {
    const init1 = jsonResponse({ jsonrpc: "2.0", result: {} });
    const notif1 = jsonResponse({ jsonrpc: "2.0", result: {} });
    const errResp = new Response("Bad session", { status: 400 });
    const init2 = jsonResponse({ jsonrpc: "2.0", result: {} });
    const notif2 = jsonResponse({ jsonrpc: "2.0", result: {} });
    const callResp = jsonResponse({ jsonrpc: "2.0", result: { content: ["retried"] } });
    fetch
      .mockImplementationOnce(() => init1)
      .mockImplementationOnce(() => notif1)
      .mockImplementationOnce(() => errResp)
      .mockImplementationOnce(() => init2)
      .mockImplementationOnce(() => notif2)
      .mockImplementationOnce(() => callResp);

    const result = await mcpCallTool("https://mcp.example.com", "test_tool", {}, "");
    expect(result).toEqual({ content: ["retried"] });
    expect(fetch).toHaveBeenCalledTimes(6);
  });

  it("does not swallow repeated failures after retry", async () => {
    const init1 = jsonResponse({ jsonrpc: "2.0", result: {} });
    const notif1 = jsonResponse({ jsonrpc: "2.0", result: {} });
    const errResp = new Response("Session expired", { status: 404 });
    const init2 = jsonResponse({ jsonrpc: "2.0", result: {} });
    const notif2 = jsonResponse({ jsonrpc: "2.0", result: {} });
    const errResp2 = new Response("Still expired", { status: 404 });
    fetch
      .mockImplementationOnce(() => init1)
      .mockImplementationOnce(() => notif1)
      .mockImplementationOnce(() => errResp)
      .mockImplementationOnce(() => init2)
      .mockImplementationOnce(() => notif2)
      .mockImplementationOnce(() => errResp2);

    await expect(listMcpTools("https://mcp.example.com", "")).rejects.toThrow();
  });
});