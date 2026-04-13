/**
 * Memory parsing and persistence.
 */

import state from "../state.js";
import { pushConfigToPage } from "../bridge.js";
import { STORAGE_KEYS } from "../../lib/constants.js";

let memoryPersistTimer = 0;

/**
 * Parse a memory_write tag content.
 * Supports both:
 * 1. key_name: value, importance: always
 * 2. key: key_name, value: value, importance: always
 */
export function parseMemoryWrite(content) {
  const cleaned = String(content || "").trim();
  if (!cleaned) {
    return null;
  }

  // Pattern 1: Explicit 'key: ..., value: ...'
  const explicitKeyMatch = cleaned.match(/key\s*:\s*(?:"|')?([^,"']+)(?:"|')?/i);
  const explicitValueMatch = cleaned.match(/value\s*:\s*(?:"|')?([\s\S]*?)(?:"|'|,\s*importance|$)/i);
  const importanceMatch = cleaned.match(/importance\s*:\s*(always|called)/i);

  if (explicitKeyMatch && explicitValueMatch) {
    const key = sanitizeMemoryKey(explicitKeyMatch[1]);
    const value = String(explicitValueMatch[1] || "").trim();
    const importance = sanitizeMemoryImportance(
      importanceMatch ? importanceMatch[1] : "called"
    );
    if (key && value) {
      return { key, value, importance };
    }
  }

  // Pattern 2: Standard 'key_name: value'
  const simpleMatch = cleaned.match(
    /^([a-z0-9_]+)\s*:\s*([\s\S]*?)(?:,\s*importance\s*:\s*(always|called))?$/i
  );
  if (simpleMatch) {
    const key = sanitizeMemoryKey(simpleMatch[1]);
    const value = String(simpleMatch[2] || "").trim();
    const importance = sanitizeMemoryImportance(simpleMatch[3] || "called");
    if (key && value) {
      return { key, value, importance };
    }
  }

  return null;
}

/**
 * Sanitize a memory key to lowercase alphanumeric + underscore.
 */
export function sanitizeMemoryKey(input) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "");
}

/**
 * Normalize importance to "always" or "called".
 */
export function sanitizeMemoryImportance(input) {
  return String(input || "called").toLowerCase() === "always"
    ? "always"
    : "called";
}

/**
 * Upsert memory entries and persist to storage.
 */
export function upsertMemories(items) {
  let changed = false;

  for (const item of items) {
    const key = sanitizeMemoryKey(item.key);
    const value = String(item.value || "").trim();
    const importance = sanitizeMemoryImportance(item.importance);

    if (!key || !value) {
      continue;
    }

    const existing = state.memories[key];
    if (
      existing &&
      existing.value === value &&
      existing.importance === importance
    ) {
      continue;
    }

    state.memories[key] = { value, importance };
    changed = true;
  }

  if (!changed) {
    return;
  }

  if (state.ui) {
    state.ui.refreshMemories();
  }
  pushConfigToPage();

  if (memoryPersistTimer) {
    window.clearTimeout(memoryPersistTimer);
  }

  memoryPersistTimer = window.setTimeout(async () => {
    memoryPersistTimer = 0;
    await chrome.storage.local.set({
      [STORAGE_KEYS.memories]: state.memories,
    });
  }, 300);
}
