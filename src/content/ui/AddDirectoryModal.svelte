<script>
  import { onMount } from "svelte";
  import {
    pickDeepCodeDirectory,
    activateDeepCodeDirectory,
  } from "../deep-code.js";
  import { unlinkDirectory } from "../../lib/local-directory-source.js";
  import { t } from "../../lib/i18n.svelte.js";

  let { show = false, activeDirectory = null, fileCount = 0, onclose = null } = $props();

  let loading = $state(false);
  let feedback = $state("");
  let manualPath = $state("");
  let pickedRoot = $state("");
  let pickedFileCount = $state(0);

  onMount(() => {
    const handler = (event) => {
      const detail = event.detail || {};
      manualPath = detail.manualPath ?? manualPath;
    };
    window.addEventListener("bds:deep-code-toggle-state", handler);
    return () => window.removeEventListener("bds:deep-code-toggle-state", handler);
  });

  async function handlePickFolder() {
    feedback = "";
    loading = true;
    try {
      const res = await pickDeepCodeDirectory();
      pickedRoot = res.rootName;
      pickedFileCount = res.fileCount;
      if (res.path) manualPath = res.path;
      feedback = t("deepCodeModal.linkedFeedback", { name: res.rootName, count: res.fileCount });
      setTimeout(() => { feedback = ""; }, 3000);
    } catch (err) {
      if (err.name !== "AbortError") {
        feedback = err.message === "File System Access API is not supported on this browser context."
          ? t("deepCodeModal.fsApiUnsupported")
          : (err.message || t("deepCodeModal.selectFailed"));
      }
    } finally {
      loading = false;
    }
  }

  async function handleManualSubmit() {
    const p = manualPath.trim().replace(/[\\/]+$/, "");
    if (!p) return;
    const folderName = p.split(/[/\\]/).pop() || "";
    const expected = pickedRoot;
    if (expected && folderName.toLowerCase() !== expected.toLowerCase()) {
      feedback = t("deepCodeModal.pathMismatch", { name: expected });
      setTimeout(() => { feedback = ""; }, 3500);
      return;
    }
    await activateDeepCodeDirectory(folderName, pickedFileCount || fileCount, p);
    if (onclose) onclose();
  }

  async function handleCancel() {
    if (pickedRoot) {
      try {
        await unlinkDirectory("deepcode-pending-project");
      } catch { /* ignore */ }
      pickedRoot = "";
    }
    if (onclose) onclose();
  }

  function handleOverlayClick() {
    handleCancel();
  }
</script>

{#if show}
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="bds-add-backdrop"
    role="dialog"
    tabindex="-1"
    onclick={handleOverlayClick}
    onkeydown={(e) => e.key === 'Escape' && handleCancel()}
  >
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="bds-add-card" onclick={(e) => e.stopPropagation()}>
      <div class="bds-add-header">
        <div class="ds-modal-content__title">{t("deepCodeModal.addNewDirectory")}</div>
        <button id="bds-close" type="button" onclick={handleCancel} aria-label={t("deepCodeModal.closeAria")}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M14.1871 13.1265L13.1265 14.1872L1.81275 2.87347L2.87341 1.81281L14.1871 13.1265Z" fill="currentColor"></path>
            <path d="M13.1265 1.81282L14.1871 2.87348L2.8734 14.1872L1.81274 13.1265L13.1265 1.81282Z" fill="currentColor"></path>
          </svg>
        </button>
      </div>

      <div class="bds-add-body">
        {#if pickedRoot}
          <div class="bds-add-picked">
            <span class="bds-active-dot"></span>
            <strong>{pickedRoot}</strong>
            {#if pickedFileCount > 0}
              <span class="bds-count-badge">{t("deepCodeModal.filesIndexed", { count: pickedFileCount })}</span>
            {/if}
          </div>
        {/if}

        <button
          type="button"
          class="bds-btn"
          style="width: 100%; justify-content: center; padding: 9px 14px; font-size: 13px; margin-bottom: 14px;"
          disabled={loading}
          onclick={handlePickFolder}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
          </svg>
          <span>{loading ? t("deepCodeModal.indexing") : t("deepCodeModal.pickFolder")}</span>
        </button>

        <div class="bds-manual-section">
          <label class="bds-manual-label" for="bds-add-manual-path-input">
            {t("deepCodeModal.manualPathLabel")}
          </label>
          <div class="bds-manual-input-row">
            <input
              id="bds-add-manual-path-input"
              type="text"
              placeholder={t("deepCodeModal.manualPathPlaceholder")}
              bind:value={manualPath}
              class="bds-manual-input"
            />
            <button type="button" class="bds-btn" onclick={handleManualSubmit}>
              {t("deepCodeModal.savePath")}
            </button>
          </div>
          <p class="bds-manual-hint">{t("deepCodeModal.manualPathHint")}</p>
        </div>

        {#if feedback}
          <p class="bds-add-feedback">{feedback}</p>
        {/if}
      </div>

      <div class="bds-add-footer">
        <button type="button" class="bds-btn-outlined" onclick={handleCancel}>
          {t("deepCodeModal.cancel")}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .bds-add-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2147483647;
    padding: 16px;
    animation: bds-modal-in 0.18s cubic-bezier(0.16, 1, 0.3, 1);
  }

  @keyframes bds-modal-in {
    from { opacity: 0; transform: scale(0.98); }
    to { opacity: 1; transform: scale(1); }
  }

  .bds-add-card {
    width: min(92vw, 420px);
    border: 1px solid var(--bds-border);
    border-radius: var(--bds-radius, 14px);
    background: var(--bds-bg-panel);
    box-shadow: var(--bds-shadow);
    color: var(--bds-text-primary);
    padding: 24px;
    display: flex;
    flex-direction: column;
    max-height: 82vh;
    box-sizing: border-box;
    font-family: inherit;
  }

  .bds-add-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 20px;
  }

  .bds-add-body {
    display: flex;
    flex-direction: column;
  }

  .bds-add-footer {
    display: flex;
    justify-content: flex-end;
    margin-top: 20px;
    padding-top: 12px;
    border-top: 1px solid var(--bds-border);
  }

  .bds-add-picked {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--bds-bg-elevated);
    border: 1px solid var(--bds-border);
    border-radius: var(--bds-radius, 10px);
    padding: 8px 12px;
    margin-bottom: 12px;
    font-size: 13px;
  }

  .bds-active-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #10b981;
    box-shadow: 0 0 6px rgba(16, 185, 129, 0.6);
    flex-shrink: 0;
  }

  .bds-count-badge {
    font-size: 10px;
    background: var(--bds-bg-hover, rgba(255, 255, 255, 0.08));
    color: var(--bds-text-secondary);
    padding: 1px 5px;
    border-radius: 4px;
  }

  .bds-manual-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .bds-manual-label {
    font-size: 11px;
    color: var(--bds-text-secondary);
    font-weight: 500;
  }

  .bds-manual-input-row {
    display: flex;
    gap: 8px;
  }

  .bds-manual-input-row .bds-btn {
    flex-shrink: 0;
    padding: 7px 12px;
    font-size: 12px;
  }

  .bds-manual-input {
    flex: 1;
    min-width: 0;
    background: var(--bds-bg-elevated);
    border: 1px solid var(--bds-border);
    border-radius: var(--bds-radius, 8px);
    padding: 7px 10px;
    font-size: 12px;
    font-family: monospace;
    color: var(--bds-text-primary);
    outline: none;
  }

  .bds-manual-input:focus {
    border-color: var(--bds-accent);
  }

  .bds-manual-hint {
    font-size: 10.5px;
    font-style: italic;
    color: var(--bds-text-tertiary);
    margin: 0;
    line-height: 1.4;
  }

  .bds-add-feedback {
    font-size: 11.5px;
    color: var(--bds-accent);
    margin: 10px 0 0;
    text-align: center;
  }
</style>