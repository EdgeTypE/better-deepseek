// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { parseBdsMessage } from "./index.js";

describe("parseBdsMessage - MCP tags", () => {
  it("parses a valid <BDS:AUTO:MCP> tag with closing tag and JSON args", () => {
    const result = parseBdsMessage(
      '<BDS:AUTO:MCP url="https://mcp.example.com" tool="fetch_data" args=\'{"id":42}\'></BDS:AUTO:MCP>',
    );
    expect(result.autoRequests.mcpCalls).toEqual([
      { serverUrl: "https://mcp.example.com", toolName: "fetch_data", args: { id: 42 } },
    ]);
  });

  it("uses attrs.toolName if attrs.tool is absent", () => {
    const result = parseBdsMessage(
      '<BDS:AUTO:MCP url="https://mcp.example.com" toolName="query_db" args=\'{"q":"test"}\'></BDS:AUTO:MCP>',
    );
    expect(result.autoRequests.mcpCalls).toEqual([
      { serverUrl: "https://mcp.example.com", toolName: "query_db", args: { q: "test" } },
    ]);
  });

  it("uses attrs.serverUrl if attrs.url is absent", () => {
    const result = parseBdsMessage(
      '<BDS:AUTO:MCP serverUrl="https://other.example.com" tool="list" args=\'{"x":1}\'></BDS:AUTO:MCP>',
    );
    expect(result.autoRequests.mcpCalls).toEqual([
      { serverUrl: "https://other.example.com", toolName: "list", args: { x: 1 } },
    ]);
  });

  it("falls back to { _raw } when args JSON is malformed", () => {
    const result = parseBdsMessage(
      '<BDS:AUTO:MCP url="https://mcp.example.com" tool="bad_args" args=\'{invalid json}\'></BDS:AUTO:MCP>',
    );
    expect(result.autoRequests.mcpCalls).toHaveLength(1);
    expect(result.autoRequests.mcpCalls[0].serverUrl).toBe("https://mcp.example.com");
    expect(result.autoRequests.mcpCalls[0].toolName).toBe("bad_args");
    expect(result.autoRequests.mcpCalls[0].args).toEqual({ _raw: "{invalid json}" });
  });

  it("skips tag when url attribute is missing", () => {
    const result = parseBdsMessage(
      '<BDS:AUTO:MCP tool="fetch_data" args=\'{"id":1}\'></BDS:AUTO:MCP>',
    );
    expect(result.autoRequests.mcpCalls).toHaveLength(0);
  });

  it("skips tag when tool attribute is missing", () => {
    const result = parseBdsMessage(
      '<BDS:AUTO:MCP url="https://mcp.example.com" args=\'{"id":1}\'></BDS:AUTO:MCP>',
    );
    expect(result.autoRequests.mcpCalls).toHaveLength(0);
  });

  it("skips tag when both url and tool are missing", () => {
    const result = parseBdsMessage(
      '<BDS:AUTO:MCP args=\'{"id":1}\'></BDS:AUTO:MCP>',
    );
    expect(result.autoRequests.mcpCalls).toHaveLength(0);
  });

  it("ignores tag inside a fenced code block", () => {
    const text = '```\n<BDS:AUTO:MCP url="https://mcp.example.com" tool="list" args=\'{"x":1}\'></BDS:AUTO:MCP>\n```';
    const result = parseBdsMessage(text);
    expect(result.autoRequests.mcpCalls).toHaveLength(0);
  });

  it("ignores tag inside inline code", () => {
    const text = '`<BDS:AUTO:MCP url="https://mcp.example.com" tool="list" args=\'{"x":1}\'></BDS:AUTO:MCP>`';
    const result = parseBdsMessage(text);
    expect(result.autoRequests.mcpCalls).toHaveLength(0);
  });

  it("extracts args from tag body when args attribute is absent", () => {
    const result = parseBdsMessage(
      '<BDS:AUTO:MCP url="https://mcp.example.com" tool="body_args">{"key":"from_body"}</BDS:AUTO:MCP>',
    );
    expect(result.autoRequests.mcpCalls).toHaveLength(1);
    expect(result.autoRequests.mcpCalls[0].args).toEqual({ key: "from_body" });
  });

  it("parses multiple MCP tags in one message", () => {
    const text =
      '<BDS:AUTO:MCP url="https://s1.example.com" tool="t1" args=\'{"a":1}\'></BDS:AUTO:MCP>' +
      '\n' +
      '<BDS:AUTO:MCP url="https://s2.example.com" tool="t2" args=\'{"b":2}\'></BDS:AUTO:MCP>';
    const result = parseBdsMessage(text);
    expect(result.autoRequests.mcpCalls).toHaveLength(2);
    expect(result.autoRequests.mcpCalls[0].serverUrl).toBe("https://s1.example.com");
    expect(result.autoRequests.mcpCalls[1].serverUrl).toBe("https://s2.example.com");
  });
});