/**
 * Python runner tool card (Pyodide in iframe).
 */

import { createToolCardShell } from "./common.js";
import { triggerTextDownload } from "../../lib/utils/download.js";
import { buildPythonRunnerDocument } from "../../lib/utils/html-utils.js";

export function buildPythonCard(sourceCode) {
  const source = String(sourceCode || "");
  const card = createToolCardShell("Python Runner", "Pyodide in browser");

  const frame = document.createElement("iframe");
  frame.className = "bds-python-frame";
  frame.sandbox = "allow-scripts";
  frame.srcdoc = buildPythonRunnerDocument(source);

  const actions = document.createElement("div");
  actions.className = "bds-card-actions";

  const downloadButton = document.createElement("button");
  downloadButton.type = "button";
  downloadButton.className = "bds-btn";
  downloadButton.textContent = "Download .py";
  downloadButton.addEventListener("click", () => {
    triggerTextDownload(source, `script-${Date.now()}.py`);
  });

  actions.appendChild(downloadButton);
  card.body.appendChild(frame);
  card.body.appendChild(actions);

  return card.element;
}
