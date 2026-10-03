<script>
  import Drawer from "./Drawer.svelte";
  import ToastStack from "./ToastStack.svelte";
  import QuestionPanel from "./QuestionPanel.svelte";
  import QueuePanel from "./QueuePanel.svelte";
  import DeepResearchRevisionPanel from "./DeepResearchRevisionPanel.svelte";
  import WhatsNewModal from "./WhatsNewModal.svelte";
  import SelectionOverlay from "./SelectionOverlay.svelte";
  import StatusBanner from "./StatusBanner.svelte";
  import AnnouncementBanner from "./AnnouncementBanner.svelte";
  import PreviewPanel from "./PreviewPanel.svelte";
  import ConfirmDialog from "./ConfirmDialog.svelte";
  import DeepCodeModal from "./DeepCodeModal.svelte";
  import ApiPlayground from "../api-playground/ApiPlayground.svelte";
  import LiveModeOverlay from "./LiveModeOverlay.svelte";
  import VoiceLanguagePrompt from "./VoiceLanguagePrompt.svelte";
  import appState from "../state.js";
  import { STORAGE_KEYS } from "../../lib/constants.js";

  let drawerOpen = $state(false);
  let apiPlaygroundOpen = $state(false);
  let deepCodeModalOpen = $state(false);
  let liveModeOpen = $state(false);
  let whatsNewPending = $state(appState.whatsNewPending);

  let previewVisible = $state(false);
  let previewTitle = $state("");
  let previewContent = $state("");

  /** @type {Array<{id: number, message: string}>} */
  let toasts = $state([]);
  let toastId = 0;

  let confirmVisible = $state(false);
  let confirmMessage = $state("");
  let confirmResolve = null;

  export function showConfirm(message) {
    return new Promise((resolve) => {
      confirmResolve = resolve;
      confirmMessage = message;
      confirmVisible = true;
    });
  }

  function handleConfirm(result) {
    confirmVisible = false;
    confirmMessage = "";
    if (confirmResolve) {
      confirmResolve(result);
      confirmResolve = null;
    }
  }

  // ── First-run speech language prompt ──
  let voiceLangPromptVisible = $state(false);
  let voiceLangPromptCurrent = $state("");
  let voiceLangPromptResolve = null;

  /** Persist the whole settings object, matching SettingsPanel's save path. */
  function persistSettings() {
    if (typeof chrome === "undefined" || !chrome.storage?.local) return;
    try {
      chrome.storage.local.set({
        [STORAGE_KEYS.settings]: JSON.parse(JSON.stringify(appState.settings)),
      });
    } catch (_) {
      // Storage unavailable in some embedded contexts; the in-memory choice still applies.
    }
  }

  /**
   * Ask the user to pick a speech language, once. Resolves with the chosen code, or
   * null when dismissed. Resolves immediately (no prompt) once the user has chosen.
   * @returns {Promise<string|null>}
   */
  export function promptVoiceLanguage() {
    if (appState.settings.voiceLanguageChosen) {
      return Promise.resolve(appState.settings.voiceLanguage || "");
    }
    return new Promise((resolve) => {
      voiceLangPromptResolve = resolve;
      voiceLangPromptCurrent = appState.settings.voiceLanguage || "";
      voiceLangPromptVisible = true;
    });
  }

  function handleVoiceLangConfirm(lang) {
    voiceLangPromptVisible = false;
    appState.settings.voiceLanguage = lang || "";
    appState.settings.voiceLanguageChosen = true;
    persistSettings();
    if (voiceLangPromptResolve) {
      voiceLangPromptResolve(lang || "");
      voiceLangPromptResolve = null;
    }
  }

  function handleVoiceLangCancel() {
    voiceLangPromptVisible = false;
    if (voiceLangPromptResolve) {
      voiceLangPromptResolve(null);
      voiceLangPromptResolve = null;
    }
  }

  /** True once a language is set; blocks Live Mode / voice input until then. */
  async function ensureVoiceLanguage() {
    if (appState.settings.voiceLanguageChosen) return true;
    const lang = await promptVoiceLanguage();
    return Boolean(lang);
  }

  // ── Public API (called from non-Svelte code via mount.js) ──

  export function showToast(message, duration = 2880) {
    const id = ++toastId;
    toasts = [...toasts, { id, message }];

    setTimeout(() => {
      toasts = toasts.filter((t) => t.id !== id);
    }, duration);
  }

  export function showLongWorkOverlay(_visible) {}

  // Settings/skills/memories refresh — forwarded to Drawer
  let drawerRef = $state(null);

  export function refreshSettings() {
    if (drawerRef) drawerRef.refreshSettings();
  }
  export function refreshSkills() {
    if (drawerRef) drawerRef.refreshSkills();
  }
  export function refreshCharacters() {
    if (drawerRef) drawerRef.refreshCharacters();
  }
  export function refreshMemories() {
    if (drawerRef) drawerRef.refreshMemories();
  }
  export function refreshProjects() {
    if (drawerRef) drawerRef.refreshProjects();
    if (appState.heroBarRef) appState.heroBarRef.refresh();
  }
  export function refreshSavedItems() {
    if (drawerRef) drawerRef.refreshSavedItems();
  }
  export function refreshCssSnippets() {
    if (drawerRef) drawerRef.refreshCssSnippets();
  }

  export function refreshWhatsNew() {
    whatsNewPending = appState.whatsNewPending;
  }

  export function showPreviewPanel(title, content) {
    previewTitle = title;
    previewContent = content;
    previewVisible = true;
  }

  export function hidePreviewPanel() {
    previewVisible = false;
    previewTitle = "";
    previewContent = "";
  }

  async function toggleDrawer() {
    if (drawerOpen) {
      if (drawerRef && drawerRef.handleClose) {
        await drawerRef.handleClose();
      } else {
        drawerOpen = false;
      }
    } else {
      drawerOpen = true;
    }
  }

  function closeDrawer() {
    drawerOpen = false;
  }

  function openApiPlayground() {
    apiPlaygroundOpen = true;
  }

  function closeApiPlayground() {
    apiPlaygroundOpen = false;
  }

  export async function openLiveMode() {
    // First Live Mode use asks for a speech language before anything starts.
    if (!(await ensureVoiceLanguage())) return;
    liveModeOpen = true;
  }

  export function closeLiveMode() {
    liveModeOpen = false;
  }

  // Handle external selection mode toggle
  window.addEventListener("bds:toggleSelectionMode", () => {
    appState.selectionMode = true;
    closeDrawer();
  });

  window.addEventListener("bds:open-deep-code-modal", () => {
    deepCodeModalOpen = true;
  });

  window.addEventListener("bds:open-live-mode", () => {
    openLiveMode();
  });
</script>

<button id="bds-toggle" type="button" onclick={toggleDrawer} aria-label="Better DeepSeek">
  <span class="bds-toggle-full" aria-hidden="true">BDS</span>
  <span class="bds-toggle-short" aria-hidden="true">B</span>
</button>

<Drawer bind:this={drawerRef} open={drawerOpen} onclose={closeDrawer} onopenapiplayground={openApiPlayground} />

{#if apiPlaygroundOpen}
  <ApiPlayground onclose={closeApiPlayground} />
{/if}

{#if liveModeOpen}
  <LiveModeOverlay onclose={closeLiveMode} />
{/if}

<DeepCodeModal
  show={deepCodeModalOpen}
  activeDirectory={appState.deepCode.activeDirectory}
  fileCount={appState.deepCode.fileCount}
  onclose={() => deepCodeModalOpen = false}
/>

<ToastStack {toasts} />
<QuestionPanel />
<QueuePanel />
<DeepResearchRevisionPanel />

{#if whatsNewPending}
  <WhatsNewModal onDismiss={() => whatsNewPending = false} />
{/if}

<SelectionOverlay />
<StatusBanner />
<AnnouncementBanner />
<PreviewPanel
  visible={previewVisible}
  title={previewTitle}
  content={previewContent}
  onclose={hidePreviewPanel}
/>

<ConfirmDialog
  show={confirmVisible}
  message={confirmMessage}
  onconfirm={() => handleConfirm(true)}
  oncancel={() => handleConfirm(false)}
/>

<VoiceLanguagePrompt
  show={voiceLangPromptVisible}
  current={voiceLangPromptCurrent}
  onconfirm={handleVoiceLangConfirm}
  oncancel={handleVoiceLangCancel}
/>
