/**
 * Twitter (X) Tweet Reader
 * Fetches tweet text and metadata via Twitter's OEmbed API.
 */

import { normalizeHttpUrl } from "../../lib/utils/url-normalizer.js";

export async function fetchTwitterTweet(tweetUrl) {
  try {
    const normalizedTweetUrl = normalizeHttpUrl(tweetUrl);
    const apiUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(normalizedTweetUrl)}`;
    
    const response = await chrome.runtime.sendMessage({
      type: "bds-fetch-url",
      url: apiUrl
    });

    if (!response || !response.ok) {
      throw new Error("Failed to fetch tweet info from Twitter OEmbed.");
    }

    const data = JSON.parse(response.html); // The background script returns it as 'html' text
    const authorName = data.author_name;
    const authorUrl = data.author_url;
    const originalHtml = data.html || "";

    // Extract text from the blockquote html returned by OEmbed
    // It usually looks like: <blockquote class="twitter-tweet"><p lang="en" dir="ltr">TEXT</p>&mdash; USER (@HANDLE) <a href="...">DATE</a></blockquote>
    const parser = new DOMParser();
    const doc = parser.parseFromString(originalHtml, "text/html");
    const p = doc.querySelector("p");
    
    let tweetText = p ? p.innerText : "Could not extract tweet text.";
    
    // Minimal cleaning: remove the "pic.twitter.com" links at the end if any
    tweetText = tweetText.replace(/pic\.twitter\.com\/\S+/g, "").trim();

    const finalOutput = [
      `Author: ${authorName} (@${authorUrl.split("/").pop()})`,
      `URL: ${normalizedTweetUrl}`,
      `---`,
      tweetText
    ].join("\n\n");

    const blob = new Blob([finalOutput], { type: "text/markdown" });
    const fileName = `tweet_${authorName.replace(/\s+/g, "_")}.md`;

    return new File([blob], fileName, { type: "text/markdown" });
  } catch (err) {
    console.error("[TwitterReader] Error:", err);
    throw err;
  }
}
