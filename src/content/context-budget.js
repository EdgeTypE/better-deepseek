/**
 * Context budget tracking for Deep Research.
 *
 * Tracks estimated full-chat context per conversation, including hidden
 * extension prompts, visible text, evidence digests, and attachment text.
 * Uses server-reported token usage when available to calibrate estimates.
 *
 * Default limit: 128,000 tokens (DeepSeek web-chat context window).
 * Default stop threshold: 70% of limit = 89,600 tokens.
 */

import { CHARS_PER_TOKEN } from "../lib/constants.js";
import state from "./state.js";

/** @type {Map<string, {estimate: number, serverTokens: number, lastServerUpdate: number, entries: Array}>} */
const conversations = new Map();

/**
 * Estimate DeepSeek token count from text using the chars-per-token heuristic.
 * @param {string} text
 * @returns {number} estimated token count
 */
export function estimateDeepSeekTokens(text) {
  if (!text) return 0;
  return Math.ceil(String(text).length / CHARS_PER_TOKEN);
}

/**
 * Record outgoing context that will be sent to DeepSeek.
 * @param {object} opts
 * @param {string} opts.conversationId
 * @param {string} [opts.text] - Raw prompt text
 * @param {string} [opts.fileText] - Attached file text
 * @param {string} [opts.label] - Human-readable label for debugging
 * @returns {number} new estimated total
 */
export function recordOutgoingContext({ conversationId, text, fileText, label }) {
  const tokens = estimateDeepSeekTokens(text || "") + estimateDeepSeekTokens(fileText || "");
  if (tokens <= 0) return getConversationContextEstimate(conversationId);

  let convo = conversations.get(conversationId);
  if (!convo) {
    convo = { estimate: 0, serverTokens: 0, lastServerUpdate: 0, entries: [] };
    conversations.set(conversationId, convo);
  }

  convo.estimate += tokens;
  convo.entries.push({ tokens, label: label || "", timestamp: Date.now() });
  return convo.estimate;
}

/**
 * Record server-reported token usage to calibrate estimates.
 * The server count replaces the estimate when available, as it is authoritative.
 * @param {object} opts
 * @param {string} opts.conversationId
 * @param {number} opts.inputTokens
 * @param {number} opts.outputTokens
 * @param {string} [opts.modelName]
 */
export function recordServerUsage({ conversationId, inputTokens, outputTokens, modelName }) {
  let convo = conversations.get(conversationId);
  if (!convo) {
    convo = { estimate: 0, serverTokens: 0, lastServerUpdate: 0, entries: [] };
    conversations.set(conversationId, convo);
  }

  const total = (Number(inputTokens) || 0) + (Number(outputTokens) || 0);
  convo.serverTokens = Math.max(convo.serverTokens, total);
  convo.lastServerUpdate = Date.now();

  // Server report is authoritative — use max of estimate and server count
  // Keep the local estimate if it is larger because it may include readable
  // attachment text or an outgoing prompt recorded before usage returns.
  convo.estimate = Math.max(convo.estimate, Math.ceil(convo.serverTokens * 1.05));
}

/**
 * Get the estimated total context tokens for a conversation.
 * @param {string} conversationId
 * @returns {number}
 */
export function getConversationContextEstimate(conversationId) {
  const convo = conversations.get(conversationId);
  if (!convo) return 0;
  return convo.estimate;
}

/**
 * Get the context budget configuration from settings.
 * @returns {{ enabled: boolean, limitTokens: number, stopPercent: number, thresholdTokens: number }}
 */
export function getContextBudgetConfig() {
  const settings = state.settings;
  const enabled = Boolean(settings.deepResearchContextGuardEnabled);
  const limitTokens = clampContextLimit(Number(settings.deepResearchContextLimitTokens) || 128000);
  const stopPercent = clampStopPercent(Number(settings.deepResearchContextStopPercent) || 70);
  const thresholdTokens = Math.floor(limitTokens * (stopPercent / 100));
  return { enabled, limitTokens, stopPercent, thresholdTokens };
}

/**
 * Check whether adding outgoingEstimateTokens would cross the Deep Research
 * context budget threshold.
 * @param {object} run - The deep research run object
 * @param {number} outgoingEstimateTokens - Estimated tokens the next prompt will add
 * @returns {{ wouldCross: boolean, currentEstimate: number, projectedTotal: number, thresholdTokens: number, config: object }}
 */
export function wouldCrossDeepResearchBudget(run, outgoingEstimateTokens) {
  const config = getContextBudgetConfig();

  if (!config.enabled) {
    return { wouldCross: false, currentEstimate: 0, projectedTotal: 0, thresholdTokens: config.thresholdTokens, config };
  }

  const conversationId = run?.conversationId || "";
  const currentEstimate = getConversationContextEstimate(conversationId);
  const projectedTotal = currentEstimate + (outgoingEstimateTokens || 0);
  const wouldCross = projectedTotal >= config.thresholdTokens;

  return { wouldCross, currentEstimate, projectedTotal, thresholdTokens: config.thresholdTokens, config };
}

/**
 * Mark remaining pending steps as skipped_budget and record budget stop metadata.
 * @param {object} run - The deep research run object
 * @returns {object} snapshot of the budget state
 */
export function applyBudgetStop(run, budgetCheck = null) {
  const config = getContextBudgetConfig();
  const conversationId = run?.conversationId || "";
  const currentEstimate = getConversationContextEstimate(conversationId);
  const projectedTotal = Number(budgetCheck?.projectedTotal) || currentEstimate;
  const thresholdTokens = Number(budgetCheck?.thresholdTokens) || config.thresholdTokens;

  const snapshot = {
    estimatedTokens: currentEstimate,
    projectedTokens: projectedTotal,
    limitTokens: config.limitTokens,
    stopPercent: config.stopPercent,
    thresholdTokens,
    stoppedAt: Date.now(),
  };

  if (run?.execution) {
    run.execution.budgetStopReason = `Context budget threshold reached: projected ~${projectedTotal} of ${thresholdTokens} tokens (${config.stopPercent}% of ${config.limitTokens})`;
    run.execution.contextBudgetSnapshot = snapshot;

    // Mark the current unsent step and all remaining unfinished steps terminal.
    // Budget stops usually happen while the current step is ready_to_send.
    const steps = run.execution.steps || [];
    const currentIdx = Math.max(0, run.execution.currentStepIndex ?? 0);
    for (let i = currentIdx; i < steps.length; i++) {
      if (steps[i] && steps[i].status !== "complete") {
        steps[i].status = "skipped_budget";
      }
    }
  }

  return snapshot;
}

/**
 * Clear context budget tracking for a conversation.
 * @param {string} conversationId
 */
export function clearConversationBudget(conversationId) {
  conversations.delete(conversationId);
}

/**
 * Check if a run has been stopped by the budget guard.
 * @param {object} run
 * @returns {boolean}
 */
export function isBudgetStopped(run) {
  return Boolean(run?.execution?.budgetStopReason);
}

/**
 * Clamp context limit to a sensible range: 16,000 - 1,000,000.
 * @param {number} value
 * @returns {number}
 */
export function clampContextLimit(value) {
  if (!Number.isFinite(value) || value <= 0) return 128000;
  return Math.max(16000, Math.min(1000000, Math.round(value)));
}

/**
 * Clamp stop percentage to 50-95 range.
 * @param {number} value
 * @returns {number}
 */
export function clampStopPercent(value) {
  if (!Number.isFinite(value) || value <= 0) return 70;
  return Math.max(50, Math.min(95, Math.round(value)));
}
