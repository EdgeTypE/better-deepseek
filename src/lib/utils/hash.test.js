import { describe, expect, it } from "vitest";
import { simpleHash } from "./hash.js";

describe("simpleHash", () => {
  it("returns a deterministic hex hash", () => {
    expect(simpleHash("hello world")).toBe(simpleHash("hello world"));
    expect(simpleHash("hello world")).toMatch(/^[a-f0-9]+$/);
  });

  it("changes when the input changes", () => {
    expect(simpleHash("alpha")).not.toBe(simpleHash("beta"));
  });

  it("normalizes falsy input to an empty string", () => {
    expect(simpleHash("")).toBe(simpleHash(null));
    expect(simpleHash(undefined)).toBe(simpleHash(""));
  });

  it("handles long strings", () => {
    const input = "abc123".repeat(1000);
    expect(simpleHash(input)).toMatch(/^[a-f0-9]+$/);
  });
});
