/**
 * Visualizer tool card.
 * Specialized for high-end simulations and interactive explainers.
 */

import { createToolCardShell } from "./common.js";
import { buildVisualizerDocument } from "../../lib/utils/html-utils.js";

export function buildVisualizerCard(content) {
  const card = createToolCardShell("Visualizer", "Interactive Simulation");
  
  // Custom class for visualizer card to make it look more integrated/premium
  card.element.classList.add("bds-visualizer-card");

  const frame = document.createElement("iframe");
  frame.className = "bds-preview-frame bds-visualizer-frame";
  frame.sandbox = "allow-scripts allow-forms";
  frame.srcdoc = buildVisualizerDocument(content);

  card.body.appendChild(frame);

  return card.element;
}
