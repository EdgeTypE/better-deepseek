<script>
  import Drawer from "./Drawer.svelte";
  import ToastStack from "./ToastStack.svelte";
  import QuestionPanel from "./QuestionPanel.svelte";
  import DeepResearchRevisionPanel from "./DeepResearchRevisionPanel.svelte";
  import WhatsNewModal from "./WhatsNewModal.svelte";
  import SelectionOverlay from "./SelectionOverlay.svelte";
  import StatusBanner from "./StatusBanner.svelte";
  import AnnouncementBanner from "./AnnouncementBanner.svelte";
  import PreviewPanel from "./PreviewPanel.svelte";
  import ConfirmDialog from "./ConfirmDialog.svelte";
  import ApiPlayground from "../api-playground/ApiPlayground.svelte";
  import appState from "../state.js";

  let drawerOpen = $state(false);
  let apiPlaygroundOpen = $state(false);
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

  // ── Public API (called from non-Svelte code via mount.js) ──

  export function showToast(message) {
    const id = ++toastId;
    toasts = [...toasts, { id, message }];

    setTimeout(() => {
      toasts = toasts.filter((t) => t.id !== id);
    }, 2880);
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

  // Handle external selection mode toggle
  window.addEventListener("bds:toggleSelectionMode", () => {
    appState.selectionMode = true;
    closeDrawer();
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

<ToastStack {toasts} />
<QuestionPanel />
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
