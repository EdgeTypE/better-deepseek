/**
 * Pricing service — 3-tier fallback for DeepSeek API pricing data.
 *
 * 1. Scrape official pricing page (via service worker)
 * 2. Fetch pricing.json from GitHub repo
 * 3. Use embedded fallback pricing
 */

import { EMBEDDED_PRICING, PRICING_URLS } from "./constants.js";

let pricingCache = null;
let fetchPromise = null;

/**
 * Resolve the canonical model name from an alias.
 */
export function resolveModelName(modelName) {
  if (!modelName) return "deepseek-v4-flash";
  const name = String(modelName).toLowerCase();
  const aliases = {
    "deepseek-chat": "deepseek-v4-flash",
    "deepseek-reasoner": "deepseek-v4-pro",
    "instant": "deepseek-v4-flash",
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
  const model = pricing.models[resolved] || pricing.models["deepseek-v4-flash"];
  return {
    inputPrice: model.inputPrice || 0.14,
    inputCacheHitPrice: model.inputCacheHitPrice || 0.0028,
    outputPrice: model.outputPrice || 0.28,
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
        console.log("[BDS] Pricing loaded from official site");
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
        console.log("[BDS] Pricing loaded from GitHub");
        return pricingCache;
      }
    } catch (e) {
      console.warn("[BDS] GitHub pricing fetch failed:", e.message);
    }

    // Tier 3: Use embedded fallback
    pricingCache = EMBEDDED_PRICING;
    console.log("[BDS] Using embedded fallback pricing");
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
 */
function parsePricingFromHtml(html) {
  if (!html || typeof html !== "string") return null;

  const models = {};

  // Extract the pricing table from the HTML content
  // The MDX-rendered page contains markdown-style pricing information

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

  // Extract deepseek-v4-flash pricing
  // Looking for patterns like: "deepseek-v4-flash" near "$0.14" for input, "$0.28" for output
  const v4FlashMatch = extractModelPricing(text, "deepseek-v4-flash", "deepseek v4 flash", "flash");
  if (v4FlashMatch) models["deepseek-v4-flash"] = v4FlashMatch;

  // Extract deepseek-v4-pro pricing
  const v4ProMatch = extractModelPricing(text, "deepseek-v4-pro", "deepseek v4 pro", "pro");
  if (v4ProMatch) models["deepseek-v4-pro"] = v4ProMatch;

  // Try to find pricing by dollar amounts near model names
  // More robust: find the Pricing table section and parse rows
  const fallback = parsePricingTableFromText(text);
  for (const [key, val] of Object.entries(fallback)) {
    if (!models[key]) models[key] = val;
  }

  if (Object.keys(models).length === 0) return null;

  return {
    updatedAt: new Date().toISOString().split("T")[0],
    models,
  };
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

  // The pricing page typically lists: input cache hit, input cache miss, output
  // Sort and assign: lowest = cache hit, middle = input, highest = output typically
  const sorted = [...numericAmounts].sort((a, b) => a - b);

  const cacheHit = sorted[0];
  const output = sorted[sorted.length - 1];
  // Input (cache miss) is the main input price
  const input = sorted.length >= 2
    ? sorted.find((v) => v > cacheHit && v < output) || sorted[1]
    : sorted[sorted.length - 2] || sorted[0];

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

  // Model patterns with their pricing
  const modelPatterns = [
    {
      key: "deepseek-v4-flash",
      regex: /deepseek.v4.flash|v4\s*flash|flash/i,
      inputCache: [0.0028, 0.014, 0.028],
      inputMiss: [0.14, 0.435, 1.74],
      output: [0.28, 0.87, 3.48],
    },
    {
      key: "deepseek-v4-pro",
      regex: /deepseek.v4.pro|v4\s*pro/i,
      inputCache: [0.003625, 0.0145],
      inputMiss: [0.435, 1.74],
      output: [0.87, 3.48],
    },
  ];

  for (const { key, regex } of modelPatterns) {
    if (regex.test(pricingSection)) {
      // Find all dollar amounts associated with this model section
      const modelStart = pricingSection.search(regex);
      if (modelStart >= 0) {
        const modelText = pricingSection.substring(modelStart, modelStart + 400);
        const amounts = (modelText.match(/\$(\d+\.?\d*)/g) || [])
          .map((a) => parseFloat(a.replace("$", "")))
          .filter((n) => !isNaN(n) && n > 0);

        if (amounts.length >= 3) {
          const sorted = [...amounts].sort((a, b) => a - b);
          models[key] = {
            displayName: key === "deepseek-v4-flash" ? "DeepSeek V4 Flash" : "DeepSeek V4 Pro",
            inputPrice: sorted[1], // second smallest = input cache miss
            inputCacheHitPrice: sorted[0], // smallest = cache hit
            outputPrice: sorted[sorted.length - 1], // largest = output
          };
        }
      }
    }
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
