<script>
  import appState from "../state.js";
  import { pushConfigToPage } from "../bridge.js";
  import {
    STORAGE_KEYS,
    SYSTEM_PROMPT_TEMPLATE_VERSION,
    DOWNLOAD_BEHAVIOR_VERSION,
    DEFAULT_SYSTEM_PROMPT,
  } from "../../lib/constants.js";
  import { getActiveProject, updateProject } from "../project-manager.js";

  let systemPrompt = $state(appState.settings.systemPrompt || "");
  let autoFiles = $state(Boolean(appState.settings.autoDownloadFiles));
  let autoZip = $state(Boolean(appState.settings.autoDownloadLongWorkZip));
  let voiceMode = $state(Boolean(appState.settings.voiceMode));
  let voiceLanguage = $state(
    appState.settings.voiceLanguage ||
      (typeof navigator !== "undefined" ? navigator.language : "en-US"),
  );
  let autoSubmitVoice = $state(Boolean(appState.settings.autoSubmitVoice));
  let preferredLang = $state(appState.settings.preferredLang || "");
  let disableSystemPrompt = $state(
    Boolean(appState.settings.disableSystemPrompt),
  );
  let systemPromptInjectionFrequency = $state(
    appState.settings.systemPromptInjectionFrequency || "first",
  );
  let systemPromptInjectionInterval = $state(
    Number(appState.settings.systemPromptInjectionInterval) || 3,
  );
  let disableMemory = $state(Boolean(appState.settings.disableMemory));
  let htmlToMarkdownMaxDepth = $state(
    Number(appState.settings.htmlToMarkdownMaxDepth) || 200,
  );
  let maxChatSessions = $state(
    Number(appState.settings.maxChatSessions) || 500,
  );
  let advancedOpen = $state(false);

  let activeProject = $state(getActiveProject());
  let projectInstructions = $state(activeProject?.customInstructions || "");
  let projectSaveTimer = null;

  export function refresh() {
    systemPrompt = appState.settings.systemPrompt || "";
    autoFiles = Boolean(appState.settings.autoDownloadFiles);
    autoZip = Boolean(appState.settings.autoDownloadLongWorkZip);
    voiceMode = Boolean(appState.settings.voiceMode);
    voiceLanguage =
      appState.settings.voiceLanguage ||
      (typeof navigator !== "undefined" ? navigator.language : "en-US");
    autoSubmitVoice = Boolean(appState.settings.autoSubmitVoice);
    preferredLang = appState.settings.preferredLang || "";
    disableSystemPrompt = Boolean(appState.settings.disableSystemPrompt);
    systemPromptInjectionFrequency =
      appState.settings.systemPromptInjectionFrequency || "first";
    systemPromptInjectionInterval =
      Number(appState.settings.systemPromptInjectionInterval) || 3;
    disableMemory = Boolean(appState.settings.disableMemory);
    htmlToMarkdownMaxDepth =
      Number(appState.settings.htmlToMarkdownMaxDepth) || 200;
    maxChatSessions = Number(appState.settings.maxChatSessions) || 500;
  }

  export function refreshProject() {
    activeProject = getActiveProject();
    projectInstructions = activeProject?.customInstructions || "";
  }

  function scheduleProjectSave() {
    if (projectSaveTimer) clearTimeout(projectSaveTimer);
    projectSaveTimer = setTimeout(async () => {
      projectSaveTimer = null;
      const project = getActiveProject();
      if (!project) return;
      await updateProject(project.id, {
        customInstructions: projectInstructions,
      });
      pushConfigToPage();
    }, 600);
  }

  async function save() {
    appState.settings.systemPrompt = systemPrompt.trim();
    appState.settings.systemPromptTemplateVersion =
      SYSTEM_PROMPT_TEMPLATE_VERSION;
    appState.settings.downloadBehaviorVersion = DOWNLOAD_BEHAVIOR_VERSION;
    appState.settings.autoDownloadFiles = autoFiles;
    appState.settings.autoDownloadLongWorkZip = autoZip;
    appState.settings.voiceMode = voiceMode;
    appState.settings.voiceLanguage = voiceLanguage;
    appState.settings.autoSubmitVoice = autoSubmitVoice;
    appState.settings.preferredLang = preferredLang.trim();
    appState.settings.disableSystemPrompt = disableSystemPrompt;
    appState.settings.systemPromptInjectionFrequency =
      systemPromptInjectionFrequency;
    appState.settings.systemPromptInjectionInterval =
      systemPromptInjectionInterval;
    appState.settings.disableMemory = disableMemory;
    appState.settings.htmlToMarkdownMaxDepth = Math.max(
      10,
      Math.floor(Number(htmlToMarkdownMaxDepth) || 200),
    );
    appState.settings.maxChatSessions = Math.max(
      10,
      Math.floor(Number(maxChatSessions) || 500),
    );

    await chrome.storage.local.set({
      [STORAGE_KEYS.settings]: appState.settings,
    });
    pushConfigToPage();

    if (appState.ui) {
      appState.ui.showToast("Settings saved.");
    }
  }

  function resetSystemPrompt() {
    systemPrompt = DEFAULT_SYSTEM_PROMPT;
  }
</script>

<div class="bds-section-title">
  <span class="bds-icon-inline">
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g clip-path="url(#clip0_1450_63327)">
        <path
          d="M14.0861 5.51366C13.8717 5.0575 13.588 4.58542 13.2889 4.18108C13.208 4.07172 13.1596 4.04373 13.0243 4.03054C12.4277 3.97255 11.8245 4.05527 11.2269 3.9972C10.7224 3.94816 10.3133 3.71661 10.0115 3.30919C9.66986 2.84777 9.43973 2.31343 9.09824 1.85234C9.01771 1.74365 8.96805 1.71589 8.83354 1.70282C8.29432 1.65044 7.70402 1.65061 7.16656 1.70282C7.03205 1.71589 6.98239 1.74365 6.90186 1.85234C6.56067 2.31303 6.33025 2.84774 5.98855 3.30919C5.68681 3.71661 5.27774 3.94816 4.77317 3.9972C4.17564 4.05527 3.57239 3.97255 2.97585 4.03054C2.84046 4.04373 2.79208 4.07172 2.71115 4.18108C2.41212 4.58542 2.12835 5.0575 1.91403 5.51366C1.85299 5.64359 1.85286 5.7018 1.91403 5.8319C2.14865 6.33077 2.49748 6.76892 2.73237 7.26854C2.9594 7.7515 2.96041 8.24717 2.73338 8.73044C2.49837 9.23061 2.14891 9.66837 1.91403 10.1681C1.85291 10.2982 1.85299 10.3564 1.91403 10.4863C2.12856 10.9429 2.41185 11.4142 2.71115 11.8189C2.79208 11.9283 2.84046 11.9563 2.97585 11.9694C3.57239 12.0274 4.17564 11.9447 4.77317 12.0028C5.27774 12.0518 5.68681 12.2834 5.98855 12.6908C6.33024 13.1522 6.56037 13.6866 6.90186 14.1476C6.98239 14.2563 7.03205 14.2841 7.16656 14.2972C7.70402 14.3494 8.29432 14.3495 8.83354 14.2972C8.96805 14.2841 9.01771 14.2563 9.09824 14.1476C9.43944 13.687 9.66985 13.1522 10.0115 12.6908C10.3133 12.2834 10.7224 12.0518 11.2269 12.0028C11.8244 11.9447 12.4271 12.0275 13.0243 11.9694C13.1596 11.9563 13.208 11.9283 13.2889 11.8189C13.5891 11.4131 13.872 10.942 14.0861 10.4863C14.1471 10.3564 14.1472 10.2982 14.0861 10.1681C13.8513 9.66861 13.5017 9.23061 13.2667 8.73044C13.0397 8.24717 13.0407 7.7515 13.2677 7.26854C13.5026 6.7689 13.8513 6.33106 14.0861 5.8319C14.1472 5.7018 14.1471 5.64359 14.0861 5.51366ZM15.3035 6.40373C15.0685 6.90359 14.7188 7.34119 14.4841 7.84037C14.4231 7.97025 14.423 8.02855 14.4841 8.15861C14.7189 8.65833 15.0685 9.09611 15.3035 9.59626C15.5308 10.0801 15.5308 10.5744 15.3035 11.0582C15.052 11.5933 14.7225 12.1426 14.37 12.6191C14.0685 13.0265 13.6581 13.259 13.1536 13.3081C12.5566 13.366 11.9541 13.2835 11.3573 13.3414C11.2228 13.3545 11.1731 13.3823 11.0926 13.491C10.7511 13.9521 10.521 14.4864 10.1793 14.9478C9.87828 15.3542 9.46719 15.5869 8.96387 15.6358C8.34008 15.6964 7.66194 15.6966 7.03623 15.6358C6.53291 15.5869 6.12182 15.3542 5.82084 14.9478C5.47911 14.4863 5.24878 13.9517 4.90753 13.491C4.82701 13.3823 4.77734 13.3545 4.64284 13.3414C4.04647 13.2835 3.44373 13.366 2.84653 13.3081C2.34201 13.259 1.93164 13.0265 1.63013 12.6191C1.27867 12.144 0.948453 11.5941 0.696621 11.0582C0.469315 10.5744 0.469279 10.0801 0.696621 9.59626C0.931628 9.09613 1.2813 8.65807 1.51597 8.15861C1.57708 8.02855 1.57702 7.97025 1.51597 7.84037C1.28117 7.34095 0.931635 6.9036 0.696621 6.40373C0.469213 5.91992 0.469367 5.42562 0.696621 4.94183C0.948441 4.40587 1.27868 3.85598 1.63013 3.38092C1.93164 2.97349 2.34201 2.74095 2.84653 2.6919C3.44353 2.63397 4.04599 2.71649 4.64284 2.65856C4.77734 2.64549 4.82701 2.61774 4.90753 2.50904C5.24905 2.04792 5.47913 1.51362 5.82084 1.05219C6.12182 0.645806 6.53291 0.413119 7.03623 0.364178C7.66002 0.303556 8.33816 0.303369 8.96387 0.364178C9.46719 0.413119 9.87828 0.645806 10.1793 1.05219C10.521 1.51365 10.7513 2.04828 11.0926 2.50904C11.1731 2.61774 11.2228 2.64549 11.3573 2.65856C11.9541 2.71649 12.5566 2.63397 13.1536 2.6919C13.6581 2.74095 14.0685 2.97349 14.37 3.38092C14.7214 3.85598 15.0517 4.40587 15.3035 4.94183C15.5307 5.42562 15.5309 5.91992 15.3035 6.40373Z"
          fill="currentColor"
        ></path><path
          d="M9.13764 7.99999C9.13764 7.3715 8.62855 6.8624 8.00005 6.8624C7.37155 6.8624 6.86246 7.3715 6.86246 7.99999C6.86246 8.62849 7.37155 9.13759 8.00005 9.13759C8.62855 9.13759 9.13764 8.62849 9.13764 7.99999ZM10.4834 7.99999C10.4834 9.37126 9.37132 10.4833 8.00005 10.4833C6.62878 10.4833 5.51674 9.37126 5.51674 7.99999C5.51674 6.62873 6.62878 5.51669 8.00005 5.51669C9.37132 5.51669 10.4834 6.62873 10.4834 7.99999Z"
          fill="currentColor"
        ></path>
      </g>
      <defs
        ><clipPath id="clip0_1450_63327"
          ><rect width="16" height="16" fill="currentColor"></rect></clipPath
        ></defs
      >
    </svg>
  </span>
  General Settings
</div>

<div class="bds-label-row">
  <label class="bds-label" for="bds-system-prompt">Hidden System Prompt</label>
  <button class="bds-reset-btn" type="button" onclick={resetSystemPrompt}
    >Reset</button
  >
</div>
<textarea id="bds-system-prompt" spellcheck="false" bind:value={systemPrompt}
></textarea>

{#if activeProject}
  <div class="bds-label-row" style="margin-top: 12px;">
    <label class="bds-label" for="bds-project-instructions">
      Project Instructions — <em style="font-weight: 400; opacity: 0.7;"
        >{activeProject.name}</em
      >
    </label>
  </div>
  <textarea
    id="bds-project-instructions"
    class="bds-input"
    spellcheck="false"
    bind:value={projectInstructions}
    oninput={scheduleProjectSave}
    placeholder="Custom instructions appended to the global system prompt for this project…"
  ></textarea>
  <p style="font-size: 10px; opacity: 0.5; margin: 2px 0 12px;">Auto-saved</p>
{/if}

<button
  type="button"
  class="bds-advanced-toggle"
  class:open={advancedOpen}
  onclick={() => (advancedOpen = !advancedOpen)}
>
  Advanced Settings
  <span class="bds-chevron">
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M4 6L8 10L12 6"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  </span>
</button>

<div class="bds-advanced-content" class:open={advancedOpen}>
  <div class="bds-advanced-inner">
    <div class="bds-toggle-row">
      <span class="bds-toggle-label">Auto download create_file outputs</span>
      <label class="bds-switch">
        <input id="bds-auto-files" type="checkbox" bind:checked={autoFiles} />
        <span class="bds-switch-track"></span>
      </label>
    </div>

    <div class="bds-toggle-row">
      <span class="bds-toggle-label">Disable Hidden System Prompt</span>
      <label class="bds-switch">
        <input
          id="bds-disable-prompt"
          type="checkbox"
          bind:checked={disableSystemPrompt}
        />
        <span class="bds-switch-track"></span>
      </label>
    </div>

    <div class="bds-toggle-row">
      <span class="bds-toggle-label">Disable Stored Memory Injection</span>
      <label class="bds-switch">
        <input
          id="bds-disable-memory"
          type="checkbox"
          bind:checked={disableMemory}
        />
        <span class="bds-switch-track"></span>
      </label>
    </div>

    <div class="bds-toggle-row">
      <span class="bds-toggle-label">System Prompt Injection Frequency</span>
      <select class="bds-select" bind:value={systemPromptInjectionFrequency}>
        <option value="first">Only on first message</option>
        <option value="always">Always (every message)</option>
        <option value="every_x">Every N messages</option>
      </select>
    </div>

    {#if systemPromptInjectionFrequency === "every_x"}
      <div
        class="bds-toggle-row"
        style="flex-direction: column; align-items: flex-start; gap: 6px; padding-left: 12px; border-left: 2px solid rgba(255, 255, 255, 0.1); margin-left: 4px;"
      >
        <span class="bds-toggle-label">Injection Interval (N)</span>
        <input
          id="bds-injection-interval"
          type="number"
          min="2"
          class="bds-input"
          style="width: 100px; box-sizing: border-box;"
          bind:value={systemPromptInjectionInterval}
        />
        <p style="font-size: 10px; opacity: 0.5; margin: 0;">
          Inject the prompt every {systemPromptInjectionInterval} messages.
        </p>
      </div>
    {/if}

    <div class="bds-toggle-row">
      <span class="bds-toggle-label">Voice Mode (Auto-read responses)</span>
      <label class="bds-switch">
        <input id="bds-voice-mode" type="checkbox" bind:checked={voiceMode} />
        <span class="bds-switch-track"></span>
      </label>
    </div>

    <div class="bds-toggle-row">
      <span class="bds-toggle-label">Auto-submit after speech</span>
      <label class="bds-switch">
        <input
          id="bds-voice-autosubmit"
          type="checkbox"
          bind:checked={autoSubmitVoice}
        />
        <span class="bds-switch-track"></span>
      </label>
    </div>

    <div class="bds-toggle-row">
      <span class="bds-toggle-label">Speech Language</span>
      <select class="bds-select" bind:value={voiceLanguage}>
        <option value="en-US">English (US)</option>
        <option value="en-GB">English (UK)</option>
        <option value="tr-TR">Türkçe (TR)</option>
        <option value="de-DE">Deutsch (DE)</option>
        <option value="fr-FR">Français (FR)</option>
        <option value="es-ES">Español (ES)</option>
        <option value="it-IT">Italiano (IT)</option>
        <option value="zh-CN">中文 (简体)</option>
        <option value="ja-JP">日本語 (JP)</option>
      </select>
    </div>

    <div class="bds-toggle-row">
      <span class="bds-toggle-label">Auto download LONG_WORK zip</span>
      <label class="bds-switch">
        <input id="bds-auto-zip" type="checkbox" bind:checked={autoZip} />
        <span class="bds-switch-track"></span>
      </label>
    </div>

    <div
      class="bds-toggle-row"
      style="flex-direction: column; align-items: flex-start; gap: 6px;"
    >
      <span class="bds-toggle-label">Preferred Response Language</span>
      <input
        id="bds-preferred-lang"
        type="text"
        class="bds-input"
        style="width: 100%; box-sizing: border-box;"
        placeholder="e.g. English, Turkish, Pirate"
        bind:value={preferredLang}
      />
      <p style="font-size: 10px; opacity: 0.5; margin: 0;">
        Leave empty to let the model decide.
      </p>
    </div>

    <div
      class="bds-toggle-row"
      style="flex-direction: column; align-items: flex-start; gap: 6px;"
    >
      <span class="bds-toggle-label">Markdown Walker Max Depth</span>
      <input
        id="bds-html-md-depth"
        type="number"
        min="10"
        step="10"
        class="bds-input"
        style="width: 120px; box-sizing: border-box;"
        bind:value={htmlToMarkdownMaxDepth}
      />
      <p style="font-size: 10px; opacity: 0.5; margin: 0;">
        Hard cap on DOM recursion depth when reconstructing markdown from a
        message. Lower = safer against stack overflow on deeply nested content;
        higher = preserves structure of pathologically nested messages. Default
        200.
      </p>
    </div>

    <div
      class="bds-toggle-row"
      style="flex-direction: column; align-items: flex-start; gap: 6px;"
    >
      <span class="bds-toggle-label">Chat Session List Cap</span>
      <input
        id="bds-max-chat-sessions"
        type="number"
        min="10"
        step="50"
        class="bds-input"
        style="width: 120px; box-sizing: border-box;"
        bind:value={maxChatSessions}
      />
      <p style="font-size: 10px; opacity: 0.5; margin: 0;">
        Maximum number of chat sessions kept in memory for the sidebar. Older
        sessions beyond this cap are evicted (FIFO). Lower values reduce memory
        usage on long-lived tabs. Default 500.
      </p>
    </div>
  </div>
</div>

<button id="bds-save-settings" type="button" onclick={save}>
  Save Settings
</button>
