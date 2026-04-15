/**
 * Tool renderer registry and rendering logic.
 */

import { simpleHash } from "../../lib/utils/hash.js";
import { getOrCreateHost } from "../dom/host.js";
import { buildHtmlPreviewCard } from "./html-preview.js";
import { buildLatexCard } from "./latex-card.js";
import { buildPythonCard } from "./python-runner.js";
import { buildVisualizerCard } from "./visualizer.js";
import { buildPptxCard } from "./pptx-generator.js";

/**
 * Map of tool name → renderer function.
 * Add new tools here to extend the system.
 */
const TOOL_RENDERERS = {
  html: (content) => buildHtmlPreviewCard(content),
  latex: (content) => buildLatexCard(content),
  run_python_embed: (content) => buildPythonCard(content),
  visualizer: (content) => buildVisualizerCard(content),
  pptx: (content) => buildPptxCard(content),
};

/**
 * Render renderable tool blocks into the DOM next to a message node.
 */
export function renderToolBlocks(node, blocks) {
  const host = getOrCreateHost(node, "bds-tool-host");

  if (!blocks.length) {
    host.replaceChildren();
    return;
  }

  const signature = simpleHash(
    blocks
      .map((block) => `${block.name}:${simpleHash(block.content)}`)
      .join("|")
  );
  if (host.dataset.signature === signature) {
    return;
  }

  host.dataset.signature = signature;
  host.replaceChildren();

  for (const block of blocks) {
    const renderer = TOOL_RENDERERS[block.name];
    if (!renderer) {
      continue;
    }
    host.appendChild(renderer(block.content));
  }
}

export { TOOL_RENDERERS };
