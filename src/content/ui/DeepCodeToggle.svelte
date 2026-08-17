<script>
  import { onMount } from "svelte";
  import appState from "../state.js";
  import {
    setDeepCodeEnabled,
    toggleDeepCodeEnabled,
    selectRecentDirectory,
    removeRecentDirectory,
    isDeepCodeOnboarded,
    markDeepCodeOnboarded,
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
  let showOnboarding = $state(false);
  let onboarded = $state(true);
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
    if (!localEnabled) return t("deepCodeToggle.label");
    const dir =
      activeDirectory ||
      (manualPath ? manualPath.split(/[/\\]/).filter(Boolean).pop() : "");
    if (!dir) return t("deepCodeToggle.labelActive");
    const cleanDir = dir.length > 18 ? dir.slice(0, 16) + "…" : dir;
    return t("deepCodeToggle.labelWithDir", { dir: cleanDir });
  });

  async function checkHarnessStatus() {
    try {
      const mode = await bridge.detectMode(1000);
      harnessStatus = mode === "enhanced" ? "enhanced" : "fallback";
    } catch {
      harnessStatus = "fallback";
    }
  }

  onMount(() => {
    void Promise.resolve(isDeepCodeOnboarded?.())
      .then((done) => {
        if (typeof done === "boolean") onboarded = done;
      })
      .catch(() => {
        onboarded = true;
      });

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

    const handleClickOutside = (e) => {
      if (
        isOpen &&
        menuRef &&
        !menuRef.contains(e.target) &&
        buttonRef &&
        !buttonRef.contains(e.target)
      ) {
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

    let left = rect.left;
    if (left + menuWidth > window.innerWidth - 10) {
      left = window.innerWidth - menuWidth - 10;
    }
    if (left < 10) {
      left = 10;
    }

    if (rect.top >= 320) {
      const bottom = window.innerHeight - rect.top + margin;
      dropdownStyle = `bottom: ${bottom}px; left: ${Math.max(10, left)}px; top: auto;`;
    } else {
      const top = rect.bottom + margin;
      dropdownStyle = `top: ${top}px; left: ${Math.max(10, left)}px; bottom: auto;`;
    }
  }

  function handleButtonClick(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (!onboarded) {
      showOnboarding = true;
      return;
    }
    isOpen = !isOpen;
    if (isOpen) {
      updateDropdownPosition();
      void checkHarnessStatus();
    }
  }

  async function handleOnboardingGotIt() {
    await markDeepCodeOnboarded();
    onboarded = true;
    showOnboarding = false;
    isOpen = true;
    updateDropdownPosition();
    void checkHarnessStatus();
  }

  function handleOnboardingDismiss() {
    showOnboarding = false;
    isOpen = false;
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
    setTimeout(() => {
      actionFeedback = "";
    }, 3500);
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
  aria-label={t("deepCodeToggle.ariaLabel")}
  class="bds-deep-code-toggle f79352dc ds-toggle-button ds-toggle-button--m"
  class:ds-toggle-button--selected={localEnabled}
  class:bds-deep-code-toggle--selected={localEnabled}
  style="transform: translateZ(0px);"
  onclick={handleButtonClick}
  onkeydown={(e) =>
    (e.key === "Enter" || e.key === " ") && handleButtonClick(e)}
  data-testid="deep-code-toggle"
  title={manualPath
    ? t("deepCodeToggle.titleActive", { path: manualPath })
    : t("deepCodeToggle.titleDefault")}
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
  <span class="bds-toggle-chevron" class:bds-toggle-chevron--open={isOpen}>
    <svg
      width="10"
      height="10"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M4 6L8 10L12 6"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  </span>
  <div class="ds-focus-ring" style="--dsl-focus-ring-offset: -1px;"></div>
</div>

<!-- ONBOARDING POPUP -->
{#if showOnboarding}
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="bds-onboarding-backdrop"
    role="dialog"
    tabindex="-1"
    aria-modal="true"
    aria-label={t("deepCodeOnboarding.title")}
    onclick={handleOnboardingDismiss}
    onkeydown={(e) => e.key === "Escape" && handleOnboardingDismiss()}
  >
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="bds-onboarding-card" onclick={(e) => e.stopPropagation()}>
      <div class="bds-onboarding-header">
        <div class="bds-onboarding-title-group">
          <span
            class="bds-icon-inline"
            style="color: var(--bds-accent, #4d6bfe); margin-right: 6px;"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M5.75 4.75L2.5 8L5.75 11.25M10.25 4.75L13.5 8L10.25 11.25M8.5 3.5L7.5 12.5"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </span>
          <h3 class="bds-onboarding-title">{t("deepCodeOnboarding.title")}</h3>
        </div>
        <button
          id="bds-close"
          type="button"
          class="bds-close-btn"
          onclick={handleOnboardingDismiss}
          aria-label={t("deepCodeOnboarding.closeAria")}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M14.1871 13.1265L13.1265 14.1872L1.81275 2.87347L2.87341 1.81281L14.1871 13.1265Z"
              fill="currentColor"
            ></path>
            <path
              d="M13.1265 1.81282L14.1871 2.87348L2.8734 14.1872L1.81274 13.1265L13.1265 1.81282Z"
              fill="currentColor"
            ></path>
          </svg>
        </button>
      </div>

      <div class="bds-onboarding-body">
        <p class="bds-onboarding-paragraph">
          {@html t("deepCodeOnboarding.harnessIntro")}
        </p>
        <p class="bds-onboarding-paragraph">
          <a
            href="https://github.com/deepseek-ai/deepseek-harness"
            target="_blank"
            rel="noopener noreferrer"
            class="bds-onboarding-link">{t("deepCodeOnboarding.harnessLink")}</a
          >
        </p>
        <p class="bds-onboarding-paragraph">
          {@html t("deepCodeOnboarding.pluginInfo")}
        </p>
        <p class="bds-onboarding-paragraph">
          <a
            href="https://github.com/EdgeTypE/dsh-better-deepseek"
            target="_blank"
            rel="noopener noreferrer"
            class="bds-onboarding-link">{t("deepCodeOnboarding.pluginLink")}</a
          >
        </p>
      </div>

      <div class="bds-onboarding-footer">
        <button
          type="button"
          class="bds-btn bds-onboarding-got-it"
          onclick={handleOnboardingGotIt}
          >{t("deepCodeOnboarding.gotIt")}</button
        >
      </div>
    </div>
  </div>
{/if}

<!-- FLOATING DROPDOWN PANEL -->
{#if isOpen}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    bind:this={menuRef}
    class="bds-dc-panel"
    role="presentation"
    style={dropdownStyle}
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => e.stopPropagation()}
  >
    <!-- HEADER -->
    <div class="bds-dc-header">
      <div class="bds-dc-title-group">
        <span
          class="bds-icon-inline"
          style="color: var(--bds-accent, #4d6bfe); margin-right: 6px;"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M5.75 4.75L2.5 8L5.75 11.25M10.25 4.75L13.5 8L10.25 11.25M8.5 3.5L7.5 12.5"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </span>
        <h3 class="bds-dc-title">{t("deepCodeToggle.panelTitle")}</h3>
      </div>

      <button
        id="bds-close"
        type="button"
        class="bds-close-btn"
        onclick={() => (isOpen = false)}
        aria-label={t("deepCodeToggle.closeAria")}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M14.1871 13.1265L13.1265 14.1872L1.81275 2.87347L2.87341 1.81281L14.1871 13.1265Z"
            fill="currentColor"
          ></path>
          <path
            d="M13.1265 1.81282L14.1871 2.87348L2.8734 14.1872L1.81274 13.1265L13.1265 1.81282Z"
            fill="currentColor"
          ></path>
        </svg>
      </button>
    </div>

    <!-- SETTING TOGGLE ROW -->
    <div class="bds-toggle-row">
      <div class="bds-toggle-row-info">
        <span class="bds-label">{t("deepCodeToggle.integrationTitle")}</span>
        <p class="bds-toggle-row-desc">
          {t("deepCodeToggle.integrationDesc")}
        </p>
      </div>
      <button
        type="button"
        class="bds-switch"
        class:bds-switch--on={localEnabled}
        onclick={handleToggleSwitch}
        title={localEnabled
          ? t("deepCodeToggle.disableToggle")
          : t("deepCodeToggle.enableToggle")}
      >
        <span class="bds-switch-handle"></span>
      </button>
    </div>

    <!-- PRIMARY ACTION: ADD NEW DIRECTORY -->
    <div class="bds-add-section">
      <button
        type="button"
        class="bds-add-btn"
        onclick={handleAddMenuToggle}
        aria-expanded={showAddPopup}
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M12 5v14M5 12h14"></path>
        </svg>
        <span>{t("deepCodeModal.addNewDirectory")}</span>
      </button>
      {#if actionFeedback}
        <p class="bds-action-feedback">
          {actionFeedback}
        </p>
      {/if}
    </div>

    <AddDirectoryModal
      show={showAddPopup}
      {activeDirectory}
      {fileCount}
      onclose={() => (showAddPopup = false)}
    />

    <!-- RECENT CODEBASES LIST -->
    <div class="bds-section-title">
      <span>{t("deepCodeToggle.recentTitle")}</span>
      {#if recentDirectories.length > 0}
        <span class="bds-section-count">{recentDirectories.length}</span>
      {/if}
    </div>

    <div class="bds-options-list">
      {#if recentDirectories && recentDirectories.length > 0}
        {#each recentDirectories as dir, idx}
          {@const isSelected =
            activeDirectory === dir.name ||
            (manualPath &&
              dir.path &&
              manualPath.toLowerCase() === dir.path.toLowerCase())}
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

            <div class="bds-option-text">
              <div class="bds-option-name-row">
                <span class="bds-option-name">
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
              title={t("deepCodeToggle.removeHistory")}
              onclick={(e) => handleRemoveRecent(dir, e)}
            >
              ×
            </button>
          </div>
        {/each}
      {:else}
        <div class="bds-empty-recents">
          {t("deepCodeToggle.emptyRecents")}
        </div>
      {/if}
    </div>

    <!-- FOOTER STATUS -->
    <div class="bds-dc-footer">
      <div class="bds-dc-status">
        <span class="bds-status-dot" class:online={harnessStatus === "enhanced"}
        ></span>
        <span class="bds-status-text">
          {#if harnessStatus === "enhanced"}
            {t("deepCodeToggle.statusEnhanced")}
          {:else}
            {t("deepCodeToggle.statusFallback")}
          {/if}
        </span>
      </div>
      <span class="bds-dc-version">v0.1.13</span>
    </div>
  </div>
{/if}

<style>
  :global(.bds-deep-code-mount) {
    display: contents !important;
  }

  /* ─── ONBOARDING POPUP ─── */
  .bds-onboarding-backdrop {
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

  .bds-onboarding-card {
    width: min(92vw, 440px);
    border: 1px solid var(--bds-border, #3a3b3f);
    border-radius: var(--bds-radius, 14px);
    background: var(--bds-bg-panel, #1e1f23);
    box-shadow: var(--bds-shadow, 0 12px 32px rgba(0, 0, 0, 0.45));
    color: var(--bds-text-primary, #ececec);
    padding: 24px;
    display: flex;
    flex-direction: column;
    max-height: 82vh;
    box-sizing: border-box;
    font-family: inherit;
  }

  .bds-onboarding-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
  }

  .bds-onboarding-title-group {
    display: flex;
    align-items: center;
  }

  .bds-onboarding-title {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    line-height: 1.2;
    color: var(--bds-text-primary, #ececec);
  }

  .bds-onboarding-body {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .bds-onboarding-paragraph {
    margin: 0;
    font-size: 13px;
    line-height: 1.55;
    color: var(--bds-text-secondary, #b0b0bf);
  }

  .bds-onboarding-link {
    color: var(--bds-accent, #4d6bfe);
    text-decoration: underline;
    font-weight: 500;
    word-break: break-all;
  }

  .bds-onboarding-footer {
    display: flex;
    justify-content: flex-end;
    margin-top: 20px;
  }

  .bds-onboarding-got-it {
    padding: 8px 20px;
    font-size: 13px;
    font-weight: 600;
    border-radius: 8px;
    background: var(--bds-accent, #4d6bfe);
    color: #ffffff;
    border: none;
    cursor: pointer;
    transition: opacity var(--bds-transition, 0.18s ease);
  }

  .bds-onboarding-got-it:hover {
    opacity: 0.9;
  }

  /* ─── TOGGLE BUTTON (TOOLBAR) ─── */
  .bds-deep-code-toggle {
    position: relative;
    display: inline-flex;
    align-items: center;
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
    display: inline-flex;
    align-items: center;
    line-height: inherit;
    vertical-align: middle;
  }

  .bds-toggle-chevron {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-left: 2px;
    opacity: 0.65;
    transition:
      transform 0.2s ease,
      opacity 0.2s ease;
    line-height: 1;
  }

  .bds-toggle-chevron--open {
    transform: rotate(180deg);
    opacity: 1;
  }

  .bds-deep-code-toggle :global(svg) {
    display: block;
  }

  .bds-icon-inline {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  /* ─── CLOSE BUTTON ─── */
  .bds-close-btn {
    background: transparent;
    border: none;
    color: var(--bds-text-tertiary, #6b6b7b);
    cursor: pointer;
    padding: 4px;
    border-radius: 6px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: all var(--bds-transition, 0.15s ease);
    line-height: 1;
  }

  .bds-close-btn:hover {
    background: var(--bds-bg-hover, rgba(255, 255, 255, 0.08));
    color: var(--bds-text-primary, #ececec);
  }

  /* ─── FLOATING DRAWER PANEL ─── */
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

  @keyframes bds-modal-in {
    from {
      opacity: 0;
      transform: scale(0.98);
    }
    to {
      opacity: 1;
      transform: scale(1);
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

  .bds-dc-title {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    line-height: 1.2;
    color: var(--bds-text-primary, #ececec);
  }

  /* ─── TOGGLE ROW ─── */
  .bds-toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 0 12px;
    gap: 12px;
    border-bottom: 1px solid var(--bds-border, #3a3b3f);
  }

  .bds-toggle-row-info {
    flex: 1;
    min-width: 0;
  }

  .bds-label {
    display: block;
    font-size: 13px;
    font-weight: 600;
    color: var(--bds-text-primary, #ececec);
    line-height: 1.3;
  }

  .bds-toggle-row-desc {
    font-size: 11px;
    color: var(--bds-text-tertiary, #8e8ea0);
    margin: 2px 0 0;
    line-height: 1.35;
  }

  /* ─── SWITCH ─── */
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

  /* ─── ADD DIRECTORY SECTION & BUTTON ─── */
  .bds-add-section {
    margin: 12px 0;
  }

  .bds-add-btn {
    width: 100%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 9px 16px;
    font-size: 13px;
    font-weight: 600;
    border-radius: 8px;
    background: var(--bds-accent, #4d6bfe);
    color: #ffffff;
    border: none;
    cursor: pointer;
    transition: all var(--bds-transition, 0.18s ease);
    box-sizing: border-box;
  }

  .bds-add-btn:hover {
    opacity: 0.92;
    transform: translateY(-1px);
  }

  .bds-add-btn svg {
    flex-shrink: 0;
  }

  .bds-action-feedback {
    font-size: 11px;
    color: var(--bds-accent, #4d6bfe);
    margin: 6px 0 0;
    text-align: center;
  }

  /* ─── SECTION HEADER ─── */
  .bds-section-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    margin: 0 0 6px;
    font-size: 11px;
    font-weight: 600;
    color: var(--bds-text-secondary, #8e8ea0);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .bds-section-count {
    font-size: 11px;
    color: var(--bds-text-tertiary, #6b6b7b);
    font-weight: normal;
  }

  /* ─── OPTIONS / RECENTS LIST ─── */
  .bds-options-list {
    display: flex;
    flex-direction: column;
    background: var(--bds-bg-elevated, #2a2b30);
    border: 1px solid var(--bds-border, #3a3b3f);
    border-radius: var(--bds-radius, 12px);
    max-height: 190px;
    overflow-y: auto;
    overflow-x: hidden;
    margin-bottom: 12px;
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

  .bds-option-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  .bds-option-name-row {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .bds-option-name {
    font-weight: 500;
    font-size: 13px;
    text-overflow: ellipsis;
    overflow: hidden;
    white-space: nowrap;
    color: var(--bds-text-primary, #ececec);
  }

  .bds-file-badge {
    font-size: 10px;
    background: var(--bds-bg-hover, rgba(255, 255, 255, 0.08));
    color: var(--bds-text-secondary, #8e8ea0);
    padding: 1px 5px;
    border-radius: 4px;
    flex-shrink: 0;
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
    padding: 0;
    width: 22px;
    height: 22px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: all 0.15s;
    line-height: 1;
    flex-shrink: 0;
    margin-left: auto;
  }

  .bds-option-item:hover .bds-remove-btn {
    opacity: 0.7;
  }

  .bds-remove-btn:hover {
    opacity: 1 !important;
    color: #f87171;
    background: rgba(239, 68, 68, 0.15);
  }

  .bds-empty-recents {
    padding: 16px;
    text-align: center;
    font-size: 12px;
    color: var(--bds-text-tertiary, #6b6b7b);
  }

  /* ─── FOOTER ─── */
  .bds-dc-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: auto;
    padding-top: 8px;
    border-top: 1px solid var(--bds-border, #3a3b3f);
  }

  .bds-dc-status {
    display: flex;
    align-items: center;
    gap: 6px;
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

  .bds-status-text {
    font-size: 11px;
    color: var(--bds-text-secondary, #8e8ea0);
    line-height: 1;
  }

  .bds-dc-version {
    font-size: 10px;
    color: var(--bds-text-tertiary, #6b6b7b);
  }

  @media (max-width: 560px) {
    .bds-deep-code-toggle span._6dbc175 {
      display: none !important;
    }
  }
</style>
