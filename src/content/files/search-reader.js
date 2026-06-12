/**
 * Search Reader
 * Fetches search results via background script / Android bridge, parses the
 * HTML, and returns formatted markdown results. Supports optional deepFetch to
 * auto-read content from top N results.
 */

import { fetchAndConvertWebPage } from "./web-reader.js";

const DUCKDUCKGO_SEARCH_URL = "https://lite.duckduckgo.com/lite/?q=";
const BING_SEARCH_URL = "https://www.bing.com/search?q=";
const MAX_DEEP_FETCH = 5;

const SEARCH_PROVIDERS = [
  {
    name: "DuckDuckGo",
    url: (query) => DUCKDUCKGO_SEARCH_URL + encodeURIComponent(query),
    parse: parseDuckDuckGoSearchResults,
  },
  {
    name: "Bing",
    url: (query) => BING_SEARCH_URL + encodeURIComponent(query),
    parse: parseBingSearchResults,
  },
];

function cleanSearchText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Extract the actual destination URL from a DDG click-track redirect link.
 * DDG wraps real URLs in: //duckduckgo.com/l/?uddg=<encoded_url>&rut=...
 */
function extractUrlFromDdgLink(href) {
  if (!href) return "";
  try {
    const url = new URL(href.startsWith("//") ? "https:" + href : href);
    const uddg = url.searchParams.get("uddg");
    return uddg ? decodeURIComponent(uddg) : href;
  } catch {
    return href;
  }
}

function decodeBase64Url(value) {
  if (!value) return "";

  try {
    const normalized = value
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(value.length / 4) * 4, "=");
    const binary =
      typeof atob === "function"
        ? atob(normalized)
        : typeof Buffer !== "undefined"
          ? Buffer.from(normalized, "base64").toString("binary")
          : "";
    if (!binary) return "";

    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return "";
  }
}

/**
 * Extract the actual destination URL from a Bing click-track redirect link.
 * Bing wraps URLs in /ck/a?...&u=a1<base64url(destination)>&...
 */
function extractUrlFromBingLink(href) {
  if (!href) return "";

  try {
    const url = new URL(href, "https://www.bing.com");
    const wrapped = url.searchParams.get("u");

    if (wrapped) {
      const decodedParam = decodeURIComponent(wrapped);
      const candidates = [
        decodedParam,
        decodedParam.startsWith("a1") || decodedParam.startsWith("a2")
          ? decodedParam.slice(2)
          : "",
      ];

      for (const candidate of candidates) {
        if (isHttpUrl(candidate)) return candidate;

        const decodedUrl = decodeBase64Url(candidate);
        if (isHttpUrl(decodedUrl)) return decodedUrl;
      }
    }

    if (url.hostname.endsWith("bing.com") && url.pathname.startsWith("/ck/")) {
      return "";
    }

    return isHttpUrl(url.toString()) ? url.toString() : href;
  } catch {
    return href;
  }
}

/**
 * Parse DuckDuckGo Lite / HTML result pages.
 *
 * DDG Lite currently uses simple table rows:
 *   <tr>
 *     <td valign="top">1.&nbsp;</td>
 *     <td><a class="result-link" href="//duckduckgo.com/l/?uddg=...">Title</a></td>
 *   </tr>
 *   <tr>
 *     <td>&nbsp;&nbsp;&nbsp;</td>
 *     <td class="result-snippet">Snippet text</td>
 *   </tr>
 *   <tr>
 *     <td>&nbsp;&nbsp;&nbsp;</td>
 *     <td><span class="link-text">example.com/page</span></td>
 *   </tr>
 *
 * DDG HTML can instead use block results:
 *   <div class="result">
 *     <a class="result__a" href="/l/?uddg=...">Title</a>
 *     <a class="result__snippet">Snippet text</a>
 *   </div>
 */
function parseDuckDuckGoSearchResults(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const links = doc.querySelectorAll("a.result-link, a.result__a");
  const results = [];

  for (const link of links) {
    const title = cleanSearchText(link.textContent);
    const rawHref = link.getAttribute("href") || "";
    const url = extractUrlFromDdgLink(rawHref);
    if (!title || !isHttpUrl(url)) continue;

    let snippet = "";
    const resultContainer = link.closest(".result");

    if (resultContainer) {
      snippet = cleanSearchText(resultContainer.querySelector(".result__snippet")?.textContent);
    } else {
      const linkRow = link.closest("tr");
      if (!linkRow) continue;

      const nextRow = linkRow.nextElementSibling;
      const snippetEl = nextRow?.querySelector(".result-snippet");
      snippet = cleanSearchText(snippetEl?.textContent);
    }

    results.push({ title, url, snippet });
  }

  return results;
}

/**
 * Parse Bing HTML result pages used as a fallback when DuckDuckGo returns its
 * Android/OkHttp anomaly page.
 *
 * Bing organic results are list items:
 *   <li class="b_algo">
 *     <h2><a href="https://www.bing.com/ck/a?...&u=a1BASE64URL...">Title</a></h2>
 *     <div class="b_caption"><p>Snippet text</p></div>
 *   </li>
 *
 * The direct destination is stored in the `u` query parameter. Bing prefixes
 * the base64url payload with `a1` / `a2`, so extractUrlFromBingLink strips that
 * marker and decodes the URL before deep-fetch uses it.
 */
function parseBingSearchResults(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const results = [];
  const seenUrls = new Set();

  for (const item of doc.querySelectorAll("li.b_algo")) {
    const link = item.querySelector("h2 a[href]");
    if (!link) continue;

    const title = cleanSearchText(link.textContent);
    const url = extractUrlFromBingLink(link.getAttribute("href") || "");
    if (!title || !isHttpUrl(url) || seenUrls.has(url)) continue;

    const snippet = cleanSearchText(
      item.querySelector(".b_caption p, .b_snippet, .b_lineclamp2, p")?.textContent
    );

    seenUrls.add(url);
    results.push({ title, url, snippet });
  }

  return results;
}

function parseSearchResults(html) {
  const duckDuckGoResults = parseDuckDuckGoSearchResults(html);
  return duckDuckGoResults.length > 0 ? duckDuckGoResults : parseBingSearchResults(html);
}

function isSearchChallengePage(html, status) {
  if (Number(status) === 202) return true;

  const content = String(html || "");
  if (/result-link|result__a|b_algo/.test(content)) return false;

  return /anomaly|captcha|unusual traffic|verify you are human|robot|bot detection/i.test(content);
}

function searchFailureMessage(errors) {
  const messages = errors.map((error) => error.replace(/^[^:]+:\s*/, ""));
  const uniqueMessages = [...new Set(messages)];
  return uniqueMessages.length === 1
    ? `Search failed: ${uniqueMessages[0]}`
    : `Search failed: ${errors.join("; ")}`;
}

/**
 * Format search results as a markdown document.
 */
function formatSearchResults(query, results, provider = "DuckDuckGo") {
  const lines = [];
  lines.push(`# Search Results: ${query}`);
  lines.push("");
  lines.push(`> ${results.length} results found via ${provider}`);
  lines.push("");
  lines.push("---");
  lines.push("");

  results.forEach((result, index) => {
    const rank = index + 1;
    lines.push(`## ${rank}. ${result.title}`);
    lines.push("");
    lines.push(`> ${result.snippet}`);
    lines.push("");
    lines.push(`**URL:** ${result.url}`);
    lines.push("");
    lines.push("---");
    lines.push("");
  });

  return lines.join("\n");
}

/**
 * Format deep-fetched page content as an appendix.
 */
function formatDeepFetchContent(title, url, markdown) {
  const lines = [];
  lines.push("");
  lines.push("=".repeat(64));
  lines.push(`## Page Content: ${title}`);
  lines.push(`**Source:** ${url}`);
  lines.push("=".repeat(64));
  lines.push("");
  lines.push(markdown);
  lines.push("");
  lines.push("---");
  lines.push("");
  return lines.join("\n");
}

/**
 * Search the web.
 *
 * @param {string} query - Search query
 * @param {number} [deepFetch=0] - Number of top results to also fetch full content for
 * @param {(status: string) => void} [onStatus] - Optional status callback
 * @returns {Promise<{file: File, results: Array<{title: string, url: string, snippet: string}>, query: string, deepFetch: number, provider: string}>}
 */
export {
  parseSearchResults,
  formatSearchResults,
  formatDeepFetchContent,
  extractUrlFromDdgLink,
  extractUrlFromBingLink,
};

export async function searchWeb(query, deepFetch = 0, onStatus = () => {}) {
  const trimmedQuery = String(query || "").trim();
  if (!trimmedQuery) {
    throw new Error("Search query is empty.");
  }

  const safeDeepFetch = Math.max(0, Math.min(MAX_DEEP_FETCH, Number(deepFetch) || 0));

  let providerName = "";
  let results = [];
  const errors = [];

  for (const provider of SEARCH_PROVIDERS) {
    onStatus(`Searching ${provider.name}...`);

    let response;
    try {
      response = await chrome.runtime.sendMessage({
        type: "bds-fetch-url",
        url: provider.url(trimmedQuery),
      });
    } catch (err) {
      errors.push(`${provider.name}: ${err.message}`);
      continue;
    }

    if (!response || !response.ok) {
      errors.push(`${provider.name}: ${response?.error || "Search request failed."}`);
      continue;
    }

    onStatus(`Parsing ${provider.name} results...`);
    const parsedResults = provider.parse(response.html || "");
    if (parsedResults.length > 0) {
      providerName = provider.name;
      results = parsedResults;
      break;
    }

    errors.push(
      `${provider.name}: ${
        isSearchChallengePage(response.html, response.status)
          ? "search provider returned an anti-bot challenge"
          : "no results"
      }`
    );
  }

  if (results.length === 0) {
    const onlyNoResults = errors.length > 0 && errors.every((error) => /: no results$/.test(error));
    if (onlyNoResults) {
      throw new Error("No search results found for query: " + trimmedQuery);
    }
    throw new Error(searchFailureMessage(errors));
  }

  let output = formatSearchResults(trimmedQuery, results, providerName);

  if (safeDeepFetch > 0) {
    onStatus(`Fetching content from top ${safeDeepFetch} results...`);
    const urlsToFetch = results.slice(0, safeDeepFetch);

    for (let i = 0; i < urlsToFetch.length; i++) {
      const result = urlsToFetch[i];
      try {
        onStatus(`Reading page ${i + 1}/${safeDeepFetch}: ${result.title}`);
        const file = await fetchAndConvertWebPage(result.url, () => {});
        const markdown = await file.text();
        output += formatDeepFetchContent(result.title, result.url, markdown);
      } catch (err) {
        output += formatDeepFetchContent(
          result.title,
          result.url,
          `*(Failed to fetch page content: ${err.message})*`
        );
      }
    }
  }

  onStatus("Creating file...");
  const blob = new Blob([output], { type: "text/markdown" });
  const safeFilename =
    trimmedQuery
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "-")
      .slice(0, 50) + "-search.md";

  const file = new File([blob], safeFilename, { type: "text/markdown" });
  return { file, results, query: trimmedQuery, deepFetch: safeDeepFetch, provider: providerName };
}
