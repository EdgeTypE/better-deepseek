/**
 * Search Reader
 * Fetches search results via background script / Android bridge, parses the
 * HTML, and returns formatted markdown results. Supports optional deepFetch to
 * auto-read content from top N results.
 */

import { fetchAndConvertWebPage } from "./web-reader.js";
import { buildEffectiveSearchQuery, rankSearchResults, extractSearchSignals } from "./search-quality.js";
import { extractMcpResultText } from "../../lib/mcp-result.js";
import { parseLooseJson } from "../parser/json-repair.js";

const DUCKDUCKGO_SEARCH_URL = "https://lite.duckduckgo.com/lite/?q=";
const DUCKDUCKGO_HTML_SEARCH_URL = "https://html.duckduckgo.com/html/?q=";
const BING_SEARCH_URL = "https://www.bing.com/search?q=";
const MAX_DEEP_FETCH = 5;

// Hard per-provider budget. A hanging provider (e.g. blocked or blackholed
// host) must fail fast so the chain can move on to the next provider (#148).
const SEARCH_PROVIDER_TIMEOUT_MS = 15_000;

// Prepended when only weak-relevance results could be recovered — tells the
// model to treat the evidence cautiously instead of citing it as fact (#148).
const LOW_CONFIDENCE_NOTICE =
  "> ⚠️ Low-confidence results: no search provider returned strongly relevant matches. Verify before citing.";

const SEARCH_FETCH_OPTIONS = {
  method: "GET",
  headers: {
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache, no-store",
    Pragma: "no-cache",
  },
  cache: "no-store",
  credentials: "omit",
  redirect: "follow",
  timeoutMs: SEARCH_PROVIDER_TIMEOUT_MS,
};

const SEARCH_PROVIDERS = [
  {
    id: "ddg-lite",
    name: "DuckDuckGo Lite",
    url: (query) => DUCKDUCKGO_SEARCH_URL + encodeURIComponent(query),
    parse: parseDuckDuckGoSearchResults,
  },
  {
    id: "ddg-html",
    name: "DuckDuckGo HTML",
    url: (query) => DUCKDUCKGO_HTML_SEARCH_URL + encodeURIComponent(query),
    parse: parseDuckDuckGoSearchResults,
  },
  {
    id: "bing",
    name: "Bing",
    url: (query) => BING_SEARCH_URL + encodeURIComponent(query),
    parse: parseBingSearchResults,
  },
];

/**
 * i18n keys for provider labels, kept explicit so code ids (kebab-case) and
 * locale keys (camelCase) can't drift apart again.
 */
const PROVIDER_LABEL_KEYS = {
  "ddg-lite": "settings.searchProvider.ddgLite",
  "ddg-html": "settings.searchProvider.ddgHtml",
  "bing": "settings.searchProvider.bing",
};

/** Canonical id+label list for settings UI rendering (built-in providers only). */
export const SEARCH_PROVIDER_CATALOG = SEARCH_PROVIDERS.map(({ id, name }) => ({
  id,
  name,
  labelKey: PROVIDER_LABEL_KEYS[id],
}));

/**
 * Provider-id prefix for MCP-backed search providers. An MCP server becomes a
 * search provider by gaining a `searchTool` config, and is then referenced in
 * `settings.searchProviders` as `mcp:<serverId>`.
 */
export const MCP_SEARCH_PROVIDER_PREFIX = "mcp:";

/** Fallback argument name when the user leaves the query argument blank. */
export const DEFAULT_MCP_QUERY_ARG = "query";

/**
 * Result count requested from an MCP search tool when a count argument is
 * configured. Mirrors the ballpark of the HTML providers so ranking and the
 * weak-result fallback behave the same way.
 */
export const MCP_SEARCH_RESULT_COUNT = 8;

/** Build the stable provider id for an MCP server entry. */
export function mcpSearchProviderId(serverId) {
  return MCP_SEARCH_PROVIDER_PREFIX + String(serverId || "");
}

/**
 * Turn an MCP server entry into a search provider descriptor.
 *
 * Returns null unless the server is configured as a search provider — i.e. it
 * has a `searchTool.toolName`. Servers without that stay plain MCP servers and
 * never appear in the search chain.
 *
 * @param {object} server Normalized MCP server entry from state.mcpServers.
 * @returns {null | {
 *   id: string, kind: "mcp", name: string, serverId: string,
 *   serverUrl: string, apiKey: string, toolName: string,
 *   queryArg: string, countArg: string
 * }}
 */
export function buildMcpSearchProvider(server) {
  if (!server || typeof server !== "object") return null;

  const toolName = String(server.searchTool?.toolName || "").trim();
  const serverUrl = String(server.serverUrl || "").trim();
  if (!toolName || !serverUrl) return null;

  return {
    id: mcpSearchProviderId(server.id),
    kind: "mcp",
    name: String(server.name || serverUrl),
    serverId: String(server.id || ""),
    serverUrl,
    apiKey: String(server.apiKey || ""),
    toolName,
    queryArg: String(server.searchTool?.queryArg || "").trim() || DEFAULT_MCP_QUERY_ARG,
    countArg: String(server.searchTool?.countArg || "").trim(),
  };
}

/** Collect the search providers contributed by the configured MCP servers. */
export function collectMcpSearchProviders(mcpServers) {
  if (!Array.isArray(mcpServers)) return [];
  return mcpServers.map(buildMcpSearchProvider).filter(Boolean);
}

/**
 * Canonical id+label list for the settings UI: the built-in providers followed
 * by every MCP server configured as a search provider. `labelKey` is null for
 * MCP entries — their display name is user-supplied.
 */
export function buildSearchProviderCatalog(mcpServers = []) {
  const catalog = SEARCH_PROVIDER_CATALOG.map((provider) => ({
    ...provider,
    kind: "http",
  }));
  for (const provider of collectMcpSearchProviders(mcpServers)) {
    catalog.push({
      id: provider.id,
      name: provider.name,
      labelKey: null,
      kind: "mcp",
      serverId: provider.serverId,
    });
  }
  return catalog;
}

/**
 * Resolve a user-configured provider order into an active provider list.
 *
 * Unknown ids are dropped, duplicates are removed, and a missing or fully
 * invalid list falls back to the built-in order. Disabled providers stay
 * disabled — the returned list is used verbatim by searchWeb.
 *
 * MCP providers are only resolvable while their server still has a
 * `searchTool`; removing the tool config silently drops the id, and the
 * built-in fallback keeps search working.
 *
 * @param {Array<string|object>} [preferred] Provider ids, or descriptors that
 *   a caller already resolved (passed through untouched).
 * @param {Array<object>} [mcpServers] state.mcpServers, for MCP provider lookup.
 */
export function resolveSearchProviders(preferred, mcpServers = []) {
  const available = [...SEARCH_PROVIDERS, ...collectMcpSearchProviders(mcpServers)];
  if (!Array.isArray(preferred)) return [...SEARCH_PROVIDERS];

  const byId = new Map(available.map((provider) => [provider.id, provider]));
  const seen = new Set();
  const resolved = [];

  for (const raw of preferred) {
    // A caller may hand us provider descriptors it already resolved (auto.js
    // and deep-research.js do, so they can attach MCP servers). Passing those
    // through `String(raw)` would stringify the object to "[object Object]",
    // match nothing, and silently drop the whole user-configured order.
    if (isResolvedProvider(raw)) {
      if (!seen.has(raw.id)) {
        resolved.push(raw);
        seen.add(raw.id);
      }
      continue;
    }

    const provider = byId.get(String(raw));
    if (provider && !seen.has(provider.id)) {
      resolved.push(provider);
      seen.add(provider.id);
    }
  }
  return resolved.length > 0 ? resolved : [...SEARCH_PROVIDERS];
}

/** True for a provider descriptor produced by this module. */
function isResolvedProvider(value) {
  return Boolean(value)
    && typeof value === "object"
    && typeof value.id === "string"
    && value.id !== ""
    && (typeof value.parse === "function" || value.kind === "mcp");
}

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
    const normalizedHref = href.startsWith("//")
      ? "https:" + href
      : href.startsWith("/")
        ? "https://duckduckgo.com" + href
        : href;
    const url = new URL(normalizedHref);
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
function formatSearchResults(query, results, provider = "DuckDuckGo Lite") {
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

// ── MCP search result normalization ──
//
// MCP search tools return whatever their author chose: an Exa-style JSON blob,
// a fenced JSON block, a markdown list, "Title:/URL:" text, or a numbered list
// whose URLs sit on their own line. There is no shared schema, so we probe the
// common shapes in order of reliability and fall back to link extraction. A
// format we cannot read yields zero results, which makes the provider report
// "no results" and lets the next provider run — a safe failure rather than a
// silently wrong result.

const MCP_RESULT_SNIPPET_MAX = 500;
const MCP_JSON_LIST_KEYS = [
  "results", "items", "data", "organic_results", "documents",
  "hits", "searchResults", "sources", "pages",
];
const MCP_URL_KEYS = ["url", "link", "href", "sourceUrl", "source_url", "uri"];
const MCP_TITLE_KEYS = ["title", "name", "heading", "label", "siteName", "site_name"];
const MCP_SNIPPET_KEYS = [
  "snippet", "description", "summary", "text", "content",
  "highlights", "highlight", "excerpt",
];

function truncateSnippet(value) {
  const text = cleanSearchText(value);
  return text.length > MCP_RESULT_SNIPPET_MAX
    ? text.slice(0, MCP_RESULT_SNIPPET_MAX) + "…"
    : text;
}

function pickFirstString(entry, keys) {
  for (const key of keys) {
    const value = entry[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
}

function normalizeMcpEntry(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;

  const url = pickFirstString(entry, MCP_URL_KEYS).trim();
  if (!isHttpUrl(url)) return null;

  const title = cleanSearchText(pickFirstString(entry, MCP_TITLE_KEYS)) || url;

  let snippet = "";
  for (const key of MCP_SNIPPET_KEYS) {
    const value = entry[key];
    if (typeof value === "string" && value.trim()) {
      snippet = value;
      break;
    }
    // Some tools return highlights as a string array.
    if (Array.isArray(value) && value.length && typeof value[0] === "string") {
      snippet = value.join(" ");
      break;
    }
  }

  return { title, url, snippet: truncateSnippet(snippet) };
}

function collectMcpEntries(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  for (const key of MCP_JSON_LIST_KEYS) {
    if (Array.isArray(value[key])) return value[key];
  }
  // A bare single-result object is still a result.
  return [value];
}

function dedupeByUrl(entries) {
  const seen = new Set();
  const out = [];
  for (const entry of entries) {
    if (seen.has(entry.url)) continue;
    seen.add(entry.url);
    out.push(entry);
  }
  return out;
}

/**
 * Extract the first balanced `{...}` or `[...]` substring, ignoring brackets
 * that appear inside JSON strings. Used when a tool wraps its JSON in prose.
 */
function extractBalancedJson(text) {
  const start = text.search(/[[{]/);
  if (start === -1) return "";

  const stack = [];
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') { inString = true; continue; }
    if (ch === "{" || ch === "[") { stack.push(ch); continue; }
    if (ch === "}" || ch === "]") {
      const open = stack.pop();
      if (!open) return "";
      if ((ch === "}" && open !== "{") || (ch === "]" && open !== "[")) return "";
      if (stack.length === 0) return text.slice(start, i + 1);
    }
  }

  return "";
}

function parseMarkdownLinkResults(text) {
  const results = [];
  const linkRe = /\[([^\]\n]{1,300})\]\((https?:\/\/[^\s)]+)\)/g;
  let match;
  while ((match = linkRe.exec(text)) !== null) {
    const url = match[2];
    if (!isHttpUrl(url)) continue;
    results.push({ title: cleanSearchText(match[1]) || url, url, snippet: "" });
  }
  return results;
}

const LABELED_URL_RE = /^\s*(?:URL|Url|url|Link|Source|Source URL)\s*:\s*(https?:\/\/\S+)\s*$/;
const LABELED_TITLE_RE = /^\s*(?:Title|Name)\s*:\s*(.+)$/;

function parseLabeledUrlResults(text) {
  const lines = String(text || "").split(/\r?\n/);
  const results = [];
  let pendingTitle = "";

  for (let i = 0; i < lines.length; i++) {
    const titleMatch = lines[i].match(LABELED_TITLE_RE);
    if (titleMatch) {
      pendingTitle = cleanSearchText(titleMatch[1]);
      continue;
    }

    const urlMatch = lines[i].match(LABELED_URL_RE);
    if (!urlMatch) continue;

    const url = urlMatch[1].replace(/[.,;)]+$/, "");
    if (!isHttpUrl(url)) {
      pendingTitle = "";
      continue;
    }

    let snippet = "";
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j].trim();
      if (!line || LABELED_TITLE_RE.test(line) || LABELED_URL_RE.test(line)) break;
      snippet += (snippet ? " " : "") + line;
    }

    results.push({ title: pendingTitle || url, url, snippet: truncateSnippet(snippet) });
    pendingTitle = "";
  }

  return results;
}

// A second family of search tools answers in prose rather than data: a numbered
// heading, the URL on a line of its own, then a description. No brackets, no
// field labels — nothing the JSON or link parsers can key on, so it gets its
// own pass. It runs last because it is by far the loosest matcher.

const NUMBERED_ITEM_RE = /^\s*(\d{1,3})[.)]\s+(\S.*)$/;
const BARE_URL_RE = /https?:\/\/[^\s<>"'`)\]]+/;

/** First http(s) URL in a line, with trailing sentence punctuation removed. */
function extractBareUrl(text) {
  const match = String(text || "").match(BARE_URL_RE);
  if (!match) return "";
  const url = match[0].replace(/[.,;:!?]+$/, "");
  return isHttpUrl(url) ? url : "";
}

/** Heading text with the URL taken out, leaving no dangling brackets or separators. */
function cleanHeadingAroundUrl(heading, url) {
  return cleanSearchText(
    heading
      .replace(url, " ")
      .replace(/\(\s*\)|\[\s*\]|\{\s*\}/g, " ")
      .replace(/^[\s\-–—:•|,]+|[\s\-–—:•|,]+$/g, ""),
  );
}

/**
 * Parse numbered result lists that carry a bare URL line.
 *
 * Deliberately tolerant about ordering: the URL may be inline in the heading,
 * on the following line, or after a lead-in paragraph. Lines are buffered per
 * item and only become a snippet once a URL has been seen, so a numbered list
 * that never yields a URL produces nothing and lets the caller fall through.
 *
 * @param {string} text Tool result text.
 * @returns {Array<{title: string, url: string, snippet: string}>}
 */
function parseNumberedListResults(text) {
  const lines = String(text || "").split(/\r?\n/);
  const results = [];
  let current = null;

  const flush = () => {
    if (current?.url) {
      results.push({
        title: current.title || current.url,
        url: current.url,
        snippet: truncateSnippet(current.body.join(" ")),
      });
    }
    current = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const item = line.match(NUMBERED_ITEM_RE);
    if (item) {
      flush();
      const heading = cleanSearchText(item[2]);
      const inlineUrl = extractBareUrl(heading);
      current = {
        // Drop the URL from the heading, plus any bracket pair or separator it
        // left behind, so "Beta (https://b.com)" still reads as "Beta".
        title: inlineUrl ? cleanHeadingAroundUrl(heading, inlineUrl) : heading,
        url: inlineUrl,
        body: [],
      };
      continue;
    }

    if (!current) continue;

    if (!current.url) {
      const url = extractBareUrl(line);
      if (url) {
        current.url = url;
        continue;
      }
    }
    current.body.push(line);
  }

  flush();
  return results;
}

/**
 * Normalize the text returned by an MCP search tool into `{title, url, snippet}`
 * entries the ranking pipeline understands.
 *
 * @param {string} text Tool result text.
 * @returns {Array<{title: string, url: string, snippet: string}>}
 */
export function parseMcpSearchResults(text) {
  const source = String(text || "").trim();
  if (!source) return [];

  const candidates = [];
  const direct = parseLooseJson(source);
  if (direct.value !== null) candidates.push(direct.value);

  const balanced = extractBalancedJson(source);
  if (balanced && balanced !== source) {
    const parsed = parseLooseJson(balanced);
    if (parsed.value !== null) candidates.push(parsed.value);
  }

  for (const candidate of candidates) {
    const entries = collectMcpEntries(candidate).map(normalizeMcpEntry).filter(Boolean);
    if (entries.length > 0) return dedupeByUrl(entries);
  }

  const markdown = parseMarkdownLinkResults(source);
  if (markdown.length > 0) return dedupeByUrl(markdown);

  const labeled = parseLabeledUrlResults(source);
  if (labeled.length > 0) return labeled;

  return dedupeByUrl(parseNumberedListResults(source));
}

/**
 * Call an MCP-backed search provider and return the raw tool result text.
 * Throws with a provider-readable message on transport or tool failure.
 */
async function fetchMcpSearchText(provider, query) {
  const args = { [provider.queryArg]: query };
  if (provider.countArg) args[provider.countArg] = MCP_SEARCH_RESULT_COUNT;

  const response = await chrome.runtime.sendMessage({
    type: "bds-mcp-call",
    serverUrl: provider.serverUrl,
    apiKey: provider.apiKey,
    toolName: provider.toolName,
    args,
  });

  if (!response || !response.ok) {
    throw new Error(response?.error || "MCP search request failed.");
  }

  return extractMcpResultText(response.result);
}

/**
 * Search the web.
 *
 * @param {string} query - Search query
 * @param {number} [deepFetch=0] - Number of top results to also fetch full content for
 * @param {(status: string, info?: { phase: string, provider?: string }) => void} [onStatus] - Optional status callback
 * @typedef {{
 *   purpose?: string,
 *   sourceType?: "general"|"docs"|"news"|"reviews"|"academic"|"commerce",
 *   providers?: string[] | Array<object>,
 *   mcpServers?: Array<object>
 * }} SearchOptions
 * @param {SearchOptions} [options] - Optional query shaping, ranking hints and
 *   user-configured provider ids (see resolveSearchProviders)
 * @returns {Promise<{file: File, results: Array<{title: string, url: string, snippet: string}>, query: string, deepFetch: number, provider: string, effectiveQuery?: string, rawResultCount: number}>}
 */
export {
  parseSearchResults,
  formatSearchResults,
  formatDeepFetchContent,
  extractUrlFromDdgLink,
  extractUrlFromBingLink,
};

export async function searchWeb(query, deepFetch = 0, onStatus = () => {}, options = {}) {
  const trimmedQuery = String(query || "").trim();
  if (!trimmedQuery) {
    throw new Error("Search query is empty.");
  }

  const safeDeepFetch = Math.max(0, Math.min(MAX_DEEP_FETCH, Number(deepFetch) || 0));
  const { normalizedQuery, effectiveQuery } = buildEffectiveSearchQuery(trimmedQuery, options);
  const providerQuery = effectiveQuery || normalizedQuery;

  // Detect positive site: constraints for error messaging
  const signals = extractSearchSignals(providerQuery);
  const hasSiteConstraint = signals.includeSites.length > 0;
  const siteDomains = hasSiteConstraint ? signals.includeSites.join(", ") : "";

  // Provider order is user-configured (settings.searchProviders); callers pass
  // either the raw ids plus the MCP servers, or an already-resolved list.
  // Falls back to the built-in order when nothing resolves.
  const activeProviders = resolveSearchProviders(options.providers, options.mcpServers);

  let providerName = "";
  let results = [];
  let rawResultCount = 0;
  const errors = [];
  let bestWeakResult = null;

  for (const provider of activeProviders) {
    onStatus(`Searching ${provider.name}...`, { phase: "searching", provider: provider.name });

    let parsedResults;

    if (provider.kind === "mcp") {
      let text;
      try {
        text = await fetchMcpSearchText(provider, providerQuery);
      } catch (err) {
        errors.push(`${provider.name}: ${err.message}`);
        continue;
      }

      onStatus(`Parsing ${provider.name} results...`, { phase: "parsing", provider: provider.name });
      parsedResults = parseMcpSearchResults(text);
      if (parsedResults.length === 0) {
        errors.push(`${provider.name}: no results`);
        continue;
      }
    } else {
      let response;
      try {
        response = await chrome.runtime.sendMessage({
          type: "bds-fetch-url",
          url: provider.url(providerQuery),
          options: SEARCH_FETCH_OPTIONS,
        });
      } catch (err) {
        errors.push(`${provider.name}: ${err.message}`);
        continue;
      }

      if (!response || !response.ok) {
        errors.push(`${provider.name}: ${response?.error || "Search request failed."}`);
        continue;
      }

      onStatus(`Parsing ${provider.name} results...`, { phase: "parsing", provider: provider.name });
      parsedResults = provider.parse(response.html || "");
      if (parsedResults.length === 0) {
        errors.push(
          `${provider.name}: ${
            isSearchChallengePage(response.html, response.status)
              ? "search provider returned an anti-bot challenge"
              : "no results"
          }`
        );
        continue;
      }
    }

    const rankedResults = rankSearchResults(trimmedQuery, parsedResults, options);
    if (
      !bestWeakResult ||
      rankedResults.topScore > bestWeakResult.topScore ||
      (rankedResults.topScore === bestWeakResult.topScore &&
        rankedResults.results.length > bestWeakResult.results.length)
    ) {
      bestWeakResult = {
        providerName: provider.name,
        results: rankedResults.results,
        rawResultCount: rankedResults.rawResultCount,
        topScore: rankedResults.topScore,
      };
    }

    if (rankedResults.results.length === 0) {
      errors.push(`${provider.name}: no qualifying results`);
      continue;
    }

    if (rankedResults.passingCount >= 3 || rankedResults.isStrongTopResult) {
      providerName = provider.name;
      results = rankedResults.results;
      rawResultCount = rankedResults.rawResultCount;
      break;
    }

    errors.push(`${provider.name}: weak relevance`);
  }

  let usedWeakFallback = false;
  if (results.length === 0 && bestWeakResult?.results?.length > 0) {
    usedWeakFallback = true;
    providerName = bestWeakResult.providerName;
    results = bestWeakResult.results;
    rawResultCount = bestWeakResult.rawResultCount;
  }

  if (results.length === 0) {
    const onlyNoResults =
      errors.length > 0 &&
      errors.every((error) => /: no (results|qualifying results)$/.test(error));
    if (onlyNoResults) {
      if (hasSiteConstraint) {
        throw new Error(`No search results found for site: ${siteDomains}.`);
      }
      throw new Error("No search results found for query: " + trimmedQuery);
    }
    throw new Error(searchFailureMessage(errors));
  }

  let output = formatSearchResults(trimmedQuery, results, providerName);
  if (usedWeakFallback) {
    output = LOW_CONFIDENCE_NOTICE + "\n\n" + output;
  }

  if (safeDeepFetch > 0) {
    onStatus(`Fetching content from top ${safeDeepFetch} results...`, { phase: "deep-fetch" });
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

  onStatus("Creating file...", { phase: "finalize" });
  const blob = new Blob([output], { type: "text/markdown" });
  const safeFilename =
    trimmedQuery
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "-")
      .slice(0, 50) + "-search.md";

  const file = new File([blob], safeFilename, { type: "text/markdown" });
  return {
    file,
    results,
    query: trimmedQuery,
    deepFetch: safeDeepFetch,
    provider: providerName,
    effectiveQuery,
    rawResultCount: rawResultCount || results.length,
    lowConfidence: usedWeakFallback,
  };
}
