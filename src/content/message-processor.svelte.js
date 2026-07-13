/**
 * Process individual chat message nodes — detect tools, files, memory writes.
 */

import state from "./state.js";
import { simpleHash } from "../lib/utils/hash.js";
import {
  detectMessageRole,
  isLatestAssistantMessage,
  isAbsoluteLastMessage,
  scheduleScan,
  collectMessageNodes
} from "./scanner.js";
import { extractMessageRawText } from "./dom/message-text.js";
import { injectPythonRunButtons } from "./dom/python-injector.js";
import { injectJavaScriptRunButtons } from "./dom/javascript-injector.js";
import { injectLuaRunButtons } from "./dom/lua-injector.js";
import { injectRubyRunButtons } from "./dom/ruby-injector.js";
import { parseBdsMessage } from "./parser/index.js";
import { upsertMemories } from "./parser/memory-parser.js";
import { upsertCharacters } from "./parser/character-parser.js";
import { upsertSkills } from "./parser/skill-parser.js";
import { collectLongWorkFiles, finalizeLongWork, emitZipForFiles } from "./files/long-work.js";
import { emitStandaloneFiles } from "./files/standalone.js";
import { getOrCreateHost } from "./dom/host.js";
import { handleAutoWebFetch, handleAutoGitHubFetch, handleAutoTwitterFetch, handleAutoYouTubeFetch, handleAutoSearch, handleAutoSearchForRun } from "./auto.js";
import { handleManagedAutoContinuation, isManagedRunActive, trySynthesizeReport } from "./deep-research.js";

import { mount, unmount } from "svelte";
import MessageOverlay from "./ui/MessageOverlay.svelte";
import { i18n } from "../lib/i18n.svelte.js";
import { remoteConfig } from "../lib/remote-config.svelte.js";
import { makeId } from "../lib/utils/helpers.js";
import { STORAGE_KEYS } from "../lib/constants.js";
import { isPredominantlyRtl } from '../lib/utils/rtl-detector.js';

const messageOverlays = new Map();
const nodeStates = new WeakMap();
const userMsgCleaned = new WeakSet();
const readMessages = new WeakSet();
const processedSearchResultCards = new WeakSet();

function normalizeSearchKeyPart(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function getSearchRequestKey(query, runId, purpose, sourceType) {
  const baseKey = runId ? `${runId}\n${normalizeSearchKeyPart(query)}` : normalizeSearchKeyPart(query);
  const normalizedPurpose = normalizeSearchKeyPart(purpose);
  const normalizedSourceType = normalizeSearchKeyPart(sourceType);
  if (!normalizedPurpose && !normalizedSourceType) {
    return baseKey;
  }
  return [baseKey, normalizedPurpose, normalizedSourceType].join("\n");
}

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
export function processMessageNode(node, nodeIndex = -1, nodes = null) {
  if (!node || node.closest("#bds-root")) {
    return;
  }

  if (nodeIndex === -1 || !nodes) {
    const collected = collectMessageNodes();
    nodeIndex = collected.indexOf(node);
    nodes = collected;
  }

  // Inject Run buttons into any Python/JS/Lua/Ruby code blocks in this message
  injectPythonRunButtons(node);
  injectJavaScriptRunButtons(node);
  injectLuaRunButtons(node);
  injectRubyRunButtons(node);
  injectSelectionCheckbox(node);
  injectBookmarkButton(node);

  const rawText = extractMessageRawText(node);
  if (!rawText.trim()) {
    return;
  }

  const role = detectMessageRole(node);
  processMessageTimestamp(node, role, nodeIndex, nodes);
  const stateData = getNodeState(node);

  // --- USER MESSAGE: strip <BetterDeepSeek> system prompt from view ---
  if (role === "user") {
    const rawUserText = rawText;
    stripBdsTagsFromUserMessage(node);

    // --- CODE RUNNER RESULT CARD (USER) ---
    if (rawUserText.includes("[BDS:AUTO] Code Runner Result")) {
      const match = rawUserText.match(/\[BDS:AUTO\] Code Runner Result \(([^)]+)\)\s+Status: ([^\n]+)\s+Output:\s+(?:```text\n|```)?([\s\S]*?)(?:\n```)?\s*(?:<\/BetterDeepSeek>|$)/i);
      if (match) {
        stateData.hasControlTags = true;
        const language = match[1];
        const status = match[2];
        const output = match[3];

        const existing = messageOverlays.get(node);
        const newBlocks = [{
          name: "auto_code_result",
          attrs: { language, status },
          content: output
        }];

        if (existing) {
          existing.props.blocks = newBlocks;
        } else {
          const host = getOrCreateHost(node, "bds-overlay-host");
          removeStaleMessageOverlays(host);
          const props = $state({ text: "", blocks: newBlocks, loading: false });
          const component = mount(MessageOverlay, { target: host, props });
          messageOverlays.set(node, { component, props });
        }
        syncVisibilityState(node, false, stateData, true);
      }
    }

    // --- SEARCH RESULT CARD (USER) ---
    if (rawUserText.includes("[BDS:AUTO] Search Result for:")) {
      const queryMatch = rawUserText.match(/\[BDS:AUTO\] Search Result for:\s*(.+?)(?:\n|$)/);
      const query = queryMatch ? queryMatch[1].trim() : "";

      const jsonMatch = rawUserText.match(/\[BDS:AUTO_SEARCH_RESULT\]\s*([\s\S]*?)\s*\[\/BDS:AUTO_SEARCH_RESULT\]/);
      if (jsonMatch) {
        let parsedCount = "0";
        let parsedDeepFetch = "0";
        let parsedResults = "[]";
        try {
          const data = JSON.parse(jsonMatch[1].trim());
          parsedResults = JSON.stringify(data.results || []);
          parsedCount = String(data.count ?? data.results?.length ?? 0);
          parsedDeepFetch = String(data.deepFetch ?? 0);
        } catch (e) {
          console.error("[BDS:AUTO_SEARCH_RESULT] Failed to parse JSON:", e);
        }

        if (query && !processedSearchResultCards.has(node)) {
          processedSearchResultCards.add(node);
          stateData.hasControlTags = true;

          const existing = messageOverlays.get(node);
          const newBlocks = [{
            name: "auto_search_result",
            attrs: { query, count: parsedCount, deepFetch: parsedDeepFetch },
            content: parsedResults
          }];

          if (existing) {
            existing.props.blocks = newBlocks;
          } else {
            const host = getOrCreateHost(node, "bds-overlay-host");
            removeStaleMessageOverlays(host);
            const props = $state({ text: "", blocks: newBlocks, loading: false });
            const component = mount(MessageOverlay, { target: host, props });
            messageOverlays.set(node, { component, props });
          }
          syncVisibilityState(node, false, stateData, true);
        }
      }
    }

    if (state.settings.tokenPriceDisplay && !stateData.priceInjected) {
      const modelName = detectModelInline(null);
      
      // Predict if we have a pending injection that isn't in the DOM yet
      let totalUserText = rawUserText;
      if (!totalUserText.includes("<BetterDeepSeek>")) {
        const convId = getCurrentConversationIdInline();
        const pending = state.pricing.pendingInjections.get(convId);
        
        // Match by text content to ensure we don't apply an old injection to a new message
        if (pending && pending.userPrompt && rawUserText.trim() === pending.userPrompt.trim()) {
          if (pending.injectedText) {
            totalUserText = pending.injectedText + "\n\n" + totalUserText;
          }
        }
      }

      const newInputTokens = estimateTokensInline(totalUserText);
      const cacheHitTokens = 0; // We will handle cache hit logic differently or just ignore for user display
      const { inputCost } = calcCostInline(newInputTokens, 0, modelName);
      
      stateData.tokens = newInputTokens;
      stateData.cost = inputCost;
      stateData.role = "user";
      
      injectPriceUser(node, newInputTokens, inputCost);
      refreshSessionTotalDisplayInline();
      stateData.priceInjected = true;
    }
    handleUserMessageCollapse(node);
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
  const preGateBlocks = parsed.renderableBlocks;

  // --- RTL DETECTION ---
  const isRtl = isPredominantlyRtl(rawText);
  stateData.isRtl = isRtl;
  applyRtlToNative(node, isRtl);
  // --- AUTO INTERFACES (instant trigger on completion) ---
  // Triggers immediately when the global stop button disappears,
  // which signals that DeepSeek's SSE stream has fired "event: close".
  // Uses isLatestAssistantMessage instead of isAbsoluteLastMessage so a
  // user message after the AI reply doesn't silently block auto tags.
  const autoRequestsAvailable = parsed.autoRequests.webFetch.length > 0 ||
    parsed.autoRequests.githubFetch.length > 0 ||
    parsed.autoRequests.twitterFetch.length > 0 ||
    parsed.autoRequests.youtubeFetch.length > 0 ||
    parsed.autoRequests.searchQueries.length > 0;
  const currentConversationId = getCurrentConversationIdInline();
  const managedAutoSuppressionRun = getManagedAutoSuppressionRun(parsed, currentConversationId);
  const suppressManagedAuto = Boolean(managedAutoSuppressionRun);

  if (isLatestAssistant && autoRequestsAvailable) {
    // isSystemGenerating() checks for the stop button (square SVG icon).
    // When it's gone, the SSE stream has ended and all tokens are in the DOM.
    const isGenerationDone = !isSystemGenerating();

    if (isGenerationDone) {
      if (!stateData.autoWebFetchesHandled) stateData.autoWebFetchesHandled = new Set();
      if (!stateData.autoGitHubFetchesHandled) stateData.autoGitHubFetchesHandled = new Set();
      if (!stateData.autoTwitterFetchesHandled) stateData.autoTwitterFetchesHandled = new Set();
      if (!stateData.autoYouTubeFetchesHandled) stateData.autoYouTubeFetchesHandled = new Set();
      if (!stateData.autoSearchQueriesHandled) stateData.autoSearchQueriesHandled = new Set();

      // Stray AUTO tags are treated as continuation attempts and recovered below.
      for (const url of parsed.autoRequests.webFetch) {
        if (suppressManagedAuto) continue;
        if (!stateData.autoWebFetchesHandled.has(url)) {
          stateData.autoWebFetchesHandled.add(url);
          handleAutoWebFetch(url);
        }
      }

      for (const repoUrl of parsed.autoRequests.githubFetch) {
        if (suppressManagedAuto) continue;
        if (!stateData.autoGitHubFetchesHandled.has(repoUrl)) {
          stateData.autoGitHubFetchesHandled.add(repoUrl);
          handleAutoGitHubFetch(repoUrl);
        }
      }

      for (const tweetUrl of parsed.autoRequests.twitterFetch) {
        if (suppressManagedAuto) continue;
        if (!stateData.autoTwitterFetchesHandled.has(tweetUrl)) {
          stateData.autoTwitterFetchesHandled.add(tweetUrl);
          handleAutoTwitterFetch(tweetUrl);
        }
      }

      for (const videoUrl of parsed.autoRequests.youtubeFetch) {
        if (suppressManagedAuto) continue;
        if (!stateData.autoYouTubeFetchesHandled.has(videoUrl)) {
          stateData.autoYouTubeFetchesHandled.add(videoUrl);
          handleAutoYouTubeFetch(videoUrl);
        }
      }

      for (const { query, deepFetch, runId, purpose, sourceType } of parsed.autoRequests.searchQueries) {
        if (suppressManagedAuto) continue;
        const searchKey = getSearchRequestKey(query, runId, purpose, sourceType);
        if (!stateData.autoSearchQueriesHandled.has(searchKey)) {
          stateData.autoSearchQueriesHandled.add(searchKey);
          if (runId) {
            handleAutoSearchForRun(query, deepFetch, runId, { purpose, sourceType });
          } else {
            handleAutoSearch(query, deepFetch, { purpose, sourceType });
          }
        }
      }

      if (
        suppressManagedAuto &&
        !parsed.deepResearch.stepDone.length &&
        !stateData.managedAutoContinuationHandled
      ) {
        const handled = handleManagedAutoContinuation(managedAutoSuppressionRun, parsed.visibleText);
        if (handled) {
          stateData.managedAutoContinuationHandled = true;
        }
      }
    } else if (!stateData.autoTimer) {
      stateData.autoTimer = setTimeout(() => {
        stateData.autoTimer = null;
        scheduleScan();
      }, 3000);
    }
  }

  // If we are still streaming a tool but aren't stalled yet, schedule a check in case it gets cut off
  if (!isStalled && parsed.isStreamingTool) {
    if (stateData.stallTimer) clearTimeout(stateData.stallTimer);
    stateData.stallTimer = setTimeout(() => {
      scheduleScan();
    }, 2600);
  }

  const hasActionableFiles = parsed.createFiles.length > 0;

  const deepResearchEventsAvailable = hasDeepResearchEvents(parsed);
  if (deepResearchEventsAvailable && role === "assistant" && isLatestAssistant) {
    if (!isSystemGenerating()) {
      if (stateData.deepResearchTimer) {
        clearTimeout(stateData.deepResearchTimer);
        stateData.deepResearchTimer = null;
      }
      dispatchDeepResearchEvents(parsed, stateData);
    } else if (!stateData.deepResearchTimer) {
      stateData.deepResearchTimer = setTimeout(() => {
        stateData.deepResearchTimer = null;
        scheduleScan();
      }, 3000);
    }
  }
  gateManagedDeepResearchReports(parsed);
  gateSuppressedManagedAutoBlocks(parsed, suppressManagedAuto);

  // --- SYNTHESIZE REPORT for managed deep research ---
  // If we are in the reporting phase and the latest settled assistant message
  // has no report tag, synthesize a report from visible markdown.
  if (isLatestAssistant && isSettled && role === "assistant") {
    const drRuns = state.deepResearch.runs;
    for (const run of drRuns) {
      if (run.execution && run.execution.managed &&
          run.conversationId === currentConversationId &&
          run.execution.reportRequested &&
          run.status === "reporting") {
        const hasReportTag = parsed.deepResearch.reports.length > 0;
        if (!hasReportTag && parsed.visibleText && parsed.visibleText.trim()) {
          const synthesized = trySynthesizeReport(run, parsed.visibleText);
          if (synthesized) {
            // Inject a synthetic renderable block so the UI renders DeepResearchReportCard
            parsed.renderableBlocks.push({
              name: "deep_research_report",
              attrs: { runId: run.id },
              content: parsed.visibleText,
            });
            parsed.containsControlTags = true;
          }
        }
      }
    }
  }

  reindexVisibleTextMarkers(parsed, preGateBlocks);

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

  if (parsed.skillCreates && parsed.skillCreates.length) {
    upsertSkills(parsed.skillCreates);
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

    if (!state.activeQuestions && !isSystemGenerating() && parsed.askQuestions.length > 0 && isLatestAssistantMessage(node) && isAbsoluteLastMessage(node)) {
      state.activeQuestions = parsed.askQuestions;
      window.dispatchEvent(new CustomEvent('bds-ask-questions', { 
        detail: { 
          questions: parsed.askQuestions,
          messageNode: node
        } 
      }));
    }

    // TAG-DRIVEN INTERFACE LOCK
    const isCurrentlyLoading = parsed.isStreamingTool || stateData.isLongWorkActive;
    const hasTags = parsed.containsControlTags || isCurrentlyLoading;

    if (hasTags) {
      // Ensure a stable loading index for this message
      if (!stateData.loadingIndex) {
        stateData.loadingIndex = Math.floor(Math.random() * 4) + 1;
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
        existing.props.isRtl = stateData.isRtl || false; 
      } else {
        const host = getOrCreateHost(node, "bds-overlay-host");
        removeStaleMessageOverlays(host);
        
        // Copy DeepSeek's markdown computed styles so the overlay matches
        matchNativeStyles(node, host);
        
        // Create reactive props object
        const props = $state({
          text: newText,
          blocks: newBlocks,
          loading: isLoading,
          loadingIndex: loadingIndex,
          isRtl: stateData.isRtl || false 
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

function hasAnyAutoRequest(parsed) {
  return Boolean(
    parsed?.autoRequests?.webFetch?.length ||
    parsed?.autoRequests?.githubFetch?.length ||
    parsed?.autoRequests?.twitterFetch?.length ||
    parsed?.autoRequests?.youtubeFetch?.length ||
    parsed?.autoRequests?.searchQueries?.length
  );
}

function isActiveManagedRun(run) {
  return Boolean(
    run?.execution?.managed &&
    run.status !== "complete" &&
    run.status !== "cancelled"
  );
}

function getManagedAutoSuppressionRun(parsed, conversationId) {
  if (!hasAnyAutoRequest(parsed)) return null;

  const activeConversationRun = state.deepResearch.runs.find(
    (run) => run.conversationId === conversationId && isActiveManagedRun(run),
  );
  if (activeConversationRun) return activeConversationRun;

  for (const { runId } of parsed.autoRequests.searchQueries || []) {
    if (!runId || !isManagedRunActive(runId)) continue;
    const run = state.deepResearch.runs.find((item) => item.id === runId);
    if (run && isActiveManagedRun(run)) return run;
  }

  return null;
}

function gateSuppressedManagedAutoBlocks(parsed, shouldSuppress) {
  if (!shouldSuppress || !parsed?.renderableBlocks?.length) return;

  parsed.renderableBlocks = parsed.renderableBlocks.filter((block) =>
    block.name !== "auto:search" &&
    block.name !== "auto:request_web_fetch" &&
    block.name !== "auto:request_github_fetch"
  );
}

function reindexVisibleTextMarkers(parsed, preGateBlocks) {
  if (!parsed.visibleText || !/\x00BLOCK:\d+\x00/.test(parsed.visibleText)) return;
  // WARNING: preGateBlocks must be captured before any gating/synthesis mutates
  // parsed.renderableBlocks. Do NOT shallow-clone blocks between capture and
  // this call — preGateBlocks.indexOf(block) relies on object identity.
  const indexMap = new Map();
  for (let newIdx = 0; newIdx < parsed.renderableBlocks.length; newIdx++) {
    const block = parsed.renderableBlocks[newIdx];
    const oldIdx = preGateBlocks.indexOf(block);
    if (oldIdx !== -1) indexMap.set(oldIdx, newIdx);
  }
  parsed.visibleText = parsed.visibleText.replace(
    /\x00BLOCK:(\d+)\x00/g,
    (_, idxStr) => {
      const newIdx = indexMap.get(parseInt(idxStr, 10));
      return newIdx !== undefined ? `\x00BLOCK:${newIdx}\x00` : '';
    }
  );
}

function gateManagedDeepResearchReports(parsed) {
  if (!parsed?.renderableBlocks?.length) return;

  parsed.renderableBlocks = parsed.renderableBlocks.filter((block) => {
    if (block.name !== "deep_research_report") return true;

    const runId = block.attrs?.runId || block.attrs?.runid || "";
    const run = state.deepResearch.runs.find((item) => item.id === runId);
    if (!run?.execution?.managed) return true;
    if (run.status === "complete") return true;

    const steps = run.execution.steps || [];
    const stepsComplete = steps.every((step) => step.status === "complete");
    return Boolean(run.execution.reportRequested && stepsComplete);
  });
}

function hasDeepResearchEvents(parsed) {
  const data = parsed && parsed.deepResearch;
  if (!data) return false;

  return (
    data.plans.length > 0 ||
    data.statuses.length > 0 ||
    data.reports.length > 0 ||
    data.stepDone.length > 0
  );
}

/**
 * Read computed font/color styles from DeepSeek's native .ds-markdown
 * and apply them as inline styles on the overlay host so the overlay
 * visually matches the surrounding message text.
 */
function matchNativeStyles(node, host) {
  const md = node.querySelector('.ds-markdown, [class*="markdown"]');
  if (!md) return;
  const cs = getComputedStyle(md);
  host.style.fontFamily = cs.fontFamily;
  host.style.fontSize = cs.fontSize;
  host.style.lineHeight = cs.lineHeight;
  host.style.fontWeight = cs.fontWeight;
  host.style.letterSpacing = cs.letterSpacing;
  host.style.color = cs.color;
}

function removeStaleMessageOverlays(host) {
  for (const overlay of host.querySelectorAll(".bds-message-overlay")) {
    overlay.remove();
  }
}

function dispatchDeepResearchEvents(parsed, stateData) {
  const data = parsed && parsed.deepResearch;
  if (!data) return;

  if (!hasDeepResearchEvents(parsed)) return;

  const signature = simpleHash(JSON.stringify(data));
  if (stateData.deepResearchSignature === signature) return;
  stateData.deepResearchSignature = signature;

  const conversationId = getCurrentConversationIdInline();

  for (const item of data.plans) {
    window.dispatchEvent(new CustomEvent("bds:deep-research-plan-received", {
      detail: {
        conversationId,
        runId: item.runId,
        plan: item.plan,
        raw: item.raw || "",
        error: item.error || "",
      },
    }));
  }

  for (const item of data.statuses) {
    window.dispatchEvent(new CustomEvent("bds:deep-research-status-received", {
      detail: {
        conversationId,
        runId: item.runId,
        status: item.status,
        raw: item.raw || "",
        error: item.error || "",
      },
    }));
  }

  for (const item of data.reports) {
    window.dispatchEvent(new CustomEvent("bds:deep-research-report-received", {
      detail: {
        conversationId,
        runId: item.runId,
        markdown: item.markdown,
      },
    }));
  }

  for (const item of data.stepDone) {
    window.dispatchEvent(new CustomEvent("bds:deep-research-step-done", {
      detail: {
        conversationId,
        runId: item.runId,
        stepId: item.stepId,
        analysis: item.analysis,
        raw: item.raw || "",
        error: item.error || "",
      },
    }));
  }
}

/**
 * Checks if DeepSeek is currently generating ANY response on the page.
 * Uses the presence of the 'Stop Generation' button as a global indicator.
 */
export function isSystemGenerating() {
  const selectors = remoteConfig.getConfig("selectors.stopButton.selectors") || [
    ".ds-icon-stop-circle",
    ".ds-icon-stop",
    'div[role="button"] svg path[d*="M3 3h10v10H3z"]',
    'div[role="button"] svg path[d*="M6 6h12v12H6z"]',
    'div[role="button"] svg path[d*="M2 4.88"]',
  ]
  const selectorStr = (Array.isArray(selectors) ? selectors : [selectors]).join(", ")
  return !!document.querySelector(selectorStr)
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
    
    stateData.tokens = outputTokens;
    stateData.cost = outputCost;
    stateData.role = "assistant";
    
    injectPriceAssistant(node, outputTokens, outputCost);
    refreshSessionTotalDisplayInline();
  }
}

/**
 * Apply RTL styling directly to the native message's markdown container
 * for messages that don't trigger an overlay.
 */
function applyRtlToNative(node, isRtl) {
  if (!isRtl) return;

  // Find ALL markdown containers (including thinking blocks)
  const allMarkdown = node.querySelectorAll('.ds-markdown, [class*="markdown"]');
  
  for (const target of allMarkdown) {
    // Skip cursor elements
    if (target.closest('.ds-cursor')) continue;
    
    target.setAttribute('dir', 'rtl');
    target.style.direction = 'rtl';
    target.style.textAlign = 'right';
    target.classList.add('bds-rtl-native');
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
  // Simple flat-rate cost (no cache split)
  return calcCostInlineWithCache(inputTokens, 0, outputTokens, modelName);
}

function calcCostInlineWithCache(inputNewTokens, inputCachedTokens, outputTokens, modelName) {
  const pricing = state.embeddedPricing;
  const resolved = detectModelInline(modelName);
  const m = pricing.models[resolved] || pricing.models["deepseek-v4-flash"];
  const newCost = (inputNewTokens / 1e6) * m.inputPrice;
  const cachedCost = (inputCachedTokens / 1e6) * (m.inputCacheHitPrice || 0.0028);
  const outputCost = (outputTokens / 1e6) * m.outputPrice;
  return { inputCost: newCost + cachedCost, outputCost, totalCost: newCost + cachedCost + outputCost };
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

function getCurrentConversationIdInline() {
  const match = location.href.match(/\/chat\/s\/([^\/]+)/);
  return match ? match[1] : "default";
}
const nodeTimeMap = new WeakMap();

function getMessageTimestamp(node, role, nodeIndex, messages) {
  if (nodeTimeMap.has(node)) {
    return nodeTimeMap.get(node);
  }
  if (messages && nodeIndex >= 0 && messages[nodeIndex]) {
    const apiMsg = messages[nodeIndex];
    const apiRole = String(apiMsg.role || "").toLowerCase();
    if (apiRole === role) {
      let ts = apiMsg.inserted_at || apiMsg.created_at || apiMsg.updated_at;
      if (ts) {
        if (ts < 1e11) {
          ts = ts * 1000;
        }
        nodeTimeMap.set(node, ts);
        return ts;
      }
    }
  }
  // If we have API data but this specific message isn't in it (e.g. a new
  // message sent after loadAllHistory completed), Date.now() is close enough.
  if (messages && messages.length > 0) {
    return Date.now();
  }
  // No API data loaded yet — don't show a misleading timestamp; wait for rescan.
  return 0;
}

function formatTimestamp(ts) {
  const date = new Date(ts);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  
  if (isToday) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + 
           date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
}

function processMessageTimestamp(node, role, nodeIndex, nodes) {
  const container = (role === "assistant") 
    ? (node.closest("._4f9bf79._43c05b5") || node.parentElement || node)
    : (node.parentElement || node);
    
  const existingEl = container.querySelector(".bds-message-timestamp");
  
  if (!state.settings.showTimestamps) {
    if (existingEl) {
      existingEl.remove();
    }
    return;
  }
  
  const sessionId = getCurrentConversationIdInline();
  const messages = state.chatMessagesBySession.get(sessionId) || [];
  const ts = getMessageTimestamp(node, role, nodeIndex, messages);
  
  if (ts === 0) {
    if (existingEl) {
      existingEl.remove();
    }
    return;
  }
  
  const formatted = formatTimestamp(ts);
  
  if (existingEl) {
    // If it's already there, check if we need to update it from a fallback to an API timestamp
    const isFallback = existingEl.getAttribute("data-bds-ts-type") === "fallback";
    const hasRealTs = nodeTimeMap.has(node);
    if (isFallback && hasRealTs) {
      existingEl.textContent = formatted;
      existingEl.title = new Date(ts).toLocaleString();
      existingEl.setAttribute("data-bds-ts-type", "api");
    }
    return;
  }
  
  let target;
  if (role === "user") {
    target = container.querySelector("._11d6b3a .ds-flex") ||
      container.querySelector(".ds-flex._78e0558") || container.querySelector("[class*='_78e0558']");
  } else {
    const modelBadge = container.querySelector("._46a12ab")?.parentElement;
    if (modelBadge) {
      target = modelBadge;
    } else {
      target = container.querySelector("._0a3d93b") || container.querySelector(".ds-flex._0a3d93b");
      if (!target) {
        const bars = container.querySelectorAll(".ds-flex");
        for (const bar of bars) {
          if (bar.querySelector(".ds-icon-button") || bar.querySelector("[role='button']")) {
            target = bar;
            break;
          }
        }
      }
    }
  }
  
  if (!target) return;
  
  const el = document.createElement("span");
  el.className = "bds-message-timestamp";
  el.textContent = formatted;
  el.title = new Date(ts).toLocaleString();
  
  const hasRealTs = nodeTimeMap.has(node);
  el.setAttribute("data-bds-ts-type", hasRealTs ? "api" : "fallback");
  
  target.appendChild(el);
}

function injectPriceUser(node, tokens, cost) {
  const container = node.parentElement || node;
  if (container.querySelector(".bds-message-price")) return;
  const priceText = formatCostDisplay(cost);
  const target = container.querySelector("._11d6b3a .ds-flex") ||
    container.querySelector(".ds-flex._78e0558") || container.querySelector("[class*='_78e0558']");
  if (!target) return;
  const el = document.createElement("span");
  el.className = "bds-message-price bds-price-user";
  el.innerHTML = `<span class="bds-price-label">${i18n.t('messageProcessor.userPrice', { price: priceText })}</span><span class="bds-token-count">${i18n.t('messageProcessor.tokenCount', { count: fmtTok(tokens) })}</span>`;
  target.appendChild(el);
}

function injectPriceAssistant(node, tokens, cost) {
  const container = node.closest("._4f9bf79._43c05b5") || node.parentElement || node;
  if (container.querySelector(".bds-message-price")) return;
  const priceText = formatCostDisplay(cost);
  
  // Try to find a model badge in this message first
  const modelBadge = container.querySelector("._46a12ab")?.parentElement;
  if (modelBadge) {
    const el = document.createElement("span");
    el.className = "bds-message-price bds-price-assistant-inline";
    el.innerHTML = `<span class="bds-price-label">${i18n.t('messageProcessor.userPrice', { price: priceText })}</span>`;
    modelBadge.appendChild(el);
    return;
  }

  const target = container.querySelector("._0a3d93b") || container.querySelector(".ds-flex._0a3d93b");
  if (!target) {
    const bars = container.querySelectorAll(".ds-flex");
    for (const bar of bars) {
      if (bar.querySelector(".ds-icon-button") || bar.querySelector("[role='button']")) {
        const el = document.createElement("span");
        el.className = "bds-message-price bds-price-assistant";
        el.innerHTML = `<span class="bds-price-label">${i18n.t('messageProcessor.userPrice', { price: priceText })}</span><span class="bds-token-count">${i18n.t('messageProcessor.tokenCount', { count: fmtTok(tokens) })}</span>`;
        bar.appendChild(el);
        return;
      }
    }
    return;
  }
  const el = document.createElement("span");
  el.className = "bds-message-price bds-price-assistant";
  el.innerHTML = `<span class="bds-price-label">${i18n.t('messageProcessor.userPrice', { price: priceText })}</span><span class="bds-token-count">${i18n.t('messageProcessor.tokenCount', { count: fmtTok(tokens) })}</span>`;
  target.appendChild(el);
}

function fmtTok(n) {
  return n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1000 ? (n / 1000).toFixed(1) + "K" : String(n);
}

function formatCostDisplay(cost) {
  if (cost <= 0 || cost < 1e-6) return i18n.t('messageProcessor.minCost');
  if (cost < 1e-3) return "$" + cost.toFixed(6);
  if (cost < 0.01) return "$" + cost.toFixed(4);
  return "$" + cost.toFixed(3);
}

function refreshSessionTotalDisplayInline() {
  if (!state.settings.tokenPriceDisplay) return;
  
  const nodes = collectMessageNodes();
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCost = 0;

  for (const node of nodes) {
    const sd = nodeStates.get(node);
    if (sd && sd.tokens) {
      if (sd.role === "user") {
        totalInputTokens += sd.tokens;
      } else {
        totalOutputTokens += sd.tokens;
      }
      totalCost += sd.cost || 0;
    }
  }

  // Update global state for other components that might read it
  state.pricing.sessionInputTokens = totalInputTokens;
  state.pricing.sessionOutputTokens = totalOutputTokens;
  state.pricing.sessionTotals.totalCost = totalCost;

  let el = document.querySelector(".bds-session-total");
  if (!el) {
    const header = document.querySelector("._2be88ba .f8d1e4c0 ._9fcbeda._7ee190f");
    // Look for the model badge pill container
    const modelBadge = header?.querySelector("._46a12ab")?.parentElement;
    const target = modelBadge || header;
    
    if (!target) return;
    
    el = document.createElement("div");
    el.className = "bds-session-total";
    target.appendChild(el);
  }
  
  const allTok = totalInputTokens + totalOutputTokens;
  const totalFmt = formatCostDisplay(totalCost);
  
  // Context Usage Calculation
  const modelName = detectModelInline(null);
  const pricingData = state.embeddedPricing;
  const m = pricingData.models[modelName] || pricingData.models["deepseek-v4-flash"];
  const contextLimit = m.contextLength || 1000000;
  const usagePercent = Math.min(1, allTok / contextLimit);
  
  // SVG Ring Parameters (Radius 7, Circumference ~44)
  const radius = 7;
  const circ = 2 * Math.PI * radius;
  const offset = circ * (1 - usagePercent);
  const ringClass = usagePercent > 0.9 ? "danger" : usagePercent > 0.7 ? "warning" : "";
  const usageText = i18n.t('messageProcessor.contextTemplate', { used: fmtTok(allTok), total: fmtTok(contextLimit), percent: (usagePercent * 100).toFixed(1) });

  el.innerHTML = `
    <span class="bds-price-badge">${i18n.t('messageProcessor.userPrice', { price: totalFmt })}</span>
    <span class="bds-token-badge">${i18n.t('messageProcessor.tokenCount', { count: fmtTok(allTok) })}</span>
    <div class="bds-context-ring-container" data-tooltip="${i18n.t('messageProcessor.contextTooltip', { text: usageText })}">
      <svg class="bds-context-ring ${ringClass}" width="18" height="18" viewBox="0 0 18 18">
        <circle class="bg" cx="9" cy="9" r="${radius}" />
        <circle class="progress" cx="9" cy="9" r="${radius}" 
                stroke-dasharray="${circ}" 
                stroke-dashoffset="${offset}" />
      </svg>
    </div>
  `;
}

function injectSelectionCheckbox(node) {
  if (node.querySelector(".bds-selection-checkbox-container")) return;

  const container = document.createElement("div");
  container.className = "bds-selection-checkbox-container";
  
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "bds-selection-checkbox";
  
  // Use a stable random ID for this session
  let id = node.getAttribute("data-bds-msg-id");
  if (!id) {
    id = "msg-" + Math.random().toString(36).substring(2, 11);
    node.setAttribute("data-bds-msg-id", id);
  }
  checkbox.setAttribute("data-bds-message-id", id);

  checkbox.addEventListener("change", (e) => {
    if (e.target.checked) {
      state.selectedMessageIds.add(id);
    } else {
      state.selectedMessageIds.delete(id);
    }
    window.dispatchEvent(new CustomEvent("bds:selectionChanged"));
  });

  container.appendChild(checkbox);
  
  // Inser at the very beginning of the message node
  if (node.firstChild) {
    node.insertBefore(container, node.firstChild);
  } else {
    node.appendChild(container);
  }
}

function injectBookmarkButton(node) {
  const stateData = getNodeState(node);
  if (stateData.bookmarkInjected) return;

  const role = detectMessageRole(node);
  if (role !== "user" && role !== "assistant") return;

  let msgId = node.getAttribute("data-bds-msg-id");
  if (!msgId) {
    msgId = "msg-" + Math.random().toString(36).substring(2, 11);
    node.setAttribute("data-bds-msg-id", msgId);
  }

  const isBookmarked = state.savedItems.some(item => item.messageNodeId === msgId && item.type === "bookmark");

  let container;
  if (role === "user") {
    const wrapper = node.parentElement || node;
    container = wrapper.querySelector("._11d6b3a .ds-flex") ||
      wrapper.querySelector(".ds-flex._78e0558") || wrapper.querySelector("[class*='_78e0558']");
  } else {
    const wrapper = node.closest("._4f9bf79._43c05b5") || node.parentElement || node;
    const actionRow = wrapper.querySelector("._0a3d93b") || wrapper.querySelector(".ds-flex._0a3d93b");
    if (actionRow) {
      container = actionRow.querySelector("._965abe9") || actionRow.querySelector(".ds-flex._965abe9._54866f7");
    }
  }

  if (!container) return;

  const siblingBtn = container.querySelector('[class*="ds-button"]');
  const baseClass = siblingBtn ? siblingBtn.className.replace(/bds-bookmark-btn[^\s]*/g, "").trim() : "ds-button ds-button--iconLabelTertiary ds-button--icon ds-button--capsule ds-button--xs";

  const btn = document.createElement("div");
  btn.className = baseClass + " bds-bookmark-btn" + (isBookmarked ? " bds-bookmark-btn--active" : "");
  btn.setAttribute("tabindex", "0");
  btn.setAttribute("role", "button");
  btn.setAttribute("aria-disabled", "false");
  btn.title = isBookmarked ? i18n.t('savedItems.removeBookmark') : i18n.t('savedItems.bookmarkThis');

  btn.innerHTML = [
    '<div class="ds-button__background"></div>',
    '<div class="ds-button__icon ds-button__icon--last-child">',
    '<div class="ds-icon">',
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="' + (isBookmarked ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">',
    '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>',
    '</svg>',
    '</div>',
    '</div>',
  ].join("");

  btn.addEventListener("click", async (e) => {
    e.stopPropagation();
    const already = state.savedItems.some(item => item.messageNodeId === msgId && item.type === "bookmark");

    if (already) {
      state.savedItems = state.savedItems.filter(item => !(item.messageNodeId === msgId && item.type === "bookmark"));
      await chrome.storage.local.set({ [STORAGE_KEYS.savedItems]: state.savedItems });
      btn.classList.remove("bds-bookmark-btn--active");
      const svg = btn.querySelector("svg");
      if (svg) svg.setAttribute("fill", "none");
      btn.title = i18n.t('savedItems.bookmarkThis');
      if (state.ui) state.ui.showToast(i18n.t('savedItems.bookmarkRemoved'));
    } else {
      const conversationUrl = location.href;
      const match = location.href.match(/\/chat\/s\/([^\/]+)/);
      const conversationId = match ? match[1] : "";
      let conversationTitle = "";
      if (conversationId) {
        const session = state.chatSessions.find(s => s.id === conversationId);
        if (session && session.title) conversationTitle = session.title;
      }
      if (!conversationTitle) {
        const t = document.title.replace(/\s*[-·]\s*DeepSeek\s*$/i, "").trim();
        if (t && t.toLowerCase() !== "chat") conversationTitle = t;
      }

      const text = extractMessageRawText(node).slice(0, 2000);
      const snippet = text.length > 200 ? text.slice(0, 200) + "..." : text;

      state.savedItems.push({
        id: makeId(),
        type: "bookmark",
        title: snippet,
        content: text,
        messageType: role,
        messageNodeId: msgId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        conversationTitle: conversationTitle,
        conversationUrl: conversationUrl,
      });
      await chrome.storage.local.set({ [STORAGE_KEYS.savedItems]: state.savedItems });
      btn.classList.add("bds-bookmark-btn--active");
      const svg = btn.querySelector("svg");
      if (svg) svg.setAttribute("fill", "currentColor");
      btn.title = i18n.t('savedItems.removeBookmark');
      if (state.ui) state.ui.showToast(i18n.t('savedItems.bookmarked'));
    }
  });

  container.appendChild(btn);
  stateData.bookmarkInjected = true;
}

function handleUserMessageCollapse(node) {
  const textContainer = node.querySelector('.fbb737a4') || node.querySelector('.ds-markdown');
  if (!textContainer) return;

  const stateData = getNodeState(node);
  const text = textContainer.textContent || "";
  const lines = text.split("\n").length;
  
  const CHAR_THRESHOLD = 600;
  const LINE_THRESHOLD = 10;
  const isTooLong = text.length > CHAR_THRESHOLD || lines > LINE_THRESHOLD;

  if (isTooLong && state.settings.collapseLongUserMessages) {
    if (!stateData.collapseInitialized) {
      stateData.collapseInitialized = true;
      stateData.isCollapsed = true;
      
      textContainer.classList.add("bds-collapsed-user-message");
      textContainer.style.maxHeight = "160px";
      textContainer.style.overflow = "hidden";
      textContainer.style.position = "relative";
      
      const parent = textContainer.parentNode;
      if (parent) {
        parent.style.position = "relative";
      }

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "bds-user-message-expand-toggle";
      btn.title = i18n.t('expandToggle.expandTitle');
      
      if (textContainer.nextSibling) {
        textContainer.parentNode.insertBefore(btn, textContainer.nextSibling);
      } else {
        textContainer.parentNode.appendChild(btn);
      }

      stateData.expandBtn = btn;

      const toggleCollapse = () => {
        stateData.isCollapsed = !stateData.isCollapsed;
        if (stateData.isCollapsed) {
          textContainer.classList.add("bds-collapsed-user-message");
          textContainer.classList.remove("bds-expanded-user-message");
          textContainer.style.maxHeight = "160px";
          btn.classList.remove("expanded");
          btn.title = i18n.t('expandToggle.expandTitle');
          btn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="15 3 21 3 21 9"></polyline>
              <polyline points="9 21 3 21 3 15"></polyline>
              <line x1="21" y1="3" x2="14" y2="10"></line>
              <line x1="3" y1="21" x2="10" y2="14"></line>
            </svg>
          `;
        } else {
          textContainer.classList.remove("bds-collapsed-user-message");
          textContainer.classList.add("bds-expanded-user-message");
          textContainer.style.maxHeight = "none";
          btn.classList.add("expanded");
          btn.title = i18n.t('expandToggle.collapseTitle');
          btn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="4 14 10 14 10 20"></polyline>
              <polyline points="20 10 14 10 14 4"></polyline>
              <line x1="14" y1="10" x2="21" y2="3"></line>
              <line x1="10" y1="14" x2="3" y2="21"></line>
            </svg>
          `;
        }
      };

      btn.addEventListener("click", toggleCollapse);
      btn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 3 21 3 21 9"></polyline>
          <polyline points="9 21 3 21 3 15"></polyline>
          <line x1="21" y1="3" x2="14" y2="10"></line>
          <line x1="3" y1="21" x2="10" y2="14"></line>
        </svg>
      `;
    } else {
      if (stateData.isCollapsed) {
        textContainer.classList.add("bds-collapsed-user-message");
        textContainer.classList.remove("bds-expanded-user-message");
        textContainer.style.maxHeight = "160px";
      } else {
        textContainer.classList.remove("bds-collapsed-user-message");
        textContainer.classList.add("bds-expanded-user-message");
        textContainer.style.maxHeight = "none";
      }
    }
  } else {
    cleanupUserMessageCollapse(node, stateData, textContainer);
  }
}

function cleanupUserMessageCollapse(node, stateData, textContainer) {
  if (stateData.collapseInitialized) {
    textContainer.classList.remove("bds-collapsed-user-message");
    textContainer.classList.remove("bds-expanded-user-message");
    textContainer.style.maxHeight = "";
    textContainer.style.overflow = "";
    textContainer.style.position = "";
    if (stateData.expandBtn && stateData.expandBtn.parentNode) {
      stateData.expandBtn.parentNode.removeChild(stateData.expandBtn);
    }
    stateData.collapseInitialized = false;
    stateData.isCollapsed = false;
    stateData.expandBtn = null;
  }
}
