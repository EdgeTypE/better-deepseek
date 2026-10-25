/**
 * Applies a settings payload to the live extension state.
 *
 * Shared by the file import ("Import All Data") and the chat card, so both
 * paths write the same storage keys with the same guards. Anything that is
 * only meaningful to the importing UI (refreshing the settings form, toasts)
 * stays with the caller.
 */

import state from "../state.js";
import { DEFAULT_SYSTEM_PROMPT, STORAGE_KEYS } from "../../lib/constants.js";
import { CONFIG_SECTIONS } from "../../lib/config-sync.js";

/** Section key → the state field it replaces. */
const SECTION_STATE_KEYS = {
  settings: "settings",
  customSystemPrompts: null, // nested inside settings
  cssSnippets: "cssSnippets",
  skills: "skills",
  characters: "characters",
  memories: "memories",
  mcpServers: "mcpServers",
  projects: "projects",
  projectFiles: "projectFiles",
  chatTags: "chatTags",
  savedItems: "savedItems",
};

/** Section key → the storage key its state field is persisted under. */
const SECTION_STORAGE_KEYS = {
  cssSnippets: STORAGE_KEYS.cssSnippets,
  skills: STORAGE_KEYS.skills,
  characters: STORAGE_KEYS.characters,
  memories: STORAGE_KEYS.memories,
  mcpServers: STORAGE_KEYS.mcpServers,
  projects: STORAGE_KEYS.projects,
  projectFiles: STORAGE_KEYS.projectFiles,
  chatTags: STORAGE_KEYS.chatTags,
  savedItems: STORAGE_KEYS.savedItems,
};

function plain(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

/**
 * Live state, in the shape `buildSyncPayload` expects.
 *
 * Lives here rather than in `export.js` so the card can build a pre-apply
 * snapshot without importing the module that pulls in the auto-send pipeline.
 */
export function currentSyncSources() {
  return {
    settings: state.settings,
    cssSnippets: state.cssSnippets,
    skills: state.skills,
    characters: state.characters,
    memories: state.memories,
    mcpServers: state.mcpServers,
    projects: state.projects,
    projectFiles: state.projectFiles,
    chatTags: state.chatTags,
    savedItems: state.savedItems,
  };
}

/**
 * Which of the requested sections this payload can actually satisfy.
 *
 * A section is offered only when the payload carries a truthy value for it —
 * reporting success for a no-op is worse than reporting that nothing happened.
 *
 * @param {object} payload
 * @param {Iterable<string>} [sections]
 * @returns {string[]}
 */
export function availableSections(payload, sections = CONFIG_SECTIONS) {
  if (!payload) return [];
  return [...sections].filter((key) => Boolean(payload[key]));
}

/**
 * Apply the selected sections of a payload to live state and storage.
 *
 * @param {object} payload
 * @param {Iterable<string>} [sections]
 * @returns {Promise<{ applied: string[] }>}
 */
export async function applyConfigPayload(payload, sections = CONFIG_SECTIONS) {
  if (!payload) return { applied: [] };

  const selected = new Set([...sections].filter((key) => SECTION_STATE_KEYS[key] !== undefined));
  const applied = [];

  if (selected.has("settings") && payload.settings) {
    const incoming = payload.settings;
    const oldToken = state.settings.githubToken;
    // Keep the destination's migration flags: loadStateFromStorage() reads
    // them on the next boot, and a foreign value would re-run (or skip) an
    // upgrade that already happened here.
    const migrationsToKeep = {
      systemPromptBackupDone: state.settings.systemPromptBackupDone,
      systemPromptTemplateVersion: state.settings.systemPromptTemplateVersion,
      downloadBehaviorVersion: state.settings.downloadBehaviorVersion,
    };

    // A source that never touched its prompt sends a marker instead of ~41 KB
    // of text; the destination then falls back to its own shipped default,
    // which is the version that matches this build.
    const useDefaultPrompt = payload.systemPromptIsDefault === true;

    // Use a reactive spread (not Object.assign) so Svelte 5 tracks the change.
    state.settings = {
      ...state.settings,
      ...plain(incoming),
      ...migrationsToKeep,
      githubToken: oldToken,
      // customSystemPrompts is managed by its own section; the settings blob
      // must never overwrite it regardless of the section selection.
      customSystemPrompts: state.settings.customSystemPrompts,
      ...(useDefaultPrompt
        ? { activeSystemPromptId: "default", systemPrompt: DEFAULT_SYSTEM_PROMPT }
        : {}),
    };
    await chrome.storage.local.set({ [STORAGE_KEYS.settings]: plain(state.settings) });
    applied.push("settings");
  }

  if (selected.has("customSystemPrompts") && payload.customSystemPrompts) {
    state.settings = {
      ...state.settings,
      customSystemPrompts: plain(payload.customSystemPrompts),
    };
    await chrome.storage.local.set({ [STORAGE_KEYS.settings]: plain(state.settings) });
    applied.push("customSystemPrompts");
  }

  for (const key of CONFIG_SECTIONS) {
    if (!selected.has(key) || key === "settings" || key === "customSystemPrompts") continue;
    const value = payload[key];
    if (value === undefined || value === null) continue;

    const stateKey = SECTION_STATE_KEYS[key];
    const storageKey = SECTION_STORAGE_KEYS[key];
    if (!stateKey || !storageKey) continue;

    state[stateKey] = plain(value);
    await chrome.storage.local.set({ [storageKey]: state[stateKey] });
    applied.push(key);
  }

  return { applied };
}
