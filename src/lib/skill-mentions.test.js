import { describe, expect, it } from "vitest";
import { findMentionQuery, parseSkillMentions } from "./skill-mentions.js";

const NAMES = ["translate", "code review", "code"];

describe("findMentionQuery", () => {
  it("opens on a bare @ at the caret", () => {
    const result = findMentionQuery("@", 1, NAMES);
    expect(result).toEqual({ start: 0, query: "", matches: NAMES });
  });

  it("does not require the @ to be the first character of the message", () => {
    const result = findMentionQuery("please @tra", 11, NAMES);
    expect(result).toEqual({ start: 7, query: "tra", matches: ["translate"] });
  });

  it("ignores an @ glued to a word", () => {
    expect(findMentionQuery("mail@host", 9, NAMES)).toBeNull();
  });

  it("keeps matching across spaces while the query is still a prefix", () => {
    const result = findMentionQuery("@code re", 8, NAMES);
    expect(result).toEqual({ start: 0, query: "code re", matches: ["code review"] });
  });

  it("closes once the query stops being a prefix", () => {
    expect(findMentionQuery("@code review please", 19, NAMES)).toBeNull();
    expect(findMentionQuery("@translate this", 15, NAMES)).toBeNull();
  });

  it("closes after the completed mention and its trailing space", () => {
    expect(findMentionQuery("@translate ", 11, NAMES)).toBeNull();
  });

  it("closes when the caret sits before the @", () => {
    expect(findMentionQuery("@translate", 0, NAMES)).toBeNull();
  });

  it("ignores an @ on an earlier line", () => {
    expect(findMentionQuery("@tra\nhello", 9, NAMES)).toBeNull();
  });

  it("returns null when no skill matches", () => {
    expect(findMentionQuery("@zzz", 4, NAMES)).toBeNull();
  });
});

describe("parseSkillMentions", () => {
  const skills = [
    { name: "translate", content: "T" },
    { name: "code review", content: "CR" },
    { name: "code", content: "C" },
  ];

  it("resolves a mention that sits mid-sentence", () => {
    const found = parseSkillMentions("please @translate this", skills);
    expect(found.map((s) => s.name)).toEqual(["translate"]);
  });

  it("prefers the longest skill name", () => {
    const found = parseSkillMentions("@code review this", skills);
    expect(found.map((s) => s.name)).toEqual(["code review"]);
  });

  it("keeps the order of appearance and drops duplicates", () => {
    const found = parseSkillMentions("@code @translate and @code again", skills);
    expect(found.map((s) => s.name)).toEqual(["code", "translate"]);
  });

  it("requires a word boundary after the name", () => {
    const short = [{ name: "test", content: "x" }];
    expect(parseSkillMentions("@testing", short)).toEqual([]);
    expect(parseSkillMentions("@test this", short).map((s) => s.name)).toEqual(["test"]);
    expect(parseSkillMentions("@test, please", short).map((s) => s.name)).toEqual(["test"]);
  });

  it("does not treat an email address as a mention", () => {
    expect(parseSkillMentions("write to me@translate.dev", skills)).toEqual([]);
  });

  it("handles names with regex characters", () => {
    const tricky = [{ name: "c++", content: "x" }];
    expect(parseSkillMentions("@c++ go", tricky).map((s) => s.name)).toEqual(["c++"]);
  });

  it("returns an empty list for empty input", () => {
    expect(parseSkillMentions("", skills)).toEqual([]);
    expect(parseSkillMentions("no mentions here", skills)).toEqual([]);
    expect(parseSkillMentions("@translate", [])).toEqual([]);
  });
});
