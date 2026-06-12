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
} from "./search-reader.js";

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
    expect(md).toContain("> 2 results found via DuckDuckGo");
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

describe("searchWeb", () => {
  const ON_STATUS = vi.fn();

  beforeEach(() => {
    chromeSendMessageMock.mockReset();
    ON_STATUS.mockReset();
  });

  it("fetches search results and returns a markdown File with metadata", async () => {
    const html = makeResultHtml([
      { title: "Result One", url: "https://one.com", snippet: "First snippet" },
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
    expect(result.provider).toBe("DuckDuckGo");
    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toEqual({
      title: "Result One",
      url: "https://one.com",
      snippet: "First snippet",
    });
    const text = await readFileAsText(result.file);
    expect(text).toContain("# Search Results: test query");
    expect(text).toContain("## 1. Result One");
    expect(ON_STATUS).toHaveBeenCalled();
  });

  it("falls back to Bing when DuckDuckGo returns the Android anomaly page", async () => {
    chromeSendMessageMock
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

    expect(chromeSendMessageMock).toHaveBeenCalledTimes(2);
    expect(chromeSendMessageMock.mock.calls[0][0].url).toContain("lite.duckduckgo.com");
    expect(chromeSendMessageMock.mock.calls[1][0].url).toContain("www.bing.com/search");
    expect(result.provider).toBe("Bing");
    expect(result.results).toEqual([
      {
        title: "Top Dog Breeds in the Philippines",
        url: "https://example.com/dogs-philippines",
        snippet: "Popular dogs for pet owners in the Philippines.",
      },
    ]);
    expect(text).toContain("> 1 results found via Bing");
    expect(ON_STATUS).toHaveBeenCalledWith("Searching Bing...");
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
});
