/**
 * YouTube Data Reader
 * Extracts metadata and transcripts from YouTube video pages.
 */

import { normalizeHttpUrl } from "../../lib/utils/url-normalizer.js";

export async function fetchYouTubeData(videoUrl) {
  try {
    const normalizedVideoUrl = normalizeHttpUrl(videoUrl);
    const videoId = extractVideoId(normalizedVideoUrl);
    if (!videoId) throw new Error("Invalid YouTube URL.");

    // 1. Fetch metadata (Title/Description) via simple page fetch
    // This is less likely to break than transcript parsing
    const metaResponse = await chrome.runtime.sendMessage({
      type: "bds-fetch-url",
      url: `https://www.youtube.com/watch?v=${videoId}`
    });

    let title = "YouTube Video";
    let description = "";

    if (metaResponse && metaResponse.ok) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(metaResponse.html, "text/html");
      title = doc.querySelector('meta[name="title"]')?.content || 
              doc.querySelector('title')?.innerText || "YouTube Video";
      description = doc.querySelector('meta[name="description"]')?.content || "";
    }

    // 2. Fetch Transcript via the library in the background script
    const transcriptResponse = await chrome.runtime.sendMessage({
      type: "bds-get-youtube-transcript",
      videoId: videoId
    });

    let transcriptText = "";

    if (transcriptResponse && transcriptResponse.ok && Array.isArray(transcriptResponse.transcript)) {
      if (transcriptResponse.transcript.length === 0) {
        transcriptText = "[Transcript is empty. This video might not have captions available.]";
      } else {
        transcriptText = formatLibraryTranscript(transcriptResponse.transcript);
      }
    } else if (transcriptResponse && !transcriptResponse.ok) {
      transcriptText = `[Error fetching transcript: ${transcriptResponse.error}]`;
    } else {
      transcriptText = "[Could not retrieve transcript data from the background script.]";
    }

    const finalOutput = [
      `Title: ${title}`,
      `URL: ${normalizedVideoUrl}`,
      `Description: ${description}`,
      `\n${"=".repeat(64)}\n`,
      `TRANSCRIPT:`,
      `\n${transcriptText}`
    ].join("\n");

    const blob = new Blob([finalOutput], { type: "text/plain" });
    const fileName = `youtube_${videoId}.txt`;

    return new File([blob], fileName, { type: "text/plain" });
  } catch (err) {
    console.error("[YouTubeReader] Error:", err);
    throw err;
  }
}

function formatLibraryTranscript(transcriptArray) {
  return transcriptArray.map(item => {
    const start = item.offset / 1000;
    const minutes = Math.floor(start / 60);
    const seconds = Math.floor(start % 60).toString().padStart(2, '0');
    return `[${minutes}:${seconds}] ${item.text}`;
  }).join("\n");
}

function extractVideoId(url) {
  const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[7].length === 11) ? match[7] : null;
}

function parseTranscriptXml(xmlString) {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, "text/xml");
  const textNodes = xmlDoc.getElementsByTagName("text");
  
  let result = "";
  for (let i = 0; i < textNodes.length; i++) {
    const start = textNodes[i].getAttribute("start");
    const text = textNodes[i].textContent
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");
    
    // Format as [MM:SS] Text
    const minutes = Math.floor(start / 60);
    const seconds = Math.floor(start % 60).toString().padStart(2, '0');
    result += `[${minutes}:${seconds}] ${text}\n`;
  }
  
  return result.trim();
}
