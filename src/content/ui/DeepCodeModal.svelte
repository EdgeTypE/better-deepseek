<script>
  import { onMount, onDestroy } from "svelte";
  import appState from "../state.js";
  import {
    pickAndLinkDeepCodeDirectory,
    selectRecentDirectory,
    removeRecentDirectory,
  } from "../deep-code.js";
  import { t } from "../../lib/i18n.svelte.js";

  let { show = false, activeDirectory = null, fileCount = 0, onclose = null } = $props();

  let loading = $state(false);
  let feedback = $state("");
  let recentDirectories = $state(appState.deepCode.recentDirectories || []);
  let manualPath = $state(appState.deepCode.manualPath || "");

  let lastEventRecent = null;

  onMount(() => {
    const handler = (event) => {
      const detail = event.detail || {};
      lastEventRecent = Array.isArray(detail.recentDirectories) ? detail.recentDirectories : lastEventRecent;
      manualPath = detail.manualPath ?? manualPath;
      if (lastEventRecent) recentDirectories = lastEventRecent;
    };
    window.addEventListener("bds:deep-code-toggle-state", handler);
    return () => window.removeEventListener("bds:deep-code-toggle-state", handler);
  });

  onDestroy(() => {
    lastEventRecent = null;
  });

  $effect(() => {
    recentDirectories = appState.deepCode.recentDirectories || [];
    manualPath = appState.deepCode.manualPath || "";
  });

  async function handleSelectFolder() {
    feedback = "";
    loading = true;
    try {
      const res = await pickAndLinkDeepCodeDirectory();
      feedback = t("deepCodeModal.linkedFeedback", { name: res.rootName, count: res.fileCount });
      setTimeout(() => { feedback = ""; }, 3500);
    } catch (err) {
      if (err.name !== "AbortError") {
        feedback = err.message || t("deepCodeModal.selectFailed");
      }
    } finally {
      loading = false;
    }
  }

  async function handleSelectRecent(entry) {
    await selectRecentDirectory(entry);
    feedback = t("deepCodeModal.switchedFeedback", { name: entry.name });
    setTimeout(() => { feedback = ""; }, 2500);
  }

  async function handleRemoveRecent(entry, e) {
    e?.stopPropagation?.();
    await removeRecentDirectory(entry.path || entry.name);
  }

  function handleOverlayClick() {
    if (onclose) onclose();
  }
</script>

{#if show}
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="bds-modal-backdrop"
    role="dialog"
    tabindex="-1"
    onclick={handleOverlayClick}
    onkeydown={(e) => e.key === 'Escape' && onclose?.()}
  >
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="bds-dc-modal" onclick={(e) => e.stopPropagation()}>
      <div class="bds-drawer-header">
        <div class="ds-modal-content__title">{t("deepCodeModal.title")}</div>
        <button id="bds-close" type="button" onclick={onclose} aria-label={t("deepCodeModal.closeAria")}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M14.1871 13.1265L13.1265 14.1872L1.81275 2.87347L2.87341 1.81281L14.1871 13.1265Z" fill="currentColor"></path>
            <path d="M13.1265 1.81282L14.1871 2.87348L2.8734 14.1872L1.81274 13.1265L13.1265 1.81282Z" fill="currentColor"></path>
          </svg>
        </button>
      </div>

      <div class="bds-drawer-body">
        <p class="bds-dc-subtitle">
          {t("deepCodeModal.subtitle")}
        </p>

        {#if activeDirectory || manualPath}
          <div class="bds-skill-item bds-active-dir-item" style="margin-bottom: 12px;">
            <div style="flex: 1; min-width: 0;">
              <div style="display: flex; align-items: center; gap: 6px;">
                <span class="bds-active-dot"></span>
                <strong style="font-size: 13px; color: var(--bds-text-primary);">{activeDirectory || t("deepCodeModal.activeCodebase")}</strong>
                {#if fileCount > 0}
                  <span class="bds-count-badge">{t("deepCodeModal.filesIndexed", { count: fileCount })}</span>
                {/if}
              </div>
              {#if manualPath}
                <div class="bds-path-code-text" title={manualPath}>{manualPath}</div>
              {/if}
            </div>
          </div>
        {/if}

        <button
          type="button"
          class="bds-btn"
          style="width: 100%; justify-content: center; padding: 9px 14px; font-size: 13px; margin-bottom: 12px;"
          disabled={loading}
          onclick={handleSelectFolder}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
          </svg>
          <span>{loading ? t("deepCodeModal.indexing") : t("deepCodeModal.linkFolder")}</span>
        </button>

        {#if feedback}
          <p class="bds-dc-feedback">{feedback}</p>
        {/if}

        <hr class="bds-dc-hr" />

        <div class="bds-section-title">
          <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
            <span>{t("deepCodeModal.recentTitle")}</span>
            {#if recentDirectories.length > 0}
              <span style="font-size: 11px; color: var(--bds-text-tertiary);">{recentDirectories.length}</span>
            {/if}
          </div>
        </div>

        <div class="bds-list" style="max-height: 220px; overflow-y: auto;">
          {#if recentDirectories && recentDirectories.length > 0}
            {#each recentDirectories as dir}
              {@const isSelected = activeDirectory === dir.name || (manualPath && dir.path && manualPath.toLowerCase() === dir.path.toLowerCase())}
              <div
                class="bds-skill-item"
                class:bds-active={isSelected}
                role="button"
                tabindex="0"
                onclick={() => handleSelectRecent(dir)}
                onkeydown={(e) => e.key === "Enter" && handleSelectRecent(dir)}
                title={dir.path || dir.name}
              >
                <div style="flex: 1; min-width: 0;">
                  <div style="display: flex; align-items: center; gap: 6px;">
                    <span style="font-weight: 500; font-size: 13px; color: var(--bds-text-primary); text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">
                      {dir.name}
                    </span>
                    {#if dir.fileCount}
                      <span class="bds-count-badge">{dir.fileCount}f</span>
                    {/if}
                    {#if isSelected}
                      <span style="color: var(--bds-accent); font-size: 12px;">✓</span>
                    {/if}
                  </div>
                  {#if dir.path}
                    <div class="bds-path-code-text" title={dir.path}>{dir.path}</div>
                  {/if}
                </div>
                <button
                  type="button"
                  class="bds-item-remove-btn"
                  title={t("deepCodeModal.removeHistory")}
                  onclick={(e) => handleRemoveRecent(dir, e)}
                >
                  ×
                </button>
              </div>
            {/each}
          {:else}
            <p class="bds-empty" style="font-size: 11px; padding: 16px 0;">{t("deepCodeModal.emptyRecent")}</p>
          {/if}
        </div>
      </div>

      <div class="bds-drawer-bottom" style="display: flex; justify-content: flex-end;">
        <button type="button" class="bds-btn-outlined" style="font-size: 12px; padding: 5px 14px;" onclick={onclose}>
          {t("deepCodeModal.done")}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .bds-modal-backdrop {
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

  .bds-dc-modal {
    width: min(92vw, 400px);
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

  .bds-dc-modal .bds-drawer-header {
    margin-bottom: 24px;
  }

  .bds-dc-subtitle {
    font-size: 12px;
    color: var(--bds-text-secondary);
    margin: 0 0 16px;
    line-height: 1.45;
  }

  .bds-dc-hr {
    border: none;
    height: 1px;
    background: var(--bds-border);
    margin: 20px 0;
  }

  .bds-dc-feedback {
    font-size: 11.5px;
    color: var(--bds-accent);
    margin: 0 0 10px;
    text-align: center;
  }

  .bds-active-dir-item {
    background: var(--bds-bg-elevated);
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

  .bds-path-code-text {
    font-size: 10.5px;
    color: var(--bds-text-tertiary);
    font-family: monospace;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-top: 2px;
  }

  .bds-item-remove-btn {
    opacity: 0;
    background: transparent;
    border: none;
    color: var(--bds-text-tertiary);
    font-size: 14px;
    cursor: pointer;
    padding: 0 4px;
    border-radius: 4px;
    transition: all var(--bds-transition, 0.15s ease);
    flex-shrink: 0;
  }

  .bds-skill-item:hover .bds-item-remove-btn {
    opacity: 0.8;
  }

  .bds-item-remove-btn:hover {
    opacity: 1 !important;
    color: #f87171;
    background: rgba(239, 68, 68, 0.15);
  }
</style>
