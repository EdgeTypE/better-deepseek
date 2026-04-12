/**
 * LaTeX tool card — compile and preview PDFs.
 */

import state from "../state.js";
import { createToolCardShell } from "./common.js";
import {
  triggerTextDownload,
  triggerBlobDownload,
} from "../../lib/utils/download.js";
import { base64ToBlob } from "../../lib/utils/helpers.js";
import { simpleHash } from "../../lib/utils/hash.js";

export function buildLatexCard(latexSource) {
  const source = String(latexSource || "");
  const card = createToolCardShell("LaTeX to PDF", "Compile and download");

  const status = document.createElement("p");
  status.className = "bds-latex-status";
  status.textContent = "Compiling PDF preview...";

  const pdfFrame = document.createElement("iframe");
  pdfFrame.className = "bds-latex-pdf-frame";
  pdfFrame.title = "LaTeX PDF Preview";

  const sourceDetails = document.createElement("details");
  sourceDetails.className = "bds-latex-source-details";

  const sourceSummary = document.createElement("summary");
  sourceSummary.textContent = "Show LaTeX source";

  const preview = document.createElement("pre");
  preview.className = "bds-latex-preview";
  preview.textContent = source.slice(0, 4000);

  sourceDetails.appendChild(sourceSummary);
  sourceDetails.appendChild(preview);

  const actions = document.createElement("div");
  actions.className = "bds-card-actions";

  const pdfButton = document.createElement("button");
  pdfButton.type = "button";
  pdfButton.className = "bds-btn";
  pdfButton.textContent = "Download PDF";
  pdfButton.addEventListener("click", async () => {
    const previousText = pdfButton.textContent;
    pdfButton.disabled = true;
    pdfButton.textContent = "Preparing PDF...";
    await downloadLatexPdf(source, `latex-${Date.now()}.pdf`);
    pdfButton.disabled = false;
    pdfButton.textContent = previousText;
  });

  const texButton = document.createElement("button");
  texButton.type = "button";
  texButton.className = "bds-btn bds-btn-secondary";
  texButton.textContent = "Download .tex";
  texButton.addEventListener("click", () => {
    triggerTextDownload(source, `latex-${Date.now()}.tex`);
  });

  actions.appendChild(pdfButton);
  actions.appendChild(texButton);

  card.body.appendChild(status);
  card.body.appendChild(pdfFrame);
  card.body.appendChild(sourceDetails);
  card.body.appendChild(actions);

  void renderLatexPdfPreview(source, pdfFrame, status);

  if (state.settings.autoDownloadLatexPdf) {
    const autoKey = simpleHash(source);
    if (!state.processedLatexAutoDownloads.has(autoKey)) {
      state.processedLatexAutoDownloads.add(autoKey);
      void downloadLatexPdf(source, `latex-${Date.now()}.pdf`);
    }
  }

  return card.element;
}

async function renderLatexPdfPreview(source, pdfFrame, statusNode) {
  try {
    const blob = await compileLatexPdfBlob(source);
    const nextUrl = URL.createObjectURL(blob);

    const previousUrl = pdfFrame.dataset.pdfUrl;
    if (previousUrl) {
      URL.revokeObjectURL(previousUrl);
    }

    pdfFrame.dataset.pdfUrl = nextUrl;
    pdfFrame.src = nextUrl;
    statusNode.textContent = "PDF preview ready.";
  } catch (error) {
    statusNode.textContent =
      "PDF preview could not be rendered. You can use Download PDF or Download .tex.";
    pdfFrame.removeAttribute("src");
  }
}

export async function compileLatexPdfBlob(source) {
  const response = await chrome.runtime.sendMessage({
    type: "bds-compile-latex",
    source,
  });

  if (!response || !response.ok || !response.base64) {
    throw new Error(
      response && response.error ? response.error : "LaTeX compile failed."
    );
  }

  return base64ToBlob(response.base64, "application/pdf");
}

export async function downloadLatexPdf(source, fileName) {
  try {
    const blob = await compileLatexPdfBlob(source);
    triggerBlobDownload(blob, fileName);
    if (state.ui) {
      state.ui.showToast("LaTeX PDF downloaded.");
    }
    return true;
  } catch (error) {
    if (state.ui) {
      state.ui.showToast("LaTeX PDF failed. Downloaded .tex fallback.");
    }
    triggerTextDownload(
      source,
      String(fileName || "latex.pdf").replace(/\.pdf$/i, ".tex")
    );
    return false;
  }
}
