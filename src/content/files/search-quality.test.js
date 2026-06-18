import { describe, expect, it } from "vitest";

import {
  buildEffectiveSearchQuery,
  extractSearchSignals,
  normalizeSearchUrl,
  rankSearchResults,
} from "./search-quality.js";

describe("search-quality helpers", () => {
  it("extracts quoted phrases, years, sites, and negative terms", () => {
    const signals = extractSearchSignals(
      '"Claude Sonnet" benchmark 2025 site:anthropic.com -site:reddit.com -rumors api docs'
    );

    expect(signals.quotedPhrases).toEqual(["Claude Sonnet"]);
    expect(signals.years).toEqual(["2025"]);
    expect(signals.includeSites).toEqual(["anthropic.com"]);
    expect(signals.excludeSites).toEqual(["reddit.com"]);
    expect(signals.negativeTerms).toEqual(["rumors"]);
    expect(signals.importantTokens).toEqual(
      expect.arrayContaining(["benchmark", "api", "docs"])
    );
  });

  it("builds an effective query only when metadata adds search-shaping terms", () => {
    expect(buildEffectiveSearchQuery("Python 3.13 release notes").effectiveQuery).toBeUndefined();

    const shaped = buildEffectiveSearchQuery("Python 3.13 release notes", {
      purpose: "confirm official changes and migration details",
      sourceType: "docs",
    });

    expect(shaped.effectiveQuery).toContain("Python 3.13 release notes");
    expect(shaped.effectiveQuery).toContain("confirm");
    expect(shaped.effectiveQuery).toContain("documentation");
  });

  it("normalizes URLs for duplicate collapsing", () => {
    expect(normalizeSearchUrl("https://example.com/path/")).toBe("https://example.com/path");
    expect(normalizeSearchUrl("https://EXAMPLE.com/path#frag")).toBe("https://example.com/path");
  });

  it("ranks exact entity and date matches above generic category matches", () => {
    const ranked = rankSearchResults('"Claude Sonnet" benchmark 2025', [
      {
        title: "AI model benchmark category overview",
        url: "https://example.com/overview",
        snippet: "General benchmark information for model categories.",
      },
      {
        title: "Claude Sonnet benchmark results 2025",
        url: "https://example.com/claude-sonnet-results",
        snippet: "Exact 2025 benchmark data for Claude Sonnet.",
      },
    ]);

    expect(ranked.results[0].title).toBe("Claude Sonnet benchmark results 2025");
  });

  it("filters duplicate URLs and negative-term matches", () => {
    const ranked = rankSearchResults("deepseek api -forum", [
      {
        title: "DeepSeek API docs",
        url: "https://deepseek.com/docs/",
        snippet: "Official API reference.",
      },
      {
        title: "DeepSeek API docs duplicate",
        url: "https://deepseek.com/docs",
        snippet: "Official API reference.",
      },
      {
        title: "DeepSeek forum thread",
        url: "https://community.deepseek.com/forum-post",
        snippet: "Forum discussion about the API.",
      },
    ], { sourceType: "docs" });

    expect(ranked.rawResultCount).toBe(3);
    expect(ranked.results).toHaveLength(1);
    expect(ranked.results[0].url).toBe("https://deepseek.com/docs/");
  });

  it("does not treat negative terms as substrings inside unrelated words", () => {
    const ranked = rankSearchResults("python news -ai", [
      {
        title: "Daily Python release roundup",
        url: "https://example.com/daily-python",
        snippet: "Python news and release notes.",
      },
      {
        title: "Python AI tooling news",
        url: "https://example.com/python-ai",
        snippet: "AI tooling updates for Python.",
      },
    ]);

    expect(ranked.results).toHaveLength(1);
    expect(ranked.results[0].title).toBe("Daily Python release roundup");
  });
});
