import { describe, expect, it } from "vitest";
import { stripInjectedBlocks } from "./payload-mutator.js";

describe("stripInjectedBlocks", () => {
  it("removes hidden context blocks", () => {
    expect(stripInjectedBlocks("<BetterDeepSeek>secret</BetterDeepSeek>hello")).toBe("hello");
    expect(stripInjectedBlocks("<BDS:SKILLS>x</BDS:SKILLS>hello")).toBe("hello");
    expect(stripInjectedBlocks("<BDS:RP>x</BDS:RP>hello")).toBe("hello");
    expect(stripInjectedBlocks("<BDS:PROJECT>x</BDS:PROJECT>hello")).toBe("hello");
    expect(stripInjectedBlocks("<BDS:PROJECT_CONTEXT>x</BDS:PROJECT_CONTEXT>hello")).toBe("hello");
  });

  it("keeps explicit tool-control messages the model must see", () => {
    const auto = "<BetterDeepSeek>[BDS:AUTO]do it</BetterDeepSeek>";
    expect(stripInjectedBlocks(auto)).toBe(auto);

    const research = "<BetterDeepSeek>[BDS:DEEP_RESEARCH]go</BetterDeepSeek>";
    expect(stripInjectedBlocks(research)).toBe(research);

    const memory = '<BetterDeepSeek><BDS:memory_calls id="1"></BetterDeepSeek>';
    expect(stripInjectedBlocks(memory)).toBe(memory);
  });

  // Regression guard for the `[^>]*` in the paired strips: they are safe only
  // because the matching close tag anchors the removal region. If someone turns
  // them into self-contained strips, the tail of the tag leaks into the prompt.
  it("fully strips paired blocks whose attributes contain '>'", () => {
    expect(stripInjectedBlocks('A<BDS:memory_calls args="a>b">body</BDS:memory_calls>B')).toBe("AB");
    expect(stripInjectedBlocks('A<BDS:PROJECT id="1 > 2">body</BDS:PROJECT>B')).toBe("AB");
  });
});
