/**
 * Deep Research Mode V1 — State machine and run management.
 *
 * State machine: idle -> planning -> awaiting_revision|approved -> running -> reporting -> complete
 *
 * Persists minimal run metadata under STORAGE_KEYS.deepResearchRuns.
 */

import { BRIDGE_EVENTS, STORAGE_KEYS } from "../lib/constants.js";
import { makeId } from "../lib/utils/helpers.js";
import { normalizeHttpUrl } from "../lib/utils/url-normalizer.js";
import state from "./state.js";
import { clearRunSearchHistory, injectPureTextAndSend, sendFileWithMessage } from "./auto.js";
import { fetchAndConvertWebPage } from "./files/web-reader.js";
import { searchWeb } from "./files/search-reader.js";

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
      /** Normalized steps from the approved plan */
      steps: [],
      currentStepIndex: -1,
      /** The step ID we are waiting for analysis on */
      awaitingAnalysisStepId: null,
      /** Whether the final report prompt has been sent */
      reportRequested: false,
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

const DEEP_FETCH_DEFAULT = 3;
const MAX_DEEP_FETCH = 5;

function clampDeepFetch(value) {
  const num = parseInt(value, 10);
  if (isNaN(num) || num < 0) return DEEP_FETCH_DEFAULT;
  return Math.min(num, MAX_DEEP_FETCH);
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
      steps: managed ? steps.map((s) => ({
        id: s.id,
        action: s.action,
        query: s.query,
        purpose: s.purpose,
        sourceType: s.sourceType,
        deepFetch: s.deepFetch,
        status: s.status,
        error: s.error,
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
    status: step.status || "pending",
    outcome: step.outcome || null,
    error: step.error || null,
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
    } : {
      managed: false,
      steps: [],
      currentStepIndex: -1,
      awaitingAnalysisStepId: null,
      reportRequested: false,
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
    `Emit searches as <BDS:AUTO:SEARCH runId="${run.id}" deepFetch="3" purpose="why this search matters" sourceType="reviews">specific query</BDS:AUTO:SEARCH>, choosing sourceType from general, docs, news, reviews, academic, or commerce. Use <BDS:AUTO:REQUEST_WEB_FETCH> for specific URLs.`,
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
      deepFetch: action === "search" ? clampDeepFetch(s.deepFetch ?? DEEP_FETCH_DEFAULT) : 0,
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
        console.log(`[BDS:DEEP_RESEARCH] Fetch status for step ${step.id}: ${status}`);
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
      const deepFetch = clampDeepFetch(step.deepFetch ?? DEEP_FETCH_DEFAULT);
      const result = await searchWeb(step.query, deepFetch, (status) => {
        console.log(`[BDS:DEEP_RESEARCH] Search status for step ${step.id}: ${status}`);
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

  step.status = "awaiting_analysis";
  run.execution.awaitingAnalysisStepId = step.id;
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

function buildManagedStepResultPrompt(run, step) {
  const runId = run.id;
  const stepId = step.id;
  const metadata = step.outcome || "{}";
  let resultSummary = "";

  if (step.error) {
    resultSummary = [
      `[Step ${stepId} failed.]`,
      `Error: ${step.error}`,
      step.resultFile ? `Read the attached error file: ${step.resultFile.name}` : "",
    ].filter(Boolean).join("\n");
  } else {
    let preview = "Step result is ready";
    try {
      const parsed = JSON.parse(metadata);
      preview = step.action === "fetch"
        ? `Fetched ${parsed.url || step.query} (${parsed.length || 0} chars)`
        : `Search "${parsed.query || step.query}" returned ${parsed.count || 0} results`;
    } catch {
      // Keep the generic preview.
    }

    resultSummary = [
      `[Step ${stepId} result - ${preview}]`,
      step.resultFile ? `Read the attached evidence file before analyzing: ${step.resultFile.name}` : "",
      "Metadata:",
      "```json",
      metadata,
      "```",
    ].filter(Boolean).join("\n");
  }

  return [
    `<BetterDeepSeek>`,
    `[BDS:DEEP_RESEARCH] Step ${stepId} of your research plan is complete.`,
    `Run ID: ${runId}`,
    `Action: ${step.action}`,
    `Query: ${step.query}`,
    `Purpose: ${step.purpose || ""}`,
    ``,
    resultSummary,
    ``,
    `Analyze this step result after reading the attached file when present. Update your source ledger mentally. Then finish your analysis with:`,
    `<BDS:DEEP_RESEARCH_STEP_DONE runId="${runId}" stepId="${stepId}">JSON</BDS:DEEP_RESEARCH_STEP_DONE>`,
    ``,
    `The JSON inside must be: {"stepId":"${stepId}","analysis":"short summary of findings","newInsights":["insight1","insight2"]}`,
    ``,
    `Do NOT produce the final report yet. Only analyze this step.`,
    `</BetterDeepSeek>`,
  ].join("\n");
}

async function sendStepResult(run, step) {
  const label = `Deep Research step ${step.id} result`;
  const prompt = buildManagedStepResultPrompt(run, step);

  if (step.resultFile) {
    return await sendFileWithMessage(step.resultFile, prompt, label);
  }

  return injectPureTextAndSend(prompt, label);
}

/**
 * Build the final report prompt after all steps are complete.
 * @param {object} run
 * @returns {string}
 */
function buildFinalReportPrompt(run) {
  const runId = run.id;

  const stepSummaries = run.execution.steps.map((s) => {
    const header = `Step ${s.id}: ${s.action} "${s.query}" (${s.purpose})`;
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
 * Advance to the next step after step-done is received.
 * If all steps complete, sends the final report prompt.
 * @param {object} run
 * @returns {boolean} true if advanced, false if all steps done
 */
function advanceToNextStep(run) {
  run.execution.awaitingAnalysisStepId = null;
  run.execution.currentStepIndex += 1;

  if (run.execution.currentStepIndex >= run.execution.steps.length) {
    requestFinalReport(run);
    return false;
  }

  // Advance to next step
  void persistRuns(state.deepResearch.runs);
  void runCurrentStep(run).then((ran) => {
    if (ran) {
      const step = run.execution.steps[run.execution.currentStepIndex];
      void sendStepResult(run, step);
    }
  });
  return true;
}

function requestFinalReport(run) {
  run.execution.awaitingAnalysisStepId = null;
  run.execution.reportRequested = true;
  setStatus(run, "reporting");
  upsertRun(run);
  emitRunState(run);
  void persistRuns(state.deepResearch.runs);

  injectPureTextAndSend(buildFinalReportPrompt(run), "Deep Research final report request");
}

/**
 * Handle a received DEEP_RESEARCH_STEP_DONE tag.
 * Only advances if the runId and stepId match the expected values.
 * @param {object} run
 * @param {string} stepId
 * @param {object} analysisJson
 * @returns {boolean} true if the step was handled
 */
export function handleStepDone(run, stepId, analysisJson) {
  if (!run || !run.execution.managed) return false;
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
  }
  run.updatedAt = Date.now();

  advanceToNextStep(run);
  return true;
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
  emitConfigState();
  emitToggleState();
  emitRunState(run);
  void persistRuns(state.deepResearch.runs);

  return true;
}

function areManagedStepsComplete(run) {
  const steps = run?.execution?.steps || [];
  return steps.every((step) => step.status === "complete");
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

    if (run.execution.steps.length === 0) {
      requestFinalReport(run);
      return;
    }

    // Run step 1 immediately
    void runCurrentStep(run).then((ran) => {
      if (ran) {
        const step = run.execution.steps[0];
        void sendStepResult(run, step).then((sent) => {
          if (sent === false) {
            state.ui?.showToast?.("Could not start Deep Research execution.");
            emitRunState(run);
          }
        });
      }
    });
  });

  window.addEventListener("bds:deep-research-revise", (event) => {
    const detail = normalizeEventDetail(event.detail);
    const run = ensureRun(detail.runId, detail.conversationId);
    run.plan = detail.plan || run.plan;
    const sent = injectPureTextAndSend(
      buildRevisionMessage(run, String(detail.feedback || "")),
      "Deep Research revision request",
    );
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
