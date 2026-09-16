// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { parseBdsMessage } from "./index.js";

/**
 * Issue #149's second, more dangerous symptom.
 *
 * Besides the loud `{ _raw }` rejection, the reporter found operator sequences
 * being silently shortened — an arrow `->` losing its hyphen, so the extension
 * reported success while writing a syntactically invalid file. The cause was the
 * decoded attribute value going through a second HTML parse, and the stated
 * requirement was to decode it exactly once and insert it verbatim.
 *
 * These run through the whole pipeline and assert byte-exact recovery, not
 * substring presence. A second decode anywhere between the tag and the JSON body
 * shortens the value and fails here, which `toContain` assertions would miss.
 */
const OPERATOR_PAYLOADS = {
  "arrow (hyphen + greater-than)": "x -> y",
  "greater-or-equal": "a >= b",
  "less-or-equal": "a <= b",
  "logical and": "a && b",
  "fat arrow": "x => y",
  "markup": '<root><a b="1"/></root>',
  "comparison plus quote": 'if (a > b) { s = "hi" }',
  "ampersand entity text": "AT&amp;T",
  "all four delimiters at once": '<a b="1">x >= y && z</a>',
};

describe("issue #149 — operator sequences survive the full pipeline", () => {
  for (const [label, content] of Object.entries(OPERATOR_PAYLOADS)) {
    it(`preserves ${label}`, () => {
      const payload = JSON.stringify({ path: "a.txt", content });
      // Single-quoted attribute, so the JSON's own double quotes are payload.
      const message = `<BDS:AUTO:MCP url="fs" tool="write_file" args='${payload}'></BDS:AUTO:MCP>`;

      const call = parseBdsMessage(message).autoRequests.mcpCalls[0];

      expect(call.args).toEqual({ path: "a.txt", content });
      // Guards against a shortened-but-still-valid value, which is the trap the
      // reporter hit: `{"content":"x -> y"}` and `{"content":"x > y"}` both parse.
      expect(call.args.content).toHaveLength(content.length);
    });
  }

  it("survives the base64Args transport too", () => {
    const content = '<a b="1">x >= y && z</a>';
    const payload = JSON.stringify({ path: "a.txt", content });
    const encoded = Buffer.from(payload, "utf8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    const message = `<BDS:AUTO:MCP url="fs" tool="write_file" base64Args="${encoded}"></BDS:AUTO:MCP>`;

    expect(parseBdsMessage(message).autoRequests.mcpCalls[0].args).toEqual({
      path: "a.txt",
      content,
    });
  });
});
