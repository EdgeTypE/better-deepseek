/**
 * Chrome storage layer — load, save, normalize, and listen for changes.
 */

import state from "./state.js";
import { pushConfigToPage, setMaxChatSessions } from "./bridge.js";
import {
  STORAGE_KEYS,
  DEFAULT_SETTINGS,
  DEFAULT_SYSTEM_PROMPT,
  SYSTEM_PROMPT_TEMPLATE_VERSION,
  DOWNLOAD_BEHAVIOR_VERSION,
  DEFAULT_REMOTE_CONFIG,
  CSS_PRESETS,
} from "../lib/constants.js";
import { makeId } from "../lib/utils/helpers.js";
import { setHtmlToMarkdownMaxDepth } from "./dom/message-text.js";
import { i18n } from "../lib/i18n.svelte.js";
import { remoteConfig } from "../lib/remote-config.svelte.js";

// ── Load ──

export async function loadStateFromStorage() {
  const values = await chrome.storage.local.get([
    STORAGE_KEYS.settings,
    STORAGE_KEYS.skills,
    STORAGE_KEYS.memories,
    STORAGE_KEYS.characters,
    STORAGE_KEYS.projects,
    STORAGE_KEYS.projectFiles,
    STORAGE_KEYS.whatsNewPending,
    STORAGE_KEYS.chatTags,
    STORAGE_KEYS.savedItems,
    STORAGE_KEYS.remoteAnnouncement,
    STORAGE_KEYS.dismissedAnnouncements,
    STORAGE_KEYS.cssSnippets,
    "bds_locale_updates",
    STORAGE_KEYS.commandMappings,
    STORAGE_KEYS.mcpServers,
  ]);

  if (values.bds_locale_updates) {
    i18n.loadUpdatedLocales(values.bds_locale_updates);
  }

  const storedSettings = values[STORAGE_KEYS.settings] || {};

  state.settings = {
    ...DEFAULT_SETTINGS,
    ...storedSettings,
  };
  state.settings.customSystemPrompts = normalizeCustomSystemPrompts(state.settings.customSystemPrompts);
  state.settings.systemPromptEntries = normalizeSystemPromptEntries(state.settings.systemPromptEntries);

  setHtmlToMarkdownMaxDepth(state.settings.htmlToMarkdownMaxDepth);
  setMaxChatSessions(state.settings.maxChatSessions);

  if (!state.settings.systemPromptBackupDone) {
    const isOldDefault = shouldUpgradeSystemPrompt(storedSettings);
    const hasCustomPrompt = storedSettings.systemPrompt && 
                           storedSettings.systemPrompt.trim() !== "" && 
                           storedSettings.systemPrompt.trim() !== DEFAULT_SYSTEM_PROMPT.trim();

    if (!isOldDefault && hasCustomPrompt) {
      const backupId = makeId();
      state.settings.customSystemPrompts = [
        {
          id: backupId,
          name: "Legacy Custom Prompt",
          content: storedSettings.systemPrompt.trim()
        },
        ...state.settings.customSystemPrompts
      ];
      state.settings.activeSystemPromptId = "default";
    }
    
    state.settings.systemPromptBackupDone = true;
    state.settings.systemPrompt = DEFAULT_SYSTEM_PROMPT;
    state.settings.systemPromptTemplateVersion = SYSTEM_PROMPT_TEMPLATE_VERSION;

    await chrome.storage.local.set({
      [STORAGE_KEYS.settings]: state.settings,
    });
  } else if (Number(storedSettings.systemPromptTemplateVersion || 0) < SYSTEM_PROMPT_TEMPLATE_VERSION) {
    state.settings.systemPrompt = DEFAULT_SYSTEM_PROMPT;
    state.settings.systemPromptTemplateVersion = SYSTEM_PROMPT_TEMPLATE_VERSION;
    state.settings.activeSystemPromptId = "default";
    await chrome.storage.local.set({
      [STORAGE_KEYS.settings]: state.settings,
    });
  }

  // Always reflect the latest DEFAULT_SYSTEM_PROMPT when the user has the
  // built-in prompt selected — no custom prompt overrides this at rest.
  if (state.settings.activeSystemPromptId === "default") {
    state.settings.systemPrompt = DEFAULT_SYSTEM_PROMPT;
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

    await chrome.storage.local.set({
      [STORAGE_KEYS.settings]: state.settings,
    });
  }

  state.skills = normalizeSkills(values[STORAGE_KEYS.skills]);
  state.cssSnippets = normalizeCssSnippets(values[STORAGE_KEYS.cssSnippets]);
  state.memories = normalizeMemories(values[STORAGE_KEYS.memories]);
  state.characters = normalizeCharacters(values[STORAGE_KEYS.characters]);
  state.projects = normalizeProjects(values[STORAGE_KEYS.projects]);
  state.projectFiles = normalizeProjectFiles(values[STORAGE_KEYS.projectFiles]);
  state.whatsNewPending = !!values[STORAGE_KEYS.whatsNewPending];
  state.chatTags = normalizeChatTags(values[STORAGE_KEYS.chatTags]);
  state.savedItems = normalizeSavedItems(values[STORAGE_KEYS.savedItems]);
  state.commands.customMappings = normalizeCommandMappings(values[STORAGE_KEYS.commandMappings]);
  state.mcpServers = normalizeMcpServers(values[STORAGE_KEYS.mcpServers]);
  state.remoteAnnouncements = Array.isArray(values[STORAGE_KEYS.remoteAnnouncement]) ? values[STORAGE_KEYS.remoteAnnouncement] : [];
  state.dismissedAnnouncements = Array.isArray(values[STORAGE_KEYS.dismissedAnnouncements]) ? values[STORAGE_KEYS.dismissedAnnouncements] : [];

  await remoteConfig.init();
  state.remoteConfig = remoteConfig.raw;
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
      usage: String(item && item.usage ? item.usage : ""),
      content: String(item && item.content ? item.content : ""),
      active: item && typeof item.active === "boolean" ? item.active : true,
    }))
    .filter((item) => item.content.trim().length > 0);
}

export function normalizeCustomSystemPrompts(raw) {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((item) => ({
      id: String(item && item.id ? item.id : makeId()),
      name: String(item && item.name ? item.name : "Saved Prompt"),
      content: String(item && item.content ? item.content : ""),
    }))
    .filter((item) => item.content.trim().length > 0);
}

export function normalizeSystemPromptEntries(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((e) => ({
      id: String(e && e.id ? e.id : ""),
      name: String(e && e.name ? e.name : ""),
      content: String(e && e.content ? e.content : ""),
      enabled: e && typeof e.enabled === "boolean" ? e.enabled : true,
      schedule: normalizeSystemPromptSchedule(e && e.schedule),
    }))
    .filter((e) => e.id && e.content.trim().length > 0);
}

function normalizeSystemPromptSchedule(raw) {
  if (!raw || typeof raw !== "object") return { type: "first", everyNTurns: 1 };
  const type = String(raw.type || "first");
  const validTypes = ["first", "always", "interval"];
  return {
    type: validTypes.includes(type) ? type : "first",
    everyNTurns: Math.max(1, Math.floor(Number(raw.everyNTurns) || 1)),
  };
}

export function normalizeCharacters(raw) {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((item) => ({
      id: String(item && item.id ? item.id : makeId()),
      name: String(item && item.name ? item.name : "Character"),
      usage: String(item && item.usage ? item.usage : ""),
      content: String(item && item.content ? item.content : ""),
      active: item && typeof item.active === "boolean" ? item.active : false,
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

export function normalizeProjects(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item) => item && typeof item === "object" && item.id && item.name)
    .map((item) => ({
      id: String(item.id),
      name: String(item.name),
      description: String(item.description || ""),
      customInstructions: String(item.customInstructions || ""),
      linkedDirId: item.linkedDirId || null,
      createdAt: Number(item.createdAt) || Date.now(),
      updatedAt: Number(item.updatedAt) || Date.now(),
    }));
}

export function normalizeProjectFiles(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item) => item && typeof item === "object" && item.id && item.projectId && item.content)
    .map((item) => ({
      id: String(item.id),
      projectId: String(item.projectId),
      name: String(item.name || "file"),
      content: String(item.content),
      size: Number(item.size) || new TextEncoder().encode(String(item.content)).length,
      createdAt: Number(item.createdAt) || Date.now(),
    }));
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

export function normalizeChatTags(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  const result = {};
  for (const [sessionId, tags] of Object.entries(raw)) {
    if (!sessionId || !Array.isArray(tags)) continue;
    const cleaned = tags
      .map((t) => String(t || "").trim())
      .filter((t) => t.length > 0);
    if (cleaned.length > 0) {
      result[sessionId] = cleaned;
    }
  }
  return result;
}

export function normalizeSavedItems(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item) => item && item.id && item.content)
    .map((item) => ({
      id: String(item.id),
      type: item.type === "snippet" ? "snippet" : "bookmark",
      title: String(item.title || ""),
      content: String(item.content),
      messageType: item.type === "bookmark"
        ? (item.messageType === "assistant" ? "assistant" : "user")
        : null,
      messageNodeId: String(item.messageNodeId || ""),
      createdAt: Number(item.createdAt) || Date.now(),
      updatedAt: Number(item.updatedAt) || Date.now(),
      conversationTitle: String(item.conversationTitle || ""),
      conversationUrl: String(item.conversationUrl || ""),
    }));
}

export function normalizeCommandMappings(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {}
  const result = {}
  for (const [key, snippetId] of Object.entries(raw)) {
    const cleanKey = String(key || "").toLowerCase().replace(/[^a-z0-9_]/g, "")
    if (cleanKey && snippetId) result[cleanKey] = String(snippetId)
  }
  return result
}

export function normalizeMcpServers(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(s => s && s.id && s.serverUrl)
    .map(s => ({
      id: String(s.id),
      name: String(s.name || s.serverUrl || "MCP Server"),
      serverUrl: String(s.serverUrl),
      apiKey: String(s.apiKey || ""),
      tools: Array.isArray(s.tools) ? s.tools.map(t => ({
        name: String(t.name || ""),
        description: String(t.description || ""),
        inputSchema: t.inputSchema || {},
      })).filter(t => t.name) : [],
      enabled: s.enabled !== false,
      createdAt: Number(s.createdAt) || Date.now(),
    }));
}

export function normalizeCssSnippets(raw) {
  const defaultPresets = [
    {
      id: "preset-reducePadding",
      name: "presetReducePadding",
      css: CSS_PRESETS.reducePadding.css,
      active: false,
      isPreset: true,
    },
    {
      id: "preset-widerMessages",
      name: "presetWiderMessages",
      css: CSS_PRESETS.widerMessages.css,
      active: false,
      isPreset: true,
    },
    {
      id: "preset-compact",
      name: "presetCompact",
      css: CSS_PRESETS.compact.css,
      active: false,
      isPreset: true,
    },
    {
      id: "preset-betterCodeFont",
      name: "presetBetterCodeFont",
      css: CSS_PRESETS.betterCodeFont.css,
      active: false,
      isPreset: true,
    },
  ];

  if (!Array.isArray(raw)) {
    return defaultPresets;
  }

  const map = new Map(raw.map((item) => [item.id, item]));

  const finalPresets = defaultPresets.map((preset) => {
    const existing = map.get(preset.id);
    if (existing) {
      map.delete(preset.id);
      return {
        ...preset,
        css: existing.css !== undefined ? existing.css : preset.css,
        active: !!existing.active,
      };
    }
    return preset;
  });

  const customSnippets = Array.from(map.values())
    .map((item) => ({
      id: String(item.id || makeId()),
      name: String(item.name || "Snippet"),
      css: String(item.css || ""),
      active: !!item.active,
      isPreset: false,
    }))
    .filter((item) => item.css.trim().length > 0);

  return [...finalPresets, ...customSnippets];
}

// ── Storage change listener ──

let _storageListenerRef = null;
let _storageCleanupRef = null;

/**
 * Bind the storage.onChanged listener. Idempotent — subsequent calls
 * return the same cleanup handle. The returned cleanup function removes
 * the listener and permits a later fresh bind.
 *
 * @returns {() => void}
 */
export function bindStorageChangeListener() {
  // Re-register if previously cleared (e.g. mock reset)
  if (_storageListenerRef) {
    // Verify the listener is still registered; mock resets clear the Set
    if (!chrome.storage.onChanged.hasListener(_storageListenerRef)) {
      _storageListenerRef = null;
      _storageCleanupRef = null;
    } else {
      return _storageCleanupRef;
    }
  }

  if (!_storageListenerRef) {
    _storageListenerRef = (changes, areaName) => {
    if (areaName !== "local") {
      return;
    }

    let pageConfigChanged = false;

    if (changes[STORAGE_KEYS.settings]) {
      state.settings = {
        ...DEFAULT_SETTINGS,
        ...(changes[STORAGE_KEYS.settings].newValue || {}),
      };
      state.settings.customSystemPrompts = normalizeCustomSystemPrompts(state.settings.customSystemPrompts);
      state.settings.systemPromptEntries = normalizeSystemPromptEntries(state.settings.systemPromptEntries);
      setHtmlToMarkdownMaxDepth(state.settings.htmlToMarkdownMaxDepth);
      setMaxChatSessions(state.settings.maxChatSessions);

      // Re-initialize i18n locale
      i18n.init(state.settings.syncLocale ? null : state.settings.locale);

      if (state.ui) {
        state.ui.refreshSettings();
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent("bds:settingsChanged"));
      }
      pageConfigChanged = true;
    }

    if (changes[STORAGE_KEYS.skills]) {
      state.skills = normalizeSkills(changes[STORAGE_KEYS.skills].newValue);
      if (state.ui) {
        state.ui.refreshSkills();
      }
      pageConfigChanged = true;
    }

    if (changes[STORAGE_KEYS.memories]) {
      state.memories = normalizeMemories(
        changes[STORAGE_KEYS.memories].newValue
      );
      if (state.ui) {
        state.ui.refreshMemories();
      }
      pageConfigChanged = true;
    }

    if (changes[STORAGE_KEYS.characters]) {
      state.characters = normalizeCharacters(
        changes[STORAGE_KEYS.characters].newValue
      );
      if (state.ui) {
        state.ui.refreshCharacters();
      }
      pageConfigChanged = true;
    }

    if (changes[STORAGE_KEYS.projects]) {
      state.projects = normalizeProjects(changes[STORAGE_KEYS.projects].newValue);
      if (state.ui) state.ui.refreshProjects();
      pageConfigChanged = true;
    }

    if (changes[STORAGE_KEYS.projectFiles]) {
      state.projectFiles = normalizeProjectFiles(changes[STORAGE_KEYS.projectFiles].newValue);
      if (state.ui) state.ui.refreshProjects();
      pageConfigChanged = true;
    }

    if (changes[STORAGE_KEYS.whatsNewPending]) {
      state.whatsNewPending = !!changes[STORAGE_KEYS.whatsNewPending].newValue;
      if (state.ui) {
        state.ui.refreshWhatsNew();
      }
    }

    if (changes[STORAGE_KEYS.chatTags]) {
      state.chatTags = normalizeChatTags(changes[STORAGE_KEYS.chatTags].newValue);

      // Update sidebar tag chips if search is active
      import("./ui/SidebarSearch.js").then(m => {
        if (typeof m.renderTagChips === 'function') {
          m.renderTagChips();
        }
      });
    }

    if (changes[STORAGE_KEYS.savedItems]) {
      state.savedItems = normalizeSavedItems(changes[STORAGE_KEYS.savedItems].newValue);
      if (state.ui) state.ui.refreshSavedItems();
    }

    if (changes[STORAGE_KEYS.commandMappings]) {
      state.commands.customMappings = normalizeCommandMappings(changes[STORAGE_KEYS.commandMappings].newValue);
    }

    if (changes[STORAGE_KEYS.mcpServers]) {
      state.mcpServers = normalizeMcpServers(changes[STORAGE_KEYS.mcpServers].newValue);
      pageConfigChanged = true;
    }

    if (changes[STORAGE_KEYS.cssSnippets]) {
      state.cssSnippets = normalizeCssSnippets(changes[STORAGE_KEYS.cssSnippets].newValue);
      if (state.ui && typeof state.ui.refreshCssSnippets === 'function') {
        state.ui.refreshCssSnippets();
      }
      window.dispatchEvent(new CustomEvent("bds:cssSnippetsChanged"));
    }

    if (changes[STORAGE_KEYS.remoteAnnouncement]) {
      state.remoteAnnouncements = Array.isArray(changes[STORAGE_KEYS.remoteAnnouncement].newValue) ? changes[STORAGE_KEYS.remoteAnnouncement].newValue : [];
      window.dispatchEvent(new CustomEvent("bds:remote-announcement-updated", { detail: state.remoteAnnouncements }));
    }

    if (changes[STORAGE_KEYS.dismissedAnnouncements]) {
      state.dismissedAnnouncements = changes[STORAGE_KEYS.dismissedAnnouncements].newValue || [];
    }

    if (changes[STORAGE_KEYS.remoteConfig]) {
      // syncFromStorage NEVER writes back — it is the ownership boundary
      remoteConfig.syncFromStorage(changes[STORAGE_KEYS.remoteConfig].newValue ?? {});
      state.remoteConfig = remoteConfig.raw;
    }

    if (changes.bds_locale_updates) {
      if (changes.bds_locale_updates.newValue) {
        i18n.loadUpdatedLocales(changes.bds_locale_updates.newValue);
      } else {
        i18n.resetLocales();
      }
    }

    if (pageConfigChanged) {
      pushConfigToPage();
    }
  };

  chrome.storage.onChanged.addListener(_storageListenerRef);
  const listener = _storageListenerRef;
  _storageCleanupRef = () => {
    chrome.storage.onChanged.removeListener(listener);
    if (_storageListenerRef === listener) {
      _storageListenerRef = null;
      _storageCleanupRef = null;
    }
  };
  }

  return _storageCleanupRef;
}
