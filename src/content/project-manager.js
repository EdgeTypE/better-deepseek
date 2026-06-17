/**
 * Project CRUD, file management, and conversation association logic.
 *
 * Functions that write to storage throw on failure so the UI can catch and display errors.
 * setActiveProject, clearActiveProject, tickFile, untickFile, clearActiveFiles, and
 * isFileTicked NEVER call chrome.storage — they are session-only state mutations.
 */

import state from "./state.js";
import { STORAGE_KEYS } from "../lib/constants.js";
import { makeId } from "../lib/utils/helpers.js";
import { unlinkDirectory } from "../lib/local-directory-source.js";

export const MAX_ACTIVE_PROJECTS = 5;

// ── Private storage helpers ──

function saveProjects() {
  return chrome.storage.local.set({ [STORAGE_KEYS.projects]: state.projects });
}

function saveProjectFiles() {
  return chrome.storage.local.set({ [STORAGE_KEYS.projectFiles]: state.projectFiles });
}

// ── Project CRUD ──

export async function createProject(name, description = "") {
  const project = {
    id: makeId(),
    name: String(name).trim(),
    description: String(description || "").trim(),
    customInstructions: "",
    linkedDirId: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  state.projects = [...state.projects, project];
  await saveProjects();
  return project;
}

export async function updateProject(id, updates) {
  const index = state.projects.findIndex((p) => p.id === id);
  if (index === -1) return;
  state.projects = state.projects.map((p, i) =>
    i === index ? { ...p, ...updates, id, updatedAt: Date.now() } : p
  );
  await saveProjects();
}

export async function deleteProject(id) {
  const project = state.projects.find((p) => p.id === id);
  if (project && project.linkedDirId) {
    unlinkDirectory(project.linkedDirId).catch(() => {});
  }

  state.projects = state.projects.filter((p) => p.id !== id);
  state.projectFiles = state.projectFiles.filter((f) => f.projectId !== id);

  // Remove from multi-project selection.
  state.activeProjectIds = state.activeProjectIds.filter((pid) => pid !== id);
  const { [id]: _removed, ...rest } = state.activeFileIdsByProject;
  state.activeFileIdsByProject = rest;

  await Promise.all([saveProjects(), saveProjectFiles()]);
}

export function setProjectLinkedDir(id, linkedDirId) {
  const index = state.projects.findIndex((p) => p.id === id);
  if (index === -1) return;
  state.projects = state.projects.map((p, i) =>
    i === index ? { ...p, linkedDirId, updatedAt: Date.now() } : p
  );
  saveProjects();
}

export function clearProjectLinkedDir(id) {
  const index = state.projects.findIndex((p) => p.id === id);
  if (index === -1) return;
  const project = state.projects[index];
  if (project && project.linkedDirId) {
    unlinkDirectory(project.linkedDirId).catch(() => {});
  }
  state.projects = state.projects.map((p, i) =>
    i === index ? { ...p, linkedDirId: null, updatedAt: Date.now() } : p
  );
  saveProjects();
}

/**
 * Toggle a project's active state. Up to MAX_ACTIVE_PROJECTS can be active at once.
 *
 * @param {string} id
 * @returns {boolean} true if the project is now active, false if it was removed or could not be added.
 */
export function toggleActiveProject(id) {
  const active = new Set(state.activeProjectIds);
  if (active.has(id)) {
    active.delete(id);
    const { [id]: _removed, ...rest } = state.activeFileIdsByProject;
    state.activeFileIdsByProject = rest;
    state.activeProjectIds = Array.from(active);
    return false;
  }
  if (active.size >= MAX_ACTIVE_PROJECTS) {
    return false;
  }
  active.add(id);
  state.activeProjectIds = Array.from(active);
  if (!state.activeFileIdsByProject[id]) {
    state.activeFileIdsByProject[id] = [];
  }
  return true;
}

/**
 * Replace the entire active project selection.
 *
 * @param {string[]} ids
 */
export function setActiveProjects(ids) {
  const unique = Array.from(new Set(ids.filter((id) => state.projects.some((p) => p.id === id)))).slice(0, MAX_ACTIVE_PROJECTS);
  state.activeProjectIds = unique;
  const next = {};
  for (const id of unique) {
    next[id] = state.activeFileIdsByProject[id] || [];
  }
  state.activeFileIdsByProject = next;
}

/**
 * Legacy single-project setter. Adds the project to the active set.
 *
 * @param {string} id
 */
export function setActiveProject(id) {
  setActiveProjects([id]);
}

export function clearActiveProject() {
  state.activeProjectIds = [];
  state.activeFileIdsByProject = {};
}

/**
 * @deprecated Use getActiveProjects for multi-project support.
 * @returns {object|null}
 */
export function getActiveProject() {
  const id = state.activeProjectIds[0];
  if (!id) return null;
  return state.projects.find((p) => p.id === id) || null;
}

export function getActiveProjects() {
  return state.projects.filter((p) => state.activeProjectIds.includes(p.id));
}

export function isProjectActive(id) {
  return state.activeProjectIds.includes(id);
}

// ── File CRUD ──

export async function addProjectFile(projectId, name, content) {
  const file = {
    id: makeId(),
    projectId,
    name: String(name),
    content: String(content),
    size: new TextEncoder().encode(content).length,
    createdAt: Date.now(),
  };
  state.projectFiles = [...state.projectFiles, file];
  await saveProjectFiles();
  return file;
}

/**
 * Adds multiple files to a project in a single storage write.
 *
 * @param {string} projectId
 * @param {{ name: string, content: string }[]} fileDataArray
 * @returns {Promise<object[]>} The created file objects.
 */
export async function addProjectFilesBatch(projectId, fileDataArray) {
  if (!fileDataArray.length) return [];
  const encoder = new TextEncoder();
  const now = Date.now();
  const newFiles = fileDataArray.map(({ name, content }) => ({
    id: makeId(),
    projectId,
    name: String(name),
    content: String(content),
    size: encoder.encode(content).length,
    createdAt: now,
  }));
  state.projectFiles = [...state.projectFiles, ...newFiles];
  await saveProjectFiles();
  return newFiles;
}

export async function deleteProjectFile(id) {
  state.projectFiles = state.projectFiles.filter((f) => f.id !== id);
  for (const projectId of Object.keys(state.activeFileIdsByProject)) {
    state.activeFileIdsByProject[projectId] = state.activeFileIdsByProject[projectId].filter((fid) => fid !== id);
  }
  await saveProjectFiles();
}

export function getFilesForProject(projectId) {
  return state.projectFiles.filter((f) => f.projectId === projectId);
}

/**
 * Get all files across all active projects.
 * If RAG is enabled, returns every file in each active project.
 * Otherwise returns only the explicitly ticked files per project.
 *
 * @param {boolean} ragEnabled
 * @returns {Array<{ id: string, projectId: string, name: string, content: string, projectName?: string }>}
 */
export function getFilesForActiveProjects(ragEnabled = false) {
  const files = [];
  for (const projectId of state.activeProjectIds) {
    const project = state.projects.find((p) => p.id === projectId);
    if (!project) continue;

    let projectFiles;
    if (ragEnabled) {
      projectFiles = getFilesForProject(projectId);
    } else {
      const activeIds = state.activeFileIdsByProject[projectId] || [];
      projectFiles = state.projectFiles.filter((f) => activeIds.includes(f.id));
    }

    for (const file of projectFiles) {
      files.push({ ...file, projectName: project.name });
    }
  }
  return files;
}

// ── File selection (session-only — no storage writes) ──

export function tickFile(fileId, projectId) {
  if (!projectId) {
    const file = state.projectFiles.find((f) => f.id === fileId);
    if (!file) return;
    projectId = file.projectId;
  }
  if (!state.activeFileIdsByProject[projectId]) {
    state.activeFileIdsByProject[projectId] = [];
  }
  if (!state.activeFileIdsByProject[projectId].includes(fileId)) {
    state.activeFileIdsByProject[projectId] = [...state.activeFileIdsByProject[projectId], fileId];
  }
}

export function untickFile(fileId, projectId) {
  if (!projectId) {
    const file = state.projectFiles.find((f) => f.id === fileId);
    if (!file) return;
    projectId = file.projectId;
  }
  if (state.activeFileIdsByProject[projectId]) {
    state.activeFileIdsByProject[projectId] = state.activeFileIdsByProject[projectId].filter((id) => id !== fileId);
  }
}

export function clearActiveFiles(projectId) {
  if (projectId) {
    state.activeFileIdsByProject[projectId] = [];
  } else {
    state.activeFileIdsByProject = {};
  }
}

export function getActiveFiles() {
  return getFilesForActiveProjects(false);
}

export function isFileTicked(fileId, projectId) {
  if (!projectId) {
    const file = state.projectFiles.find((f) => f.id === fileId);
    if (!file) return false;
    projectId = file.projectId;
  }
  return (state.activeFileIdsByProject[projectId] || []).includes(fileId);
}

export function getTickedFilesForProject(projectId) {
  return (state.activeFileIdsByProject[projectId] || [])
    .map((id) => state.projectFiles.find((f) => f.id === id))
    .filter(Boolean);
}
