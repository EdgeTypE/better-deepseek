"use strict";

/**
 * Background service worker.
 * Handles LaTeX compilation via latexonline.cc.
 */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== "bds-compile-latex") {
    return false;
  }

  compileLatexToPdfBase64(String(message.source || ""))
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
});

async function compileLatexToPdfBase64(source) {
  if (!source.trim()) {
    throw new Error("Empty LaTeX source.");
  }

  const providers = [
    // Provider 1: TeXLive.net (Robust POST API - Supports full TeX Live)
    async () => {
      const formData = new FormData();
      // TeXLive.net expects multipart/form-data
      formData.append("filecontents[]", source);
      formData.append("filename[]", "document.tex");
      formData.append("engine", "pdflatex");
      formData.append("return", "pdf");

      const resp = await fetch("https://texlive.net/cgi-bin/latexcgi", {
        method: "POST",
        body: formData,
      });

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`TeXLive.net failed (${resp.status}): ${text.slice(0, 100)}`);
      }
      return resp.arrayBuffer();
    },
    // Provider 2: LaTeX Online (Classic GET API - Backup)
    async () => {
      const resp = await fetch(
        `https://latexonline.cc/compile?text=${encodeURIComponent(source)}`
      );
      if (!resp.ok) throw new Error(`LaTeXOnline failed: ${resp.status}`);
      return resp.arrayBuffer();
    },
  ];

  let lastError = null;
  for (const provider of providers) {
    try {
      const arrayBuffer = await provider();
      if (!arrayBuffer || arrayBuffer.byteLength < 100) {
        throw new Error("Received invalid or empty PDF buffer.");
      }
      const bytes = new Uint8Array(arrayBuffer);
      return bytesToBase64(bytes);
    } catch (e) {
      console.warn("LaTeX Provider failed, trying next...", e.message);
      lastError = e;
    }
  }

  throw new Error(
    `All LaTeX providers failed. Last error: ${
      lastError && lastError.message ? lastError.message : "Unknown error"
    }`
  );
}

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
