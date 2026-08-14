<script>
  import { onMount } from "svelte";
  import appState from "../state.js";
  import {
    setDeepCodeEnabled,
    toggleDeepCodeEnabled,
    selectRecentDirectory,
    removeRecentDirectory,
  } from "../deep-code.js";
  import { BetterDeepSeekHarnessBridge } from "../../lib/harness-bridge.js";
  import { t } from "../../lib/i18n.svelte.js";
  import AddDirectoryModal from "./AddDirectoryModal.svelte";

  let { enabled = false, onToggle = null } = $props();

  let localEnabled = $state(false);
  let activeDirectory = $state(appState.deepCode.activeDirectory || "");
  let manualPath = $state(appState.deepCode.manualPath || "");
  let fileCount = $state(appState.deepCode.fileCount || 0);
  let recentDirectories = $state(appState.deepCode.recentDirectories || []);

  let isOpen = $state(false);
  let menuRef = $state(null);
  let buttonRef = $state(null);
  let dropdownStyle = $state("");
  let actionFeedback = $state("");
  let showAddPopup = $state(false);
  let harnessStatus = $state("checking"); // checking | enhanced | fallback

  let bridge = new BetterDeepSeekHarnessBridge();

  $effect(() => {
    localEnabled = Boolean(enabled);
    activeDirectory = appState.deepCode.activeDirectory || "";
    manualPath = appState.deepCode.manualPath || "";
    fileCount = appState.deepCode.fileCount || 0;
    recentDirectories = appState.deepCode.recentDirectories || [];
  });

  let displayLabel = $derived.by(() => {
    if (!localEnabled) return "DeepCode";
    const dir = activeDirectory || (manualPath ? manualPath.split(/[/\\]/).filter(Boolean).pop() : "");
    if (!dir) return "DeepCode: Active";
    const cleanDir = dir.length > 18 ? dir.slice(0, 16) + "…" : dir;
    return `DeepCode: ${cleanDir}`;
  });

  onMount(async () => {
    const handler = (event) => {
      const detail = event.detail || {};
      localEnabled = Boolean(detail.enabled);
      activeDirectory = detail.activeDirectory || "";
      manualPath = detail.manualPath || "";
      fileCount = detail.fileCount || 0;
      if (Array.isArray(detail.recentDirectories)) {
        recentDirectories = detail.recentDirectories;
      }
    };
    window.addEventListener("bds:deep-code-toggle-state", handler);

    try {
      const mode = await bridge.detectMode(1500);
      harnessStatus = mode === "enhanced" ? "enhanced" : "fallback";
    } catch {
      harnessStatus = "fallback";
    }

    const handleClickOutside = (e) => {
      if (isOpen && menuRef && !menuRef.contains(e.target) && buttonRef && !buttonRef.contains(e.target)) {
        isOpen = false;
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isOpen) {
        isOpen = false;
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("bds:deep-code-toggle-state", handler);
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  });

  function updateDropdownPosition() {
    if (!buttonRef) return;
    const rect = buttonRef.getBoundingClientRect();
    const margin = 8;
    const menuWidth = 360;
    const menuHeight = 420;

    let top = rect.top - menuHeight - margin;
    let left = rect.left;

    if (top < 10) {
      top = rect.bottom + margin;
    }
    if (left + menuWidth > window.innerWidth - 10) {
      left = window.innerWidth - menuWidth - 10;
    }
    if (left < 10) {
      left = 10;
    }

    dropdownStyle = `top: ${Math.max(10, top)}px; left: ${Math.max(10, left)}px;`;
  }

  function handleButtonClick(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    isOpen = !isOpen;
    if (isOpen) {
      updateDropdownPosition();
    }
  }

  function handleToggleSwitch(event) {
    event?.stopPropagation?.();
    const next = !localEnabled;
    localEnabled = next;
    setDeepCodeEnabled(next);
    if (onToggle) onToggle(next);
  }

  async function handleSelectRecent(entry, event) {
    event?.stopPropagation?.();
    const result = await selectRecentDirectory(entry);
    actionFeedback = result.needsPicker
      ? t("deepCodeModal.recentNeedsPicker", { name: entry.name })
      : t("deepCodeModal.switchedFeedback", { name: entry.name });
    setTimeout(() => { actionFeedback = ""; }, 3500);
  }

  async function handleRemoveRecent(entry, event) {
    event?.stopPropagation?.();
    await removeRecentDirectory(entry.path || entry.name);
  }

  function handleAddMenuToggle() {
    showAddPopup = !showAddPopup;
    actionFeedback = "";
  }
</script>

<!-- COMPOSER TOOLBAR TOGGLE BUTTON -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  bind:this={buttonRef}
  tabindex="0"
  aria-pressed={localEnabled}
  aria-expanded={isOpen}
  aria-label="DeepCode: Local Codebase & Harness"
  class="bds-deep-code-toggle f79352dc ds-toggle-button ds-toggle-button--m"
  class:ds-toggle-button--selected={localEnabled}
  class:bds-deep-code-toggle--selected={localEnabled}
  style="transform: translateZ(0px); margin-left: 4px;"
  onclick={handleButtonClick}
  onkeydown={(e) => (e.key === "Enter" || e.key === " ") && handleButtonClick(e)}
  data-testid="deep-code-toggle"
  title={manualPath ? `DeepCode Active: ${manualPath}` : "DeepCode: Local Codebase & Harness Workspace"}
>
  <div class="ds-toggle-button__icon">
    <div class="ds-icon" style="font-size: inherit;">
      <svg
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          d="M5.75 4.75L2.5 8L5.75 11.25M10.25 4.75L13.5 8L10.25 11.25M8.5 3.5L7.5 12.5"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </div>
  </div>
  <span class="_6dbc175 bds-toggle-label">{displayLabel}</span>
  <span class="bds-toggle-chevron">{isOpen ? "▴" : "▾"}</span>
  <div class="ds-focus-ring" style="--dsl-focus-ring-offset: -1px;"></div>
</div>

<!-- POPOVER CARD (DRAWER SETTINGS & QUESTION PANEL DESIGN SYSTEM) -->
{#if isOpen}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    bind:this={menuRef}
    class="bds-dc-panel"
    style={dropdownStyle}
    onclick={(e) => e.stopPropagation()}
  >
    <!-- HEADER -->
    <div class="bds-dc-header">
      <div class="bds-dc-title-group">
        <span class="bds-icon-inline" style="color: var(--bds-accent, #4d6bfe); margin-right: 6px;">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M5.75 4.75L2.5 8L5.75 11.25M10.25 4.75L13.5 8L10.25 11.25M8.5 3.5L7.5 12.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </span>
        <h3 class="ds-modal-content__title" style="font-size: 15px;">DeepCode</h3>
      </div>

      <button
        id="bds-close"
        type="button"
        class="bds-close-btn"
        onclick={() => isOpen = false}
        aria-label="Close"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M14.1871 13.1265L13.1265 14.1872L1.81275 2.87347L2.87341 1.81281L14.1871 13.1265Z" fill="currentColor"></path>
          <path d="M13.1265 1.81282L14.1871 2.87348L2.8734 14.1872L1.81274 13.1265L13.1265 1.81282Z" fill="currentColor"></path>
        </svg>
      </button>
    </div>

    <!-- SETTING TOGGLE ROW (EXACT DRAWER SETTINGS PATTERN) -->
    <div class="bds-toggle-row" style="padding: 8px 0 12px;">
      <div style="flex: 1; min-width: 0;">
        <span class="bds-label">Codebase & Harness Integration</span>
        <p style="font-size: 11px; color: var(--bds-text-tertiary, #8e8ea0); margin: 2px 0 0; line-height: 1.35;">
          Inject codebase context & enable DeepSeek Harness local tasks.
        </p>
      </div>
      <button
        type="button"
        class="bds-switch"
        class:bds-switch--on={localEnabled}
        onclick={handleToggleSwitch}
        title={localEnabled ? "Disable DeepCode" : "Enable DeepCode"}
      >
        <span class="bds-switch-handle"></span>
      </button>
    </div>

    <!-- PRIMARY ACTION: ADD NEW DIRECTORY -->
    <div style="margin-bottom: 12px;">
      <button
        type="button"
        class="bds-btn"
        style="width: 100%; justify-content: center; padding: 9px 16px; font-size: 13px;"
        onclick={handleAddMenuToggle}
        aria-expanded={showAddPopup}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 5v14M5 12h14"></path>
        </svg>
        <span>{t("deepCodeModal.addNewDirectory")}</span>
      </button>
      {#if actionFeedback}
        <p style="font-size: 11px; color: var(--bds-accent, #4d6bfe); margin: 6px 0 0; text-align: center;">
          {actionFeedback}
        </p>
      {/if}
    </div>

    <AddDirectoryModal
      show={showAddPopup}
      activeDirectory={activeDirectory}
      fileCount={fileCount}
      onclose={() => showAddPopup = false}
    />

    <!-- RECENT CODEBASES LIST (QUESTION PANEL / ELEVATED LIST STYLE) -->
    <div class="bds-section-title" style="margin: 0 0 6px; font-size: 12px;">
      <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
        <span style="font-weight: 600; color: var(--bds-text-secondary, #8e8ea0); text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px;">
          Recent Codebases
        </span>
        {#if recentDirectories.length > 0}
          <span style="font-size: 11px; color: var(--bds-text-tertiary, #6b6b7b);">{recentDirectories.length}</span>
        {/if}
      </div>
    </div>

    <div class="bds-options-list" style="max-height: 190px; margin-bottom: 12px;">
      {#if recentDirectories && recentDirectories.length > 0}
        {#each recentDirectories as dir, idx}
          {@const isSelected = activeDirectory === dir.name || (manualPath && dir.path && manualPath.toLowerCase() === dir.path.toLowerCase())}
          <div
            class="bds-option-item"
            class:selected={isSelected}
            role="button"
            tabindex="0"
            onclick={(e) => handleSelectRecent(dir, e)}
            onkeydown={(e) => e.key === "Enter" && handleSelectRecent(dir, e)}
            title={dir.path || dir.name}
          >
            <div class="bds-option-index">
              {isSelected ? "✓" : idx + 1}
            </div>

            <div class="bds-option-text" style="min-width: 0;">
              <div style="display: flex; align-items: center; gap: 6px;">
                <span style="font-weight: 500; font-size: 13px; text-overflow: ellipsis; overflow: hidden; white-space: nowrap; color: var(--bds-text-primary);">
                  {dir.name}
                </span>
                {#if dir.fileCount}
                  <span class="bds-file-badge">{dir.fileCount}f</span>
                {/if}
              </div>
              {#if dir.path}
                <div class="bds-path-subtext" title={dir.path}>{dir.path}</div>
              {/if}
            </div>

            <button
              type="button"
              class="bds-remove-btn"
              title="Remove from history"
              onclick={(e) => handleRemoveRecent(dir, e)}
            >
              ×
            </button>
          </div>
        {/each}
      {:else}
        <div style="padding: 16px; text-align: center; font-size: 12px; color: var(--bds-text-tertiary);">
          No recent codebases yet. Link a local folder to start.
        </div>
      {/if}
    </div>

    <!-- FOOTER STATUS (DRAWER TIP BAR PATTERN) -->
    <div class="bds-tip-bar" style="margin: 0; padding-top: 6px; border-top: 1px solid var(--bds-border); justify-content: space-between;">
      <div style="display: flex; align-items: center; gap: 6px;">
        <span class="bds-status-dot" class:online={harnessStatus === 'enhanced'}></span>
        <span style="font-size: 11px;">
          {#if harnessStatus === 'enhanced'}
            Harness Bridge Connected (Auto SSE)
          {:else}
            Harness Fallback Mode
          {/if}
        </span>
      </div>
      <span style="font-size: 10px; color: var(--bds-text-tertiary);">v0.1.12</span>
    </div>
  </div>
{/if}

<style>
  :global(.bds-deep-code-mount) {
    display: contents !important;
  }

  .bds-deep-code-toggle {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    flex: 0 0 auto;
    cursor: pointer;
    user-select: none;
    transition: all var(--bds-transition, 0.18s ease);
  }

  .bds-deep-code-toggle:focus,
  .bds-deep-code-toggle:focus-visible {
    outline: none !important;
  }

  .bds-toggle-label {
    max-width: 140px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: inline-block;
  }

  .bds-toggle-chevron {
    font-size: 10px;
    opacity: 0.6;
    margin-left: -2px;
  }

  .bds-deep-code-toggle :global(svg) {
    display: block;
  }

  /* ─── FLOATING DRAWER PANEL (QUESTION PANEL & DRAWER DESIGN TOKENS) ─── */
  .bds-dc-panel {
    position: fixed;
    width: 360px;
    background: var(--bds-bg-panel, #1e1f23);
    border: 1px solid var(--bds-border, #3a3b3f);
    border-radius: var(--bds-radius, 14px);
    box-shadow: var(--bds-shadow, 0 12px 32px rgba(0, 0, 0, 0.45));
    color: var(--bds-text-primary, #ececec);
    padding: 16px;
    z-index: 999999;
    font-family: inherit;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    animation: bds-panel-in 0.18s cubic-bezier(0.16, 1, 0.3, 1);
  }

  @keyframes bds-panel-in {
    from {
      opacity: 0;
      transform: translateY(6px) scale(0.98);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  .bds-dc-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }

  .bds-dc-title-group {
    display: flex;
    align-items: center;
  }

  /* ─── SWITCH (DRAWER SETTINGS STYLE) ─── */
  .bds-switch {
    position: relative;
    width: 36px;
    height: 20px;
    background: var(--bds-bg-hover, #3a3b3f);
    border: none;
    border-radius: 20px;
    cursor: pointer;
    padding: 2px;
    transition: background-color var(--bds-transition, 0.2s);
    flex-shrink: 0;
  }

  .bds-switch--on {
    background: var(--bds-accent, #4d6bfe);
  }

  .bds-switch-handle {
    display: block;
    width: 16px;
    height: 16px;
    background: #ffffff;
    border-radius: 50%;
    transition: transform var(--bds-transition, 0.2s);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  }

  .bds-switch--on .bds-switch-handle {
    transform: translateX(16px);
  }

  /* ─── OPTIONS / RECENTS LIST (QUESTION PANEL PATTERN) ─── */
  .bds-options-list {
    display: flex;
    flex-direction: column;
    background: var(--bds-bg-elevated, #2a2b30);
    border: 1px solid var(--bds-border, #3a3b3f);
    border-radius: var(--bds-radius, 12px);
    overflow-y: auto;
    overflow-x: hidden;
  }

  .bds-options-list::-webkit-scrollbar {
    width: 4px;
  }
  .bds-options-list::-webkit-scrollbar-thumb {
    background: var(--bds-bg-hover, rgba(255, 255, 255, 0.1));
    border-radius: 4px;
  }

  .bds-option-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    background: transparent;
    border: none;
    border-bottom: 1px solid var(--bds-border, #3a3b3f);
    color: var(--bds-text-primary, #ececec);
    font-size: 13px;
    text-align: left;
    cursor: pointer;
    transition: all var(--bds-transition, 0.15s);
    width: 100%;
    box-sizing: border-box;
    user-select: none;
  }

  .bds-option-item:last-child {
    border-bottom: none;
  }

  .bds-option-item:hover {
    background: var(--bds-bg-hover, rgba(255, 255, 255, 0.06));
  }

  .bds-option-item.selected {
    background: var(--bds-accent-glow, rgba(77, 107, 254, 0.12));
  }

  .bds-option-index {
    background: var(--bds-bg-hover, rgba(255, 255, 255, 0.08));
    color: var(--bds-text-secondary, #8e8ea0);
    width: 22px;
    height: 22px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 600;
    flex-shrink: 0;
  }

  .bds-option-item.selected .bds-option-index {
    background: var(--bds-accent, #4d6bfe);
    color: #ffffff;
  }

  .bds-file-badge {
    font-size: 10px;
    background: var(--bds-bg-hover, rgba(255, 255, 255, 0.08));
    color: var(--bds-text-secondary, #8e8ea0);
    padding: 1px 5px;
    border-radius: 4px;
  }

  .bds-path-subtext {
    font-size: 10.5px;
    color: var(--bds-text-tertiary, #6b6b7b);
    font-family: monospace;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-top: 2px;
  }

  .bds-remove-btn {
    opacity: 0;
    background: transparent;
    border: none;
    color: var(--bds-text-tertiary, #6b6b7b);
    font-size: 15px;
    cursor: pointer;
    padding: 0 4px;
    border-radius: 4px;
    transition: all 0.15s;
    line-height: 1;
  }

  .bds-option-item:hover .bds-remove-btn {
    opacity: 0.7;
  }

  .bds-remove-btn:hover {
    opacity: 1 !important;
    color: #f87171;
    background: rgba(239, 68, 68, 0.15);
  }

  .bds-status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #f59e0b;
    flex-shrink: 0;
  }

  .bds-status-dot.online {
    background: #10b981;
  }

  @media (max-width: 560px) {
    .bds-deep-code-toggle span._6dbc175 {
      display: none !important;
    }
  }
</style>
