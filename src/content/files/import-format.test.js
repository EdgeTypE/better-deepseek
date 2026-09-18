import { describe, expect, it } from "vitest";

import {
  IMPORT_FORMAT,
  detectImportFormat,
  parseJsonDocument,
} from "./import-format.js";

describe("parseJsonDocument", () => {
  it("parses objects and arrays", () => {
    expect(parseJsonDocument('{"a":1}')).toEqual({ a: 1 });
    expect(parseJsonDocument("[1,2]")).toEqual([1, 2]);
    expect(parseJsonDocument('  \n {"a":1} \n ')).toEqual({ a: 1 });
  });

  it("rejects markdown bodies", () => {
    expect(parseJsonDocument("# Heading\n\nSome prose.")).toBeNull();
    expect(parseJsonDocument("")).toBeNull();
    expect(parseJsonDocument(undefined)).toBeNull();
  });

  it("rejects scalars so a bare word is not mistaken for a backup", () => {
    expect(parseJsonDocument('"just a string"')).toBeNull();
    expect(parseJsonDocument("42")).toBeNull();
    expect(parseJsonDocument("null")).toBeNull();
  });

  it("rejects truncated JSON", () => {
    expect(parseJsonDocument('{"a":')).toBeNull();
  });
});

describe("detectImportFormat", () => {
  it("detects a JSON backup by content even when the name says markdown", () => {
    expect(detectImportFormat("bds_skills.md", '{"name":"x"}')).toBe(
      IMPORT_FORMAT.JSON,
    );
  });

  it("detects markdown by extension", () => {
    expect(detectImportFormat("persona.md", "# Persona\n\nBody")).toBe(
      IMPORT_FORMAT.MARKDOWN,
    );
    expect(detectImportFormat("persona.MARKDOWN", "Body")).toBe(
      IMPORT_FORMAT.MARKDOWN,
    );
  });

  it("detects JSON by extension", () => {
    expect(detectImportFormat("bds_memories.json", "{}")).toBe(
      IMPORT_FORMAT.JSON,
    );
  });

  it("still reports JSON for a .json name whose body is not JSON", () => {
    expect(detectImportFormat("broken.json", "not json at all")).toBe(
      IMPORT_FORMAT.JSON,
    );
  });

  it("rejects extensions it does not handle", () => {
    expect(detectImportFormat("notes.txt", "hello")).toBe(
      IMPORT_FORMAT.UNSUPPORTED,
    );
    expect(detectImportFormat("archive.zip", "PK")).toBe(
      IMPORT_FORMAT.UNSUPPORTED,
    );
  });
});
