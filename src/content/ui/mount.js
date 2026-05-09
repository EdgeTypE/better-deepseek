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
/**
 * Compute the right offset for the BDS root element.
 * Returns null on mobile so CSS media query handles positioning.
 * @param {number} innerWidth
 * @param {number} mobileBreakpoint
 * @param {DOMRect|null} panelRect bounding rect of the file-preview panel, or null
 * @param {number} defaultRight
 * @param {number} gap
 * @returns {number|null}
 */
export function computePreviewRight(innerWidth, mobileBreakpoint, panelRect, defaultRight, gap) {
  if (innerWidth < mobileBreakpoint) return null;
  if (!panelRect) return defaultRight;
  return Math.max(innerWidth - panelRect.left + gap, defaultRight);
}

function initPreviewAvoidance(root) {
  const PANEL_SELECTOR = "._519be07";
  const DEFAULT_RIGHT = 16;
  const GAP = 8;
  const MOBILE_BREAKPOINT = 768;

  let lastRight = DEFAULT_RIGHT;

  function tick() {
    const panel = document.querySelector(PANEL_SELECTOR);
    const right = computePreviewRight(
      window.innerWidth,
      MOBILE_BREAKPOINT,
      panel ? panel.getBoundingClientRect() : null,
      DEFAULT_RIGHT,
      GAP,
    );

    if (right === null) {
      // Mobile: clear any inline override so CSS media query handles positioning.
      if (root.style.right !== "") root.style.right = "";
      lastRight = DEFAULT_RIGHT;
    } else if (right !== lastRight) {
      root.style.right = right === DEFAULT_RIGHT ? "" : `${right}px`;
      lastRight = right;
    }

    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
}
