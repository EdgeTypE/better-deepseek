/**
 * Memory parsing and persistence.
 */

import state from "../state.js";
import { pushConfigToPage } from "../bridge.js";
import { STORAGE_KEYS } from "../../lib/constants.js";

let memoryPersistTimer = 0;

/**
 * Parse a memory_write tag content.
 */
export function parseMemoryWrite(content) {
  const cleaned = String(content || "").trim();
  if (!cleaned) {
    return null;
  }

  const match = cleaned.match(
    /^([a-z0-9_]+)\s*:\s*([\s\S]*?)(?:,\s*importance\s*:\s*(always|called))?$/i
  );
  if (!match) {
    return null;
  }

  const key = sanitizeMemoryKey(match[1]);
  const value = String(match[2] || "").trim();
  const importance = sanitizeMemoryImportance(match[3] || "called");

  if (!key || !value) {
    return null;
  }

  return { key, value, importance };
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
