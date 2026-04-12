/**
 * Enhance code blocks with download buttons.
 */

import state from "../state.js";
import { CODE_EXTENSION_MAP } from "../../lib/constants.js";
import { triggerTextDownload } from "../../lib/utils/download.js";

/**
 * Scan all <pre> elements and attach download buttons.
 */
export function enhanceCodeBlockDownloads() {
  const blocks = document.querySelectorAll("pre");

  for (const pre of blocks) {
    if (
      pre.closest("#bds-root") ||
      pre.dataset.bdsCodeDownloadAttached === "1"
    ) {
      continue;
    }

    const codeElement = pre.querySelector("code");
    if (!codeElement) {
      continue;
    }

    const codeText = String(codeElement.textContent || "");
    if (!codeText.trim()) {
      continue;
    }

    pre.dataset.bdsCodeDownloadAttached = "1";
    pre.style.position = "relative";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "bds-code-download";
    button.textContent = "Download";

    button.addEventListener("click", () => {
      const extension = detectCodeExtension(codeElement);
      const fileName = `snippet-${++state.downloadCounter}.${extension}`;
      triggerTextDownload(codeText, fileName);
    });

    pre.appendChild(button);
  }
}

/**
 * Detect file extension from a code element's language class.
 */
function detectCodeExtension(codeElement) {
  const className = `${codeElement.className || ""} ${
    codeElement.parentElement ? codeElement.parentElement.className : ""
  }`;
  const languageMatch =
    className.match(/language-([a-z0-9_+-]+)/i) ||
    className.match(/lang-([a-z0-9_+-]+)/i);

  if (languageMatch) {
    const lang = String(languageMatch[1] || "").toLowerCase();
    if (CODE_EXTENSION_MAP[lang]) {
      return CODE_EXTENSION_MAP[lang];
    }
  }

  const firstLine = String(codeElement.textContent || "")
    .split("\n")[0]
    .toLowerCase();
  if (firstLine.startsWith("#!/usr/bin/env python")) {
    return "py";
  }

  return "txt";
}
