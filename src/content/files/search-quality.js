const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "for",
  "from",
  "how",
  "if",
  "in",
  "into",
  "is",
  "it",
  "its",
  "of",
  "on",
  "or",
  "that",
  "the",
  "their",
  "this",
  "to",
  "was",
  "were",
  "what",
  "when",
  "where",
  "which",
  "who",
  "why",
  "with",
]);

const SEARCH_PROVIDER_DOMAINS = [
  "bing.com",
  "duckduckgo.com",
  "google.com",
  "search.yahoo.com",
];

const SOURCE_TYPE_HINTS = {
  general: [],
  docs: ["documentation", "docs", "reference", "api"],
  news: ["news", "latest", "announcement", "press"],
  reviews: ["review", "reviews", "benchmark", "comparison"],
  academic: ["research", "paper", "study", "journal"],
  commerce: ["buy", "price", "shop", "product"],
};

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeToken(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "");
}

function tokenize(value) {
  return cleanText(value)
    .split(/[\s/|]+/)
    .map((part) => normalizeToken(part))
    .filter(Boolean);
}

function normalizeDomain(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}

function extractMatches(regex, value, normalizer = (match) => cleanText(match)) {
  const matches = [];
  const input = String(value || "");
  let match;
  while ((match = regex.exec(input)) !== null) {
    const normalized = normalizer(match[1] || "");
    if (normalized && !matches.includes(normalized)) {
      matches.push(normalized);
    }
  }
  return matches;
}

export function normalizeSearchUrl(value) {
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol)) return "";
    url.hash = "";
    const pathname = url.pathname.replace(/\/+$/, "") || "/";
    return `${url.protocol}//${url.hostname.toLowerCase()}${pathname}${url.search}`;
  } catch {
    return "";
  }
}

export function extractSearchSignals(query) {
  const normalizedQuery = cleanText(query);
  const quotedPhrases = extractMatches(/"([^"]+)"/g, normalizedQuery);
  const includeSites = extractMatches(/(?:^|\s)site:([^\s]+)/gi, normalizedQuery, normalizeDomain);
  const excludeSites = extractMatches(/(?:^|\s)-site:([^\s]+)/gi, normalizedQuery, normalizeDomain);
  const negativeTerms = extractMatches(
    /(?:^|\s)-(?!(?:site:))([^\s"]+)/gi,
    normalizedQuery,
    normalizeToken
  );
  const years = extractMatches(/\b((?:19|20)\d{2})\b/g, normalizedQuery);
  const importantTokens = tokenize(
    normalizedQuery
      .replace(/"[^"]+"/g, " ")
      .replace(/(?:^|\s)-site:[^\s]+/gi, " ")
      .replace(/(?:^|\s)site:[^\s]+/gi, " ")
      .replace(/(?:^|\s)-[^\s"]+/g, " ")
  ).filter((token) => token.length > 2 && !STOP_WORDS.has(token));

  return {
    normalizedQuery,
    quotedPhrases,
    importantTokens: [...new Set(importantTokens)],
    years,
    includeSites,
    excludeSites,
    negativeTerms,
  };
}

export function buildEffectiveSearchQuery(query, options = {}) {
  const normalizedQuery = cleanText(query);
  const purpose = cleanText(options.purpose);
  const sourceType = cleanText(options.sourceType).toLowerCase();
  if (!normalizedQuery) {
    return { normalizedQuery: "", effectiveQuery: undefined };
  }

  if (!purpose && !sourceType) {
    return { normalizedQuery, effectiveQuery: undefined };
  }

  const queryTokens = new Set(extractSearchSignals(normalizedQuery).importantTokens);
  const purposeTerms = [];
  for (const token of tokenize(purpose)) {
    if (token.length <= 2 || STOP_WORDS.has(token) || queryTokens.has(token) || purposeTerms.includes(token)) {
      continue;
    }
    purposeTerms.push(token);
    if (purposeTerms.length >= 4) break;
  }

  const sourceHint = (SOURCE_TYPE_HINTS[sourceType] || []).find(
    (hint) => !queryTokens.has(hint) && !purposeTerms.includes(hint)
  );
  const additions = [...purposeTerms];
  if (sourceHint) additions.push(sourceHint);
  if (additions.length === 0) {
    return { normalizedQuery, effectiveQuery: undefined };
  }

  return {
    normalizedQuery,
    effectiveQuery: `${normalizedQuery} ${additions.join(" ")}`.trim(),
  };
}

function matchesSite(domain, sites) {
  return sites.some((site) => domain === site || domain.endsWith(`.${site}`));
}

function containsAny(haystack, terms) {
  return terms.some((term) => containsTerm(haystack, term));
}

function sourceTypeScore(sourceType, haystack) {
  const hints = SOURCE_TYPE_HINTS[sourceType] || [];
  return hints.some((hint) => containsTerm(haystack, hint)) ? 8 : 0;
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsTerm(haystack, term) {
  const needle = cleanText(term).toLowerCase();
  if (!needle) return false;
  if (/^[a-z0-9]+$/.test(needle)) {
    return new RegExp(`(^|[^a-z0-9])${escapeRegExp(needle)}($|[^a-z0-9])`, "i").test(haystack);
  }
  return haystack.includes(needle);
}

export function rankSearchResults(query, results, options = {}) {
  const signals = extractSearchSignals(query);
  const sourceType = cleanText(options.sourceType).toLowerCase();
  const seenUrls = new Set();
  const ranked = [];

  results.forEach((result, index) => {
    const normalizedUrl = normalizeSearchUrl(result.url);
    if (!normalizedUrl || seenUrls.has(normalizedUrl)) return;
    seenUrls.add(normalizedUrl);

    let parsedUrl;
    try {
      parsedUrl = new URL(normalizedUrl);
    } catch {
      return;
    }

    const domain = normalizeDomain(parsedUrl.hostname);
    if (matchesSite(domain, SEARCH_PROVIDER_DOMAINS)) return;
    if (signals.includeSites.length > 0 && !matchesSite(domain, signals.includeSites)) return;
    if (signals.excludeSites.length > 0 && matchesSite(domain, signals.excludeSites)) return;

    const title = cleanText(result.title);
    const snippet = cleanText(result.snippet);
    const titleLower = title.toLowerCase();
    const snippetLower = snippet.toLowerCase();
    const urlLower = normalizedUrl.toLowerCase();
    const domainLower = domain.toLowerCase();
    const haystack = `${titleLower}\n${snippetLower}\n${urlLower}\n${domainLower}`;

    if (signals.negativeTerms.length > 0 && containsAny(haystack, signals.negativeTerms)) return;

    let score = Math.max(0, 10 - index);
    for (const token of signals.importantTokens) {
      if (containsTerm(titleLower, token)) score += 5;
      if (containsTerm(snippetLower, token)) score += 2;
      if (containsTerm(urlLower, token) || containsTerm(domainLower, token)) score += 3;
    }
    for (const phrase of signals.quotedPhrases) {
      const phraseLower = phrase.toLowerCase();
      if (titleLower.includes(phraseLower)) score += 12;
      if (snippetLower.includes(phraseLower)) score += 6;
      if (urlLower.includes(phraseLower.replace(/\s+/g, "-"))) score += 4;
    }
    for (const year of signals.years) {
      if (haystack.includes(year)) score += 8;
    }
    score += sourceTypeScore(sourceType, haystack);

    ranked.push({
      ...result,
      score,
      normalizedUrl,
    });
  });

  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return 0;
  });

  const topScore = ranked[0]?.score || 0;
  const passingResults = ranked.filter((result) => result.score >= 12);

  return {
    results: ranked.map(({ normalizedUrl, score, ...result }) => result),
    rawResultCount: results.length,
    passingCount: passingResults.length,
    topScore,
    isStrongTopResult: topScore >= 30,
  };
}
