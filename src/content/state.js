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
  observer: null,
  scanTimer: 0,
  urlWatchTimer: 0,
  lastUrl: location.href,
  processedStandaloneFiles: new Set(),
  processedLatexAutoDownloads: new Set(),
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
};

export default state;
