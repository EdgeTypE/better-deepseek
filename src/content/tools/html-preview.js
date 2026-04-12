/**
 * HTML preview tool card.
 */

import { createToolCardShell } from "./common.js";
import { triggerTextDownload } from "../../lib/utils/download.js";
import { ensureHtmlDocument } from "../../lib/utils/html-utils.js";

export function buildHtmlPreviewCard(htmlSource) {
  const card = createToolCardShell("HTML Preview", "Interactive output");

  const frame = document.createElement("iframe");
  frame.className = "bds-preview-frame";
  frame.sandbox = "allow-scripts allow-forms";
  frame.srcdoc = ensureHtmlDocument(String(htmlSource || ""));

  const actions = document.createElement("div");
  actions.className = "bds-card-actions";

  const downloadButton = document.createElement("button");
  downloadButton.type = "button";
  downloadButton.className = "bds-btn";
  downloadButton.textContent = "Download .html";
  downloadButton.addEventListener("click", () => {
    triggerTextDownload(frame.srcdoc, `preview-${Date.now()}.html`);
  });

  actions.appendChild(downloadButton);
  card.body.appendChild(frame);
  card.body.appendChild(actions);

  return card.element;
}
