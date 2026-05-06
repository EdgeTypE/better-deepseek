/**
 * Mount the Svelte UI into the page.
 */

import { mount } from "svelte";
import App from "./App.svelte";
import state from "../state.js";

/**
 * @typedef {object} UiApi
 * @property {(message: string) => void} showToast
 * @property {() => void} refreshSettings
 * @property {() => void} refreshSkills
 * @property {() => void} refreshMemories
 * @property {() => void} refreshProjects
 */

/**
 * Mount the BDS UI and return the API object.
 * @returns {UiApi}
 */
export function mountUi() {
  if (document.getElementById("bds-root")) {
    return state.ui;
  }

  const root = document.createElement("div");
  root.id = "bds-root";
  document.body.appendChild(root);

  const app = mount(App, { target: root });

  /** @type {UiApi} */
  const api = {
    showToast: (message) => app.showToast(message),
    refreshSettings: () => app.refreshSettings(),
    refreshSkills: () => app.refreshSkills(),
    refreshCharacters: () => app.refreshCharacters(),
    refreshMemories: () => app.refreshMemories(),
    refreshProjects: () => app.refreshProjects(),
    refreshWhatsNew: () => app.refreshWhatsNew(),
  };

  state.ui = api;
  initPreviewAvoidance(root);
  return api;
}

/**
 * Continuously track DeepSeek's file-preview panel with rAF so #bds-root
 * follows the panel's left edge in real time during open/close animations.
 * @param {HTMLElement} root
 */
function initPreviewAvoidance(root) {
  const PANEL_SELECTOR = "._519be07";
  const DEFAULT_RIGHT = 16;
  const GAP = 8;

  let lastRight = DEFAULT_RIGHT;

  function tick() {
    const panel = document.querySelector(PANEL_SELECTOR);
    const targetRight = panel
      ? Math.max(window.innerWidth - panel.getBoundingClientRect().left + GAP, DEFAULT_RIGHT)
      : DEFAULT_RIGHT;

    if (targetRight !== lastRight) {
      root.style.right = targetRight === DEFAULT_RIGHT ? "" : `${targetRight}px`;
      lastRight = targetRight;
    }

    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
}
