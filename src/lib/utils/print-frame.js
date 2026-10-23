/**
 * Hidden-iframe printing for the PDF exports.
 *
 * `document.open()` / `document.write()` is the primary path: it re-parses the
 * markup into a real document, so the doctype puts the frame in standards mode
 * and `<title>`, `<style>` and `<link>` behave exactly like a loaded page.
 *
 * Firefox content scripts can't take it. Gecko's `Document::Open` compares the
 * caller's principal with the document's, a content script's expanded principal
 * never matches the page's, and the call throws
 * `SecurityError: The operation is insecure.` — the whole PDF export died there
 * (#202). `document.write()` is no escape either: without an active parser it
 * implies the same `open()`.
 *
 * So the fallback fills the about:blank document's existing <head>/<body> with
 * DOM APIs. That document was never parsed, so it stays in quirks mode — the
 * only visible consequence is that quirks rules apply (e.g. tables stop
 * inheriting `font-size`). Chrome and the Android WebView never reach it.
 */

const PRINT_FRAME_ID = "bds-print-iframe";

/**
 * Fill an iframe's document with `html`.
 *
 * @param {Document} doc The iframe's about:blank document
 * @param {string} html A complete HTML document
 * @returns {"write" | "dom"} Which path was used (handy in tests and logs)
 */
export function fillPrintDocument(doc, html) {
  try {
    doc.open();
    doc.write(html);
    doc.close();
    return "write";
  } catch (err) {
    // Only the content-script principal check is expected here; anything else
    // is a genuine bug and should keep bubbling up.
    if (err?.name !== "SecurityError") throw err;
  }

  fillPrintDocumentViaDom(doc, html);
  return "dom";
}

/**
 * Fallback used where `document.open()` is unavailable: parse the markup in a
 * detached document, then copy the pieces into the frame's existing document.
 */
function fillPrintDocumentViaDom(doc, html) {
  const parsed = new DOMParser().parseFromString(html, "text/html");

  if (!doc.head) {
    doc.documentElement.insertBefore(
      doc.createElement("head"),
      doc.documentElement.firstChild
    );
  }
  if (!doc.body) doc.documentElement.appendChild(doc.createElement("body"));

  // `class="dark"` / `lang` on <html> and any attribute on <body> drive the
  // exported stylesheet, so carry them over before the content.
  copyAttributes(parsed.documentElement, doc.documentElement);
  copyAttributes(parsed.body, doc.body);

  doc.head.innerHTML = parsed.head.innerHTML;
  doc.body.innerHTML = parsed.body.innerHTML;
}

function copyAttributes(from, to) {
  if (!from || !to) return;
  for (const attr of Array.from(from.attributes)) {
    to.setAttribute(attr.name, attr.value);
  }
}

/**
 * Create an off-screen iframe, fill it with `html` and return it.
 * The caller owns the lifecycle (print + removal).
 *
 * @param {string} html A complete HTML document
 * @returns {HTMLIFrameElement}
 */
export function createPrintFrame(html) {
  const iframe = document.createElement("iframe");
  iframe.id = PRINT_FRAME_ID;
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "none";

  document.body.appendChild(iframe);
  fillPrintDocument(iframe.contentWindow.document, html);

  return iframe;
}
