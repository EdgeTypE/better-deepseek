import { describe, expect, it } from "vitest";
import {
  parseMemoryWrite,
  sanitizeMemoryImportance,
  sanitizeMemoryKey,
} from "./memory-parser.js";

describe("parseMemoryWrite", () => {
  it("parses attribute-based memory writes", () => {
    expect(
      parseMemoryWrite("", {
        key_name: "User Name",
        value: "Alex",
        importance: "always",
      }),
    ).toEqual({
      key: "username",
      value: "Alex",
      importance: "always",
    });
  });

  it("parses explicit key/value content", () => {
    expect(
      parseMemoryWrite('key: "favorite_tool", value: "Visualizer", importance: always'),
    ).toEqual({
      key: "favorite_tool",
      value: "Visualizer",
      importance: "always",
    });
  });

  it("parses simple key_name content", () => {
    expect(parseMemoryWrite("timezone: Asia/Singapore, importance: called")).toEqual({
      key: "timezone",
      value: "Asia/Singapore",
      importance: "called",
    });
  });

  it("returns null for invalid content", () => {
    expect(parseMemoryWrite("")).toBeNull();
    expect(parseMemoryWrite("just some text")).toBeNull();
  });
});

describe("memory sanitizers", () => {
  it("sanitizes keys", () => {
    expect(sanitizeMemoryKey(" User Name! ")).toBe("username");
  });

  it("normalizes importance", () => {
    expect(sanitizeMemoryImportance("always")).toBe("always");
    expect(sanitizeMemoryImportance("other")).toBe("called");
  });
});
