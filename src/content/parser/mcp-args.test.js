import { describe, expect, it } from "vitest";
import { decodeBase64Args, resolveMcpArgs, scanMcpTags } from "./mcp-args.js";

const toUrlSafeBase64 = (text) =>
  Buffer.from(String(text), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

describe("scanMcpTags", () => {
  it("locates a plain tag and captures its attributes and body", () => {
    const tags = scanMcpTags(
      '<BDS:AUTO:MCP url="https://s.example.com" tool="t" args=\'{"a":1}\'></BDS:AUTO:MCP>',
    );

    expect(tags).toHaveLength(1);
    expect(tags[0].attrsRaw).toBe(' url="https://s.example.com" tool="t" args=\'{"a":1}\'');
    expect(tags[0].body).toBe("");
    expect(tags[0].index).toBe(0);
  });

  it("captures an apostrophe inside a single-quoted args value (issue #149)", () => {
    // The previous attribute regex refused to match this at all, so the whole
    // tool call vanished without a trace.
    const tags = scanMcpTags(
      `<BDS:AUTO:MCP url="fs" tool="write_file" args='{"path":"a.txt","content":"it's fine"}'></BDS:AUTO:MCP>`,
    );

    expect(tags).toHaveLength(1);
    expect(tags[0].attrsRaw).toContain(`"content":"it's fine"`);
  });

  it("captures a > inside an args value", () => {
    const tags = scanMcpTags(
      `<BDS:AUTO:MCP url="fs" tool="w" args='{"content":"if (a > b) { x => y }"}'></BDS:AUTO:MCP>`,
    );

    expect(tags).toHaveLength(1);
    expect(tags[0].attrsRaw).toContain(`"content":"if (a > b) { x => y }"`);
  });

  it("captures markup inside an args value", () => {
    const tags = scanMcpTags(
      `<BDS:AUTO:MCP url="fs" tool="w" args='{"content":"<root><a b=\\"1\\"/></root>"}'></BDS:AUTO:MCP>`,
    );

    expect(tags).toHaveLength(1);
    expect(tags[0].attrsRaw).toContain("<root>");
  });

  it("captures the tag body when there is no closing tag", () => {
    const tags = scanMcpTags('<BDS:AUTO:MCP url="s" tool="t" args=\'{"a":1}\'>');

    expect(tags).toHaveLength(1);
    expect(tags[0].body).toBe("");
    expect(tags[0].endIndex).toBeGreaterThan(0);
  });

  it("reads a JSON body", () => {
    const tags = scanMcpTags(
      '<BDS:AUTO:MCP url="s" tool="t">{"key":"from_body"}</BDS:AUTO:MCP>',
    );

    expect(tags[0].body).toBe('{"key":"from_body"}');
  });

  it("finds multiple tags in order", () => {
    const text =
      '<BDS:AUTO:MCP url="s1" tool="t1" args=\'{"a":1}\'></BDS:AUTO:MCP>\n' +
      '<BDS:AUTO:MCP url="s2" tool="t2" args=\'{"b":2}\'></BDS:AUTO:MCP>';
    const tags = scanMcpTags(text);

    expect(tags).toHaveLength(2);
    expect(tags[0].attrsRaw).toContain("s1");
    expect(tags[1].attrsRaw).toContain("s2");
    expect(tags[0].endIndex).toBeLessThanOrEqual(tags[1].index);
  });

  it("handles a tag with no attributes", () => {
    const tags = scanMcpTags("<BDS:AUTO:MCP></BDS:AUTO:MCP>");

    expect(tags).toHaveLength(1);
    expect(tags[0].attrsRaw).toBe("");
  });

  it("matches the tag name case-insensitively", () => {
    expect(scanMcpTags('<bds:auto:mcp url="s" tool="t"></bds:auto:mcp>')).toHaveLength(1);
  });

  it("returns nothing for an unterminated opening tag", () => {
    expect(scanMcpTags('<BDS:AUTO:MCP url="s')).toHaveLength(0);
  });

  it("returns nothing when the message has no MCP tag", () => {
    expect(scanMcpTags("just prose")).toHaveLength(0);
  });
});

describe("decodeBase64Args", () => {
  it("decodes URL-safe base64 without padding", () => {
    const encoded = toUrlSafeBase64('{"a":1}');
    expect(encoded).not.toContain("=");
    expect(decodeBase64Args(encoded)).toBe('{"a":1}');
  });

  it("decodes standard base64 with padding", () => {
    expect(decodeBase64Args("eyJhIjoxfQ==")).toBe('{"a":1}');
  });

  it("decodes UTF-8 payloads", () => {
    const payload = '{"content":"İstanbul — 中文 😀"}';
    expect(decodeBase64Args(toUrlSafeBase64(payload))).toBe(payload);
  });

  it("returns null for undecodable input", () => {
    expect(decodeBase64Args("!!!not base64!!!")).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(decodeBase64Args("")).toBeNull();
    expect(decodeBase64Args(undefined)).toBeNull();
  });
});

describe("resolveMcpArgs", () => {
  it("prefers base64Args over args", () => {
    const encoded = toUrlSafeBase64('{"from":"base64"}');
    expect(
      resolveMcpArgs({ args: '{"from":"args"}', base64Args: encoded }, ""),
    ).toEqual({ from: "base64" });
  });

  it("accepts the lowercase base64args spelling", () => {
    const encoded = toUrlSafeBase64('{"from":"base64"}');
    expect(resolveMcpArgs({ base64args: encoded }, "")).toEqual({ from: "base64" });
  });

  it("round-trips markup through base64Args verbatim", () => {
    const payload = '{"path":"a.xml","content":"<root><a b=\\"1\\"/></root>"}';
    expect(resolveMcpArgs({ base64Args: toUrlSafeBase64(payload) }, "")).toEqual({
      path: "a.xml",
      content: '<root><a b="1"/></root>',
    });
  });

  it("falls back to args when base64Args is undecodable", () => {
    expect(resolveMcpArgs({ base64Args: "!!!", args: '{"a":1}' }, "")).toEqual({ a: 1 });
  });

  it("parses a plain args attribute", () => {
    expect(resolveMcpArgs({ args: '{"a":1}' }, "")).toEqual({ a: 1 });
  });

  it("repairs a trailing comma instead of emitting _raw (issue #127)", () => {
    expect(resolveMcpArgs({ args: '{"path":"a.txt","content":"hi",}' }, "")).toEqual({
      path: "a.txt",
      content: "hi",
    });
  });

  it("parses the tag body when args is absent", () => {
    expect(resolveMcpArgs({}, '{"key":"from_body"}')).toEqual({ key: "from_body" });
  });

  it("returns {} when there is no payload at all", () => {
    expect(resolveMcpArgs({}, "")).toEqual({});
  });

  it("falls back to { _raw } only when nothing can be repaired", () => {
    expect(resolveMcpArgs({ args: "{invalid json}" }, "")).toEqual({
      _raw: "{invalid json}",
    });
  });

  it("does not accept a JSON array as an arguments object", () => {
    expect(resolveMcpArgs({ args: "[1,2,3]" }, "")).toEqual({ _raw: "[1,2,3]" });
  });
});
