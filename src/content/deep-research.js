/**
 * Deep Research Mode V1 — State machine and run management.
 *
 * State machine: idle -> planning -> awaiting_revision|approved -> running -> reporting -> complete
 *
 * Persists minimal run metadata under STORAGE_KEYS.deepResearchRuns.
 */

import { devLog } from "../lib/dev-log.js";
import { BRIDGE_EVENTS, STORAGE_KEYS } from "../lib/constants.js";
import { makeId } from "../lib/utils/helpers.js";
import { normalizeHttpUrl } from "../lib/utils/url-normalizer.js";
import state from "./state.js";
import { clearRunSearchHistory, injectPureTextAndSend, sendFileWithMessage } from "./auto.js";
import { fetchAndConvertWebPage } from "./files/web-reader.js";
import { searchWeb } from "./files/search-reader.js";
import {
  estimateDeepSeekTokens,
  recordOutgoingContext,
  wouldCrossDeepResearchBudget,
  applyBudgetStop,
  isBudgetStopped,
  clearConversationBudget,
} from "./context-budget.js";

/** Valid statuses for a deep research run */
export const RESEARCH_STATUSES = [
  "idle",
  "planning",
  "awaiting_revision",
  "approved",
  "running",
  "reporting",
  "complete",
  "cancelled",
];

/** Allowed state transitions */
const TRANSITIONS = {
  idle: ["planning"],
  planning: ["awaiting_revision", "approved", "cancelled"],
  awaiting_revision: ["planning", "cancelled"],
  approved: ["running", "cancelled"],
  running: ["reporting", "cancelled"],
  reporting: ["complete"],
  complete: [],
  cancelled: [],
};

/**
 * Create a new deep research run object.
 * @param {string} conversationId
 * @returns {object} run
 */
export function createRun(conversationId, id = makeId()) {
  return {
    id,
    conversationId,
    status: "planning",
    plan: null,
    sourceLedger: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    /** Managed execution state — when true, BDS drives step-by-step */
    execution: {
      managed: false,
      /** Normalized steps from the approved plan (includes adaptive steps) */
      steps: [],
      currentStepIndex: -1,
      /** The step ID we are waiting for analysis on */
      awaitingAnalysisStepId: null,
      /** Whether the final report prompt has been sent */
      reportRequested: false,
      /** Monotonic counter for generating adaptive step IDs (a1, a2, ...) */
      adaptiveStepCounter: 0,
      /** Why the budget guard stopped execution (empty string if not stopped) */
      budgetStopReason: "",
      /** Snapshot of context budget state at stop time */
      contextBudgetSnapshot: null,
    },
  };
}

/**
 * Validate and apply a status transition.
 * @param {object} run
 * @param {string} newStatus
 * @returns {object} updated run (same reference, mutated)
 * @throws if transition is invalid
 */
export function transitionRun(run, newStatus) {
  const allowed = TRANSITIONS[run.status];
  if (!allowed || !allowed.includes(newStatus)) {
    throw new Error(
      `Invalid deep research transition: ${run.status} -> ${newStatus}`
    );
  }
  run.status = newStatus;
  run.updatedAt = Date.now();
  return run;
}

export function getCurrentConversationId() {
  const match = String(location.href || "").match(/\/chat\/s\/([^/?#]+)/);
  return match ? match[1] : "default";
}

export function setDeepResearchEnabled(enabled, conversationId = getCurrentConversationId()) {
  state.deepResearch.enabled = Boolean(enabled);
  if (state.deepResearch.enabled) {
    state.deepResearch.pendingRun = createRun(conversationId);
  } else {
    state.deepResearch.pendingRun = null;
    const activeRun = findActiveRun(state.deepResearch.runs, conversationId);
    if (activeRun) {
      setStatus(activeRun, "cancelled");
      upsertRun(activeRun);
      clearRunSearchHistory(activeRun.id);
      clearConversationBudget(activeRun.conversationId);
      emitRunState(activeRun);
      void persistRuns(state.deepResearch.runs);
    }
  }

  emitConfigState();
  emitToggleState();
  window.dispatchEvent(new CustomEvent("bds:deep-research-config-changed"));
  return state.deepResearch.pendingRun;
}

/**
 * Persist runs array to chrome storage.
 * @param {Array} runs
 */
export async function persistRuns(runs) {
  if (typeof chrome !== "undefined" && chrome.storage) {
    await chrome.storage.local.set({
      [STORAGE_KEYS.deepResearchRuns]: runs.map(serializeRun),
    });
  }
}

/**
 * Load runs from chrome storage.
 * @returns {Promise<Array>}
 */
export async function loadRuns() {
  if (typeof chrome === "undefined" || !chrome.storage) return [];
  const result = await chrome.storage.local.get(STORAGE_KEYS.deepResearchRuns);
  const raw = result[STORAGE_KEYS.deepResearchRuns];
  if (!Array.isArray(raw)) return [];
  return raw.map(deserializeRun);
}

/**
 * Find active run for a conversation (not complete/cancelled).
 * @param {Array} runs
 * @param {string} conversationId
 * @returns {object|null}
 */
export function findActiveRun(runs, conversationId) {
  return (
    runs.find(
      (r) =>
        r.conversationId === conversationId &&
        r.status !== "complete" &&
        r.status !== "cancelled"
    ) || null
  );
}

function normalizeEventDetail(detail) {
  if (typeof detail === "string") {
    try {
      return JSON.parse(detail);
    } catch {
      return {};
    }
  }
  return detail && typeof detail === "object" ? detail : {};
}

const MAX_DEEP_FETCH = 5;
const TEXT_ONLY_STEP_PROMPT_CHARS = 9_000;
const TEXT_ONLY_FALLBACK_CHARS = 4_500;
const TEXT_ONLY_EMERGENCY_CHARS = 2_000;

/** Adaptive step expansion limits */
const MAX_ADAPTIVE_STEPS_PER_STEP = 3;
const MAX_TOTAL_MANAGED_STEPS = 12;
const VALID_SOURCE_TYPES = ["general", "docs", "news", "reviews", "academic", "commerce"];
const VALID_ADAPTIVE_ACTIONS = ["search", "fetch"];

const PROMPT_DETAIL = {
  full: { sources: 6, snippetChars: 260, excerptChars: 900, queryChars: 700, purposeChars: 400 },
  fallback: { sources: 4, snippetChars: 140, excerptChars: 420, queryChars: 420, purposeChars: 240 },
  emergency: { sources: 2, snippetChars: 70, excerptChars: 160, queryChars: 180, purposeChars: 120 },
};

function getDeepFetchSetting() {
  const val = Number(state.settings?.deepResearchDeepFetch);
  return Number.isFinite(val) ? Math.max(0, Math.min(MAX_DEEP_FETCH, val)) : 1;
}

function clampDeepFetch(value) {
  const setting = getDeepFetchSetting();
  if (value === undefined || value === null || value === '') return setting;
  const num = parseInt(String(value), 10);
  if (isNaN(num) || num < 0) return setting;
  return Math.min(num, setting);
}

function normalizeSourceType(raw) {
  const normalized = String(raw || "").trim().toLowerCase();
  return VALID_SOURCE_TYPES.includes(normalized) ? normalized : "general";
}

function tryNormalizeFetchUrl(value) {
  try {
    return normalizeHttpUrl(value);
  } catch {
    return "";
  }
}

function normalizeSearchDedupeQuery(value) {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function getStepDedupeKey(step) {
  const action = String(step?.action || "").trim().toLowerCase();
  if (!VALID_ADAPTIVE_ACTIONS.includes(action)) return "";

  const query = action === "fetch"
    ? tryNormalizeFetchUrl(step?.query) || normalizeSearchDedupeQuery(step?.query)
    : normalizeSearchDedupeQuery(step?.query);
  return query ? `${action}\n${query}` : "";
}

/**
 * Validate and normalize a single adaptive step proposal.
 * Returns null if the step is invalid, duplicate, or unsupported.
 * @param {object} rawStep - The raw adaptive step from model output
 * @param {Array} existingSteps - All current execution steps for dedup
 * @param {number} adapterCounter - Current adaptive step counter
 * @returns {object|null} Normalized adaptive step or null
 */
function validateAdaptiveStep(rawStep, existingSteps, adapterCounter) {
  if (!rawStep || typeof rawStep !== "object") return null;

  const action = String(rawStep.action || "").trim().toLowerCase();
  if (!VALID_ADAPTIVE_ACTIONS.includes(action)) return null;

  const query = String(rawStep.query || "").trim();
  if (!query) return null;

  // Fetch steps must target normalizable HTTP(S) URLs
  const normalizedQuery = action === "fetch" ? tryNormalizeFetchUrl(query) : query;
  if (!normalizedQuery) return null;

  // Deduplicate against all existing steps by normalized action + query
  const candidateKey = getStepDedupeKey({ action, query: normalizedQuery });
  for (const existing of existingSteps) {
    if (getStepDedupeKey(existing) === candidateKey) {
      return null;
    }
  }

  const purpose = String(rawStep.purpose || "").trim();
  const sourceType = action === "search" ? normalizeSourceType(rawStep.sourceType) : "";
  const deepFetch = action === "search" ? clampDeepFetch(rawStep.deepFetch) : 0;

  return {
    id: `a${adapterCounter + 1}`,
    action,
    query: normalizedQuery,
    purpose,
    sourceType,
    deepFetch,
    status: "pending",
    outcome: null,
    error: null,
    resultFile: null,
    adaptive: true,
    parentStepId: null,
  };
}

function limitText(value, maxChars) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!maxChars || text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
}

function parseStepOutcome(step) {
  try {
    return step?.outcome ? JSON.parse(step.outcome) : {};
  } catch {
    return {};
  }
}

function findRunById(runId) {
  return state.deepResearch.runs.find((run) => run.id === runId) || null;
}

function upsertRun(run) {
  const index = state.deepResearch.runs.findIndex((item) => item.id === run.id);
  if (index >= 0) {
    state.deepResearch.runs[index] = run;
  } else {
    state.deepResearch.runs.push(run);
  }
  return run;
}

function ensureRun(runId, conversationId = getCurrentConversationId()) {
  const safeRunId = String(runId || "").trim() || makeId();
  return findRunById(safeRunId) || upsertRun(createRun(conversationId, safeRunId));
}

function setStatus(run, status) {
  if (!run || !RESEARCH_STATUSES.includes(status)) return run;
  if (run.status === status) return run;
  const allowed = TRANSITIONS[run.status] || [];
  if (allowed.includes(status)) {
    return transitionRun(run, status);
  }
  run.status = status;
  run.updatedAt = Date.now();
  return run;
}

function emitConfigState() {
  window.dispatchEvent(new CustomEvent(BRIDGE_EVENTS.deepResearchConfigUpdate, {
    detail: JSON.stringify({
      enabled: Boolean(state.deepResearch.enabled && state.deepResearch.pendingRun),
      runId: state.deepResearch.pendingRun?.id || "",
    }),
  }));
}

function emitToggleState() {
  window.dispatchEvent(new CustomEvent("bds:deep-research-toggle-state", {
    detail: { enabled: state.deepResearch.enabled },
  }));
}

function isRunInteractive(run) {
  return Boolean(
    state.deepResearch.enabled &&
    run &&
    run.status === "planning"
  );
}

function emitRunState(run) {
  if (!run) return;
  const exec = run.execution;
  const managed = Boolean(exec && exec.managed);
  const steps = exec ? exec.steps : [];
  window.dispatchEvent(new CustomEvent("bds:deep-research-run-state", {
    detail: {
      runId: run.id,
      status: run.status,
      enabled: state.deepResearch.enabled,
      interactive: isRunInteractive(run),
      managed,
      currentStepIndex: exec ? exec.currentStepIndex : -1,
      totalSteps: steps.length,
      awaitingStepId: exec ? exec.awaitingAnalysisStepId : null,
      reportRequested: exec ? exec.reportRequested : false,
      budgetStopReason: exec ? exec.budgetStopReason || "" : "",
      steps: managed ? steps.map((s) => ({
        id: s.id,
        action: s.action,
        query: s.query,
        purpose: s.purpose,
        sourceType: s.sourceType,
        deepFetch: s.deepFetch,
        status: s.status,
        error: s.error,
        adaptive: Boolean(s.adaptive),
        parentStepId: s.parentStepId || null,
      })) : [],
    },
  }));
}

/**
 * Serialize a run for storage (strips large fields).
 */
function serializeRun(run) {
  const exec = run.execution;
  const serializedSteps = (exec && Array.isArray(exec.steps))
    ? exec.steps.map(serializeStep)
    : [];
  return {
    id: run.id,
    conversationId: run.conversationId,
    status: run.status,
    plan: run.plan,
    sourceLedger: run.sourceLedger,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    execution: exec ? {
      managed: Boolean(exec.managed),
      steps: serializedSteps,
      currentStepIndex: Number(exec.currentStepIndex ?? -1),
      awaitingAnalysisStepId: exec.awaitingAnalysisStepId || null,
      reportRequested: Boolean(exec.reportRequested),
      adaptiveStepCounter: Number(exec.adaptiveStepCounter ?? 0),
      budgetStopReason: exec.budgetStopReason || "",
      contextBudgetSnapshot: exec.contextBudgetSnapshot || null,
    } : undefined,
  };
}

/**
 * Serialize a single execution step for storage.
 * Strips fetched file contents — only metadata is persisted.
 */
function serializeStep(step) {
  return {
    id: step.id,
    action: step.action,
    query: step.query,
    purpose: step.purpose,
    sourceType: step.sourceType || "",
    deepFetch: Number(step.deepFetch) || 0,
    // Include skipped_budget as a valid persisted status (alongside pending, tool_running, etc.)
    status: step.status || "pending",
    outcome: step.outcome || null,
    error: step.error || null,
    adaptive: Boolean(step.adaptive),
    parentStepId: step.parentStepId || null,
  };
}

/**
 * Deserialize a run from storage.
 */
function deserializeRun(raw) {
  const rawExec = raw.execution;
  const steps = (rawExec && Array.isArray(rawExec.steps))
    ? rawExec.steps.map(deserializeStep)
    : [];
  return {
    id: String(raw.id || makeId()),
    conversationId: String(raw.conversationId || ""),
    status: RESEARCH_STATUSES.includes(raw.status) ? raw.status : "cancelled",
    plan: raw.plan || null,
    sourceLedger: Array.isArray(raw.sourceLedger) ? raw.sourceLedger : [],
    createdAt: Number(raw.createdAt) || Date.now(),
    updatedAt: Number(raw.updatedAt) || Date.now(),
    execution: rawExec ? {
      managed: Boolean(rawExec.managed),
      steps,
      currentStepIndex: Number(rawExec.currentStepIndex ?? -1),
      awaitingAnalysisStepId: rawExec.awaitingAnalysisStepId || null,
      reportRequested: Boolean(rawExec.reportRequested),
      adaptiveStepCounter: Number(rawExec.adaptiveStepCounter ?? 0),
      budgetStopReason: rawExec.budgetStopReason || "",
      contextBudgetSnapshot: rawExec.contextBudgetSnapshot || null,
    } : {
      managed: false,
      steps: [],
      currentStepIndex: -1,
      awaitingAnalysisStepId: null,
      reportRequested: false,
      adaptiveStepCounter: 0,
      budgetStopReason: "",
      contextBudgetSnapshot: null,
    },
  };
}

/**
 * Deserialize a single execution step from storage.
 */
function deserializeStep(raw) {
  return {
    id: raw.id,
    action: raw.action || "search",
    query: raw.query || "",
    purpose: raw.purpose || "",
    sourceType: raw.sourceType || "",
    deepFetch: Number(raw.deepFetch) || 0,
    status: raw.status || "pending",
    outcome: raw.outcome || null,
    error: raw.error || null,
    adaptive: Boolean(raw.adaptive),
    parentStepId: raw.parentStepId || null,
  };
}

/**
 * Build hidden approval message to send to DeepSeek.
 * @param {object} run
 * @returns {string}
 */
export function buildApprovalMessage(run) {
  return [
    `<BetterDeepSeek>`,
    `[BDS:DEEP_RESEARCH] Plan approved for run ${run.id}. Execute the following research plan:`,
    JSON.stringify(run.plan, null, 2),
    `For each search step, use a narrow query with named entities, concrete constraints, dates or locations, product or version names, and explicit source intent.`,
    `Emit searches as <BDS:AUTO:SEARCH runId="${run.id}" deepFetch="${getDeepFetchSetting()}" purpose="why this search matters" sourceType="reviews">specific query</BDS:AUTO:SEARCH>, choosing sourceType from general, docs, news, reviews, academic, or commerce. Use <BDS:AUTO:REQUEST_WEB_FETCH> for specific URLs.`,
    `After each search/fetch result is injected, read it, update the source ledger mentally, and continue with the next step until the plan is complete.`,
    `After completing all research steps, your final answer MUST be a proper Markdown report wrapped exactly as: <BDS:DEEP_RESEARCH_REPORT runId="${run.id}">markdown</BDS:DEEP_RESEARCH_REPORT>.`,
    `Do not wrap the report Markdown in a code fence. Do not finish with ordinary prose outside the report tag.`,
    `</BetterDeepSeek>`,
  ].join("\n");
}

/**
 * Build hidden revision message to send to DeepSeek.
 * @param {object} run
 * @param {string} feedback
 * @returns {string}
 */
export function buildRevisionMessage(run, feedback) {
  const safeFeedback = String(feedback || "").trim() || "No specific feedback was provided. Re-check the plan for completeness, source coverage, and alignment with the user's original request.";
  const currentPlan = run.plan ? JSON.stringify(run.plan, null, 2) : "{}";
  return [
    `<BetterDeepSeek>`,
    `[BDS:DEEP_RESEARCH] Revision requested for run ${run.id}.`,
    `User feedback: ${safeFeedback}`,
    `Current research plan:`,
    currentPlan,
    `Please revise the research plan and output ONLY an updated plan using <BDS:DEEP_RESEARCH_PLAN runId="${run.id}">JSON</BDS:DEEP_RESEARCH_PLAN>.`,
    `Do not browse yet and do not include ordinary prose outside the plan tag.`,
    `</BetterDeepSeek>`,
  ].join("\n");
}

/**
 * Build the initial planning prompt injected when deep research mode is enabled.
 * @param {string} runId
 * @param {string} userQuery - the user's research question
 * @returns {string}
 */
export function buildPlanningPrompt(runId, userQuery) {
  return [
    `<BetterDeepSeek>`,
    `[BDS:DEEP_RESEARCH] The DeepResearch toggle is enabled. Treat this exactly as the user asking: "Perform Deep Research on the following request."`,
    `Run ID: ${runId}`,
    ``,
    `CRITICAL: In this first turn, you must ONLY produce a research plan. Do NOT browse or search. Do NOT produce an ordinary answer. Do NOT produce a direct report.`,
    `Output ONLY a plan using: <BDS:DEEP_RESEARCH_PLAN runId="${runId}">JSON</BDS:DEEP_RESEARCH_PLAN>`,
    `After this turn, BDS will execute steps one-by-one. After each step result is provided, analyze it before continuing. Do NOT skip ahead to the final report until BDS tells you all steps are complete.`,
    ``,
    `The JSON plan must include:`,
    `- "title": A short descriptive title for the research`,
    `- "steps": An array of research steps, each with:`,
    `  - "id": step number`,
    `  - "action": "search" or "fetch"`,
    `  - "query": a specific search query or URL to fetch`,
    `  - "purpose": why this step is needed`,
    `  - "sourceType": for search steps, one of "general", "docs", "news", "reviews", "academic", or "commerce"`,
    ``,
    `Search steps must use narrow queries with named entities, constraints, dates or locations, product or version names, and clear source intent.`,
    ``,
    `User research question: ${userQuery}`,
    `</BetterDeepSeek>`,
  ].join("\n");
}

/**
 * Normalize plan steps into execution-ready step objects.
 * @param {Array} planSteps - Raw plan steps from model
 * @returns {Array} Normalized execution steps
 */
function normalizeStepsFromPlan(planSteps) {
  if (!Array.isArray(planSteps)) return [];
  return planSteps.map((s, i) => {
    const action = s.action === "fetch" ? "fetch" : "search";
    return {
      id: String(s.id || i + 1),
      action,
      query: String(s.query || "").trim(),
      purpose: String(s.purpose || "").trim(),
      sourceType: action === "search" ? String(s.sourceType || "general").trim() : "",
      deepFetch: action === "search" ? clampDeepFetch(s.deepFetch) : 0,
      status: "pending",
      outcome: null,
      error: null,
      resultFile: null,
    };
  });
}

/**
 * Initialize managed execution from an approved plan.
 * @param {object} run
 */
function initManagedExecution(run) {
  if (!run || !run.plan || !Array.isArray(run.plan.steps)) return;
  run.execution.managed = true;
  run.execution.steps = normalizeStepsFromPlan(run.plan.steps);
  run.execution.currentStepIndex = 0;
  run.execution.awaitingAnalysisStepId = null;
  run.execution.reportRequested = false;
  run.execution.adaptiveStepCounter = 0;
  run.execution.budgetStopReason = "";
  run.execution.contextBudgetSnapshot = null;
}

/**
 * Execute the current step of a managed deep research run.
 * Returns false if no step to run, true otherwise.
 * @param {object} run
 * @returns {Promise<boolean>}
 */
async function runCurrentStep(run) {
  if (!run || !run.execution.managed) return false;
  const steps = run.execution.steps;
  const idx = run.execution.currentStepIndex;
  if (idx < 0 || idx >= steps.length) return false;

  const step = steps[idx];
  step.status = "tool_running";
  step.outcome = null;
  step.error = null;
  step.resultFile = null;
  run.updatedAt = Date.now();
  emitRunState(run);
  void persistRuns(state.deepResearch.runs);

  try {
    if (step.action === "fetch") {
      const url = normalizeHttpUrl(step.query);
      const file = await fetchAndConvertWebPage(url, (status) => {
        devLog("DeepResearch", `Fetch status for step ${step.id}: ${status}`);
      });
      if (file) {
        const text = await readFileText(file);
        step.resultFile = file;
        step.outcome = JSON.stringify({
          url,
          fileName: file.name,
          length: text.length,
        });
        step.error = null;
      } else {
        throw new Error("Fetch returned no file");
      }
    } else {
      // Search step
      const deepFetch = clampDeepFetch(step.deepFetch);
      const result = await searchWeb(step.query, deepFetch, (status) => {
        devLog("DeepResearch", `Search status for step ${step.id}: ${status}`);
      }, {
        purpose: step.purpose,
        sourceType: step.sourceType,
      });
      if (result && result.file && result.results) {
        const text = await readFileText(result.file);
        step.resultFile = result.file;
        step.outcome = JSON.stringify({
          query: result.query || step.query,
          deepFetch: result.deepFetch ?? deepFetch,
          count: result.results.length,
          results: result.results,
          provider: result.provider || "",
          effectiveQuery: result.effectiveQuery || "",
          rawResultCount: result.rawResultCount || result.results.length,
          fileName: result.file.name,
          length: text.length,
          purpose: step.purpose,
          sourceType: step.sourceType,
        });
        step.error = null;
      } else {
        throw new Error("Search returned no results");
      }
    }
  } catch (err) {
    console.error(`[BDS:DEEP_RESEARCH] Step ${step.id} failed:`, err);
    step.error = String(err.message || err);
    step.outcome = null;
    step.resultFile = createStepErrorFile(run, step, step.error);
  }

  step.status = "ready_to_send";
  run.execution.awaitingAnalysisStepId = null;
  run.updatedAt = Date.now();
  emitRunState(run);
  void persistRuns(state.deepResearch.runs);
  return true;
}

function createStepErrorFile(run, step, message) {
  const safeRunId = String(run.id || "run").replace(/[^a-z0-9_-]/gi, "_");
  const safeStepId = String(step.id || "step").replace(/[^a-z0-9_-]/gi, "_");
  const content = [
    `Deep Research step failed`,
    ``,
    `Run ID: ${run.id}`,
    `Step ID: ${step.id}`,
    `Action: ${step.action}`,
    `Query: ${step.query}`,
    `Purpose: ${step.purpose || ""}`,
    ``,
    `Error: ${message || "Unknown error"}`,
  ].join("\n");
  return new File(
    [content],
    `deep-research-${safeRunId}-step-${safeStepId}-error.txt`,
    { type: "text/plain" },
  );
}

async function readFileText(file) {
  if (!file) return "";

  if (typeof file.text === "function") {
    return await file.text();
  }

  if (typeof file.arrayBuffer === "function") {
    const buffer = await file.arrayBuffer();
    return new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  }

  if (typeof FileReader !== "undefined") {
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }

  return "";
}

function buildSourceDigest(results, detail, { includeSnippets = false } = {}) {
  if (!Array.isArray(results) || results.length === 0) return [];

  const config = PROMPT_DETAIL[detail] || PROMPT_DETAIL.full;
  const lines = ["Top sources:"];
  results.slice(0, config.sources).forEach((result, index) => {
    const title = limitText(result.title || "Untitled source", 180);
    const url = limitText(result.url || "", 260);
    lines.push(`${index + 1}. ${title}`);
    if (url) lines.push(`   URL: ${url}`);
    if (includeSnippets && result.snippet) {
      lines.push(`   Snippet: ${limitText(result.snippet, config.snippetChars)}`);
    }
  });
  return lines;
}

function cleanEvidenceExcerpt(value) {
  return String(value || "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/={8,}/g, " ")
    .replace(/-{3,}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractDeepFetchExcerpts(evidenceText, detail, maxChars) {
  const text = String(evidenceText || "");
  if (!text.trim() || maxChars <= 0) return [];
  const config = PROMPT_DETAIL[detail] || PROMPT_DETAIL.full;

  const sections = [];
  const sectionRegex = /## Page Content:\s*([^\n]+)\n\*\*Source:\*\*\s*([^\n]+)\n([\s\S]*?)(?=\n={8,}\n## Page Content:|$)/g;
  let match;
  while ((match = sectionRegex.exec(text)) !== null) {
    sections.push({
      title: cleanEvidenceExcerpt(match[1]),
      url: cleanEvidenceExcerpt(match[2]),
      body: cleanEvidenceExcerpt(match[3]),
    });
  }

  if (sections.length === 0) {
    return [`Evidence excerpt: ${limitText(cleanEvidenceExcerpt(text), Math.min(maxChars, config.excerptChars))}`];
  }

  const lines = ["Deep-fetched excerpts:"];
  const perSection = Math.max(
    120,
    Math.min(config.excerptChars, Math.floor(maxChars / Math.min(sections.length, 3))),
  );
  for (const section of sections.slice(0, 3)) {
    lines.push(`- ${limitText(section.title, 140)} (${limitText(section.url, 180)}): ${limitText(section.body, perSection)}`);
  }
  return lines;
}

function fitLinesToBudget(lines, maxChars) {
  if (!Number.isFinite(maxChars)) return lines;

  const fitted = [];
  let used = 0;
  for (const line of lines) {
    const value = String(line || "");
    const nextUsed = used + value.length + 1;
    if (nextUsed <= maxChars) {
      fitted.push(value);
      used = nextUsed;
      continue;
    }

    const remaining = maxChars - used - 1;
    if (remaining > 20) {
      fitted.push(limitText(value, remaining));
    }
    break;
  }
  return fitted;
}

function buildStepPromptFooter(runId, stepId) {
  return [
    `Analyze this step result after reading the provided evidence. Update your source ledger mentally. Then finish your analysis with:`,
    `<BDS:DEEP_RESEARCH_STEP_DONE runId="${runId}" stepId="${stepId}">JSON</BDS:DEEP_RESEARCH_STEP_DONE>`,
    ``,
    `The JSON inside must be: {"stepId":"${stepId}","analysis":"short summary of findings","newInsights":["insight1","insight2"]}`,
    ``,
    `If you discover material gaps, contradictions, newly discovered named entities, missing source classes, or need recency checks, add up to 3 focused follow-up steps via an optional "nextSteps" array:`,
    `{"stepId":"${stepId}","analysis":"...","newInsights":["..."],"nextSteps":[{"action":"search","query":"specific follow-up query","purpose":"why this gap matters","sourceType":"academic","deepFetch":${getDeepFetchSetting()}}]}`,
    `nextStep actions: "search" or "fetch". Fetch queries must be HTTP(S) URLs. sourceType for searches: general, docs, news, reviews, academic, commerce (default: general). Only add nextSteps for material gaps — avoid unnecessary expansion.`,
    ``,
    `Do NOT produce the final report yet. Only analyze this step.`,
    `</BetterDeepSeek>`,
  ];
}

function buildStepMetadataLines(run, step, outcome, detail) {
  const config = PROMPT_DETAIL[detail] || PROMPT_DETAIL.full;
  const lines = [
    `<BetterDeepSeek>`,
    `[BDS:DEEP_RESEARCH] Step ${step.id} of your research plan is complete.`,
    `Run ID: ${run.id}`,
    `Action: ${step.action}`,
    `Query: ${limitText(step.query, config.queryChars)}`,
    `Purpose: ${limitText(step.purpose || "", config.purposeChars)}`,
  ];

  if (step.error) {
    lines.push(`Step failed: ${limitText(step.error, 600)}`);
    if (step.resultFile) lines.push(`Error file: ${step.resultFile.name}`);
    return lines;
  }

  if (step.action === "fetch") {
    lines.push(`Fetched URL: ${limitText(outcome.url || step.query, 600)}`);
    if (outcome.length) lines.push(`Fetched length: ${outcome.length} chars`);
  } else {
    lines.push(`Provider: ${outcome.provider || "unknown"}`);
    lines.push(`Results: ${outcome.count ?? 0}${outcome.rawResultCount ? ` of ${outcome.rawResultCount} raw` : ""}`);
    lines.push(`Deep fetch: ${outcome.deepFetch ?? step.deepFetch ?? 0}`);
    if (outcome.effectiveQuery && outcome.effectiveQuery !== outcome.query) {
      lines.push(`Effective query: ${limitText(outcome.effectiveQuery, config.queryChars)}`);
    }
  }

  if (outcome.fileName || step.resultFile?.name) {
    lines.push(`Evidence file: ${outcome.fileName || step.resultFile.name}`);
  }

  return lines;
}

function buildInlineEvidenceDigest(step, outcome, evidenceText, detail, maxChars) {
  if (step.error) {
    return [`Error evidence: ${limitText(evidenceText || step.error, maxChars)}`];
  }

  const lines = [];
  lines.push(`Evidence digest:`);
  lines.push(...buildSourceDigest(outcome.results, detail, { includeSnippets: true }));

  const used = lines.join("\n").length;
  const remaining = Math.max(0, maxChars - used - 40);
  if (remaining > 80) {
    lines.push(...extractDeepFetchExcerpts(evidenceText, detail, remaining));
  }

  return fitLinesToBudget(lines, maxChars);
}

function buildAttachmentEvidenceSummary(step, outcome, detail) {
  const lines = [];
  if (step.error) {
    if (step.resultFile) {
      lines.push(`Read the attached error file: ${step.resultFile.name}`);
    }
    return lines;
  }

  if (step.resultFile) {
    lines.push(`Read the attached evidence file before analyzing: ${step.resultFile.name}`);
  }
  lines.push(...buildSourceDigest(outcome.results, detail, { includeSnippets: false }));
  return lines;
}

function buildManagedStepResultPrompt(run, step, options = {}) {
  const runId = run.id;
  const stepId = step.id;
  const detail = options.detail || "full";
  const outcome = parseStepOutcome(step);
  const prefix = buildStepMetadataLines(run, step, outcome, detail);
  const footer = buildStepPromptFooter(runId, stepId);
  const maxChars = Number(options.maxChars) || Infinity;
  const evidenceBudget = Math.max(
    0,
    maxChars - prefix.join("\n").length - footer.join("\n").length - 8,
  );
  const evidenceLines = options.inlineEvidenceText != null
    ? buildInlineEvidenceDigest(step, outcome, options.inlineEvidenceText, detail, evidenceBudget)
    : buildAttachmentEvidenceSummary(step, outcome, detail);

  return [
    ...prefix,
    ``,
    ...evidenceLines,
    ``,
    ...footer,
  ].join("\n");
}

async function sendStepResult(run, step) {
  const label = `Deep Research step ${step.id} result`;
  const prompt = buildManagedStepResultPrompt(run, step);

  if (step.resultFile) {
    const evidenceText = await readFileText(step.resultFile);
    return await sendFileWithMessage(step.resultFile, prompt, label, {
      inlineText: buildManagedStepResultPrompt(run, step, {
        inlineEvidenceText: evidenceText,
        maxChars: TEXT_ONLY_STEP_PROMPT_CHARS,
        detail: "full",
      }),
      overLimitFallbackText: buildManagedStepResultPrompt(run, step, {
        inlineEvidenceText: evidenceText,
        maxChars: TEXT_ONLY_FALLBACK_CHARS,
        detail: "fallback",
      }),
      overLimitEmergencyText: buildManagedStepResultPrompt(run, step, {
        inlineEvidenceText: evidenceText,
        maxChars: TEXT_ONLY_EMERGENCY_CHARS,
        detail: "emergency",
      }),
    });
  }

  return await Promise.resolve(injectPureTextAndSend(prompt, label));
}

function markStepAwaitingAnalysis(run, step) {
  step.status = "awaiting_analysis";
  run.execution.awaitingAnalysisStepId = step.id;
  run.updatedAt = Date.now();
  emitRunState(run);
  void persistRuns(state.deepResearch.runs);
}

function markStepSendFailed(run, step) {
  step.status = "send_failed";
  if (!step.error) {
    step.error = "Could not send the Deep Research step result into the chat.";
  }
  run.execution.awaitingAnalysisStepId = null;
  run.updatedAt = Date.now();
  emitRunState(run);
  void persistRuns(state.deepResearch.runs);
}

async function sendStepForAnalysis(run, step) {
  // Check context budget before sending — if the outgoing prompt would cross
  // the threshold, stop here and request a compact final report instead.
  if (!isBudgetStopped(run)) {
    const promptText = buildManagedStepResultPrompt(run, step);
    const outgoingTokens = estimateDeepSeekTokens(promptText);
    const evidenceText = step.resultFile ? await readFileText(step.resultFile).catch(() => "") : "";
    const totalOutgoing = outgoingTokens + estimateDeepSeekTokens(evidenceText);

    const budgetCheck = wouldCrossDeepResearchBudget(run, totalOutgoing);
    if (budgetCheck.wouldCross) {
      applyBudgetStop(run, budgetCheck);
      run.updatedAt = Date.now();
      emitRunState(run);
      void persistRuns(state.deepResearch.runs);

      // Request a compact budget-stopped final report immediately
      void requestFinalReport(run, { budgetStopped: true });
      return true;
    }

    // Record outgoing context for budget tracking
    recordOutgoingContext({
      conversationId: run.conversationId,
      text: promptText,
      fileText: evidenceText || undefined,
      label: `Deep Research step ${step.id} result`,
    });
  }

  const sent = await sendStepResult(run, step);
  if (sent === false) {
    markStepSendFailed(run, step);
    return false;
  }

  markStepAwaitingAnalysis(run, step);
  return true;
}

/**
 * Build the final report prompt after all steps are complete.
 * @param {object} run
 * @returns {string}
 */
function buildFinalReportPrompt(run) {
  const runId = run.id;

  const stepSummaries = run.execution.steps.map((s) => {
    const adaptiveLabel = s.adaptive ? ` [adaptive follow-up from step ${s.parentStepId || "?"}]` : "";
    const header = `Step ${s.id}: ${s.action} "${s.query}" (${s.purpose})${adaptiveLabel}`;
    if (s.error) return `${header} — FAILED: ${s.error}`;
    return `${header} — complete`;
  }).join("\n");

  return [
    `<BetterDeepSeek>`,
    `[BDS:DEEP_RESEARCH] All research steps are complete.`,
    `Run ID: ${runId}`,
    ``,
    `Completed steps:`,
    stepSummaries,
    ``,
    `Now produce the final research report.`,
    `Wrap the report as: <BDS:DEEP_RESEARCH_REPORT runId="${runId}">markdown</BDS:DEEP_RESEARCH_REPORT>`,
    `Do NOT wrap the report Markdown in a code fence.`,
    `</BetterDeepSeek>`,
  ].join("\n");
}

/**
 * Build compact final report prompt for budget-stopped runs.
 * Includes completed steps, skipped steps, and the budget-stop reason.
 * Kept compact to avoid consuming unnecessary context.
 * @param {object} run
 * @returns {string}
 */
export function buildBudgetStoppedFinalReportPrompt(run) {
  const runId = run.id;
  const exec = run.execution;

  const completedSteps = [];
  const skippedSteps = [];
  const failedSteps = [];

  for (const s of exec.steps) {
    if (s.status === "complete") {
      const suffix = s.error ? ` — FAILED: ${s.error}` : " — complete";
      completedSteps.push(`Step ${s.id}: ${s.action} "${s.query}"${suffix}`);
    } else if (s.status === "skipped_budget") {
      skippedSteps.push(`Step ${s.id}: ${s.action} "${s.query}" — skipped (budget)`);
    } else if (s.error) {
      failedSteps.push(`Step ${s.id}: ${s.action} "${s.query}" — FAILED: ${s.error}`);
    }
  }

  const lines = [
    `<BetterDeepSeek>`,
    `[BDS:DEEP_RESEARCH] Research finalized early — context budget threshold reached.`,
    `Run ID: ${runId}`,
    `Reason: ${exec.budgetStopReason || "Context budget threshold reached"}`,
  ];

  if (completedSteps.length > 0) {
    lines.push(``);
    lines.push(`Completed (${completedSteps.length}):`);
    lines.push(...completedSteps);
  }
  if (skippedSteps.length > 0) {
    lines.push(``);
    lines.push(`Skipped due to budget (${skippedSteps.length}):`);
    lines.push(...skippedSteps);
  }
  if (failedSteps.length > 0) {
    lines.push(``);
    lines.push(`Failed:`, ...failedSteps);
  }

  lines.push(``);
  lines.push(`Synthesize a final report from completed steps only. Briefly name skipped gaps so the user knows what was left uncovered.`);
  lines.push(`Wrap the report as: <BDS:DEEP_RESEARCH_REPORT runId="${runId}">markdown</BDS:DEEP_RESEARCH_REPORT>`);
  lines.push(`Do NOT wrap the report in a code fence. Keep the report focused on what was found.`);
  lines.push(`</BetterDeepSeek>`);

  return lines.join("\n");
}

/**
 * Advance to the next step after step-done is received.
 * If all steps complete, sends the final report prompt.
 * @param {object} run
 * @returns {boolean} true if advanced, false if all steps done
 */
function advanceToNextStep(run) {
  run.execution.awaitingAnalysisStepId = null;
  run.execution.currentStepIndex += 1;

  if (run.execution.currentStepIndex >= run.execution.steps.length) {
    void requestFinalReport(run, { budgetStopped: isBudgetStopped(run) });
    return false;
  }

  // Defense in depth: if budget was already stopped, do not execute more steps
  if (isBudgetStopped(run)) {
    // Mark remaining pending steps as skipped
    for (let i = run.execution.currentStepIndex; i < run.execution.steps.length; i++) {
      if (run.execution.steps[i].status === "pending") {
        run.execution.steps[i].status = "skipped_budget";
      }
    }
    run.execution.currentStepIndex = run.execution.steps.length;
    void requestFinalReport(run, { budgetStopped: true });
    return false;
  }

  // Advance to next step
  void persistRuns(state.deepResearch.runs);
  void runCurrentStep(run).then((ran) => {
    if (ran) {
      const step = run.execution.steps[run.execution.currentStepIndex];
      void sendStepForAnalysis(run, step);
    }
  });
  return true;
}

async function requestFinalReport(run, options = {}) {
  run.execution.awaitingAnalysisStepId = null;
  emitRunState(run);

  const budgetStopped = Boolean(options.budgetStopped);
  const promptText = budgetStopped
    ? buildBudgetStoppedFinalReportPrompt(run)
    : buildFinalReportPrompt(run);
  const label = budgetStopped
    ? "Deep Research budget-stopped final report request"
    : "Deep Research final report request";

  // Record outgoing context for budget tracking
  if (budgetStopped) {
    recordOutgoingContext({
      conversationId: run.conversationId,
      text: promptText,
      label: "Budget-stopped final report prompt",
    });
  } else {
    recordOutgoingContext({
      conversationId: run.conversationId,
      text: promptText,
      label: "Final report prompt",
    });
  }

  const sent = await Promise.resolve(
    injectPureTextAndSend(promptText, label),
  );
  if (sent === false) {
    state.ui?.showToast?.("Could not request the Deep Research final report.");
    emitRunState(run);
    return false;
  }

  run.execution.reportRequested = true;
  setStatus(run, "reporting");
  upsertRun(run);
  emitRunState(run);
  void persistRuns(state.deepResearch.runs);
  return true;
}

/**
 * Validate and insert adaptive follow-up steps proposed by the model.
 * Steps are validated, deduplicated, and inserted immediately after the
 * completed step. Capped at MAX_ADAPTIVE_STEPS_PER_STEP (3) per step
 * and MAX_TOTAL_MANAGED_STEPS (12) total per run.
 * @param {object} run
 * @param {Array} nextSteps - Raw adaptive step proposals from model
 * @param {string} parentStepId - The step ID that discovered these gaps
 */
function processAdaptiveSteps(run, nextSteps, parentStepId) {
  if (!Array.isArray(nextSteps) || nextSteps.length === 0) return;

  // Never insert adaptive steps after budget guard has stopped the run
  if (isBudgetStopped(run)) return;

  const exec = run.execution;

  // Enforce total step cap
  if (exec.steps.length >= MAX_TOTAL_MANAGED_STEPS) return;

  // Initialize counter if needed (backward compat with deserialized runs)
  if (exec.adaptiveStepCounter == null) exec.adaptiveStepCounter = 0;

  const accepted = [];
  const remainingSlots = MAX_TOTAL_MANAGED_STEPS - exec.steps.length;
  const allowedCount = Math.min(MAX_ADAPTIVE_STEPS_PER_STEP, remainingSlots);

  for (const rawStep of nextSteps) {
    if (accepted.length >= allowedCount) break;
    const valid = validateAdaptiveStep(rawStep, exec.steps.concat(accepted), exec.adaptiveStepCounter);
    if (valid) {
      valid.parentStepId = parentStepId;
      exec.adaptiveStepCounter++;
      accepted.push(valid);
    }
  }

  if (accepted.length === 0) return;

  // Insert adaptive steps right after the current step
  const insertIdx = exec.currentStepIndex + 1;
  exec.steps.splice(insertIdx, 0, ...accepted);

  // Mirror accepted adaptive steps into run.plan.steps so UI/state reflect the evolving plan
  if (run.plan && Array.isArray(run.plan.steps)) {
    run.plan.steps.splice(insertIdx, 0, ...accepted.map((s) => ({
      id: s.id,
      action: s.action,
      query: s.query,
      purpose: s.purpose,
      sourceType: s.sourceType,
      deepFetch: s.deepFetch,
      adaptive: true,
      parentStepId: s.parentStepId || null,
    })));
  }

  run.updatedAt = Date.now();
}

/**
 * Handle a received DEEP_RESEARCH_STEP_DONE tag.
 * Only advances if the runId and stepId match the expected values.
 * Processes adaptive nextSteps if present in the analysis JSON.
 * @param {object} run
 * @param {string} stepId
 * @param {object} analysisJson
 * @returns {boolean} true if the step was handled
 */
export function handleStepDone(run, stepId, analysisJson) {
  if (!run || !run.execution.managed) return false;
  // If budget already stopped, do not process further step-done events
  if (isBudgetStopped(run)) return false;
  if (run.execution.awaitingAnalysisStepId !== String(stepId)) return false;

  const idx = run.execution.currentStepIndex;
  if (idx < 0 || idx >= run.execution.steps.length) return false;

  const step = run.execution.steps[idx];
  if (String(step.id) !== String(stepId)) return false;

  step.status = "complete";
  if (analysisJson && typeof analysisJson === "object") {
    let existingOutcome = {};
    if (step.outcome) {
      try {
        existingOutcome = JSON.parse(step.outcome);
      } catch {
        existingOutcome = {};
      }
    }
    step.outcome = JSON.stringify({
      ...existingOutcome,
      analysis: analysisJson.analysis || "",
      insights: analysisJson.newInsights || [],
    });

    // Process adaptive nextSteps proposed by the model
    if (Array.isArray(analysisJson.nextSteps) && analysisJson.nextSteps.length > 0) {
      processAdaptiveSteps(run, analysisJson.nextSteps, stepId);
    }
  }
  run.updatedAt = Date.now();

  advanceToNextStep(run);
  return true;
}

function summarizeFallbackAnalysis(text) {
  const summary = String(text || "").replace(/\s+/g, " ").trim();
  return summary || "The model attempted to continue to the next research step without emitting a step-done marker.";
}

/**
 * Recover when the model emits an old-style AUTO tag during managed execution
 * instead of the required DEEP_RESEARCH_STEP_DONE marker.
 * @param {object} run
 * @param {string} visibleAnalysisText
 * @returns {boolean} true if the awaiting step was completed
 */
export function handleManagedAutoContinuation(run, visibleAnalysisText = "") {
  if (!run || !run.execution?.managed) return false;
  if (run.status === "complete" || run.status === "cancelled") return false;
  if (isBudgetStopped(run)) return false;

  const stepId = String(run.execution.awaitingAnalysisStepId || "");
  if (!stepId) return false;

  const step = run.execution.steps?.[run.execution.currentStepIndex];
  if (!step || String(step.id) !== stepId || step.status !== "awaiting_analysis") {
    return false;
  }

  return handleStepDone(run, stepId, {
    analysis: summarizeFallbackAnalysis(visibleAnalysisText),
    newInsights: [],
    continuationFallback: true,
  });
}

/**
 * Handle a received DEEP_RESEARCH_REPORT or synthesize one from visible markdown.
 * @param {object} run
 * @param {string} markdown
 */
export function handleManagedReport(run, markdown) {
  if (!run || !run.execution.managed) return false;
  if (!run.execution.reportRequested) return false;
  if (!areManagedStepsComplete(run)) return false;

  setStatus(run, "complete");
  run.updatedAt = Date.now();
  upsertRun(run);
  state.deepResearch.enabled = false;
  state.deepResearch.pendingRun = null;
  clearRunSearchHistory(run.id);
  clearConversationBudget(run.conversationId);
  emitConfigState();
  emitToggleState();
  emitRunState(run);
  void persistRuns(state.deepResearch.runs);

  return true;
}

function areManagedStepsComplete(run) {
  const steps = run?.execution?.steps || [];
  // Consider steps "complete" if they are either actually complete or skipped
  // due to budget — in both cases the run has finished all possible work.
  return steps.every((step) => step.status === "complete" || step.status === "skipped_budget");
}

/**
 * Check if a managed run is in the reporting phase and the latest settled
 * assistant message has no report tag — if so, synthesize a report.
 * Called from message-processor when a message settles during reporting phase.
 * @param {object} run
 * @param {string} visibleText - The sanitized visible text from the message
 * @returns {boolean} true if synthesis was triggered
 */
export function trySynthesizeReport(run, visibleText) {
  if (!run || !run.execution.managed) return false;
  if (!run.execution.reportRequested) return false;
  if (run.status !== "reporting") return false;

  const text = String(visibleText || "").trim();
  if (!text) return false;

  return handleManagedReport(run, text);
}

/**
 * Check whether a managed deep research run is active.
 * Used to suppress AUTO tags during managed runs.
 * @param {string} runId
 * @returns {boolean}
 */
export function isManagedRunActive(runId) {
  if (!runId) return false;
  const run = findRunById(runId);
  return Boolean(run && run.execution && run.execution.managed &&
    run.status !== "complete" && run.status !== "cancelled");
}

let runtimeInitialized = false;

export function initDeepResearchRuntime() {
  if (runtimeInitialized) return;
  runtimeInitialized = true;

  loadRuns()
    .then((runs) => {
      state.deepResearch.runs = runs;
    })
    .catch((error) => {
      console.warn("[BDS:DEEP_RESEARCH] Failed to load runs:", error);
    });

  window.addEventListener("bds:deep-research-started", (event) => {
    const detail = normalizeEventDetail(event.detail);
    const runId = String(detail.runId || state.deepResearch.pendingRun?.id || "").trim();
    if (!runId) return;

    const run =
      state.deepResearch.pendingRun && state.deepResearch.pendingRun.id === runId
        ? state.deepResearch.pendingRun
        : ensureRun(runId, String(detail.conversationId || getCurrentConversationId()));

    run.conversationId = String(detail.conversationId || run.conversationId || getCurrentConversationId());
    setStatus(run, "planning");
    upsertRun(run);
    state.deepResearch.enabled = true;
    state.deepResearch.pendingRun = null;
    emitConfigState();
    emitToggleState();
    emitRunState(run);
    void persistRuns(state.deepResearch.runs);
  });

  window.addEventListener("bds:deep-research-plan-received", (event) => {
    const detail = normalizeEventDetail(event.detail);
    const run = ensureRun(detail.runId, detail.conversationId);
    run.plan = detail.plan || null;
    setStatus(run, "planning");
    upsertRun(run);
    emitRunState(run);
    void persistRuns(state.deepResearch.runs);
  });

  window.addEventListener("bds:deep-research-status-received", (event) => {
    const detail = normalizeEventDetail(event.detail);
    const run = ensureRun(detail.runId, detail.conversationId);
    setStatus(run, "running");
    run.updatedAt = Date.now();
    upsertRun(run);
    emitRunState(run);
    void persistRuns(state.deepResearch.runs);
  });

  window.addEventListener("bds:deep-research-report-received", (event) => {
    const detail = normalizeEventDetail(event.detail);
    const run = ensureRun(detail.runId, detail.conversationId);
    if (run.execution?.managed) {
      const handled = handleManagedReport(run, detail.markdown || "");
      if (!handled) {
        console.warn("[BDS:DEEP_RESEARCH] Ignored managed report before report gate opened:", {
          runId: run.id,
          status: run.status,
          reportRequested: run.execution.reportRequested,
        });
      }
      return;
    }

    setStatus(run, "complete");
    run.updatedAt = Date.now();
    upsertRun(run);
    state.deepResearch.enabled = false;
    state.deepResearch.pendingRun = null;
    clearRunSearchHistory(run.id);
    emitConfigState();
    emitToggleState();
    emitRunState(run);
    void persistRuns(state.deepResearch.runs);
  });

  window.addEventListener("bds:deep-research-approve", (event) => {
    const detail = normalizeEventDetail(event.detail);
    const run = ensureRun(detail.runId, detail.conversationId);
    run.plan = detail.plan || run.plan;

    // Initialize managed execution from the approved plan
    initManagedExecution(run);
    setStatus(run, "approved");
    setStatus(run, "running");
    upsertRun(run);
    emitRunState(run);
    void persistRuns(state.deepResearch.runs);

    // Record the approval message for context budget tracking
    recordOutgoingContext({
      conversationId: run.conversationId,
      text: buildApprovalMessage(run),
      label: "Deep Research plan approval",
    });

    if (run.execution.steps.length === 0) {
      void requestFinalReport(run);
      return;
    }

    // Run step 1 immediately
    void runCurrentStep(run).then((ran) => {
      if (ran) {
        const step = run.execution.steps[0];
        void sendStepForAnalysis(run, step).then((sent) => {
          if (sent === false) {
            state.ui?.showToast?.("Could not start Deep Research execution.");
          }
        });
      }
    });
  });

  window.addEventListener("bds:deep-research-revise", (event) => {
    const detail = normalizeEventDetail(event.detail);
    const run = ensureRun(detail.runId, detail.conversationId);
    run.plan = detail.plan || run.plan;
    const revisionMessage = buildRevisionMessage(run, String(detail.feedback || ""));
    const sent = injectPureTextAndSend(
      revisionMessage,
      "Deep Research revision request",
    );
    // Record revision prompt for budget tracking
    recordOutgoingContext({
      conversationId: run.conversationId,
      text: revisionMessage,
      label: "Deep Research revision request",
    });
    if (sent === false) {
      state.ui?.showToast?.("Could not submit Deep Research feedback.");
      emitRunState(run);
      return;
    }
    setStatus(run, "awaiting_revision");
    upsertRun(run);
    emitRunState(run);
    void persistRuns(state.deepResearch.runs);
  });

  window.addEventListener("bds:deep-research-cancel", (event) => {
    const detail = normalizeEventDetail(event.detail);
    const run = ensureRun(detail.runId, detail.conversationId);
    setStatus(run, "cancelled");
    run.execution.managed = false;
    upsertRun(run);
    state.deepResearch.enabled = false;
    state.deepResearch.pendingRun = null;
    clearRunSearchHistory(run.id);
    clearConversationBudget(run.conversationId);
    emitConfigState();
    emitToggleState();
    emitRunState(run);
    void persistRuns(state.deepResearch.runs);
    if (state.ui) {
      state.ui.showToast("Deep Research cancelled.");
    }
  });

  window.addEventListener("bds:deep-research-step-done", (event) => {
    const detail = normalizeEventDetail(event.detail);
    const run = findRunById(detail.runId);
    if (!run) return;
    const handled = handleStepDone(run, detail.stepId, detail.analysis || {});
    if (!handled) {
      console.warn("[BDS:DEEP_RESEARCH] Step-done received but not handled:", {
        runId: detail.runId,
        stepId: detail.stepId,
        expected: run.execution?.awaitingAnalysisStepId,
      });
    }
  });
}
