// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchAndConvertWebPageMock = vi.hoisted(() => vi.fn());
const chromeSendMessageMock = vi.hoisted(() => vi.fn());

vi.mock("./web-reader.js", () => ({
  fetchAndConvertWebPage: fetchAndConvertWebPageMock,
}));

import {
  searchWeb,
  parseSearchResults,
  formatSearchResults,
  formatDeepFetchContent,
  extractUrlFromDdgLink,
  extractUrlFromBingLink,
  resolveSearchProviders,
  SEARCH_PROVIDER_CATALOG,
  buildSearchProviderCatalog,
  buildMcpSearchProvider,
  mcpSearchProviderId,
  parseMcpSearchResults,
  MCP_SEARCH_RESULT_COUNT,
} from "./search-reader.js";
import enMessages from "../../../src/locales/en.json";

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

beforeEach(() => {
  vi.mocked(chrome.runtime.sendMessage).mockReset();
  fetchAndConvertWebPageMock.mockReset();
  vi.mocked(chrome.runtime.sendMessage).mockImplementation(chromeSendMessageMock);
});

function ddgHref(realUrl) {
  return `//duckduckgo.com/l/?uddg=${encodeURIComponent(realUrl)}&rut=test`;
}

function ddgRelativeHref(realUrl) {
  return `/l/?uddg=${encodeURIComponent(realUrl)}&rut=test`;
}

function makeResultHtml(results) {
  const rows = [];
  results.forEach((r, index) => {
    const rank = index + 1;
    const displayUrl = r.displayUrl || r.url || "";
    rows.push(`<tr>
      <td valign="top">${rank}.&nbsp;</td>
      <td><a class="result-link" href="${ddgHref(r.url || "")}">${r.title}</a></td>
    </tr>`);
    if (r.snippet) {
      rows.push(`<tr>
        <td>&nbsp;&nbsp;&nbsp;</td>
        <td class="result-snippet">${r.snippet}</td>
      </tr>`);
    }
    rows.push(`<tr>
      <td>&nbsp;&nbsp;&nbsp;</td>
      <td><span class="link-text">${displayUrl}</span></td>
    </tr>`);
    rows.push("<tr><td>&nbsp;</td><td>&nbsp;</td></tr>");
  });
  return `<html><body><table border="0">${rows.join("\n")}</table></body></html>`;
}

function makeDdgHtmlResultHtml(results) {
  const blocks = results
    .map((r) => `<div class="result">
      <a class="result__a" href="${ddgRelativeHref(r.url || "")}">${r.title}</a>
      <a class="result__snippet">${r.snippet || ""}</a>
    </div>`)
    .join("\n");
  return `<html><body>${blocks}</body></html>`;
}

function toBase64Url(value) {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function bingHref(realUrl) {
  return `https://www.bing.com/ck/a?!&&u=a1${toBase64Url(realUrl)}&ntb=1`;
}

function makeBingResultHtml(results) {
  const rows = results
    .map(
      (r) => `<li class="b_algo">
        <h2><a href="${bingHref(r.url || "")}">${r.title}</a></h2>
        <div class="b_caption"><p>${r.snippet || ""}</p></div>
      </li>`
    )
    .join("\n");
  return `<html><body><ol id="b_results">${rows}</ol></body></html>`;
}

function makeDdgChallengeHtml() {
  return `<html><body>
    <form id="challenge-form" action="/anomaly.js">
      <p>Unfortunately, bots use DuckDuckGo too. Please verify you are human.</p>
    </form>
  </body></html>`;
}

describe("parseSearchResults", () => {
  it("parses a single DuckDuckGo result with title, url, and snippet", () => {
    const html = makeResultHtml([
      { title: "Example", url: "https://example.com", snippet: "An example site" },
    ]);
    const results = parseSearchResults(html);
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      title: "Example",
      url: "https://example.com",
      snippet: "An example site",
    });
  });

  it("parses multiple DuckDuckGo results", () => {
    const html = makeResultHtml([
      { title: "First", url: "https://a.com", snippet: "First result" },
      { title: "Second", url: "https://b.com", snippet: "Second result" },
    ]);
    const results = parseSearchResults(html);
    expect(results).toHaveLength(2);
    expect(results[0].title).toBe("First");
    expect(results[1].title).toBe("Second");
  });

  it("returns empty array when no supported result elements exist", () => {
    const html = "<html><body>no results here</body></html>";
    expect(parseSearchResults(html)).toEqual([]);
  });

  it("handles missing snippet gracefully", () => {
    const html = makeResultHtml([
      { title: "No Snippet", url: "https://example.com", snippet: "" },
    ]);
    const results = parseSearchResults(html);
    expect(results[0].snippet).toBe("");
  });

  it("skips rows that have no result-link element", () => {
    const html = '<html><body><table border="0"><tr><td>no link</td></tr></table></body></html>';
    expect(parseSearchResults(html)).toEqual([]);
  });

  it("decodes real URL from DDG uddg parameter", () => {
    const html = makeResultHtml([
      { title: "Test", url: "https://example.com/page?x=1", snippet: "desc" },
    ]);
    const results = parseSearchResults(html);
    expect(results[0].url).toBe("https://example.com/page?x=1");
  });

  it("decodes percent-encoded URLs from uddg parameter", () => {
    const html = makeResultHtml([
      { title: "Encoded", url: "https://example.com/%C3%A9co", snippet: "encoded" },
    ]);
    const results = parseSearchResults(html);
    expect(results[0].url).toBe("https://example.com/" + decodeURIComponent("%C3%A9") + "co");
  });

  it("parses Bing result HTML and decodes redirect URLs", () => {
    const html = makeBingResultHtml([
      {
        title: "Bing Result",
        url: "https://example.com/page?x=1",
        snippet: "A Bing result snippet",
      },
    ]);

    const results = parseSearchResults(html);

    expect(results).toEqual([
      {
        title: "Bing Result",
        url: "https://example.com/page?x=1",
        snippet: "A Bing result snippet",
      },
    ]);
  });

  it("parses DuckDuckGo HTML result blocks with relative redirect URLs", () => {
    const html = makeDdgHtmlResultHtml([
      {
        title: "DuckDuckGo HTML Result",
        url: "https://example.com/ddg-html",
        snippet: "A result from the HTML endpoint.",
      },
    ]);

    const results = parseSearchResults(html);

    expect(results).toEqual([
      {
        title: "DuckDuckGo HTML Result",
        url: "https://example.com/ddg-html",
        snippet: "A result from the HTML endpoint.",
      },
    ]);
  });

  it("handles entirely malformed HTML without crashing", () => {
    expect(parseSearchResults("not even html")).toEqual([]);
    expect(parseSearchResults("")).toEqual([]);
  });
});

describe("formatSearchResults", () => {
  it("formats results as markdown with heading and result list", () => {
    const results = [
      { title: "A", url: "https://a.com", snippet: "Snippet A" },
      { title: "B", url: "https://b.com", snippet: "Snippet B" },
    ];
    const md = formatSearchResults("test query", results);

    expect(md).toContain("# Search Results: test query");
    expect(md).toContain("> 2 results found via DuckDuckGo Lite");
    expect(md).toContain("## 1. A");
    expect(md).toContain("> Snippet A");
    expect(md).toContain("**URL:** https://a.com");
    expect(md).toContain("## 2. B");
    expect(md).toContain("**URL:** https://b.com");
  });

  it("can label fallback provider results", () => {
    const md = formatSearchResults("test query", [], "Bing");
    expect(md).toContain("> 0 results found via Bing");
  });

  it("handles empty results array", () => {
    const md = formatSearchResults("empty", []);
    expect(md).toContain("# Search Results: empty");
    expect(md).toContain("> 0 results found");
  });
});

describe("extractUrlFromDdgLink", () => {
  it("extracts URL from standard DDG redirect", () => {
    const href = "//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com&rut=abc";
    expect(extractUrlFromDdgLink(href)).toBe("https://example.com");
  });

  it("extracts URL with path and query params", () => {
    const href = "//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fpage%3Fx%3D1&rut=abc";
    expect(extractUrlFromDdgLink(href)).toBe("https://example.com/page?x=1");
  });

  it("returns empty string for empty input", () => {
    expect(extractUrlFromDdgLink("")).toBe("");
    expect(extractUrlFromDdgLink(null)).toBe("");
    expect(extractUrlFromDdgLink(undefined)).toBe("");
  });

  it("returns href as-is when no uddg parameter", () => {
    const href = "//duckduckgo.com/l/?other=val";
    expect(extractUrlFromDdgLink(href)).toBe(href);
  });

  it("handles absolute DDG URLs", () => {
    const href = "https://duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com&rut=abc";
    expect(extractUrlFromDdgLink(href)).toBe("https://example.com");
  });

  it("handles relative DDG HTML redirect URLs", () => {
    const href = "/l/?uddg=https%3A%2F%2Fexample.com%2Fhtml&rut=abc";
    expect(extractUrlFromDdgLink(href)).toBe("https://example.com/html");
  });

  it("handles malformed input without crashing", () => {
    expect(extractUrlFromDdgLink("not-a-url")).toBe("not-a-url");
    expect(extractUrlFromDdgLink("://")).toBe("://");
  });

  it("decodes encoded URL paths correctly", () => {
    const href = "//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2F%25C3%25A9co&rut=abc";
    expect(extractUrlFromDdgLink(href)).toBe(
      "https://example.com/" + decodeURIComponent("%C3%A9") + "co"
    );
  });
});

describe("extractUrlFromBingLink", () => {
  it("extracts URL from Bing base64 redirect", () => {
    expect(extractUrlFromBingLink(bingHref("https://example.com/page?x=1"))).toBe(
      "https://example.com/page?x=1"
    );
  });

  it("keeps direct non-Bing URLs", () => {
    expect(extractUrlFromBingLink("https://example.com/direct")).toBe("https://example.com/direct");
  });

  it("returns empty string for undecodable Bing click redirects", () => {
    expect(extractUrlFromBingLink("https://www.bing.com/ck/a?!&&u=not-valid")).toBe("");
  });
});

describe("formatDeepFetchContent", () => {
  it("returns a formatted appendix section", () => {
    const output = formatDeepFetchContent("My Page", "https://example.com", "# Content\n\nHello");
    expect(output).toContain("Page Content: My Page");
    expect(output).toContain("**Source:** https://example.com");
    expect(output).toContain("# Content");
    expect(output).toContain("Hello");
  });

  it("includes error message when markdown is empty", () => {
    const output = formatDeepFetchContent("Empty", "https://x.com", "");
    expect(output).toContain("Page Content: Empty");
    expect(output).toContain("**Source:** https://x.com");
  });
});

describe("resolveSearchProviders", () => {
  it("exposes a stable catalog of known providers", () => {
    expect(SEARCH_PROVIDER_CATALOG).toEqual([
      { id: "ddg-lite", name: "DuckDuckGo Lite", labelKey: "settings.searchProvider.ddgLite" },
      { id: "ddg-html", name: "DuckDuckGo HTML", labelKey: "settings.searchProvider.ddgHtml" },
      { id: "bing", name: "Bing", labelKey: "settings.searchProvider.bing" },
    ]);
  });

  it("resolves every catalog label key in the base locale", () => {
    // Locale files wrap translations in a top-level `messages` object.
    const messages = enMessages.messages ?? enMessages;
    for (const { labelKey } of SEARCH_PROVIDER_CATALOG) {
      const value = labelKey
        .split(".")
        .reduce((node, part) => (node ? node[part] : undefined), messages);
      expect(value, labelKey).toBeTruthy();
      expect(value, labelKey).not.toContain("searchProvider");
    }
  });

  it("returns the default order when no preference is set", () => {
    const resolved = resolveSearchProviders(undefined);
    expect(resolved.map((p) => p.id)).toEqual(["ddg-lite", "ddg-html", "bing"]);
  });

  it("returns the default order for an empty list (all providers disabled)", () => {
    expect(resolveSearchProviders([]).map((p) => p.id)).toEqual(["ddg-lite", "ddg-html", "bing"]);
  });

  it("resolves a custom user order", () => {
    expect(resolveSearchProviders(["bing", "ddg-html"]).map((p) => p.id)).toEqual([
      "bing",
      "ddg-html",
    ]);
  });

  it("filters unknown ids and dedupes repeats", () => {
    expect(
      resolveSearchProviders(["nope", "bing", "bing", "ddg-lite"]).map((p) => p.id)
    ).toEqual(["bing", "ddg-lite"]);
  });

  it("falls back to defaults when every id is unknown", () => {
    expect(resolveSearchProviders(["ask-jeeves", "alta-vista"]).map((p) => p.id)).toEqual([
      "ddg-lite",
      "ddg-html",
      "bing",
    ]);
  });

  it("does not mutate its input array", () => {
    const input = ["bing"];
    resolveSearchProviders(input);
    expect(input).toEqual(["bing"]);
  });
});

describe("searchWeb", () => {
  const ON_STATUS = vi.fn();

  beforeEach(() => {
    chromeSendMessageMock.mockReset();
    ON_STATUS.mockReset();
  });

  it("fetches search results and returns a markdown File with metadata", async () => {
    const html = makeResultHtml([
      { title: "Test query results", url: "https://one.com/test-query", snippet: "Everything about the test query." },
    ]);
    chromeSendMessageMock.mockResolvedValue({ ok: true, html });

    const result = await searchWeb("test query", 0, ON_STATUS);

    expect(chromeSendMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "bds-fetch-url",
        url: expect.stringContaining(encodeURIComponent("test query")),
      })
    );
    expect(result.file).toBeInstanceOf(File);
    expect(result.file.name).toMatch(/\.md$/);
    expect(result.file.type).toBe("text/markdown");
    expect(result.query).toBe("test query");
    expect(result.deepFetch).toBe(0);
    expect(result.provider).toBe("DuckDuckGo Lite");
    expect(result.lowConfidence).toBe(false);
    const text = await readFileAsText(result.file);
    expect(text).not.toContain("Low-confidence results");
    expect(result.effectiveQuery).toBeUndefined();
    expect(result.rawResultCount).toBe(1);
    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toEqual({
      title: "Test query results",
      url: "https://one.com/test-query",
      snippet: "Everything about the test query.",
    });
    expect(ON_STATUS).toHaveBeenCalledWith(
      "Searching DuckDuckGo Lite...",
      { phase: "searching", provider: "DuckDuckGo Lite" }
    );
    expect(ON_STATUS).toHaveBeenCalledWith("Creating file...", { phase: "finalize" });
  });

  it("falls back to Bing when DuckDuckGo returns the Android anomaly page", async () => {
    chromeSendMessageMock
      .mockResolvedValueOnce({ ok: true, status: 202, html: makeDdgChallengeHtml() })
      .mockResolvedValueOnce({ ok: true, status: 202, html: makeDdgChallengeHtml() })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        html: makeBingResultHtml([
          {
            title: "Top Dog Breeds in the Philippines",
            url: "https://example.com/dogs-philippines",
            snippet: "Popular dogs for pet owners in the Philippines.",
          },
        ]),
      });

    const result = await searchWeb("top dog breeds Philippines pet owners", 0, ON_STATUS);
    const text = await readFileAsText(result.file);

    expect(chromeSendMessageMock).toHaveBeenCalledTimes(3);
    expect(chromeSendMessageMock.mock.calls[0][0].url).toContain("lite.duckduckgo.com");
    expect(chromeSendMessageMock.mock.calls[1][0].url).toContain("html.duckduckgo.com");
    expect(chromeSendMessageMock.mock.calls[2][0].url).toContain("www.bing.com/search");
    expect(result.provider).toBe("Bing");
    expect(result.results).toEqual([
      {
        title: "Top Dog Breeds in the Philippines",
        url: "https://example.com/dogs-philippines",
        snippet: "Popular dogs for pet owners in the Philippines.",
      },
    ]);
    expect(text).toContain("> 1 results found via Bing");
    expect(ON_STATUS).toHaveBeenCalledWith("Searching Bing...", { phase: "searching", provider: "Bing" });
  });

  it("falls back to Bing when DuckDuckGo providers time out", async () => {
    chromeSendMessageMock
      .mockResolvedValueOnce({ ok: false, error: "Request timed out after 15000ms" })
      .mockResolvedValueOnce({ ok: false, error: "Request timed out after 15000ms" })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        html: makeBingResultHtml([
          {
            title: "DeepSeek API documentation",
            url: "https://platform.deepseek.com/api-docs",
            snippet: "Official API docs and reference for DeepSeek.",
          },
        ]),
      });

    const result = await searchWeb("DeepSeek API docs", 0, ON_STATUS);

    expect(chromeSendMessageMock).toHaveBeenCalledTimes(3);
    expect(chromeSendMessageMock.mock.calls[0][0].url).toContain("lite.duckduckgo.com");
    expect(chromeSendMessageMock.mock.calls[1][0].url).toContain("html.duckduckgo.com");
    expect(chromeSendMessageMock.mock.calls[2][0].url).toContain("www.bing.com/search");
    expect(result.provider).toBe("Bing");
    expect(result.results[0].url).toBe("https://platform.deepseek.com/api-docs");
  });

  it("adds purpose and sourceType query shaping only when metadata is provided", async () => {
    const html = makeResultHtml([
      { title: "Python 3.13 release notes", url: "https://docs.python.org/3.13/whatsnew/3.13.html", snippet: "Official documentation." },
    ]);
    chromeSendMessageMock.mockResolvedValue({ ok: true, html });

    const result = await searchWeb("Python 3.13 release notes", 0, ON_STATUS, {
      purpose: "confirm official changes and migration details",
      sourceType: "docs",
    });

    expect(result.effectiveQuery).toContain("Python 3.13 release notes");
    expect(chromeSendMessageMock.mock.calls[0][0].url).toContain(
      encodeURIComponent(result.effectiveQuery)
    );
  });

  it("falls back to Bing when DuckDuckGo results are weak", async () => {
    chromeSendMessageMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        html: makeResultHtml([
          {
            title: "Developer tools overview",
            url: "https://example.com/dev-tools",
            snippet: "A general overview of developer tools.",
          },
        ]),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        html: makeResultHtml([
          {
            title: "DDG HTML tools overview",
            url: "https://example.com/html-tools",
            snippet: "Still a weak match for the real query.",
          },
        ]),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        html: makeBingResultHtml([
          {
            title: "DeepSeek API documentation",
            url: "https://platform.deepseek.com/api-docs",
            snippet: "Official API docs and reference for DeepSeek.",
          },
        ]),
      });

    const result = await searchWeb("DeepSeek API docs", 0, ON_STATUS, {
      purpose: "find official reference",
      sourceType: "docs",
    });

    expect(result.provider).toBe("Bing");
    expect(result.results[0].url).toBe("https://platform.deepseek.com/api-docs");
  });

  it("throws on empty query", async () => {
    await expect(searchWeb("")).rejects.toThrow("Search query is empty");
    await expect(searchWeb("   ")).rejects.toThrow("Search query is empty");
  });

  it("throws on null or undefined query", async () => {
    await expect(searchWeb(null)).rejects.toThrow("Search query is empty");
    await expect(searchWeb(undefined)).rejects.toThrow("Search query is empty");
  });

  it("throws on fetch failure", async () => {
    chromeSendMessageMock.mockResolvedValue({ ok: false, error: "network error" });
    await expect(searchWeb("test")).rejects.toThrow("Search failed");
  });

  it("throws when runtime.sendMessage rejects", async () => {
    chromeSendMessageMock.mockRejectedValue(new Error("connection failed"));
    await expect(searchWeb("test")).rejects.toThrow("Search failed: connection failed");
  });

  it("throws on no search results", async () => {
    const html = "<html><body>no results</body></html>";
    chromeSendMessageMock.mockResolvedValue({ ok: true, html });
    await expect(searchWeb("test")).rejects.toThrow("No search results found");
  });

  it("returns the best ranked weak provider when both providers are weak", async () => {
    chromeSendMessageMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        html: makeResultHtml([
          {
            title: "Laptop reviews 2025 shortlist",
            url: "https://example.com/laptop-shortlist",
            snippet: "Shortlist of laptop reviews for 2025 buyers.",
          },
          {
            title: "Generic buyer guide",
            url: "https://example.com/buyer-guide",
            snippet: "General shopping guide.",
          },
        ]),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        html: makeBingResultHtml([
          {
            title: "Buying a laptop",
            url: "https://bing-example.com/laptop-buying",
            snippet: "High-level laptop buying advice.",
          },
        ]),
      });

    const result = await searchWeb("laptop reviews 2025", 0, ON_STATUS, {
      purpose: "compare current options",
      sourceType: "reviews",
    });

    expect(result.provider).toBe("DuckDuckGo Lite");
    expect(result.results[0].title).toBe("Laptop reviews 2025 shortlist");
    expect(result.lowConfidence).toBe(false);
  });

  it("marks results low-confidence when only weak matches could be recovered", async () => {
    const unrelated = (host) => ({
      ok: true,
      status: 200,
      html: makeResultHtml([
        { title: "Unrelated page", url: `https://${host}/x`, snippet: "Nothing relevant here." },
      ]),
    });
    chromeSendMessageMock
      .mockResolvedValueOnce(unrelated("a.com"))
      .mockResolvedValueOnce(unrelated("b.com"))
      .mockResolvedValueOnce(unrelated("c.com"));

    const result = await searchWeb("zzqxjv", 0, ON_STATUS);

    expect(chromeSendMessageMock).toHaveBeenCalledTimes(3);
    expect(result.provider).toBe("DuckDuckGo Lite");
    expect(result.results).toHaveLength(1);
    expect(result.lowConfidence).toBe(true);
    const text = await readFileAsText(result.file);
    expect(text).toContain("Low-confidence results");
    expect(text.indexOf("Low-confidence results")).toBeLessThan(text.indexOf("# Search Results:"));
  });

  it("deepFetch reads top N pages", async () => {
    const html = makeResultHtml([
      { title: "A", url: "https://a.com", snippet: "a" },
      { title: "B", url: "https://b.com", snippet: "b" },
      { title: "C", url: "https://c.com", snippet: "c" },
    ]);
    chromeSendMessageMock.mockResolvedValue({ ok: true, html });

    fetchAndConvertWebPageMock.mockResolvedValue({
      text: async () => "# Deep content",
      name: "page.md",
      type: "text/markdown",
    });

    const result = await searchWeb("test", 2, ON_STATUS);
    const text = await readFileAsText(result.file);

    expect(result.deepFetch).toBe(2);
    expect(result.results).toHaveLength(3);
    expect(fetchAndConvertWebPageMock).toHaveBeenCalledTimes(2);
    expect(fetchAndConvertWebPageMock).toHaveBeenCalledWith("https://a.com", expect.any(Function));
    expect(fetchAndConvertWebPageMock).toHaveBeenCalledWith("https://b.com", expect.any(Function));
    expect(text).toContain("Page Content: A");
    expect(text).toContain("Page Content: B");
    expect(text).not.toContain("Page Content: C");
  });

  it("deepFetch follows ranked result order instead of provider order", async () => {
    const html = makeResultHtml([
      { title: "Benchmark category overview", url: "https://example.com/overview", snippet: "General benchmark information." },
      { title: "Claude Sonnet benchmark 2025", url: "https://example.com/claude-sonnet-2025", snippet: "Exact 2025 benchmark data for Claude Sonnet." },
    ]);
    chromeSendMessageMock.mockResolvedValue({ ok: true, html });
    fetchAndConvertWebPageMock.mockResolvedValue({
      text: async () => "# Deep content",
      name: "page.md",
      type: "text/markdown",
    });

    await searchWeb('"Claude Sonnet" benchmark 2025', 1, ON_STATUS);

    expect(fetchAndConvertWebPageMock).toHaveBeenCalledWith(
      "https://example.com/claude-sonnet-2025",
      expect.any(Function)
    );
  });

  it("deepFetch clamps to MAX_DEEP_FETCH", async () => {
    const results = Array.from({ length: 10 }, (_, i) => ({
      title: `R${i}`,
      url: `https://r${i}.com`,
      snippet: `snippet ${i}`,
    }));
    const html = makeResultHtml(results);
    chromeSendMessageMock.mockResolvedValue({ ok: true, html });
    fetchAndConvertWebPageMock.mockResolvedValue({
      text: async () => "x",
      name: "x.md",
      type: "text/markdown",
    });

    const result = await searchWeb("test", 999, ON_STATUS);
    const text = await readFileAsText(result.file);

    expect(result.deepFetch).toBe(5);
    expect(fetchAndConvertWebPageMock).toHaveBeenCalledTimes(5);
    expect(text).toContain("Page Content: R4");
    expect(text).not.toContain("Page Content: R5");
  });

  it("deepFetch handles per-page fetch failure gracefully", async () => {
    const html = makeResultHtml([
      { title: "Good", url: "https://good.com", snippet: "good" },
      { title: "Bad", url: "https://bad.com", snippet: "bad" },
    ]);
    chromeSendMessageMock.mockResolvedValue({ ok: true, html });

    fetchAndConvertWebPageMock
      .mockResolvedValueOnce({
        text: async () => "# Good content",
        name: "good.md",
        type: "text/markdown",
      })
      .mockRejectedValueOnce(new Error("page error"));

    const result = await searchWeb("test", 2, ON_STATUS);
    const text = await readFileAsText(result.file);

    expect(text).toContain("Page Content: Good");
    expect(text).toContain("# Good content");
    expect(text).toContain("Page Content: Bad");
    expect(text).toContain("Failed to fetch page content: page error");
  });

  it("generates a safe filename from the query", async () => {
    const html = makeResultHtml([{ title: "X", url: "https://x.com", snippet: "x" }]);
    chromeSendMessageMock.mockResolvedValue({ ok: true, html });

    const result = await searchWeb("Hello World! @#$", 0, ON_STATUS);
    expect(result.file.name).toBe("hello-world------search.md");
  });

  it("sends search request with safe fetch options and headers", async () => {
    const html = makeResultHtml([{ title: "T", url: "https://t.com", snippet: "s" }]);
    chromeSendMessageMock.mockResolvedValue({ ok: true, status: 200, html });
    await searchWeb("test", 0, ON_STATUS);

    const sentMessage = chromeSendMessageMock.mock.calls[0][0];
    expect(sentMessage.type).toBe("bds-fetch-url");
    expect(sentMessage.options).toBeDefined();
    expect(sentMessage.options.method).toBe("GET");
    expect(sentMessage.options.headers).toBeDefined();
    expect(sentMessage.options.headers.Accept).toContain("text/html");
    expect(sentMessage.options.headers).not.toHaveProperty("User-Agent");
    expect(sentMessage.options.cache).toBe("no-store");
    expect(sentMessage.options.credentials).toBe("omit");
    expect(sentMessage.options.redirect).toBe("follow");
    expect(sentMessage.options.timeoutMs).toBe(15000);
  });

  it("uses DuckDuckGo HTML when Lite returns challenge", async () => {
    chromeSendMessageMock
      .mockResolvedValueOnce({ ok: true, status: 202, html: makeDdgChallengeHtml() })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        html: makeDdgHtmlResultHtml([
          { title: "test result one", url: "https://html-result.com/one", snippet: "test content about tests" },
          { title: "test result two", url: "https://html-result.com/two", snippet: "more test content" },
          { title: "test result three", url: "https://html-result.com/three", snippet: "third test result" },
        ]),
      });

    const result = await searchWeb("test", 0, ON_STATUS);

    expect(chromeSendMessageMock).toHaveBeenCalledTimes(2);
    expect(chromeSendMessageMock.mock.calls[0][0].url).toContain("lite.duckduckgo.com");
    expect(chromeSendMessageMock.mock.calls[1][0].url).toContain("html.duckduckgo.com");
    expect(result.provider).toBe("DuckDuckGo HTML");
    expect(result.results[0].url).toBe("https://html-result.com/one");
  });

  it("falls back from DuckDuckGo Lite to DuckDuckGo HTML to Bing", async () => {
    chromeSendMessageMock
      .mockResolvedValueOnce({ ok: true, status: 202, html: makeDdgChallengeHtml() })
      .mockResolvedValueOnce({ ok: true, status: 202, html: makeDdgChallengeHtml() })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        html: makeBingResultHtml([
          { title: "Bing Result", url: "https://bing-result.com", snippet: "fallback worked" },
        ]),
      });

    const result = await searchWeb("test", 0, ON_STATUS);

    expect(chromeSendMessageMock).toHaveBeenCalledTimes(3);
    expect(chromeSendMessageMock.mock.calls[0][0].url).toContain("lite.duckduckgo.com");
    expect(chromeSendMessageMock.mock.calls[1][0].url).toContain("html.duckduckgo.com");
    expect(chromeSendMessageMock.mock.calls[2][0].url).toContain("www.bing.com/search");
    expect(result.provider).toBe("Bing");
  });

  it("searches site: queries with the user-configured provider order", async () => {
    chromeSendMessageMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        html: makeBingResultHtml([
          { title: "API Docs overview", url: "https://api-docs.deepseek.com/overview", snippet: "DeepSeek API documentation overview" },
          { title: "Chat Completions API", url: "https://api-docs.deepseek.com/api/chat-completions", snippet: "DeepSeek API chat completions reference" },
          { title: "API Reference Guide", url: "https://api-docs.deepseek.com/reference", snippet: "Complete DeepSeek API reference" },
        ]),
      });

    const result = await searchWeb(
      "site:api-docs.deepseek.com chat completions DeepSeek API",
      0,
      ON_STATUS,
      { providers: ["bing"] }
    );

    expect(chromeSendMessageMock).toHaveBeenCalledTimes(1);
    expect(chromeSendMessageMock.mock.calls[0][0].url).toContain("www.bing.com/search");
    expect(result.provider).toBe("Bing");
    expect(result.results[0].url).toContain("api-docs.deepseek.com");
  });

  it("keeps the default provider order for site: queries when no preference is set", async () => {
    chromeSendMessageMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        html: makeResultHtml([
          {
            title: "EdgeTypE/better-deepseek issue tracker 2025",
            url: "https://github.com/EdgeTypE/better-deepseek/issues",
            snippet: "Issue tracker for better-deepseek, active in 2025.",
          },
        ]),
      });

    const result = await searchWeb(
      "site:github.com better-deepseek issue tracker 2025",
      0,
      ON_STATUS
    );

    expect(chromeSendMessageMock).toHaveBeenCalledTimes(1);
    expect(chromeSendMessageMock.mock.calls[0][0].url).toContain("lite.duckduckgo.com");
    expect(result.provider).toBe("DuckDuckGo Lite");
    expect(result.results[0].url).toContain("github.com");
  });

  it("throws site-scoped error when all providers fail for site: query", async () => {
    chromeSendMessageMock
      .mockResolvedValue({ ok: true, status: 200, html: "<html><body><p>no results</p></body></html>" });

    await expect(searchWeb("site:docs.example.com unknown topic", 0, ON_STATUS))
      .rejects.toThrow(/site.*no.*result|no.*result.*site/i);
  });

  it("normal query still starts with DuckDuckGo Lite", async () => {
    chromeSendMessageMock
      .mockResolvedValueOnce({ ok: true, status: 200, html: makeResultHtml([
        { title: "General", url: "https://example.com", snippet: "general result" },
      ]) });

    const result = await searchWeb("general query without site constraint", 0, ON_STATUS);

    expect(chromeSendMessageMock.mock.calls[0][0].url).toContain("lite.duckduckgo.com");
    expect(result.provider).toBe("DuckDuckGo Lite");
  });
});

describe("MCP search providers", () => {
  const ON_STATUS = vi.fn();
  const EXA_SERVER = {
    id: "srv1",
    name: "Exa",
    serverUrl: "https://mcp.exa.ai/mcp",
    apiKey: "sk-test",
    enabled: true,
    searchTool: { toolName: "web_search_exa", queryArg: "query", countArg: "numResults" },
  };

  const mcpText = (results) => ({
    ok: true,
    result: { content: [{ type: "text", text: JSON.stringify(results) }] },
  });

  beforeEach(() => {
    chromeSendMessageMock.mockReset();
    ON_STATUS.mockReset();
  });

  it("builds a provider descriptor from a server with a searchTool", () => {
    expect(buildMcpSearchProvider(EXA_SERVER)).toEqual({
      id: "mcp:srv1",
      kind: "mcp",
      name: "Exa",
      serverId: "srv1",
      serverUrl: "https://mcp.exa.ai/mcp",
      apiKey: "sk-test",
      toolName: "web_search_exa",
      queryArg: "query",
      countArg: "numResults",
    });
  });

  it("returns null for a server without a usable searchTool", () => {
    expect(buildMcpSearchProvider({ id: "s", name: "n", serverUrl: "https://x/mcp" })).toBeNull();
    expect(buildMcpSearchProvider({ id: "s", serverUrl: "https://x/mcp", searchTool: { toolName: "" } })).toBeNull();
    expect(buildMcpSearchProvider({ id: "s", searchTool: { toolName: "search" } })).toBeNull();
    expect(buildMcpSearchProvider(null)).toBeNull();
  });

  it("defaults the query argument and leaves the count argument empty", () => {
    const provider = buildMcpSearchProvider({ ...EXA_SERVER, searchTool: { toolName: "search" } });
    expect(provider.queryArg).toBe("query");
    expect(provider.countArg).toBe("");
  });

  it("exposes a stable provider id helper", () => {
    expect(mcpSearchProviderId("abc")).toBe("mcp:abc");
  });

  it("appends MCP servers to the settings catalog", () => {
    const catalog = buildSearchProviderCatalog([EXA_SERVER]);
    expect(catalog.map((p) => p.id)).toEqual(["ddg-lite", "ddg-html", "bing", "mcp:srv1"]);
    expect(catalog[0].kind).toBe("http");
    expect(catalog.at(-1)).toEqual({
      id: "mcp:srv1",
      name: "Exa",
      labelKey: null,
      kind: "mcp",
      serverId: "srv1",
    });
  });

  it("resolves an MCP provider id from the configured order", () => {
    const resolved = resolveSearchProviders(["mcp:srv1", "bing"], [EXA_SERVER]);
    expect(resolved.map((p) => p.id)).toEqual(["mcp:srv1", "bing"]);
    expect(resolved[0].kind).toBe("mcp");
  });

  it("drops an MCP id once its server stops being a search provider", () => {
    const resolved = resolveSearchProviders(["mcp:srv1", "bing"], [{ ...EXA_SERVER, searchTool: null }]);
    expect(resolved.map((p) => p.id)).toEqual(["bing"]);
  });

  it("passes already-resolved descriptors through instead of re-resolving them", () => {
    // auto.js / deep-research.js resolve the order first (so they can attach
    // MCP servers) and hand the descriptors to searchWeb. Re-resolving them by
    // stringifying the objects used to drop the entire configured order.
    const resolvedInCaller = resolveSearchProviders(["mcp:srv1", "bing"], [EXA_SERVER]);
    expect(resolveSearchProviders(resolvedInCaller).map((p) => p.id)).toEqual(["mcp:srv1", "bing"]);
  });

  it("parses a JSON result array", () => {
    const text = JSON.stringify([
      { title: "A", url: "https://a.com", text: "about a" },
      { title: "B", url: "https://b.com", summary: "about b" },
    ]);
    expect(parseMcpSearchResults(text)).toEqual([
      { title: "A", url: "https://a.com", snippet: "about a" },
      { title: "B", url: "https://b.com", snippet: "about b" },
    ]);
  });

  it("parses a JSON object wrapping a results array", () => {
    const text = JSON.stringify({ results: [{ title: "A", url: "https://a.com", snippet: "s" }] });
    expect(parseMcpSearchResults(text)).toEqual([
      { title: "A", url: "https://a.com", snippet: "s" },
    ]);
  });

  it("parses fenced JSON embedded in prose", () => {
    const text = 'Here you go:\n```json\n{"results":[{"title":"A","url":"https://a.com"}]}\n```';
    expect(parseMcpSearchResults(text)).toEqual([
      { title: "A", url: "https://a.com", snippet: "" },
    ]);
  });

  it("parses markdown link lists", () => {
    const text = "1. [Alpha](https://alpha.com) — first\n2. [Beta](https://beta.com)";
    expect(parseMcpSearchResults(text).map((r) => r.url)).toEqual([
      "https://alpha.com",
      "https://beta.com",
    ]);
  });

  it("parses Title:/URL: text blocks", () => {
    const text = "Title: Alpha\nURL: https://alpha.com\nSome snippet here.\n\nTitle: Beta\nURL: https://beta.com";
    expect(parseMcpSearchResults(text)).toEqual([
      { title: "Alpha", url: "https://alpha.com", snippet: "Some snippet here." },
      { title: "Beta", url: "https://beta.com", snippet: "" },
    ]);
  });

  it("parses numbered lists whose URLs sit on their own line", () => {
    const text = [
      '8 results for "vector databases" (est. 1,234 total)',
      "",
      "Answer: A vector database stores embeddings.",
      "",
      "1. Best Vector Databases 2026",
      "   https://example.com/best",
      "   A roundup of the leading options.",
      "",
      "2. Pinecone Review",
      "   https://example.com/pinecone",
      "   Hands-on review.",
    ].join("\n");
    expect(parseMcpSearchResults(text)).toEqual([
      {
        title: "Best Vector Databases 2026",
        url: "https://example.com/best",
        snippet: "A roundup of the leading options.",
      },
      { title: "Pinecone Review", url: "https://example.com/pinecone", snippet: "Hands-on review." },
    ]);
  });

  it("parses numbered lists with the URL inline in the heading", () => {
    const text = "1. Alpha — https://alpha.com\n2. Beta (https://beta.com)";
    expect(parseMcpSearchResults(text)).toEqual([
      { title: "Alpha", url: "https://alpha.com", snippet: "" },
      { title: "Beta", url: "https://beta.com", snippet: "" },
    ]);
  });

  it("keeps heading brackets that are not URL wrappers", () => {
    const text = "1. Python (programming language) https://python.org";
    expect(parseMcpSearchResults(text)).toEqual([
      { title: "Python (programming language)", url: "https://python.org", snippet: "" },
    ]);
  });

  it("keeps text that precedes the URL inside a numbered item", () => {
    const text = "1. Alpha\n   A short description.\n   https://alpha.com";
    expect(parseMcpSearchResults(text)).toEqual([
      { title: "Alpha", url: "https://alpha.com", snippet: "A short description." },
    ]);
  });

  it("strips trailing sentence punctuation from a bare URL line", () => {
    const text = "1. Alpha\n   See https://alpha.com.";
    expect(parseMcpSearchResults(text)).toEqual([
      { title: "Alpha", url: "https://alpha.com", snippet: "" },
    ]);
  });

  it("dedupes repeated URLs across numbered items", () => {
    const text = "1. Alpha\n   https://alpha.com\n2. Alpha again\n   https://alpha.com";
    expect(parseMcpSearchResults(text)).toEqual([
      { title: "Alpha", url: "https://alpha.com", snippet: "" },
    ]);
  });

  it("ignores numbered lists that never yield a URL", () => {
    expect(parseMcpSearchResults("1. Alpha\n2. Beta\n3. Gamma")).toEqual([]);
  });

  it("dedupes URLs and ignores non-http entries", () => {
    const text = JSON.stringify([
      { title: "A", url: "https://a.com" },
      { title: "A again", url: "https://a.com" },
      { title: "Bad", url: "not-a-url" },
    ]);
    expect(parseMcpSearchResults(text)).toEqual([{ title: "A", url: "https://a.com", snippet: "" }]);
  });

  it("returns no results for unreadable text", () => {
    expect(parseMcpSearchResults("no links or json here")).toEqual([]);
    expect(parseMcpSearchResults("")).toEqual([]);
    expect(parseMcpSearchResults(undefined)).toEqual([]);
  });

  it("searches through an MCP provider and normalizes the tool result", async () => {
    chromeSendMessageMock.mockResolvedValue(
      mcpText([{ title: "MCP search test result", url: "https://mcp-search-test.com/a", text: "mcp search test content" }])
    );

    const result = await searchWeb("mcp search test", 0, ON_STATUS, {
      providers: ["mcp:srv1"],
      mcpServers: [EXA_SERVER],
    });

    expect(chromeSendMessageMock).toHaveBeenCalledWith({
      type: "bds-mcp-call",
      serverUrl: "https://mcp.exa.ai/mcp",
      apiKey: "sk-test",
      toolName: "web_search_exa",
      args: { query: "mcp search test", numResults: MCP_SEARCH_RESULT_COUNT },
    });
    expect(result.provider).toBe("Exa");
    expect(result.lowConfidence).toBe(false);
    expect(result.results[0]).toEqual({
      title: "MCP search test result",
      url: "https://mcp-search-test.com/a",
      snippet: "mcp search test content",
    });
  });

  it("runs an MCP provider handed over as an already-resolved descriptor", async () => {
    chromeSendMessageMock.mockResolvedValue(
      mcpText([{ title: "MCP search test result", url: "https://mcp-search-test.com/a", text: "mcp search test content" }])
    );

    // Mirrors what auto.js passes: a resolved list, not raw ids.
    const providers = resolveSearchProviders(["mcp:srv1"], [EXA_SERVER]);
    const result = await searchWeb("mcp search test", 0, ON_STATUS, { providers });

    expect(result.provider).toBe("Exa");
    expect(chromeSendMessageMock.mock.calls[0][0].type).toBe("bds-mcp-call");
  });

  it("omits the count argument when the server configures none", async () => {
    chromeSendMessageMock.mockResolvedValue(
      mcpText([{ title: "MCP search test result", url: "https://mcp-search-test.com/a", text: "mcp search test content" }])
    );

    await searchWeb("mcp search test", 0, ON_STATUS, {
      providers: ["mcp:srv1"],
      mcpServers: [{ ...EXA_SERVER, searchTool: { toolName: "web_search_exa", queryArg: "q" } }],
    });

    expect(chromeSendMessageMock.mock.calls[0][0].args).toEqual({ q: "mcp search test" });
  });

  it("falls through to the next provider when the MCP call fails", async () => {
    chromeSendMessageMock
      .mockResolvedValueOnce({ ok: false, error: "server down" })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        html: makeResultHtml([
          { title: "duckduckgo test result", url: "https://ddg-result.com", snippet: "duckduckgo test content" },
        ]),
      });

    const result = await searchWeb("duckduckgo test", 0, ON_STATUS, {
      providers: ["mcp:srv1", "ddg-lite"],
      mcpServers: [EXA_SERVER],
    });

    expect(chromeSendMessageMock.mock.calls[0][0].type).toBe("bds-mcp-call");
    expect(chromeSendMessageMock.mock.calls[1][0].type).toBe("bds-fetch-url");
    expect(result.provider).toBe("DuckDuckGo Lite");
  });

  it("reports an unreadable MCP result as a provider error and moves on", async () => {
    chromeSendMessageMock
      .mockResolvedValueOnce({ ok: true, result: { content: [{ type: "text", text: "nothing parseable" }] } })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        html: makeResultHtml([
          { title: "duckduckgo test result", url: "https://ddg-result.com", snippet: "duckduckgo test content" },
        ]),
      });

    const result = await searchWeb("duckduckgo test", 0, ON_STATUS, {
      providers: ["mcp:srv1", "ddg-lite"],
      mcpServers: [EXA_SERVER],
    });

    expect(result.provider).toBe("DuckDuckGo Lite");
  });
});
