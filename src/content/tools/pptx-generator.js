/**
 * PowerPoint generation tool card.
 * Refined UI: Mimics a download card, hides code by default.
 */

import PptxGenJS from "pptxgenjs";
import { createToolCardShell } from "./common.js";

/**
 * Builds a refined UI card for PowerPoint generation.
 * @param {string} jsCode - The JavaScript code snippet using PptxGenJS API.
 * @returns {HTMLElement} The card element.
 */
export function buildPptxCard(jsCode) {
  const card = createToolCardShell("PowerPoint Generator", "PptxGenJS Engine");
  card.element.classList.add("bds-pptx-card");

  // Try to extract filename from code
  const filenameMatch = jsCode.match(/fileName:\s*["'](.*?)["']/);
  const fileName = filenameMatch ? filenameMatch[1] : "Presentation.pptx";

  const body = card.body;

  // 1. Download Card Section
  const downloadWrapper = document.createElement("div");
  downloadWrapper.className = "bds-pptx-download-wrapper";

  const info = document.createElement("div");
  info.className = "bds-pptx-info";

  const icon = document.createElement("div");
  icon.className = "bds-pptx-icon";
  icon.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
      <polyline points="14 2 14 8 20 8"></polyline>
      <text x="7" y="18" font-size="6" font-weight="bold" fill="currentColor" stroke="none" style="font-family: sans-serif;">PPTX</text>
    </svg>
  `;

  const details = document.createElement("div");
  details.className = "bds-pptx-details";
  const h4 = document.createElement("h4");
  h4.textContent = "PowerPoint Presentation";
  const p = document.createElement("p");
  p.textContent = fileName;
  details.appendChild(h4);
  details.appendChild(p);

  info.appendChild(icon);
  info.appendChild(details);

  const downloadBtn = document.createElement("button");
  downloadBtn.type = "button";
  downloadBtn.className = "bds-btn";
  downloadBtn.textContent = "Download";

  downloadWrapper.appendChild(info);
  downloadWrapper.appendChild(downloadBtn);

  // 2. Script Toggle Section
  const scriptToggleWrapper = document.createElement("div");
  scriptToggleWrapper.className = "bds-pptx-script-toggle";

  const toggleBtn = document.createElement("button");
  toggleBtn.type = "button";
  toggleBtn.className = "bds-pptx-script-btn";
  toggleBtn.textContent = "Show generated script";

  const scriptContent = document.createElement("pre");
  scriptContent.className = "bds-pptx-script-content hidden";
  scriptContent.textContent = jsCode.trim();

  toggleBtn.addEventListener("click", () => {
    const isHidden = scriptContent.classList.toggle("hidden");
    toggleBtn.textContent = isHidden ? "Show generated script" : "Hide script";
  });

  scriptToggleWrapper.appendChild(toggleBtn);
  scriptToggleWrapper.appendChild(scriptContent);

  // --- Logic ---
  downloadBtn.addEventListener("click", async () => {
    const originalText = downloadBtn.textContent;
    try {
      downloadBtn.textContent = "Processing...";
      downloadBtn.disabled = true;
      
      const func = new Function("PptxGenJS", "pptxgen", jsCode);
      await func(PptxGenJS, PptxGenJS);
      
      downloadBtn.textContent = "Done!";
      setTimeout(() => {
        downloadBtn.textContent = originalText;
        downloadBtn.disabled = false;
      }, 2000);
    } catch (err) {
      console.error("PPTX Gen Error:", err);
      downloadBtn.textContent = "Error";
      downloadBtn.style.backgroundColor = "var(--bds-danger)";
      setTimeout(() => {
        downloadBtn.textContent = originalText;
        downloadBtn.style.backgroundColor = "";
        downloadBtn.disabled = false;
      }, 3000);
    }
  });

  body.appendChild(downloadWrapper);
  body.appendChild(scriptToggleWrapper);

  return card.element;
}
