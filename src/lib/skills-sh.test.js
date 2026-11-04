// @vitest-environment node

/**
 * "Find Skill" catalog client. Pins the two unauthenticated skills.sh endpoints
 * and the bridge payload; /api/v1/* is not usable from an extension (OIDC).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_RESULTS,
  MIN_QUERY_LENGTH,
  buildDownloadUrl,
  buildSearchUrl,
  downloadSkillMarkdown,
  fetchSkillsJson,
  formatInstalls,
  normalizeSearchResults,
  pickSkillMarkdown,
  searchSkills,
} from "./skills-sh.js";

const SEARCH_PAYLOAD = {
  query: "react",
  skills: [
    {
      id: "vercel-labs/agent-skills/vercel-react-best-practices",
      source: "vercel-labs/agent-skills",
      skillId: "vercel-react-best-practices",
      name: "vercel-react-best-practices",
      installs: 868432,
    },
    {
      id: "open.feishu.cn/lark-event",
      source: "open.feishu.cn",
      skillId: "lark-event",
      name: "lark-event",
      installs: 12,
    },
  ],
};

function replyWith(payload) {
  return { ok: true, status: 200, html: JSON.stringify(payload) };
}

beforeEach(() => {
  vi.mocked(chrome.runtime.sendMessage).mockReset();
});

describe("URL builders", () => {
  it("trims and encodes the query for the search endpoint", () => {
    expect(buildSearchUrl("  react native  ")).toBe(
      "https://skills.sh/api/search?q=react%20native",
    );
    expect(buildSearchUrl("a&b=c")).toBe("https://skills.sh/api/search?q=a%26b%3Dc");
  });

  it("builds the download path from source + skillId", () => {
    expect(buildDownloadUrl(SEARCH_PAYLOAD.skills[0])).toBe(
      "https://skills.sh/api/download/vercel-labs/agent-skills/vercel-react-best-practices",
    );
    expect(buildDownloadUrl(SEARCH_PAYLOAD.skills[1])).toBe(
      "https://skills.sh/api/download/open.feishu.cn/lark-event",
    );
  });

  it("encodes path segments so a value cannot escape the API path", () => {
    expect(buildDownloadUrl({ source: "owner/repo", skillId: "../evil" })).toBe(
      "https://skills.sh/api/download/owner/repo/..%2Fevil",
    );
  });

  it("rejects incomplete identifiers", () => {
    expect(() => buildDownloadUrl({ source: "owner/repo" })).toThrow(
      "Incomplete skill identifier",
    );
    expect(() => buildDownloadUrl(null)).toThrow("Incomplete skill identifier");
  });

  it("rejects dot segments that URL resolution would collapse", () => {
    expect(() => buildDownloadUrl({ source: "../evil", skillId: "x" })).toThrow(
      "Invalid skill identifier",
    );
    expect(() => buildDownloadUrl({ source: "owner/repo", skillId: ".." })).toThrow(
      "Invalid skill identifier",
    );
    // Dotted hostnames are legitimate well-known sources and must still work.
    expect(buildDownloadUrl({ source: "open.feishu.cn", skillId: "lark-event" })).toBe(
      "https://skills.sh/api/download/open.feishu.cn/lark-event",
    );
  });
});

describe("normalizeSearchResults", () => {
  it("maps the API shape and deduplicates by id", () => {
    const results = normalizeSearchResults({
      skills: [...SEARCH_PAYLOAD.skills, SEARCH_PAYLOAD.skills[0]],
    });
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      id: "vercel-labs/agent-skills/vercel-react-best-practices",
      source: "vercel-labs/agent-skills",
      skillId: "vercel-react-best-practices",
      name: "vercel-react-best-practices",
      installs: 868432,
    });
  });

  it("derives skillId from the id when the field is missing", () => {
    const results = normalizeSearchResults({
      skills: [{ id: "owner/repo/my-skill", source: "owner/repo" }],
    });
    expect(results[0].skillId).toBe("my-skill");
    expect(results[0].name).toBe("my-skill");
    expect(results[0].installs).toBe(0);
  });

  it("skips unusable entries and caps the list", () => {
    const many = Array.from({ length: 60 }, (_, i) => ({
      id: `owner/repo/skill-${i}`,
      source: "owner/repo",
      skillId: `skill-${i}`,
    }));
    expect(normalizeSearchResults({ skills: [null, {}, { source: "x" }, ...many] })).toHaveLength(
      MAX_RESULTS,
    );
    expect(normalizeSearchResults(null)).toEqual([]);
  });
});

describe("pickSkillMarkdown", () => {
  it("prefers the root SKILL.md over nested copies", () => {
    const content = pickSkillMarkdown({
      files: [
        { path: "nested/SKILL.md", contents: "nested" },
        { path: "SKILL.md", contents: "  root content  " },
      ],
    });
    expect(content).toBe("root content");
  });

  it("falls back to a nested SKILL.md", () => {
    expect(
      pickSkillMarkdown({ files: [{ path: "skills/react/SKILL.md", contents: "hello" }] }),
    ).toBe("hello");
  });

  it("throws when the snapshot has no usable SKILL.md", () => {
    expect(() => pickSkillMarkdown({ files: [{ path: "README.md", contents: "x" }] })).toThrow(
      "No SKILL.md",
    );
    expect(() => pickSkillMarkdown({ files: [{ path: "SKILL.md", contents: "  " }] })).toThrow(
      "No SKILL.md",
    );
    expect(() => pickSkillMarkdown({ files: null })).toThrow("No SKILL.md");
  });
});

describe("formatInstalls", () => {
  it("compacts large counts", () => {
    expect(formatInstalls(868432)).toBe("868.4K");
    expect(formatInstalls(1_200_000)).toBe("1.2M");
    expect(formatInstalls(999)).toBe("999");
    expect(formatInstalls("junk")).toBe("0");
  });
});

describe("fetchSkillsJson", () => {
  it("uses the fetch bridge and parses the JSON body", async () => {
    const sendMessage = vi
      .mocked(chrome.runtime.sendMessage)
      .mockResolvedValue(replyWith({ ok: 1 }));
    await expect(fetchSkillsJson("https://skills.sh/api/search?q=ab", 1234)).resolves.toEqual({
      ok: 1,
    });
    expect(sendMessage).toHaveBeenCalledWith({
      type: "bds-fetch-url",
      url: "https://skills.sh/api/search?q=ab",
      options: { method: "GET", timeoutMs: 1234 },
    });
  });

  it("surfaces in-band bridge failures", async () => {
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({
      ok: false,
      status: 404,
      error: "Server returned 404",
    });
    await expect(fetchSkillsJson("https://skills.sh/x")).rejects.toThrow("Server returned 404");
  });

  it("surfaces rejected bridge calls and non-JSON bodies", async () => {
    vi.mocked(chrome.runtime.sendMessage).mockRejectedValue(new Error("offline"));
    await expect(fetchSkillsJson("https://skills.sh/x")).rejects.toThrow("offline");

    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({
      ok: true,
      status: 200,
      html: "<html>404 page</html>",
    });
    await expect(fetchSkillsJson("https://skills.sh/x")).rejects.toThrow("invalid response");
  });
});

describe("searchSkills / downloadSkillMarkdown", () => {
  it("rejects short queries without hitting the network", async () => {
    const sendMessage = vi.mocked(chrome.runtime.sendMessage);
    await expect(searchSkills(" ")).rejects.toThrow(`at least ${MIN_QUERY_LENGTH}`);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("searches and normalizes results", async () => {
    const sendMessage = vi
      .mocked(chrome.runtime.sendMessage)
      .mockResolvedValue(replyWith(SEARCH_PAYLOAD));
    const results = await searchSkills("  react  ");
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://skills.sh/api/search?q=react" }),
    );
    expect(results).toHaveLength(2);
  });

  it("downloads a skill snapshot and returns its SKILL.md", async () => {
    const sendMessage = vi.mocked(chrome.runtime.sendMessage).mockResolvedValue(
      replyWith({
        files: [
          { path: "AGENTS.md", contents: "not this one" },
          { path: "SKILL.md", contents: "---\nname: x\n---\nUse x." },
        ],
      }),
    );
    const content = await downloadSkillMarkdown(SEARCH_PAYLOAD.skills[0]);
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://skills.sh/api/download/vercel-labs/agent-skills/vercel-react-best-practices",
      }),
    );
    expect(content).toContain("Use x.");
  });
});
