import state from "../state.js";
import { createToolCardShell } from "./common.js";
import {
  triggerTextDownload,
  triggerBlobDownload,
} from "../../lib/utils/download.js";
import { base64ToBlob } from "../../lib/utils/helpers.js";
import { simpleHash } from "../../lib/utils/hash.js";
import { preprocessLatex } from "../../lib/utils/latex-renderer.js";

export function buildLatexCard(latexSource) {
  const source = preprocessLatex(String(latexSource || ""));
  const card = createToolCardShell("LaTeX to PDF", "Remote Compilation");

  const status = document.createElement("p");
  status.className = "bds-latex-status";
  status.textContent = "Connecting to TeX server...";

  const pdfFrame = document.createElement("iframe");
  pdfFrame.className = "bds-latex-pdf-frame";
  pdfFrame.title = "LaTeX PDF Preview";

  const sourceDetails = document.createElement("details");
  sourceDetails.className = "bds-latex-source-details";

  const sourceSummary = document.createElement("summary");
  sourceSummary.textContent = "Show LaTeX source";

  const preview = document.createElement("pre");
  preview.className = "bds-latex-preview";
  preview.textContent = source;

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
    pdfButton.textContent = "Compiling PDF...";
    await downloadLatexPdf(source, `latex-${Date.now()}.pdf`);
    pdfButton.disabled = false;
    pdfButton.textContent = previousText;
  });

  const texButton = document.createElement("button");
  texButton.type = "button";
  texButton.className = "bds-btn bds-btn-secondary";
  texButton.textContent = "Download .tex";
  texButton.addEventListener("click", () => {
    triggerTextDownload(latexSource, `latex-${Date.now()}.tex`);
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
    statusNode.textContent = "Compiling on Remote Server (TeXLive)...";
    
    const blob = await compileLatexPdfBlob(source);
    const nextUrl = URL.createObjectURL(blob);

    const previousUrl = pdfFrame.dataset.pdfUrl;
    if (previousUrl) {
      URL.revokeObjectURL(previousUrl);
    }

    pdfFrame.dataset.pdfUrl = nextUrl;
    pdfFrame.src = nextUrl;
    statusNode.textContent = "PDF Preview Ready.";
  } catch (error) {
    console.error("LaTeX preview failed:", error);
    statusNode.textContent =
      "Compilation failed. Standard TeX errors or server timeout. Use Download .tex to check local.";
    pdfFrame.style.display = 'none';
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
      state.ui.showToast("LaTeX PDF compiled successfully.");
    }
    return true;
  } catch (error) {
    console.error("Download failed:", error);
    if (state.ui) {
      state.ui.showToast("Compilation error. Check source syntax.");
    }
    return false;
  }
}
