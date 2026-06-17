/**
 * Bridge to parse PDF files through the extension sandbox.
 *
 * The sandbox is allowed to load external scripts (pdf.js from CDN) and run
 * eval, so we offload PDF text extraction there and return the result via
 * postMessage.
 */

const PDF_JS_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
const SANDBOX_URL = chrome.runtime.getURL("sandbox.html");

/**
 * Parse a PDF ArrayBuffer into plain text via the extension sandbox.
 *
 * @param {ArrayBuffer} buffer
 * @returns {Promise<string>}
 */
export function parsePdfViaSandbox(buffer) {
  return new Promise((resolve, reject) => {
    if (!buffer || buffer.byteLength === 0) {
      reject(new Error("Empty PDF buffer"));
      return;
    }

    const id = Math.random().toString(36).substring(2, 10);
    const iframe = document.createElement("iframe");
    iframe.src = SANDBOX_URL;
    iframe.style.display = "none";
    iframe.setAttribute("sandbox", "allow-scripts allow-same-origin");

    /** @param {MessageEvent} e */
    const handler = (e) => {
      if (!e.data || e.data.id !== id) return;
      if (e.data.type === "BDS_PDF_RESULT") {
        window.removeEventListener("message", handler);
        iframe.remove();
        resolve(String(e.data.text || ""));
      } else if (e.data.type === "BDS_PDF_ERROR") {
        window.removeEventListener("message", handler);
        iframe.remove();
        reject(new Error(e.data.error || "PDF parsing failed"));
      }
    };

    window.addEventListener("message", handler);

    iframe.onload = () => {
      iframe.contentWindow?.postMessage(
        { type: "BDS_PARSE_PDF", buffer: Array.from(new Uint8Array(buffer)), id },
        "*"
      );
    };

    document.body.appendChild(iframe);

    // Safety timeout so a hung sandbox doesn't leave the promise dangling.
    setTimeout(() => {
      window.removeEventListener("message", handler);
      if (iframe.parentNode) iframe.remove();
      reject(new Error("PDF parsing timed out"));
    }, 30000);
  });
}

/**
 * Load pdf.js in the current window. Used inside the sandbox only.
 */
export function loadPdfJsInSandbox() {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("No window"));
      return;
    }
    if (window.pdfjsLib) {
      resolve(window.pdfjsLib);
      return;
    }
    const script = document.createElement("script");
    script.src = PDF_JS_URL;
    script.onload = () => resolve(window.pdfjsLib);
    script.onerror = () => reject(new Error("Failed to load pdf.js"));
    document.head.appendChild(script);
  });
}
