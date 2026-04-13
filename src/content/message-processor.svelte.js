/**
 * Process individual chat message nodes — detect tools, files, memory writes.
 */

import state from "./state.js";
import { simpleHash } from "../lib/utils/hash.js";
import {
  detectMessageRole,
  isLatestAssistantMessage,
  isAbsoluteLastMessage,
} from "./scanner.js";
import { extractMessageRawText } from "./dom/message-text.js";
import { parseBdsMessage } from "./parser/index.js";
import { upsertMemories } from "./parser/memory-parser.js";
import { collectLongWorkFiles, finalizeLongWork, emitZipForFiles } from "./files/long-work.js";
import { emitStandaloneFiles } from "./files/standalone.js";
import { getOrCreateHost } from "./dom/host.js";
import { handleAutoWebFetch } from "./auto.js";

import { mount, unmount } from "svelte";
import MessageOverlay from "./ui/MessageOverlay.svelte";

const messageOverlays = new Map();
const nodeStates = new WeakMap();
const userMsgCleaned = new WeakSet();

function getNodeState(node) {
  let s = nodeStates.get(node);
  if (!s) {
    s = {};
    nodeStates.set(node, s);
  }
  return s;
}

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

  // --- USER MESSAGE: strip <BetterDeepSeek> system prompt from view ---
  if (role === "user") {
    stripBdsTagsFromUserMessage(node);
    return;
  }

  const isLatestAssistant =
    role === "assistant" && isLatestAssistantMessage(node);

  const isSettled = isMessageFinished(node);
  // Include settlement state in hash so transition to 'finished' triggers a final re-parse
  const signature = simpleHash(rawText + (isSettled ? ":settled" : ":streaming"));
  const stateData = getNodeState(node);

  // OPTIMIZATION: If hash matches, we still need to ENSURE visibility is correct
  // but we can skip the expensive parsing and collections.
  if (stateData.hash === signature) {
    if (role === "assistant") {
      syncVisibilityState(node, isLatestAssistant, stateData);
    }
    return;
  }
  stateData.hash = signature;

  const parsed = parseBdsMessage(rawText);
  const hasActionableFiles = parsed.createFiles.length > 0;
  
  // IMMEDIATELY activate longWork state if tag is seen in latest assistant message
  if (isLatestAssistant && (parsed.longWorkOpen || (parsed.isStreamingTool && parsed.streamingTagName === 'long_work'))) {
    if (!state.longWork.active) {
      state.longWork.active = true;
      state.longWork.lastActivityAt = Date.now();
    }
  }

  // Check if we already have an overlay for this node
  const existing = messageOverlays.get(node);

  if (parsed.memoryWrites.length) {
    upsertMemories(parsed.memoryWrites);
  }

  if (role === "assistant") {
    // Store parsing result for syncVisibilityState in WeakMap
    stateData.isStreamingTool = parsed.isStreamingTool;
    stateData.isLongWorkActive = state.longWork.active && !parsed.longWorkClose;
    stateData.hasControlTags = parsed.containsControlTags;

    syncVisibilityState(node, isLatestAssistant, stateData);

    const isGenerating = !!node.querySelector('.ds-cursor, ._streaming') || (isLatestAssistant && isSystemGenerating());

    // --- FILE COLLECTION ---
    // During LONG_WORK: ALWAYS buffer files. NEVER emit ZIP here.
    // ZIP emission happens ONLY at finalization below.
    if (parsed.createFiles.length > 0) {
      const inLongWorkContext = state.longWork.active || parsed.longWorkOpen;

      if (inLongWorkContext) {
        if (isLatestAssistant) {
          // LIVE session: buffer files into global state for finalizeLongWork
          collectLongWorkFiles(parsed.createFiles);
          if (isGenerating) {
            state.longWork.lastActivityAt = Date.now();
          }
        }
        // Historical (non-latest) messages: files stay in parsed.createFiles
        // and will be emitted directly at finalization below.
      } else if (!stateData.filesEmitted) {
        // Standalone files (no LONG_WORK context)
        emitStandaloneFiles(node, parsed.createFiles);
        stateData.filesEmitted = true;
      }
    }

    // ZIP emission happens ONLY here, via a single controlled path.
    const shouldFinalize =
      // LIVE: explicit close tag on latest assistant
      (parsed.longWorkClose && isLatestAssistant) ||
      // LIVE: message settled while longWork was active (fallback if close tag missed)
      (isSettled && stateData.isLongWorkActive && isLatestAssistant) ||
      // HISTORICAL: complete LONG_WORK block in a finished, non-latest message
      (parsed.longWorkOpen && parsed.longWorkClose && !isGenerating && !isLatestAssistant);

    if (shouldFinalize && !stateData.longWorkClosed) {
      stateData.longWorkClosed = true;

      if (isLatestAssistant) {
        // Live finalization: use the global buffer
        finalizeLongWork(node);
      } else {
        // Historical finalization: emit directly from this message's parsed files
        const entries = parsed.createFiles.map(f => ({
          path: f.fileName,
          content: f.content
        }));
        if (entries.length > 0) {
          emitZipForFiles(node, entries);
        }
      }
      stateData.filesEmitted = true;
    }

    // --- AUTO INTERFACES ---
    // Only trigger auto-requests if this is the absolute latest message in the entire chat.
    // This prevents redundant historical triggers on page refresh.
    if (isSettled && parsed.autoRequests.webFetch.length > 0 && isAbsoluteLastMessage(node)) {
      if (!stateData.autoWebFetchesHandled) {
        stateData.autoWebFetchesHandled = new Set();
      }
      for (const url of parsed.autoRequests.webFetch) {
        if (!stateData.autoWebFetchesHandled.has(url)) {
          stateData.autoWebFetchesHandled.add(url);
          handleAutoWebFetch(url);
        }
      }
    }

    // TAG-DRIVEN INTERFACE LOCK
    const isCurrentlyLoading = parsed.isStreamingTool || 
                               stateData.isLongWorkActive || 
                               (isLatestAssistant && isGenerating && !isSettled);
    const hasTags = parsed.containsControlTags || isCurrentlyLoading;

    if (hasTags) {
      // Ensure a stable loading index for this message
      if (!stateData.loadingIndex) {
        stateData.loadingIndex = Math.floor(Math.random() * 3) + 1;
      }
      const loadingIndex = stateData.loadingIndex;
      
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

      stateData.hiddenByTags = true;
      node.classList.add("bds-hidden-message");
    } else if (stateData.hiddenByTags) {
      // Cleanup if tags were removed
      if (existing) {
        unmount(existing.component);
        messageOverlays.delete(node);
      }
      
      stateData.hiddenByTags = false;
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
  const hasCursor = !!node.querySelector('.ds-cursor');
  const isCurrentlyStreamingClass = node.classList.contains('_streaming');
  
  // If the system is no longer generating and no cursor is present, it's done.
  // We also check for common footer buttons as a backup.
  const hasFooterButtons = !!node.querySelector('div[role="button"] svg, .ds-icon-copy, .ds-icon-regenerate, .ds-icon-share');
  
  if (!isSystemGenerating() && !hasCursor && !isCurrentlyStreamingClass) {
    return true;
  }

  return hasFooterButtons && !hasCursor && !isCurrentlyStreamingClass;
}

/**
 * Sync the visibility of the message node based on stored state.
 * Called on every scan to ensure DeepSeek doesn't strip the hidden class.
 */
function syncVisibilityState(node, isLatestAssistant, stateData) {
  // IF IT HAS ANY BDS CONTENT, HIDE THE ORIGINAL MARKDOWN PERMANENTLY.
  // The overlay will display the sanitized content. 
  // We hide regardless of whether it is currently generating to prevent leakage in history.
  if (stateData.isStreamingTool || stateData.isLongWorkActive || stateData.hasControlTags) {
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

/**
 * Strip <BetterDeepSeek>...</BetterDeepSeek> blocks from user message DOM.
 * Operates on the actual DOM text so the user never sees the injected system prompt.
 */
function stripBdsTagsFromUserMessage(node) {
  if (userMsgCleaned.has(node)) return;

  // Find the text container inside the user message bubble
  const textContainer = node.querySelector('.fbb737a4') || node.querySelector('.ds-markdown');
  if (!textContainer) return;

  // Use textContent for detection — innerHTML has HTML-encoded angle brackets (&lt; &gt;)
  const plainText = textContainer.textContent || '';
  if (!/BetterDeepSeek>/i.test(plainText)) return;

  // Mark as processed before modifying to prevent re-entry
  userMsgCleaned.add(node);

  // innerHTML has &lt;BetterDeepSeek&gt; (HTML-encoded), so match that form
  const html = textContainer.innerHTML;
  const cleaned = html.replace(
    /&lt;BetterDeepSeek&gt;[\s\S]*?&lt;\/BetterDeepSeek&gt;/gi,
    ''
  ).trim();

  if (cleaned) {
    textContainer.innerHTML = cleaned;
  } else {
    // If the entire message was the system prompt, hide the whole bubble
    node.style.display = 'none';
  }
}
