/**
 * Process individual chat message nodes — detect tools, files, memory writes.
 */

import state from "./state.js";
import { simpleHash } from "../lib/utils/hash.js";
import {
  detectMessageRole,
  isLatestAssistantMessage,
  isAbsoluteLastMessage,
  scheduleScan
} from "./scanner.js";
import { extractMessageRawText } from "./dom/message-text.js";
import { injectPythonRunButtons } from "./dom/python-injector.js";
import { injectJavaScriptRunButtons } from "./dom/javascript-injector.js";
import { parseBdsMessage } from "./parser/index.js";
import { upsertMemories } from "./parser/memory-parser.js";
import { upsertCharacters } from "./parser/character-parser.js";
import { collectLongWorkFiles, finalizeLongWork, emitZipForFiles } from "./files/long-work.js";
import { emitStandaloneFiles } from "./files/standalone.js";
import { getOrCreateHost } from "./dom/host.js";
import { handleAutoWebFetch, handleAutoGitHubFetch, handleAutoTwitterFetch, handleAutoYouTubeFetch } from "./auto.js";

import { mount, unmount } from "svelte";
import MessageOverlay from "./ui/MessageOverlay.svelte";

const messageOverlays = new Map();
const nodeStates = new WeakMap();
const userMsgCleaned = new WeakSet();
const readMessages = new WeakSet();

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

  // Inject Run buttons into any Python/JS code blocks in this message
  injectPythonRunButtons(node);
  injectJavaScriptRunButtons(node);

  const rawText = extractMessageRawText(node);
  if (!rawText.trim()) {
    return;
  }

  const role = detectMessageRole(node);
  const stateData = getNodeState(node);

  // --- USER MESSAGE: strip <BetterDeepSeek> system prompt from view ---
  if (role === "user") {
    const rawUserText = rawText;
    stripBdsTagsFromUserMessage(node);
    if (state.settings.tokenPriceDisplay && !stateData.priceInjected) {
      const modelName = detectModelInline(null);
      const inputTokens = estimateTokensInline(rawUserText);
      const { inputCost } = calcCostInline(inputTokens, 0, modelName);
      injectPriceUser(node, inputTokens, inputCost);
      state.pricing.sessionInputTokens += inputTokens;
      state.pricing.sessionTotals.inputCost += inputCost;
      state.pricing.sessionTotals.totalCost += inputCost;
      refreshSessionTotalDisplayInline();
      stateData.priceInjected = true;
    }
    return;
  }

  const isLatestAssistant = role === "assistant" && isLatestAssistantMessage(node);

  const now = Date.now();
  if (stateData.lastRawText !== rawText) {
    stateData.lastRawText = rawText;
    stateData.lastUpdateAt = now;
  }

  const timeSinceUpdate = now - (stateData.lastUpdateAt || now);
  const isStalled = timeSinceUpdate > 2500;

  // Fix false positives: a message cannot be completely settled if it's currently mutating
  let isSettled = isMessageFinished(node);
  if (!isStalled) {
    isSettled = false;
  }

  // Include settlement state in hash so transition to 'finished' triggers a final re-parse
  const signature = simpleHash(rawText + (isSettled ? ":settled" : ":streaming"));
  const shouldForceCloseTags = isSettled && isStalled;

  if (stateData.hash === signature && stateData.forceClosedTags === shouldForceCloseTags) {
    if (role === "assistant") {
      syncVisibilityState(node, isLatestAssistant, stateData, isSettled);
    }
    return;
  }
  
  stateData.hash = signature;
  stateData.forceClosedTags = shouldForceCloseTags;

  const parsed = parseBdsMessage(rawText, shouldForceCloseTags);

  // If we are still streaming a tool but aren't stalled yet, schedule a check in case it gets cut off
  if (!isStalled && parsed.isStreamingTool) {
    if (stateData.stallTimer) clearTimeout(stateData.stallTimer);
    stateData.stallTimer = setTimeout(() => {
      scheduleScan();
    }, 2600);
  }

  const hasActionableFiles = parsed.createFiles.length > 0;
  
  // IMMEDIATELY activate longWork state if tag is seen in latest assistant message
  if (isLatestAssistant && (parsed.longWorkOpen || (parsed.isStreamingTool && parsed.streamingTagName === 'long_work'))) {
    if (!state.longWork.active) {
      state.longWork.files.clear();
      state.longWork.active = true;
      state.longWork.lastActivityAt = Date.now();
    }
  }

  // Check if we already have an overlay for this node
  const existing = messageOverlays.get(node);

  if (parsed.memoryWrites.length) {
    upsertMemories(parsed.memoryWrites);
  }

  if (parsed.characterCreates.length) {
    upsertCharacters(parsed.characterCreates);
  }

  if (role === "assistant") {
    // Store parsing result for syncVisibilityState in WeakMap
    stateData.isStreamingTool = parsed.isStreamingTool;
    stateData.isLongWorkActive = state.longWork.active && !parsed.longWorkClose;
    stateData.hasControlTags = parsed.containsControlTags;

    syncVisibilityState(node, isLatestAssistant, stateData, isSettled);

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
      // HISTORICAL: complete LONG_WORK block in a finished, non-latest message
      (parsed.longWorkOpen && parsed.longWorkClose && !isLatestAssistant);

    if (shouldFinalize) {
      const filesToZip = isLatestAssistant && state.longWork.files.size > 0
        ? Array.from(state.longWork.files.entries()).map(([path, content]) => ({ path, content }))
        : parsed.createFiles.map(f => ({ path: f.fileName, content: f.content }));

      const fileHost = node.nextElementSibling?.querySelector('.bds-file-host');
      const isMounted = fileHost && fileHost.querySelector('.bds-download-card');
      
      const needsEmit = !stateData.longWorkClosed || 
                        stateData.lastFinalizedCount !== filesToZip.length || 
                        !isMounted;

      if (needsEmit && filesToZip.length > 0) {
        stateData.longWorkClosed = true;
        stateData.lastFinalizedCount = filesToZip.length;

        emitZipForFiles(node, filesToZip);

        if (isLatestAssistant) {
          state.longWork.active = false;
          state.longWork.lastActivityAt = 0;
          // Do NOT clear state.longWork.files here! Let them persist 
          // to handle any DOM re-renders until the next LONG_WORK starts.
        }
        stateData.filesEmitted = true;
      }
    }

    // --- AUTO INTERFACES ---
    // Only trigger auto-requests if this is the absolute latest message in the entire chat.
    // This prevents redundant historical triggers on page refresh.
    if (isSettled && (parsed.autoRequests.webFetch.length > 0 || 
                      parsed.autoRequests.githubFetch.length > 0 || 
                      parsed.autoRequests.twitterFetch.length > 0 || 
                      parsed.autoRequests.youtubeFetch.length > 0) && isAbsoluteLastMessage(node)) {
      
      if (!stateData.autoWebFetchesHandled) stateData.autoWebFetchesHandled = new Set();
      if (!stateData.autoGitHubFetchesHandled) stateData.autoGitHubFetchesHandled = new Set();
      if (!stateData.autoTwitterFetchesHandled) stateData.autoTwitterFetchesHandled = new Set();
      if (!stateData.autoYouTubeFetchesHandled) stateData.autoYouTubeFetchesHandled = new Set();

      for (const url of parsed.autoRequests.webFetch) {
        if (!stateData.autoWebFetchesHandled.has(url)) {
          stateData.autoWebFetchesHandled.add(url);
          handleAutoWebFetch(url);
        }
      }

      for (const repoUrl of parsed.autoRequests.githubFetch) {
        if (!stateData.autoGitHubFetchesHandled.has(repoUrl)) {
          stateData.autoGitHubFetchesHandled.add(repoUrl);
          handleAutoGitHubFetch(repoUrl);
        }
      }

      for (const tweetUrl of parsed.autoRequests.twitterFetch) {
        if (!stateData.autoTwitterFetchesHandled.has(tweetUrl)) {
          stateData.autoTwitterFetchesHandled.add(tweetUrl);
          handleAutoTwitterFetch(tweetUrl);
        }
      }

      for (const videoUrl of parsed.autoRequests.youtubeFetch) {
        if (!stateData.autoYouTubeFetchesHandled.has(videoUrl)) {
          stateData.autoYouTubeFetchesHandled.add(videoUrl);
          handleAutoYouTubeFetch(videoUrl);
        }
      }
    }

    if (isSettled && parsed.askQuestions.length > 0 && isLatestAssistantMessage(node)) {
      state.activeQuestions = parsed.askQuestions;
      window.dispatchEvent(new CustomEvent('bds-ask-questions', { 
        detail: { 
          questions: parsed.askQuestions,
          messageNode: node
        } 
      }));
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

      // Visibility is managed by syncVisibilityState so native thinking UI can
      // stay mounted while the sanitized overlay handles tagged content.
      stateData.overlayActive = true;
    } else if (stateData.overlayActive) {
      // Cleanup if tags were removed
      if (existing) {
        unmount(existing.component);
        messageOverlays.delete(node);
      }
      
      stateData.overlayActive = false;
      
      // NEVER remove the bds-host-wrapper, as it may contain bds-file-host (the ZIP card).
      // Only clear the overlay sub-container.
      const overlayHost = node.nextElementSibling?.querySelector(".bds-overlay-host");
      if (overlayHost) {
        overlayHost.replaceChildren();
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
  const stopButton = document.querySelector(
    '.ds-icon-stop-circle, ' +
    '.ds-icon-stop, ' +
    'div[role="button"] svg path[d*="M3 3h10v10H3z"], ' +
    'div[role="button"] svg path[d*="M6 6h12v12H6z"]'
  );
  return !!stopButton;
}

/**
 * Checks if a specific message has finished and settled.
 * Settled messages have action buttons (Copy, Regenerate, etc.).
 */
function isMessageFinished(node) {
  const hasCursor = !!node.querySelector('.ds-cursor');
  const isCurrentlyStreamingClass = node.classList.contains('_streaming');
  
  // If we see a cursor or the active streaming class, it's NOT finished, regardless of buttons.
  if (hasCursor || isCurrentlyStreamingClass) {
    return false;
  }

  const generating = isSystemGenerating();
  
  // If the system is no longer generating globally, it's definitely done.
  if (!generating) {
    return true;
  }

  // If the system IS generating, this specific message might still be finished
  // (e.g. it's an earlier message in the session).
  // We look for action buttons as a sign of completion.
  const hasFooterButtons = !!node.querySelector('div[role="button"] svg, .ds-icon-copy, .ds-icon-regenerate, .ds-icon-share');
  
  // Backup check: if it's the latest message and the system is generating, it's usually NOT finished.
  const isLatest = isLatestAssistantMessage(node);
  if (isLatest && generating) {
    return false;
  }

  return hasFooterButtons;
}

/**
 * Sync the visibility of the message node based on stored state.
 * Called on every scan to ensure DeepSeek doesn't strip the hidden class.
 */
function syncVisibilityState(node, isLatestAssistant, stateData, isSettled) {
  // IF IT HAS ANY BDS CONTENT, HIDE THE ORIGINAL MARKDOWN PERMANENTLY.
  // The overlay will display the sanitized content. 
  // We hide regardless of whether it is currently generating to prevent leakage in history.
  if (stateData.isStreamingTool || stateData.isLongWorkActive || stateData.hasControlTags) {
    hideMessageNode(node, true);
  } else {
    hideMessageNode(node, false);
  }

  // --- VOICE OUTPUT (TTS) ---
  if (isLatestAssistant && isSettled && state.settings.voiceMode) {
    if (!readMessages.has(node)) {
      readMessages.add(node);
      playVoiceResponse(stateData.lastRawText);
    }
  }

  // --- TOKEN PRICE DISPLAY (assistant messages) ---
  if (isSettled && state.settings.tokenPriceDisplay && !stateData.priceInjected) {
    stateData.priceInjected = true;
    const modelName = detectModelInline(null);
    const visibleText = stateData.lastRawText || "";
    const thinkingText = extractThinkingTextInline(node);
    const totalText = visibleText + thinkingText;
    const outputTokens = estimateTokensInline(totalText);
    const { outputCost } = calcCostInline(0, outputTokens, modelName);
    injectPriceAssistant(node, outputTokens, outputCost);
    state.pricing.sessionOutputTokens += outputTokens;
    state.pricing.sessionTotals.outputCost += outputCost;
    state.pricing.sessionTotals.totalCost += outputCost;
    refreshSessionTotalDisplayInline();
  }
}

/**
 * Play voice response using Web Speech Synthesis.
 */
function playVoiceResponse(text) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;

  // Clean the text: remove BDS tags
  const cleanText = text.replace(/<(BDS|BetterDeepSeek):[\s\S]*?<\/(BDS|BetterDeepSeek):[\s\S]*?>/gi, '')
                        .replace(/<[^>]*>?/gm, '') // Remove any other HTML-like tags
                        .trim();

  if (!cleanText) return;

  const utterance = new SpeechSynthesisUtterance(cleanText);
  utterance.lang = state.settings.voiceLanguage || navigator.language || 'en-US';
  
  // Try to find a good voice for the language
  const voices = window.speechSynthesis.getVoices();
  const langMatch = voices.find(v => v.lang.startsWith(utterance.lang.split('-')[0]));
  if (langMatch) utterance.voice = langMatch;

  window.speechSynthesis.speak(utterance);
}


/**
 * Show or hide a message node's content area using CSS classes.
 * We specifically target .ds-markdown to keep the "Thinking" block visible.
 */
function hideMessageNode(node, hidden) {
  // DeepSeek uses .ds-markdown for content. 
  // We also try broader selectors to capture everything that might contain tags.
  const contentSelectors = [
    '.ds-markdown',
    '.ds-message-content',
    'div[class*="markdown"]',
    'div[class*="content"]'
  ];

  let foundElements = [];
  for (const selector of contentSelectors) {
    const elements = node.querySelectorAll(selector);
    elements.forEach(el => {
      // Ignore components that are inside think segments
      if (!el.closest('.ds-think-content') && !el.closest('div[class*="think"]')) {
        foundElements.push(el);
      }
    });
  }

  if (foundElements.length === 0) {
    // Fallback: If no content container found yet, hide the whole node
    toggleNodeHidden(node, hidden);
    return;
  }

  // Ensure main node is visible (so Thoughts and Overlay show up)
  toggleNodeHidden(node, false);
  
  // Hide all content blocks that belong to the actual answer
  const uniqueElements = Array.from(new Set(foundElements));
  uniqueElements.forEach(el => toggleNodeHidden(el, hidden));
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
  const cleanedText = html.replace(
    /&lt;BetterDeepSeek&gt;[\s\S]*?&lt;\/BetterDeepSeek&gt;/gi,
    ''
  ).trim();

  if (cleanedText) {
    // Avoid direct innerHTML assignment to satisfy security linters.
    // We use a temporary parser to reconstruct the sanitized nodes.
    const parser = new DOMParser();
    const doc = parser.parseFromString(cleanedText, 'text/html');
    textContainer.replaceChildren(...doc.body.childNodes);
  } else {
    // If the entire message was the system prompt, hide the whole bubble
    node.style.display = 'none';
  }
}

// ── Inline Price Display Helpers ──

function estimateTokensInline(text) {
  if (!text) return 0;
  return Math.max(1, Math.round(String(text).length / state.charsPerToken));
}

function calcCostInline(inputTokens, outputTokens, modelName) {
  const pricing = state.embeddedPricing;
  const resolved = detectModelInline(modelName);
  const m = pricing.models[resolved] || pricing.models["deepseek-v4-flash"];
  const inputCost = (inputTokens / 1e6) * m.inputPrice;
  const outputCost = (outputTokens / 1e6) * m.outputPrice;
  return { inputCost, outputCost, totalCost: inputCost + outputCost };
}

function detectModelInline(hint) {
  if (hint) {
    const lo = String(hint).toLowerCase();
    if (lo.includes("pro") || lo.includes("reasoner") || lo === "expert") return "deepseek-v4-pro";
    if (lo.includes("flash") || lo.includes("chat") || lo === "instant") return "deepseek-v4-flash";
  }
  const modelSpan = document.querySelector("._46a12ab");
  if (modelSpan) {
    const text = (modelSpan.textContent || "").toLowerCase();
    if (text === "expert") return "deepseek-v4-pro";
    if (text === "instant") return "deepseek-v4-flash";
  }
  return state.pricing.modelName || "deepseek-v4-flash";
}

function extractThinkingTextInline(node) {
  let text = "";
  const blocks = node.querySelectorAll('.ds-think-content, [class*="think"]');
  for (const b of blocks) text += (b.textContent || "") + "\n";
  return text;
}

function injectPriceUser(node, tokens, cost) {
  const container = node.parentElement || node;
  if (container.querySelector(".bds-message-price")) return;
  const priceText = cost < 1e-4 ? "$0.0000" : cost < 0.01 ? "$" + cost.toFixed(4) : "$" + cost.toFixed(3);
  const target = container.querySelector("._11d6b3a .ds-flex") ||
    container.querySelector(".ds-flex._78e0558") || container.querySelector("[class*='_78e0558']");
  if (!target) return;
  const el = document.createElement("span");
  el.className = "bds-message-price bds-price-user";
  el.style.cssText = "font-size:11px;color:var(--bds-text-tertiary,#999);display:inline-flex;align-items:center;gap:4px;margin-left:8px;";
  el.innerHTML = `<span class="bds-price-label">API: ~${priceText}</span><span class="bds-token-count">${fmtTok(tokens)} tok</span>`;
  target.appendChild(el);
}

function injectPriceAssistant(node, tokens, cost) {
  const container = node.closest("._4f9bf79._43c05b5") || node.parentElement || node;
  if (container.querySelector(".bds-message-price")) return;
  const priceText = cost < 1e-4 ? "$0.0000" : cost < 0.01 ? "$" + cost.toFixed(4) : "$" + cost.toFixed(3);
  const target = container.querySelector("._0a3d93b") || container.querySelector(".ds-flex._0a3d93b");
  if (!target) {
    const bars = container.querySelectorAll(".ds-flex");
    for (const bar of bars) {
      if (bar.querySelector(".ds-icon-button") || bar.querySelector("[role='button']")) {
        const el = document.createElement("span");
        el.className = "bds-message-price bds-price-assistant";
        el.style.cssText = "font-size:11px;color:var(--bds-text-tertiary,#999);display:inline-flex;align-items:center;gap:4px;";
        el.innerHTML = `<span class="bds-price-label">API: ~${priceText}</span><span class="bds-token-count">${fmtTok(tokens)} tok</span>`;
        bar.appendChild(el);
        return;
      }
    }
    return;
  }
  const el = document.createElement("span");
  el.className = "bds-message-price bds-price-assistant";
  el.style.cssText = "font-size:11px;color:var(--bds-text-tertiary,#999);display:inline-flex;align-items:center;gap:4px;";
  el.innerHTML = `<span class="bds-price-label">API: ~${priceText}</span><span class="bds-token-count">${fmtTok(tokens)} tok</span>`;
  target.appendChild(el);
}

function fmtTok(n) {
  return n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1000 ? (n / 1000).toFixed(1) + "K" : String(n);
}

function refreshSessionTotalDisplayInline() {
  if (!state.settings.tokenPriceDisplay) return;
  let el = document.querySelector(".bds-session-total");
  if (!el) {
    const header = document.querySelector("._2be88ba .f8d1e4c0 ._9fcbeda._7ee190f");
    if (!header) return;
    el = document.createElement("div");
    el.className = "bds-session-total";
    el.style.cssText = "display:flex;align-items:center;gap:6px;font-size:11px;color:var(--bds-text-tertiary,#999);margin-left:8px;flex-shrink:0;";
    header.appendChild(el);
  }
  const total = state.pricing.sessionTotals.totalCost;
  const allTok = state.pricing.sessionInputTokens + state.pricing.sessionOutputTokens;
  const totalFmt = total < 1e-4 ? "$0.0000" : total < 0.01 ? "$" + total.toFixed(4) : "$" + total.toFixed(3);
  el.innerHTML = `<span class="bds-price-badge">API: ~${totalFmt}</span><span class="bds-token-badge">${fmtTok(allTok)} tokens</span>`;
}
