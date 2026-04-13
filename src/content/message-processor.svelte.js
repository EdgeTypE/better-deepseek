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
import { collectLongWorkFiles, finalizeLongWork, emitZipForFiles } from "./files/long-work.js";
import { emitStandaloneFiles } from "./files/standalone.js";
import { getOrCreateHost } from "./dom/host.js";

import { mount, unmount } from "svelte";
import MessageOverlay from "./ui/MessageOverlay.svelte";

const messageOverlays = new Map();

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

  const role = detectMessageRole(node);
  const isLatestAssistant =
    role === "assistant" && isLatestAssistantMessage(node);

  const signature = simpleHash(rawText);
  // OPTIMIZATION: If hash matches, we still need to ENSURE visibility is correct
  // but we can skip the expensive parsing and collections.
  if (node.dataset.bdsHash === signature) {
    if (role === "assistant") {
      syncVisibilityState(node, isLatestAssistant);
    }
    return;
  }
  node.dataset.bdsHash = signature;

  const parsed = parseBdsMessage(rawText);
  const hasActionableFiles = parsed.createFiles.length > 0;
  
  // IMMEDIATELY activate longWork state if tag is seen in latest assistant message
  if (isLatestAssistant && (parsed.longWorkOpen || (parsed.isStreamingTool && parsed.streamingTagName === 'long_work'))) {
    if (!state.longWork.active) {
      state.longWork.active = true;
      state.longWork.lastActivityAt = Date.now();
    }
  }

  const shouldStartLongWork =
    parsed.longWorkOpen && parsed.createFiles.length > 0 && isLatestAssistant;

  // Check if we already have an overlay for this node
  const existing = messageOverlays.get(node);
  // We'll handle cleanup/update later in the role-specific block


  if (parsed.memoryWrites.length) {
    upsertMemories(parsed.memoryWrites);
  }

  if (role === "assistant") {
    // Store parsing result for syncVisibilityState
    node.dataset.bdsIsStreamingTool = parsed.isStreamingTool ? "1" : "0";
    node.dataset.bdsIsLongWorkActive = (state.longWork.active && !parsed.longWorkClose) ? "1" : "0";
    node.dataset.bdsHasControlTags = parsed.containsControlTags ? "1" : "0";

    syncVisibilityState(node, isLatestAssistant);

    const isGenerating = !!node.querySelector('.ds-cursor, ._streaming') || (isLatestAssistant && isSystemGenerating());

    if (parsed.createFiles.length > 0) {
      if ((state.longWork.active || parsed.longWorkOpen) && isGenerating) {
        state.longWork.lastActivityAt = Date.now();
        collectLongWorkFiles(parsed.createFiles);
      } else if (!isGenerating && parsed.longWorkOpen) {
        // Historical LONG_WORK: Emit zip immediately if not already done
        if (node.dataset.bdsFilesEmitted !== signature) {
          const entries = parsed.createFiles.map(f => ({
            path: f.fileName,
            content: f.content
          }));
          emitZipForFiles(node, entries);
          node.dataset.bdsFilesEmitted = signature;
        }
      } else if (!state.longWork.active && !parsed.longWorkOpen) {
        // Historical or standalone files: Emit once per unique content hash
        if (node.dataset.bdsFilesEmitted !== signature) {
          emitStandaloneFiles(node, parsed.createFiles);
          node.dataset.bdsFilesEmitted = signature;
        }
      }
    }

    // Only finalize if we see the close tag OR the message is truly settled (has buttons, no cursor)
    const isSettled = isMessageFinished(node);
    const shouldFinalize = (parsed.longWorkClose || (isSettled && node.dataset.bdsIsLongWorkActive === "1")) && isLatestAssistant;

    if (shouldFinalize && node.dataset.bdsLongWorkClosed !== signature) {
      node.dataset.bdsLongWorkClosed = signature;
      finalizeLongWork(node);
      node.dataset.bdsFilesEmitted = signature;
    }

    // TAG-DRIVEN INTERFACE LOCK:
    // We are "Loading" if:
    // 1. The parser detected an unclosed BDS tag (parsed.isStreamingTool).
    // 2. We are in an active LONG_WORK session and haven't seen the close tag yet.
    // 3. FALLBACK: It's the latest message and it's still generating (handles Thinking phase).
    const isCurrentlyLoading = parsed.isStreamingTool || 
                               (node.dataset.bdsIsLongWorkActive === "1") || 
                               (isLatestAssistant && isGenerating && !isSettled);
    const hasTags = parsed.containsControlTags || isCurrentlyLoading;

    if (hasTags) {
      // Ensure a stable loading index for this message
      if (!node.dataset.bdsLoadingIndex) {
        node.dataset.bdsLoadingIndex = Math.floor(Math.random() * 3) + 1;
      }
      const loadingIndex = parseInt(node.dataset.bdsLoadingIndex, 10);
      
      const newText = isCurrentlyLoading ? (parsed.visibleText || "") : parsed.visibleText;
      const newBlocks = isCurrentlyLoading ? [] : parsed.renderableBlocks;
      const isLoading = isCurrentlyLoading;

      if (existing) {
        // Update reactive props instead of remounting
        existing.props.text = newText;
        existing.props.blocks = newBlocks;
        existing.props.loading = isLoading;
        existing.props.loadingIndex = loadingIndex;
      } else {
        const host = getOrCreateHost(node, "bds-overlay-host");
        
        // Create reactive props object
        const props = $state({
          text: newText,
          blocks: newBlocks,
          loading: isLoading,
          loadingIndex: loadingIndex
        });

        const component = mount(MessageOverlay, {
          target: host,
          props
        });
        
        messageOverlays.set(node, { component, props });
      }

      node.dataset.bdsHiddenByTags = "1";
      node.classList.add("bds-hidden-message");
    } else if (node.dataset.bdsHiddenByTags === "1") {
      // Cleanup if tags were removed
      if (existing) {
        unmount(existing.component);
        messageOverlays.delete(node);
      }
      
      delete node.dataset.bdsHiddenByTags;
      node.classList.remove("bds-hidden-message");
      
      const wrapper = node.nextElementSibling;
      if (wrapper && wrapper.classList.contains("bds-host-wrapper")) {
        wrapper.remove();
      }
    }
  }
}

/**
 * Checks if DeepSeek is currently generating ANY response on the page.
 * Uses the presence of the 'Stop Generation' button as a global indicator.
 */
function isSystemGenerating() {
  // DeepSeek's Stop button usually has a square icon.
  const stopButton = document.querySelector('.ds-icon-stop-circle, .ds-icon-stop, div[role="button"] svg path[d*="M3 3h10v10H3z"]');
  return !!stopButton;
}

/**
 * Checks if a specific message has finished and settled.
 * Settled messages have action buttons (Copy, Regenerate, etc.).
 */
function isMessageFinished(node) {
  const hasActionButtons = !!node.querySelector('.ds-icon-copy, .ds-icon-regenerate, .ds-icon-share');
  const hasCursor = !!node.querySelector('.ds-cursor');
  const isCurrentlyStreamingClass = node.classList.contains('_streaming');
  
  // If it has action buttons and NO cursor, it's definitely finished.
  return hasActionButtons && !hasCursor && !isCurrentlyStreamingClass;
}

/**
 * Sync the visibility of the message node based on stored state.
 * Called on every scan to ensure DeepSeek doesn't strip the hidden class.
 */
function syncVisibilityState(node, isLatestAssistant) {
  const isStreamingTool = node.dataset.bdsIsStreamingTool === "1";
  const isLongWork = node.dataset.bdsIsLongWorkActive === "1";
  const hasControlTags = node.dataset.bdsHasControlTags === "1";
  
  // IF IT HAS ANY BDS CONTENT, HIDE THE ORIGINAL MARKDOWN PERMANENTLY.
  // The overlay will display the sanitized content. 
  // We hide regardless of whether it is currently generating to prevent leakage in history.
  if (isStreamingTool || isLongWork || hasControlTags) {
    hideMessageNode(node, true);
  } else {
    hideMessageNode(node, false);
  }
}

/**
 * Show or hide a message node's content area using CSS classes.
 * We specifically target .ds-markdown to keep the "Thinking" block visible.
 */
function hideMessageNode(node, hidden) {
  // Find all markdowns, but we only want to hide the ones that are NOT in the thinking block
  const allMarkdowns = node.querySelectorAll('.ds-markdown');
  const answerMarkdowns = Array.from(allMarkdowns).filter(el => !el.closest('.ds-think-content'));

  if (answerMarkdowns.length === 0) {
    // Fallback: If no markdown found yet, show/hide the whole node as a last resort
    toggleNodeHidden(node, hidden);
    return;
  }

  // Ensure main node is visible (so Thoughts and Overlay show up)
  toggleNodeHidden(node, false);
  
  // Hide all markdowns that belong to the actual answer
  answerMarkdowns.forEach(el => toggleNodeHidden(el, hidden));
}

function toggleNodeHidden(el, hidden) {
  if (hidden) {
    el.classList.add("bds-hidden-message");
  } else {
    el.classList.remove("bds-hidden-message");
  }
}
