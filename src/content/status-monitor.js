/**
 * DeepSeek Server Status Monitor
 *
 * DeepSeek replaced its legacy statuspage-style endpoint
 * (`/api/v2/status.json`) with a Flashcat-backed widget summary endpoint
 * (`/api/widget/v1/summary.json`). The payload shape changed completely, so
 * this module polls the new endpoint and normalizes it into the indicator
 * shape the status banner consumes.
 *
 * New payload (schema_version 1.0):
 *   {
 *     "schema_version": "1.0",
 *     "generated_at": "2026-09-15T11:40:35Z",
 *     "poll_after_seconds": 30,
 *     "max_stale_seconds": 120,
 *     "page": { "name": "DeepSeek", "url": "https://status.deepseek.com" },
 *     "overall": { "status": "operational" },
 *     "ongoing_incidents": [],
 *     "in_progress_maintenances": [],
 *     "scheduled_maintenances": []
 *   }
 *
 * `overall.status` is one of:
 *   operational | degraded | partial_outage | full_outage | maintenance
 *
 * Anything other than `operational` means DeepSeek is reporting a problem, so
 * unknown values are treated as an outage rather than silently ignored.
 */

import { devLog } from "../lib/dev-log.js";
import { remoteConfig } from "../lib/remote-config.svelte.js";
import state from "./state.js";

const DEFAULT_STATUS_API = "https://status.deepseek.com/api/widget/v1/summary.json";
const FALLBACK_POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes
const MIN_POLL_INTERVAL = 30 * 1000; // never hammer the endpoint faster than this
const MAX_POLL_INTERVAL = 30 * 60 * 1000; // sanity cap on server-provided cadence

/** overall.status → banner indicator (severity ramp consumed by the UI). */
const INDICATOR_BY_STATUS = {
  operational: "none",
  degraded: "minor",
  partial_outage: "major",
  full_outage: "critical",
  maintenance: "maintenance",
};

/** overall.status → human readable label shown in the banner title. */
const LABEL_BY_STATUS = {
  operational: "Operational",
  degraded: "Degraded Performance",
  partial_outage: "Partial Outage",
  full_outage: "Full Outage",
  maintenance: "Under Maintenance",
};

/** Values that still mean "everything is fine" (defensive against aliases). */
const OPERATIONAL_ALIASES = new Set(["operational", "ok", "up", "healthy", "normal"]);

let pollTimer = null;
let pollIntervalMs = FALLBACK_POLL_INTERVAL;
let inFlight = false;
let visibilityBound = false;

/**
 * Resolve the status endpoint. Read through remote config so a future URL
 * change can be shipped without a new extension release.
 */
export function getStatusApiUrl() {
  let configured = null;
  try {
    configured = remoteConfig.getConfig("api.statusUrl");
  } catch {
    configured = null;
  }
  return typeof configured === "string" && configured.trim()
    ? configured.trim()
    : DEFAULT_STATUS_API;
}

function normalizeStatusValue(value) {
  return String(value ?? "").trim().toLowerCase();
}

/**
 * Map an `overall.status` value onto a banner indicator.
 *
 * @param {string} rawStatus
 * @returns {"none"|"minor"|"major"|"critical"|"maintenance"|null}
 *   null when the value is missing/blank, so callers can keep the last known
 *   state instead of clearing a real outage on a malformed response.
 */
export function resolveIndicator(rawStatus) {
  const status = normalizeStatusValue(rawStatus);
  if (!status) return null;
  if (OPERATIONAL_ALIASES.has(status)) return "none";
  return INDICATOR_BY_STATUS[status] || "major";
}

function firstEntryTitle(entries) {
  if (!Array.isArray(entries)) return null;
  for (const entry of entries) {
    const title = entry && typeof entry.title === "string" ? entry.title.trim() : "";
    if (title) return title;
  }
  return null;
}

/**
 * Normalize a widget summary payload into the shape `state.serverStatus` uses.
 *
 * @param {any} payload Parsed JSON from the widget summary endpoint.
 * @returns {object|null} null when the payload carries no usable status.
 */
export function parseStatusSummary(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;

  const overall = payload.overall && typeof payload.overall === "object" ? payload.overall : {};
  const incidents = Array.isArray(payload.ongoing_incidents) ? payload.ongoing_incidents : [];
  const maintenances = Array.isArray(payload.in_progress_maintenances)
    ? payload.in_progress_maintenances
    : [];

  let status = normalizeStatusValue(overall.status);

  // `overall` missing but incidents listed — infer a problem from the lists.
  if (!status) {
    if (maintenances.length) status = "maintenance";
    else if (incidents.length) status = "degraded";
  }

  const indicator = resolveIndicator(status);
  if (!indicator) return null;

  const detail = firstEntryTitle(incidents) || firstEntryTitle(maintenances);
  const label =
    LABEL_BY_STATUS[status] || (indicator === "none" ? "Operational" : "Service Disruption");

  // A summary older than `max_stale_seconds` means DeepSeek's own status
  // pipeline is lagging. Flag it for logging, but never raise an alarm for it.
  const generatedAt = Date.parse(payload.generated_at || "");
  const maxStaleSeconds = Number(payload.max_stale_seconds);
  const stale =
    Number.isFinite(generatedAt) && Number.isFinite(maxStaleSeconds) && maxStaleSeconds > 0
      ? Date.now() - generatedAt > maxStaleSeconds * 1000
      : false;

  return {
    indicator,
    status: status || "unknown",
    label,
    description: detail || label,
    detail,
    incidentCount: incidents.length,
    maintenanceCount: maintenances.length,
    stale,
    lastChecked: Date.now(),
  };
}

/**
 * Fetch the current status from DeepSeek and publish it to the UI.
 *
 * @returns {Promise<object|null>} the normalized status, or null on failure.
 */
export async function fetchServerStatus() {
  // TODO: Replace with proper Playwright network mocking (page.route) in E2E suite
  // to avoid embedding test-specific logic in production code.
  if (typeof window !== "undefined" && window.__mockDeepSeek) return null;
  if (inFlight) return null;

  inFlight = true;
  try {
    const response = await fetch(getStatusApiUrl());
    if (!response.ok) throw new Error("Status API returned " + response.status);

    const payload = await response.json();
    const next = parseStatusSummary(payload);

    if (!next) {
      devLog("Status", "Status payload carried no usable status:", payload);
      return null;
    }

    if (next.stale) {
      devLog("Status", "Status summary is stale (older than max_stale_seconds)");
    }

    state.serverStatus = next;

    // The endpoint advertises its own polling cadence.
    applyPollInterval(payload.poll_after_seconds);

    // Dispatch event for UI components
    window.dispatchEvent(new CustomEvent("bds:status-updated", {
      detail: state.serverStatus
    }));

    devLog("Status", "Server status updated:", state.serverStatus);
    return next;
  } catch (error) {
    console.warn("[BDS] Failed to fetch server status:", error);
    return null;
  } finally {
    inFlight = false;
  }
}

/**
 * Adopt the server-advertised poll cadence, clamped to a sane range.
 * @param {number|string} seconds `poll_after_seconds` from the payload.
 */
function applyPollInterval(seconds) {
  const ms = Number(seconds) * 1000;
  if (!Number.isFinite(ms) || ms <= 0) return;

  const clamped = Math.min(Math.max(ms, MIN_POLL_INTERVAL), MAX_POLL_INTERVAL);
  if (clamped === pollIntervalMs) return;

  pollIntervalMs = clamped;
  if (pollTimer) scheduleNextPoll();
}

function scheduleNextPoll() {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = setTimeout(runPoll, pollIntervalMs);
}

async function runPoll() {
  pollTimer = null;

  // Skip requests while the tab is hidden; visibilitychange refreshes on return.
  if (typeof document !== "undefined" && document.hidden) {
    scheduleNextPoll();
    return;
  }

  await fetchServerStatus();
  scheduleNextPoll();
}

function onVisibilityChange() {
  if (typeof document === "undefined" || document.hidden || !pollTimer) return;
  // Tab is visible again — refresh now instead of waiting out the interval.
  clearTimeout(pollTimer);
  runPoll();
}

/**
 * Start periodic polling.
 */
export function startStatusMonitor() {
  if (pollTimer) return;

  // TODO: Replace with proper Playwright network mocking (page.route) in E2E suite
  if (typeof window !== "undefined" && window.__mockDeepSeek) {
    devLog("Status", "Skipping status monitor in test environment");
    return;
  }

  // Initial check, then continue on the cadence the endpoint asks for.
  fetchServerStatus().then(scheduleNextPoll, scheduleNextPoll);

  if (!visibilityBound && typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisibilityChange);
    visibilityBound = true;
  }
}

/**
 * Stop polling and return the module to its initial cadence, so a later
 * `startStatusMonitor()` doesn't inherit a stale server-advertised interval.
 */
export function stopStatusMonitor() {
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
  pollIntervalMs = FALLBACK_POLL_INTERVAL;
  if (visibilityBound && typeof document !== "undefined") {
    document.removeEventListener("visibilitychange", onVisibilityChange);
    visibilityBound = false;
  }
}
