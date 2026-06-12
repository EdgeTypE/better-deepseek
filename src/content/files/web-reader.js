/**
 * Web Page Reader
 * Fetches HTML via background script, extracts main content with Readability,
 * and converts to Markdown with Turndown.
 */

import { Readability } from "@mozilla/readability";
import TurndownService from "turndown";
import { normalizeHttpUrl } from "../../lib/utils/url-normalizer.js";

/**
 * Attempt to fix mojibake by reinterpreting UTF-8-decoded bytes
 * as windows-1251. This reverses the common encoding mis-match
 * where a page served in windows-1251 was decoded as UTF-8.
 */
function attemptMojibakeFix(html) {
  if (!html || !html.includes("\uFFFD")) return null;

  try {
    const encoder = new TextEncoder();
    const rawBytes = encoder.encode(html);
    const fixed = new TextDecoder("windows-1251", { fatal: false }).decode(rawBytes);
    if (fixed && fixed !== html && fixed.includes("\uFFFD") === false) {
      return fixed;
    }
    return null;
  } catch {
    return null;
  }
}

function convertHtmlToMarkdown(html, url) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  const base = doc.createElement("base");
  base.href = url;
  doc.head.appendChild(base);

  const reader = new Readability(doc);
  const article = reader.parse();

  if (!article) {
    throw new Error("Could not parse main content from this page.");
  }

  const turndownService = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced"
  });

  const markdown = turndownService.turndown(article.content);

  return {
    title: article.title,
    author: article.byline || "Unknown",
    siteName: article.siteName || "Unknown",
    markdown,
  };
}

export async function fetchAndConvertWebPage(url, onStatus = () => {}) {
  try {
    const normalizedUrl = normalizeHttpUrl(url);
    onStatus("Fetching page content...");
    const response = await chrome.runtime.sendMessage({
      type: "bds-fetch-url",
      url: normalizedUrl
    });

    if (!response || !response.ok) {
      throw new Error(response?.error || "Failed to fetch page.");
    }

    onStatus("Processing content...");
    let html = response.html;

    let result;
    try {
      result = convertHtmlToMarkdown(html, normalizedUrl);
    } catch (firstErr) {
      // If parsing failed, try mojibake fix as fallback
      const fixedHtml = attemptMojibakeFix(html);
      if (fixedHtml) {
        html = fixedHtml;
        result = convertHtmlToMarkdown(html, normalizedUrl);
      } else {
        throw firstErr;
      }
    }

    // Secondary check: if article text contains replacement characters,
    // try re-encoding fix
    if (result.markdown.includes("\uFFFD")) {
      const fixedHtml = attemptMojibakeFix(html);
      if (fixedHtml) {
        try {
          result = convertHtmlToMarkdown(fixedHtml, normalizedUrl);
        } catch {
          // fall through to original result
        }
      }
    }

    onStatus("Converting to Markdown...");
    const finalOutput = `Title: ${result.title}\nURL: ${normalizedUrl}\nAuthor: ${result.author}\nSite: ${result.siteName}\n\n${"=".repeat(64)}\n\n${result.markdown}`;

    onStatus("Creating file...");
    const blob = new Blob([finalOutput], { type: "text/markdown" });
    const fileName = (result.title || "web-page")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "-")
      .slice(0, 50) + ".md";

    return new File([blob], fileName, { type: "text/markdown" });
  } catch (err) {
    console.error("[WebReader] Error:", err);
    throw err;
  }
}
