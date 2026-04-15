"use strict";

/**
 * Background service worker.
 */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return false;



  if (message.type === "bds-fetch-github-zip") {
    fetchGithubZip(message.url)
      .then((base64) => {
        sendResponse({ ok: true, base64 });
      })
      .catch((error) => {
        sendResponse({
          ok: false,
          error: String(error && error.message ? error.message : error),
        });
      });
    return true;
  }

  if (message.type === "bds-fetch-url") {
    fetchPageContent(message.url)
      .then((html) => {
        sendResponse({ ok: true, html });
      })
      .catch((error) => {
        sendResponse({
          ok: false,
          error: String(error && error.message ? error.message : error),
        });
      });
    return true;
  }

  return false;
});



function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(
      offset,
      Math.min(offset + chunkSize, bytes.length)
    );
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

async function fetchGithubZip(url) {
  if (!url) throw new Error("No URL provided.");

  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`GitHub returned ${resp.status} for ${url}`);
  }

  const arrayBuffer = await resp.arrayBuffer();
  if (!arrayBuffer || arrayBuffer.byteLength < 100) {
    throw new Error("Received empty or invalid ZIP.");
  }

  const bytes = new Uint8Array(arrayBuffer);
  return bytesToBase64(bytes);
}

async function fetchPageContent(url) {
  if (!url) throw new Error("No URL provided.");

  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Server returned ${resp.status} for ${url}`);
  }

  return await resp.text();
}
