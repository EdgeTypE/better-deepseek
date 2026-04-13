/**
 * Process individual chat message nodes — detect tools, files, memory writes.
 */

import state from "./state.js";
import { simpleHash } from "../lib/utils/hash.js";
import {
  detectMessageRole,
  isLatestAssistantMessage,
} from "./scanner.js";
import { extractMessageRawText } from "./dom/message-text.js";
import { parseBdsMessage } from "./parser/index.js";
import { upsertMemories } from "./parser/memory-parser.js";
import { renderToolBlocks } from "./tools/registry.js";
import { collectLongWorkFiles, finalizeLongWork } from "./files/long-work.js";
import { emitStandaloneFiles } from "./files/standalone.js";
import { applySanitizedDisplay, restoreSanitizedDisplay } from "./dom/sanitized-display.js";

/**
 * Process a single message node — the main per-node logic.
 */
export function processMessageNode(node) {
  if (!node || node.closest("#bds-root")) {
    return;
  }

  const rawText = extractMessageRawText(node);
  if (!rawText.trim()) {
    return;
  }

  const signature = simpleHash(rawText);
  if (node.dataset.bdsHash === signature) {
    return;
  }
  node.dataset.bdsHash = signature;

  const role = detectMessageRole(node);
  const parsed = parseBdsMessage(rawText);
  const hasActionableFiles = parsed.createFiles.length > 0;
  const isLatestAssistant =
    role === "assistant" && isLatestAssistantMessage(node);
  const shouldStartLongWork =
    parsed.longWorkOpen && hasActionableFiles && isLatestAssistant;

  if (parsed.memoryWrites.length) {
    upsertMemories(parsed.memoryWrites);
  }

  if (role === "assistant") {
    if (shouldStartLongWork) {
      state.longWork.active = true;
      state.longWork.lastActivityAt = Date.now();
      if (state.ui) {
        state.ui.showLongWorkOverlay(true);
      }
    }

    if (state.longWork.active && !parsed.longWorkClose) {
      hideMessageNode(node, true);
    } else {
      hideMessageNode(node, false);
    }

    if (hasActionableFiles) {
      if (
        (state.longWork.active || parsed.longWorkOpen) &&
        isLatestAssistant
      ) {
        state.longWork.lastActivityAt = Date.now();
        collectLongWorkFiles(parsed.createFiles);
      } else {
        emitStandaloneFiles(node, parsed.createFiles);
      }
    }

    if (!(state.longWork.active && !parsed.longWorkClose)) {
      renderToolBlocks(node, parsed.renderableBlocks);
    }

    const hasCollectedFiles =
      state.longWork.files.size > 0 || hasActionableFiles;
    if (
      parsed.longWorkClose &&
      hasCollectedFiles &&
      isLatestAssistant &&
      node.dataset.bdsLongWorkClosed !== "1"
    ) {
      node.dataset.bdsLongWorkClosed = "1";
      finalizeLongWork(node);
    }
  }

  if (parsed.containsControlTags && role === "assistant") {
    applySanitizedDisplay(node, parsed.visibleText, role);
  } else if (role === "assistant" && node.dataset.bdsHiddenByTags === "1") {
    restoreSanitizedDisplay(node);
  }
}

/**
 * Show or hide a message node.
 */
function hideMessageNode(node, hidden) {
  if (hidden) {
    node.dataset.bdsHidden = "1";
    node.style.display = "none";
    return;
  }

  if (node.dataset.bdsHidden === "1") {
    if (node.dataset.bdsHiddenByTags === "1") {
      node.style.display = "none";
    } else {
      node.style.display = "";
    }
    delete node.dataset.bdsHidden;
  }
}
