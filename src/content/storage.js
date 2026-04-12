/**
 * Chrome storage layer — load, save, normalize, and listen for changes.
 */

import state from "./state.js";
import { pushConfigToPage } from "./bridge.js";
import {
  STORAGE_KEYS,
  DEFAULT_SETTINGS,
  DEFAULT_SYSTEM_PROMPT,
  SYSTEM_PROMPT_TEMPLATE_VERSION,
  DOWNLOAD_BEHAVIOR_VERSION,
} from "../lib/constants.js";
import { makeId } from "../lib/utils/helpers.js";

// ── Load ──

export async function loadStateFromStorage() {
  const values = await chrome.storage.local.get([
    STORAGE_KEYS.settings,
    STORAGE_KEYS.skills,
    STORAGE_KEYS.memories,
  ]);

  const storedSettings = values[STORAGE_KEYS.settings] || {};

  state.settings = {
    ...DEFAULT_SETTINGS,
    ...storedSettings,
  };

  if (shouldUpgradeSystemPrompt(storedSettings)) {
    state.settings.systemPrompt = DEFAULT_SYSTEM_PROMPT;
    state.settings.systemPromptTemplateVersion = SYSTEM_PROMPT_TEMPLATE_VERSION;
    await chrome.storage.local.set({
      [STORAGE_KEYS.settings]: state.settings,
    });
  }

  const behaviorVersion = Number(
    storedSettings && storedSettings.downloadBehaviorVersion
      ? storedSettings.downloadBehaviorVersion
      : 0
  );
  if (behaviorVersion < DOWNLOAD_BEHAVIOR_VERSION) {
    state.settings.downloadBehaviorVersion = DOWNLOAD_BEHAVIOR_VERSION;
    state.settings.autoDownloadFiles = false;
    state.settings.autoDownloadLongWorkZip = false;
    state.settings.autoDownloadLatexPdf = false;
    await chrome.storage.local.set({
      [STORAGE_KEYS.settings]: state.settings,
    });
  }

  state.skills = normalizeSkills(values[STORAGE_KEYS.skills]);
  state.memories = normalizeMemories(values[STORAGE_KEYS.memories]);
}

function shouldUpgradeSystemPrompt(storedSettings) {
  const version = Number(
    storedSettings && storedSettings.systemPromptTemplateVersion
      ? storedSettings.systemPromptTemplateVersion
      : 0
  );

  if (version >= SYSTEM_PROMPT_TEMPLATE_VERSION) {
    return false;
  }

  const prompt = String(
    storedSettings && storedSettings.systemPrompt
      ? storedSettings.systemPrompt
      : ""
  ).trim();
  if (!prompt) {
    return true;
  }

  if (
    prompt.includes(
      "You are Better DeepSeek, an output-focused assistant with tool tags."
    )
  ) {
    return true;
  }

  if (
    prompt.includes("You are Better DeepSeek inside a tool-enabled extension.")
  ) {
    return true;
  }

  if (
    prompt.includes("You are now Better DeepSeek.") &&
    prompt.includes("When using <BDS:LONG_WORK>...</BDS:LONG_WORK>:")
  ) {
    return true;
  }

  if (
    prompt.includes(
      "Prefer complete, runnable outputs for create_file and LONG_WORK tasks."
    )
  ) {
    return true;
  }

  return false;
}

// ── Normalize ──

export function normalizeSkills(raw) {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((item) => ({
      id: String(item && item.id ? item.id : makeId()),
      name: String(item && item.name ? item.name : "Skill"),
      content: String(item && item.content ? item.content : ""),
      active: item && typeof item.active === "boolean" ? item.active : true,
    }))
    .filter((item) => item.content.trim().length > 0);
}

export function normalizeMemories(raw) {
  const memories = {};

  if (Array.isArray(raw)) {
    for (const item of raw) {
      const key = sanitizeMemoryKey(item && item.key);
      const value = String(item && item.value ? item.value : "").trim();
      if (!key || !value) {
        continue;
      }
      memories[key] = {
        value,
        importance: sanitizeMemoryImportance(item && item.importance),
      };
    }
    return memories;
  }

  if (!raw || typeof raw !== "object") {
    return memories;
  }

  for (const [unsafeKey, item] of Object.entries(raw)) {
    const key = sanitizeMemoryKey(unsafeKey);
    const value = String(item && item.value ? item.value : "").trim();
    if (!key || !value) {
      continue;
    }
    memories[key] = {
      value,
      importance: sanitizeMemoryImportance(item && item.importance),
    };
  }

  return memories;
}

export function sanitizeMemoryKey(input) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "");
}

export function sanitizeMemoryImportance(input) {
  return String(input || "called").toLowerCase() === "always"
    ? "always"
    : "called";
}

// ── Storage change listener ──

export function bindStorageChangeListener() {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") {
      return;
    }

    if (changes[STORAGE_KEYS.settings]) {
      state.settings = {
        ...DEFAULT_SETTINGS,
        ...(changes[STORAGE_KEYS.settings].newValue || {}),
      };
      if (state.ui) {
        state.ui.refreshSettings();
      }
    }

    if (changes[STORAGE_KEYS.skills]) {
      state.skills = normalizeSkills(changes[STORAGE_KEYS.skills].newValue);
      if (state.ui) {
        state.ui.refreshSkills();
      }
    }

    if (changes[STORAGE_KEYS.memories]) {
      state.memories = normalizeMemories(
        changes[STORAGE_KEYS.memories].newValue
      );
      if (state.ui) {
        state.ui.refreshMemories();
      }
    }

    pushConfigToPage();
  });
}
