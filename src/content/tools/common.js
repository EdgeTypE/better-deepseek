/**
 * Shared UI builders for tool cards and download cards.
 */

import { triggerBlobDownload } from "../../lib/utils/download.js";

/**
 * Create a tool card shell with header and body.
 */
export function createToolCardShell(title, subtitle) {
  const element = document.createElement("article");
  element.className = "bds-tool-card";

  const header = document.createElement("header");
  header.className = "bds-tool-card-header";

  const titleNode = document.createElement("h4");
  titleNode.textContent = title;

  const subtitleNode = document.createElement("p");
  subtitleNode.textContent = subtitle;

  header.appendChild(titleNode);
  header.appendChild(subtitleNode);

  const body = document.createElement("div");
  body.className = "bds-tool-card-body";

  element.appendChild(header);
  element.appendChild(body);

  return { element, body };
}

/**
 * Build a download card with title, description, and download button.
 */
export function buildDownloadCard({ title, description, fileName, blob }) {
  const card = document.createElement("article");
  card.className = "bds-download-card";

  const titleNode = document.createElement("h4");
  titleNode.textContent = title;

  const descriptionNode = document.createElement("p");
  descriptionNode.textContent = description;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "bds-btn";
  button.textContent = `Download ${fileName}`;
  button.addEventListener("click", () => {
    triggerBlobDownload(blob, fileName);
  });

  card.appendChild(titleNode);
  card.appendChild(descriptionNode);
  card.appendChild(button);

  return card;
}
