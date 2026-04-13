<script>
  import appState from "../state.js";
  import { pushConfigToPage } from "../bridge.js";
  import {
    STORAGE_KEYS,
    SYSTEM_PROMPT_TEMPLATE_VERSION,
    DOWNLOAD_BEHAVIOR_VERSION,
  } from "../../lib/constants.js";

  let systemPrompt = $state(appState.settings.systemPrompt || "");
  let autoFiles = $state(Boolean(appState.settings.autoDownloadFiles));
  let autoZip = $state(Boolean(appState.settings.autoDownloadLongWorkZip));
  let autoLatex = $state(Boolean(appState.settings.autoDownloadLatexPdf));

  export function refresh() {
    systemPrompt = appState.settings.systemPrompt || "";
    autoFiles = Boolean(appState.settings.autoDownloadFiles);
    autoZip = Boolean(appState.settings.autoDownloadLongWorkZip);
    autoLatex = Boolean(appState.settings.autoDownloadLatexPdf);
  }

  async function save() {
    appState.settings.systemPrompt = systemPrompt.trim();
    appState.settings.systemPromptTemplateVersion = SYSTEM_PROMPT_TEMPLATE_VERSION;
    appState.settings.downloadBehaviorVersion = DOWNLOAD_BEHAVIOR_VERSION;
    appState.settings.autoDownloadFiles = autoFiles;
    appState.settings.autoDownloadLongWorkZip = autoZip;
    appState.settings.autoDownloadLatexPdf = autoLatex;

    await chrome.storage.local.set({
      [STORAGE_KEYS.settings]: appState.settings,
    });
    pushConfigToPage();

    if (appState.ui) {
      appState.ui.showToast("Settings saved.");
    }
  }
</script>

<label class="bds-label" for="bds-system-prompt">Hidden System Prompt</label>
<textarea
  id="bds-system-prompt"
  spellcheck="false"
  bind:value={systemPrompt}
></textarea>

<div class="bds-toggle-row">
  <span class="bds-toggle-label">Auto download create_file outputs</span>
  <label class="bds-switch">
    <input id="bds-auto-files" type="checkbox" bind:checked={autoFiles} />
    <span class="bds-switch-track"></span>
  </label>
</div>

<div class="bds-toggle-row">
  <span class="bds-toggle-label">Auto download LONG_WORK zip</span>
  <label class="bds-switch">
    <input id="bds-auto-zip" type="checkbox" bind:checked={autoZip} />
    <span class="bds-switch-track"></span>
  </label>
</div>

<div class="bds-toggle-row">
  <span class="bds-toggle-label">Auto download LATEX PDF outputs</span>
  <label class="bds-switch">
    <input id="bds-auto-latex" type="checkbox" bind:checked={autoLatex} />
    <span class="bds-switch-track"></span>
  </label>
</div>

<button id="bds-save-settings" type="button" onclick={save}>
  Save Settings
</button>
