/**
 * Centralized extension state.
 *
 * This is a plain mutable object shared across all content script modules.
 * Svelte UI components will read from this and trigger updates via callbacks.
 */

import { DEFAULT_SETTINGS } from "../lib/constants.js";

const state = {
  settings: { ...DEFAULT_SETTINGS },
  skills: [],
  memories: {},
  characters: [],
  /** @type {Array<{id:string,name:string,description:string,customInstructions:string,createdAt:number,updatedAt:number}>} */
  projects: [],
  /** @type {Array<{id:string,projectId:string,name:string,content:string,size:number,createdAt:number}>} */
  projectFiles: [],
  /** @type {string|null} session-only, never persisted */
  activeProjectId: null,
  /** @type {string[]} session-only, never persisted */
  activeFileIds: [],
  observer: null,
  scanTimer: 0,
  urlWatchTimer: 0,
  lastUrl: location.href,
  processedStandaloneFiles: new Set(),
  downloadCounter: 0,
  network: {
    activeCompletionRequests: 0,
    lastEventAt: 0,
  },
  longWork: {
    active: false,
    files: new Map(),
    lastActivityAt: 0,
  },
  /** @type {import('./ui/mount.js').UiApi | null} */
  ui: null,
  /** @type {{ refresh: () => void } | null} session-only ref to AttachMenu's project panel */
  heroBarRef: null,
  /** @type {Array<{id:string,title:string,updatedAt:number}>} persistent session cache */
  chatSessions: [],
};

/**
 * Run `fn` with the chat-DOM MutationObserver paused, so DOM mutations the
 * extension itself causes (mounting Svelte components, replaceWith ops) do
 * not retrigger a scan. Defense-in-depth on top of the record-level filter
 * in scanner.js.
 */
export function withObserverPaused(fn) {
  const observer = state.observer;
  if (observer) observer.disconnect();
  try {
    return fn();
  } finally {
    if (observer && document.body) {
      observer.observe(document.body, { subtree: true, childList: true });
    }
  }
}

export default state;
