(function() {
  "use strict";
  "use strict";
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || message.type !== "bds-compile-latex") {
      return false;
    }
    compileLatexToPdfBase64(String(message.source || "")).then((base64) => {
      sendResponse({ ok: true, base64 });
    }).catch((error) => {
      sendResponse({
        ok: false,
        error: String(error && error.message ? error.message : error)
      });
    });
    return true;
  });
  async function compileLatexToPdfBase64(source) {
    if (!source.trim()) {
      throw new Error("Empty LaTeX source.");
    }
    const compileUrl = `https://latexonline.cc/compile?text=${encodeURIComponent(source)}`;
    const response = await fetch(compileUrl, { method: "GET" });
    if (!response.ok) {
      throw new Error(
        `LaTeX compile request failed with status ${response.status}.`
      );
    }
    const arrayBuffer = await response.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    return bytesToBase64(bytes);
  }
  function bytesToBase64(bytes) {
    let binary = "";
    const chunkSize = 32768;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      const chunk = bytes.subarray(
        offset,
        Math.min(offset + chunkSize, bytes.length)
      );
      binary += String.fromCharCode(...chunk);
    }
    return btoa(binary);
  }
})();
