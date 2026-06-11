/**
 * Deep Research Mode V1 — State machine and run management.
 *
 * State machine: idle -> planning -> awaiting_revision|approved -> running -> reporting -> complete
 *
 * Persists minimal run metadata under STORAGE_KEYS.deepResearchRuns.
 */

import { BRIDGE_EVENTS, STORAGE_KEYS } from "../lib/constants.js";
import { makeId } from "../lib/utils/helpers.js";
import state from "./state.js";
import { clearRunSearchHistory, injectPureTextAndSend } from "./auto.js";

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
  window.dispatchEvent(new CustomEvent("bds:deep-research-run-state", {
    detail: {
      runId: run.id,
      status: run.status,
      enabled: state.deepResearch.enabled,
      interactive: isRunInteractive(run),
    },
  }));
}

/**
 * Serialize a run for storage (strips large fields).
 */
function serializeRun(run) {
  return {
    id: run.id,
    conversationId: run.conversationId,
    status: run.status,
    plan: run.plan,
    sourceLedger: run.sourceLedger,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
  };
}

/**
 * Deserialize a run from storage.
 */
function deserializeRun(raw) {
  return {
    id: String(raw.id || makeId()),
    conversationId: String(raw.conversationId || ""),
    status: RESEARCH_STATUSES.includes(raw.status) ? raw.status : "cancelled",
    plan: raw.plan || null,
    sourceLedger: Array.isArray(raw.sourceLedger) ? raw.sourceLedger : [],
    createdAt: Number(raw.createdAt) || Date.now(),
    updatedAt: Number(raw.updatedAt) || Date.now(),
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
    `Use <BDS:AUTO:SEARCH runId="${run.id}" deepFetch="3"> tags for each search step and <BDS:AUTO:REQUEST_WEB_FETCH> for specific URLs.`,
    `After each search/fetch result is injected, read it, update the source ledger mentally, and continue with the next step until the plan is complete.`,
    `After completing all research steps, output your findings using <BDS:DEEP_RESEARCH_REPORT runId="${run.id}">markdown</BDS:DEEP_RESEARCH_REPORT>.`,
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
    `Please revise the research plan and output an updated plan using <BDS:DEEP_RESEARCH_PLAN runId="${run.id}">JSON</BDS:DEEP_RESEARCH_PLAN>.`,
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
    `[BDS:DEEP_RESEARCH] Deep Research mode is enabled. The user has submitted a research request.`,
    `Run ID: ${runId}`,
    ``,
    `IMPORTANT: In this phase, you must ONLY produce a research plan. Do NOT browse or search yet.`,
    `Output your plan using: <BDS:DEEP_RESEARCH_PLAN runId="${runId}">JSON</BDS:DEEP_RESEARCH_PLAN>`,
    ``,
    `The JSON plan must include:`,
    `- "title": A short descriptive title for the research`,
    `- "steps": An array of research steps, each with:`,
    `  - "id": step number`,
    `  - "action": "search" or "fetch"`,
    `  - "query": the search query or URL to fetch`,
    `  - "purpose": why this step is needed`,
    ``,
    `User research question: ${userQuery}`,
    `</BetterDeepSeek>`,
  ].join("\n");
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
    setStatus(run, "approved");
    setStatus(run, "running");
    upsertRun(run);
    emitRunState(run);
    void persistRuns(state.deepResearch.runs);
    injectPureTextAndSend(buildApprovalMessage(run), "Deep Research approval");
  });

  window.addEventListener("bds:deep-research-revise", (event) => {
    const detail = normalizeEventDetail(event.detail);
    const run = ensureRun(detail.runId, detail.conversationId);
    run.plan = detail.plan || run.plan;
    setStatus(run, "awaiting_revision");
    upsertRun(run);
    emitRunState(run);
    void persistRuns(state.deepResearch.runs);
    injectPureTextAndSend(
      buildRevisionMessage(run, String(detail.feedback || "")),
      "Deep Research revision request",
    );
  });

  window.addEventListener("bds:deep-research-cancel", (event) => {
    const detail = normalizeEventDetail(event.detail);
    const run = ensureRun(detail.runId, detail.conversationId);
    setStatus(run, "cancelled");
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
}
