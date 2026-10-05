/**
 * Pricing service — 3-tier fallback for DeepSeek API pricing data.
 *
 * 1. Scrape official pricing page (via service worker)
 * 2. Fetch pricing.json from GitHub repo
 * 3. Use embedded fallback pricing
 */

import { devLog } from "./dev-log.js";
import { EMBEDDED_PRICING, PRICING_URLS } from "./constants.js";

let pricingCache = null;
let fetchPromise = null;

/**
 * Resolve the canonical model name from an alias.
 */
export function resolveModelName(modelName) {
  if (!modelName) return "deepseek-flash";
  const name = String(modelName).toLowerCase();
  const aliases = {
    "deepseek-v4-flash": "deepseek-flash",
    "deepseek-v4-flash-vision-exp": "deepseek-flash",
    "deepseek-chat": "deepseek-flash",
    "deepseek-reasoner": "deepseek-v4-pro",
    "instant": "deepseek-flash",
    "expert": "deepseek-v4-pro",
  };
  return aliases[name] || name;
}

/**
 * Get pricing data for a specific model.
 * Returns { inputPrice, inputCacheHitPrice, outputPrice, displayName } per 1M tokens.
 */
export function getModelPricing(modelName) {
  const pricing = pricingCache || EMBEDDED_PRICING;
  const resolved = resolveModelName(modelName);
  // The cached table can be a remote payload that predates a model rename, so
  // fall back through the legacy keys before giving up.
  const models = pricing?.models || {};
  const model =
    models[resolved] ||
    models["deepseek-flash"] ||
    models["deepseek-v4-flash"] ||
    models["deepseek-chat"] ||
    EMBEDDED_PRICING.models["deepseek-flash"];
  return {
    inputPrice: model.inputPrice || 0.15,
    inputCacheHitPrice: model.inputCacheHitPrice || 0.003,
    outputPrice: model.outputPrice || 0.6,
    displayName: model.displayName || resolved,
    contextLength: model.contextLength || 1000000,
  };
}

/**
 * Calculate cost given token counts and pricing.
 */
export function calculateCost(inputTokens, outputTokens, modelName) {
  const pricing = getModelPricing(modelName);
  const inputCost = (inputTokens / 1_000_000) * pricing.inputPrice;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPrice;
  return {
    inputCost,
    outputCost,
    totalCost: inputCost + outputCost,
    modelDisplayName: pricing.displayName,
  };
}

/**
 * Format a dollar amount for display.
 */
export function formatCost(amount) {
  if (amount < 0.0001) return "$0.0000";
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  if (amount < 1) return `$${amount.toFixed(3)}`;
  return `$${amount.toFixed(2)}`;
}

/**
 * Initialize pricing: try to fetch external sources, fall back to embedded.
 */
export async function initPricing() {
  if (fetchPromise) return fetchPromise;

  fetchPromise = (async () => {
    // Tier 1: Try official pricing page via service worker
    try {
      const pricing = await fetchOfficialPricing();
      if (pricing && pricing.models && Object.keys(pricing.models).length > 0) {
        pricingCache = pricing;
        // devLog("Pricing", "Pricing loaded from official site");
        return pricingCache;
      }
    } catch (e) {
      console.warn("[BDS] Official pricing fetch failed:", e.message);
    }

    // Tier 2: Try GitHub repo pricing.json
    try {
      const pricing = await fetchGitHubPricing();
      if (pricing && pricing.models && Object.keys(pricing.models).length > 0) {
        pricingCache = pricing;
        // devLog("Pricing", "Pricing loaded from GitHub");
        return pricingCache;
      }
    } catch (e) {
      console.warn("[BDS] GitHub pricing fetch failed:", e.message);
    }

    // Tier 3: Use embedded fallback
    pricingCache = EMBEDDED_PRICING;
    // devLog("Pricing", "Using embedded fallback pricing");
    return pricingCache;
  })();

  return fetchPromise;
}

async function fetchOfficialPricing() {
  const html = await fetchPageViaServiceWorker(PRICING_URLS.official);
  return parsePricingFromHtml(html);
}

async function fetchGitHubPricing() {
  const response = await fetch(PRICING_URLS.github);
  if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
  return response.json();
}

/**
 * Fetch a page via the service worker (to avoid CORS).
 */
function fetchPageViaServiceWorker(url) {
  return new Promise((resolve, reject) => {
    if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.sendMessage) {
      reject(new Error("chrome.runtime unavailable"));
      return;
    }

    try {
      chrome.runtime.sendMessage(
        { type: "bds-fetch-url", url, options: { method: "GET" } },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (response && response.ok) {
            resolve(response.html);
          } else {
            reject(new Error(response?.error || "Fetch failed"));
          }
        }
      );
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Parse the DeepSeek pricing page HTML to extract model pricing.
 * Looks for the pricing table on https://api-docs.deepseek.com/quick_start/pricing/
 *
 * The page lists three price rows (cache hit / cache miss / output) and, per
 * row, an OFF-PEAK and a PEAK column — one column per model. We deliberately
 * read the OFF-PEAK tier: peak is exactly double, and understating the bill is
 * far less surprising than showing a peak rate while the user is off-peak.
 *
 * Exported for tests.
 */
export function parsePricingFromHtml(html) {
  if (!html || typeof html !== "string") return null;

  const models = {};

  // Pattern: Look for model names and pricing data in the text content
  const text = html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

  // Preferred: read the labelled price rows and keep the OFF-PEAK column.
  Object.assign(models, parseOffPeakPricingRows(text));

  // Fallback: older / differently shaped pricing tables.
  if (Object.keys(models).length === 0) {
    const v4FlashMatch = extractModelPricing(text, "deepseek-flash", "deepseek v4.1 flash", "deepseek v4 flash", "flash");
    if (v4FlashMatch) models["deepseek-flash"] = v4FlashMatch;

    const v4ProMatch = extractModelPricing(text, "deepseek-v4-pro", "deepseek v4 pro", "pro");
    if (v4ProMatch) models["deepseek-v4-pro"] = v4ProMatch;

    const fallback = parsePricingTableFromText(text);
    for (const [key, val] of Object.entries(fallback)) {
      if (!models[key]) models[key] = val;
    }
  }

  if (Object.keys(models).length === 0) return null;

  return {
    updatedAt: new Date().toISOString().split("T")[0],
    models,
  };
}

const MONEY = "\\$\\s*(\\d+(?:\\.\\d+)?)";
const MONEY_ONLY = "\\$\\s*\\d+(?:\\.\\d+)?";

/**
 * Build the regex for one price row:
 *   "<LABEL> OFF-PEAK $a $b PEAK $c $d"
 * where $a/$c are the first model column and $b/$d the second. The PEAK half is
 * optional so a single-tier table still parses.
 */
function buildPriceRowRegex(label) {
  return new RegExp(
    `${label}\\s*OFF-PEAK\\s*${MONEY}\\s*${MONEY}(?:\\s*PEAK\\s*${MONEY_ONLY}\\s*${MONEY_ONLY})?`,
    "i"
  );
}

const CACHE_HIT_ROW_RE = buildPriceRowRegex("CACHE HIT\\)?");
const CACHE_MISS_ROW_RE = buildPriceRowRegex("CACHE MISS\\)?");
const OUTPUT_ROW_RE = buildPriceRowRegex("OUTPUT TOKENS");

/**
 * Read the three labelled price rows and return the OFF-PEAK pricing per model.
 * Returns {} when the page does not carry the expected rows.
 */
function parseOffPeakPricingRows(text) {
  const hit = CACHE_HIT_ROW_RE.exec(text);
  const miss = CACHE_MISS_ROW_RE.exec(text);
  const out = OUTPUT_ROW_RE.exec(text);
  if (!hit || !miss || !out) return {};

  // Per row the amounts are: [off-peak model A, off-peak model B]
  const offPeak = (m) => [Number(m[1]), Number(m[2])];
  const rows = [offPeak(hit), offPeak(miss), offPeak(out)];

  // The table lists the cheaper Flash column first, but pick by price so a
  // column reorder cannot swap the two models.
  const flashIndex = rows[1][0] <= rows[1][1] ? 0 : 1;
  const proIndex = flashIndex === 0 ? 1 : 0;

  const models = {};
  const put = (key, displayName, index) => {
    const [inputCacheHitPrice, inputPrice, outputPrice] = rows.map((r) => r[index]);
    if (!(inputCacheHitPrice > 0) || !(inputPrice > 0) || !(outputPrice > 0)) return;
    models[key] = { displayName, inputPrice, inputCacheHitPrice, outputPrice };
  };
  put("deepseek-flash", "DeepSeek-V4.1-Flash", flashIndex);
  put("deepseek-v4-pro", "DeepSeek-V4-Pro", proIndex);

  return models;
}

/**
 * Reduce a flat list of dollar amounts to the off-peak
 * (cache hit, input, output) triple.
 *
 * When both tiers are present the amounts arrive in pairs — peak is always
 * exactly double off-peak — so sorting and keeping the lower member of every
 * consecutive pair recovers the off-peak tier whatever order they appeared in.
 * An odd count means the table lists a single tier; use it as-is.
 */
function pickOffPeakAmounts(amounts) {
  const sorted = [...amounts].sort((a, b) => a - b);
  if (sorted.length >= 6 && sorted.length % 2 === 0) {
    return sorted.filter((_, i) => i % 2 === 0);
  }
  return sorted;
}

function extractModelPricing(text, ...keywords) {
  // Find the section of text containing the model name
  let modelSection = "";
  for (const kw of keywords) {
    const idx = text.toLowerCase().indexOf(kw.toLowerCase());
    if (idx >= 0) {
      modelSection = text.substring(Math.max(0, idx - 50), idx + 500);
      break;
    }
  }
  if (!modelSection) return null;

  // Extract dollar amounts
  const amounts = modelSection.match(/\$(\d+\.?\d*)/g) || [];
  const numericAmounts = amounts
    .map((a) => parseFloat(a.replace("$", "")))
    .filter((n) => !isNaN(n) && n > 0);

  if (numericAmounts.length < 3) return null;

  // The pricing page lists: input cache hit, input cache miss, output
  const [cacheHit, input, output] = pickOffPeakAmounts(numericAmounts);
  if (!(cacheHit > 0) || !(input > 0) || !(output > 0)) return null;

  return {
    displayName: keywords[0],
    inputPrice: input,
    inputCacheHitPrice: cacheHit,
    outputPrice: output,
  };
}

function parsePricingTableFromText(text) {
  const models = {};

  // Parse the pricing table section
  // Look for "PRICING" section followed by model rows
  const pricingIdx = text.toLowerCase().indexOf("pricing");
  if (pricingIdx < 0) return models;

  const pricingSection = text.substring(pricingIdx);

  const modelPatterns = [
    { key: "deepseek-flash", regex: /deepseek.v4\.?1?.flash|deepseek.flash|v4\.?1?\s*flash|flash/i },
    { key: "deepseek-v4-pro", regex: /deepseek.v4.pro|v4\s*pro/i },
  ];

  for (const { key, regex } of modelPatterns) {
    const modelStart = pricingSection.search(regex);
    if (modelStart < 0) continue;

    const modelText = pricingSection.substring(modelStart, modelStart + 400);
    const amounts = (modelText.match(/\$(\d+\.?\d*)/g) || [])
      .map((a) => parseFloat(a.replace("$", "")))
      .filter((n) => !isNaN(n) && n > 0);

    if (amounts.length < 3) continue;

    const [inputCacheHitPrice, inputPrice, outputPrice] = pickOffPeakAmounts(amounts);
    models[key] = {
      displayName: key === "deepseek-flash" ? "DeepSeek-V4.1-Flash" : "DeepSeek-V4-Pro",
      inputPrice,
      inputCacheHitPrice,
      outputPrice,
    };
  }

  return models;
}

/**
 * Get the current pricing data (cached).
 */
export function getPricingData() {
  return pricingCache || EMBEDDED_PRICING;
}

/**
 * Check if pricing is available (has been loaded).
 */
export function isPricingLoaded() {
  return pricingCache !== null;
}
