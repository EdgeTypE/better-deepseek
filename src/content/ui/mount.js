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
  };

  state.ui = api;
  return api;
}
