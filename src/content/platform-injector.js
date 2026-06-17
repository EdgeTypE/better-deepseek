/**
 * Cross-platform prompt injection for non-DeepSeek chat sites.
 *
 * On enabled platforms, when the user clicks the send button we prepend the
 * BDS system prompt, skills, memories, active project instructions, and RAG
 * context to the composer input before the native send happens.
 */

import state from "./state.js";
import { DEFAULT_SYSTEM_PROMPT } from "../lib/constants.js";
import { buildHiddenPrefix } from "../injected/payload-mutator.js";
import {
  getActiveProjects,
  getFilesForActiveProjects,
  getFilesForProject,
} from "./project-manager.js";
import { getDirectoryFiles } from "../lib/local-directory-source.js";
import {
  PLATFORM_ADAPTERS,
  getCurrentPlatformAdapter,
} from "../lib/platform-adapters.js";

let listenerAttached = false;

/**
 * Build an injection config object that mirrors the shape consumed by the
 * injected payload mutator.
 */
function buildInjectionConfig() {
  const activeProjects = getActiveProjects();
  const projectRagEnabled = Boolean(state.settings.projectRagEnabled);
  const activeProjectFiles = getFilesForActiveProjects(projectRagEnabled);
  const localDirFiles = [];

  for (const project of activeProjects) {
    if (!project.linkedDirId) continue;
    try {
      const dirFiles = getDirectoryFiles(project.id);
      if (dirFiles) {
        for (const f of dirFiles) {
          localDirFiles.push({ ...f, projectName: project.name });
        }
      }
    } catch {
      // Best-effort: linked directories may not be available on all sites.
    }
  }

  const allFiles = [...activeProjectFiles, ...localDirFiles];

  let activeSystemPrompt;
  if (!state.settings.activeSystemPromptId || state.settings.activeSystemPromptId === "default") {
    activeSystemPrompt = DEFAULT_SYSTEM_PROMPT;
  } else if (Array.isArray(state.settings.customSystemPrompts)) {
    const custom = state.settings.customSystemPrompts.find(
      (p) => p.id === state.settings.activeSystemPromptId
    );
    activeSystemPrompt = custom ? custom.content : DEFAULT_SYSTEM_PROMPT;
  } else {
    activeSystemPrompt = DEFAULT_SYSTEM_PROMPT;
  }

  return {
    systemPrompt: String(activeSystemPrompt),
    systemPromptEntries: state.settings.systemPromptMultiMode
      ? (Array.isArray(state.settings.systemPromptEntries)
          ? state.settings.systemPromptEntries
          : []
        )
          .filter((e) => e.enabled && e.content && e.content.trim())
          .map((e) => ({
            id: e.id,
            content: e.content,
            schedule: e.schedule || { type: "first", everyNTurns: 1 },
          }))
      : [],
    skills: state.skills
      .filter((skill) => skill.active)
      .map((skill) => ({ name: skill.name, content: skill.content })),
    memories: Object.entries(state.memories).map(([key, item]) => ({
      key,
      value: item.value,
      importance: item.importance,
    })),
    activeCharacter: state.characters.find((c) => c.active) || null,
    preferredLang: String(state.settings.preferredLang || ""),
    disableSystemPrompt: Boolean(state.settings.disableSystemPrompt),
    disableMemory: Boolean(state.settings.disableMemory),
    systemPromptInjectionFrequency: "always",
    systemPromptInjectionInterval: 3,
    projectRagEnabled,
    projectRagLimit: Number(state.settings.projectRagLimit || 5),
    injectSystemDateTime: Boolean(state.settings.injectSystemDateTime),
    activeProjects: activeProjects.map((project) => {
      const projectFiles = projectRagEnabled
        ? getFilesForProject(project.id)
        : (state.activeFileIdsByProject[project.id] || [])
            .map((id) => state.projectFiles.find((f) => f.id === id))
            .filter(Boolean);
      const files = projectFiles.map((f) => ({ name: f.name, content: f.content }));
      return {
        id: project.id,
        name: project.name,
        instructions: project.customInstructions,
        files,
      };
    }),
    activeProject:
      activeProjects.length > 0
        ? {
            name: activeProjects[0].name,
            instructions: activeProjects[0].customInstructions,
            files: allFiles.map((f) => ({ name: f.name, content: f.content })),
          }
        : null,
  };
}

/**
 * Prepend the BDS injection prefix to the current user prompt.
 * Returns true if a prefix was injected.
 */
function injectPlatformPrefix() {
  const adapter = getCurrentPlatformAdapter();
  if (!adapter) return false;
  if (location.hostname === "chat.deepseek.com") return false;

  const enabled = state.settings.platformAdapters?.[location.hostname]?.enabled ?? adapter.enabled;
  if (!enabled) return false;

  const inputEl = adapter.inputSelectors
    .map((s) => document.querySelector(s))
    .find(Boolean);
  if (!inputEl) return false;

  const raw = inputEl.value || inputEl.textContent || "";
  const userPrompt = String(raw).trim();
  if (!userPrompt) return false;
  if (userPrompt.includes("<BetterDeepSeek>")) return false;

  const config = buildInjectionConfig();
  const prefix = buildHiddenPrefix(userPrompt, "cross-platform", { config }, true, null, null);
  if (!prefix) return false;

  const finalText = `${prefix}\n\n${userPrompt}`;
  adapter.injectText(inputEl, finalText);
  return true;
}

/**
 * Attach a capture-phase click listener to the document so we can prepend the
 * injection before the platform's own send handler runs.
 */
export function initPlatformInjector() {
  if (listenerAttached) return;
  listenerAttached = true;

  document.addEventListener(
    "click",
    (e) => {
      const adapter = getCurrentPlatformAdapter();
      if (!adapter) return;
      if (location.hostname === "chat.deepseek.com") return;

      const enabled = state.settings.platformAdapters?.[location.hostname]?.enabled ?? adapter.enabled;
      if (!enabled) return;

      const target = e.target;
      if (!(target instanceof Element)) return;
      const sendBtn = target.closest("button, div[role='button']");
      if (!sendBtn) return;
      if (!adapter.sendButtonMatcher(sendBtn)) return;

      injectPlatformPrefix();
    },
    true
  );
}

/**
 * Return the default adapter settings object for storage.
 */
export function getDefaultPlatformAdapterSettings() {
  return Object.fromEntries(
    Object.entries(PLATFORM_ADAPTERS).map(([host, adapter]) => [
      host,
      { enabled: adapter.enabled },
    ])
  );
}
