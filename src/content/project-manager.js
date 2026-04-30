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
  state.projects = state.projects.filter((p) => p.id !== id);
  state.projectFiles = state.projectFiles.filter((f) => f.projectId !== id);

  if (state.activeProjectId === id) {
    state.activeProjectId = null;
    state.activeFileIds = [];
  }

  await Promise.all([saveProjects(), saveProjectFiles()]);
}

export function setActiveProject(id) {
  state.activeProjectId = id;
  state.activeFileIds = [];
}

export function clearActiveProject() {
  state.activeProjectId = null;
  state.activeFileIds = [];
}

export function getActiveProject() {
  if (!state.activeProjectId) return null;
  return state.projects.find((p) => p.id === state.activeProjectId) || null;
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
 * Prefer this over calling addProjectFile() in a loop: sequential writes
 * trigger one chrome.storage.onChanged event per write, and the listener
 * updates state.projectFiles from storage — which can race against the
 * next iteration of the loop and cause mid-upload state corruption.
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
  state.activeFileIds = state.activeFileIds.filter((fid) => fid !== id);
  await saveProjectFiles();
}

export function getFilesForProject(projectId) {
  return state.projectFiles.filter((f) => f.projectId === projectId);
}

// ── File selection (session-only — no storage writes) ──

export function tickFile(fileId) {
  if (!state.activeFileIds.includes(fileId)) {
    state.activeFileIds = [...state.activeFileIds, fileId];
  }
}

export function untickFile(fileId) {
  state.activeFileIds = state.activeFileIds.filter((id) => id !== fileId);
}

export function clearActiveFiles() {
  state.activeFileIds = [];
}

export function getActiveFiles() {
  return state.projectFiles.filter((f) => state.activeFileIds.includes(f.id));
}

export function isFileTicked(fileId) {
  return state.activeFileIds.includes(fileId);
}

