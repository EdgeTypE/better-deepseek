<script>
  import { onMount } from "svelte";
  import appState from "../state.js";
  import { pushConfigToPage } from "../bridge.js";
  import { STORAGE_KEYS } from "../../lib/constants.js";
  import { t } from "../../lib/i18n.svelte.js";

  let skills = $state([...(appState.skills || [])]);
  let showOnComposer = $state(appState.settings?.showSelectedSkillsOnComposer !== false);
  let activeSkills = $derived(skills.filter((s) => Boolean(s.active)));
  let count = $derived(activeSkills.length);

  let isOpen = $state(false);
  let buttonRef = $state(null);
  let menuRef = $state(null);
  let dropdownStyle = $state("");

  let displayLabel = $derived.by(() => {
    if (count === 1) {
      const name = String(activeSkills[0]?.name || "");
      return name.length > 20 ? name.slice(0, 18) + "…" : name;
    }
    return t("skillChip.activeCount", { count });
  });

  function updateDropdownPosition() {
    if (!buttonRef) return;
    const rect = buttonRef.getBoundingClientRect();
    const bottom = window.innerHeight - rect.top + 8;
    const left = Math.max(10, Math.min(rect.left, window.innerWidth - 300));
    dropdownStyle = `bottom: ${bottom}px; left: ${left}px; top: auto;`;
  }

  function handleChipClick(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (isOpen) {
      isOpen = false;
      return;
    }
    updateDropdownPosition();
    isOpen = true;
  }

  function handleKeydown(event) {
    if (event.key === "Enter" || event.key === " ") {
      handleChipClick(event);
    }
  }

  async function disableSkill(skillId, event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    const skill = appState.skills.find((s) => s.id === skillId);
    if (!skill) return;

    skill.active = false;
    await chrome.storage?.local?.set?.({ [STORAGE_KEYS.skills]: appState.skills });
    skills = [...appState.skills];
    pushConfigToPage();
    window.dispatchEvent(new CustomEvent("bds:skillsChanged"));

    if (appState.ui?.showToast) {
      appState.ui.showToast(t("skillChip.disabledToast", { name: skill.name }));
    }

    if (skills.filter((s) => Boolean(s.active)).length === 0) {
      isOpen = false;
    }
  }

  async function disableAll(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    const previousCount = activeSkills.length;
    for (const skill of appState.skills) {
      skill.active = false;
    }
    await chrome.storage?.local?.set?.({ [STORAGE_KEYS.skills]: appState.skills });
    skills = [...appState.skills];
    pushConfigToPage();
    window.dispatchEvent(new CustomEvent("bds:skillsChanged"));
    isOpen = false;

    if (appState.ui?.showToast) {
      appState.ui.showToast(t("skillChip.allDisabledToast", { count: previousCount }));
    }
  }

  function handleQuickDismiss(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (count === 1) {
      disableSkill(activeSkills[0].id, event);
    } else {
      disableAll(event);
    }
  }

  function openDrawerSkills(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    isOpen = false;
    window.dispatchEvent(new CustomEvent("bds:open-drawer", { detail: { section: "skills" } }));
  }

  onMount(() => {
    const syncSkills = () => {
      skills = [...(appState.skills || [])];
    };

    const syncSettings = () => {
      showOnComposer = appState.settings?.showSelectedSkillsOnComposer !== false;
    };

    const handleStorageChange = (changes, area) => {
      if (area === "local") {
        if (changes[STORAGE_KEYS.skills]) {
          skills = [...(appState.skills || [])];
        }
        if (changes[STORAGE_KEYS.settings]) {
          showOnComposer = appState.settings?.showSelectedSkillsOnComposer !== false;
        }
      }
    };

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

    const handleEscape = (e) => {
      if (isOpen && e.key === "Escape") {
        isOpen = false;
      }
    };

    window.addEventListener("bds:skillsChanged", syncSkills);
    window.addEventListener("bds:settingsChanged", syncSettings);
    window.addEventListener("bds:urlChanged", syncSkills);
    chrome.storage?.onChanged?.addListener(handleStorageChange);
    document.addEventListener("click", handleClickOutside, true);
    document.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("bds:skillsChanged", syncSkills);
      window.removeEventListener("bds:settingsChanged", syncSettings);
      window.removeEventListener("bds:urlChanged", syncSkills);
      chrome.storage?.onChanged?.removeListener?.(handleStorageChange);
      document.removeEventListener("click", handleClickOutside, true);
      document.removeEventListener("keydown", handleEscape);
    };
  });
</script>

{#if showOnComposer && count > 0}
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    bind:this={buttonRef}
    tabindex="0"
    role="button"
    aria-expanded={isOpen}
    aria-label={count === 1 ? t("skillChip.ariaLabelSingle", { name: activeSkills[0].name }) : t("skillChip.ariaLabelMultiple", { count })}
    class="bds-skill-chip f79352dc ds-toggle-button ds-toggle-button--m ds-toggle-button--selected"
    style="transform: translateZ(0px);"
    onclick={handleChipClick}
    onkeydown={handleKeydown}
    data-testid="bds-skill-chip"
    title={count === 1 ? `${activeSkills[0].name}` : t("skillChip.ariaLabelMultiple", { count })}
  >
    <div class="ds-toggle-button__icon">
      <div class="ds-icon" style="font-size: inherit;">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
        </svg>
      </div>
    </div>
    <span class="_6dbc175 bds-chip-label bds-skill-chip-text">{displayLabel}</span>
    {#if count > 1}
      <span class="bds-toggle-chevron" class:bds-toggle-chevron--open={isOpen}>
        <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M4 6L8 10L12 6" />
        </svg>
      </span>
    {/if}
    <button
      type="button"
      class="bds-skill-chip-dismiss"
      onclick={handleQuickDismiss}
      title={count === 1 ? t("skillChip.disableSingle", { name: activeSkills[0].name }) : t("skillChip.disableAll")}
      aria-label={count === 1 ? t("skillChip.disableSingle", { name: activeSkills[0].name }) : t("skillChip.disableAll")}
    >
      <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M2 2L10 10M10 2L2 10" />
      </svg>
    </button>
    <div class="ds-focus-ring" style="--dsl-focus-ring-offset: -1px;"></div>
  </div>

  {#if isOpen}
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      bind:this={menuRef}
      class="bds-skill-panel"
      role="dialog"
      tabindex="-1"
      aria-modal="false"
      style={dropdownStyle}
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
    >
      <div class="bds-skill-panel-header">
        <div class="bds-skill-panel-title">
          <span class="bds-icon-inline" style="color: var(--bds-accent, #4d6bfe); margin-right: 6px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
            </svg>
          </span>
          <h4>{t("skillChip.panelTitle")} ({count})</h4>
        </div>
        <button
          type="button"
          class="bds-close-btn"
          onclick={() => (isOpen = false)}
          aria-label={t("skillChip.closePanel")}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
            <path d="M2 2L10 10M10 2L2 10" />
          </svg>
        </button>
      </div>

      <div class="bds-skill-panel-list">
        {#each activeSkills as skill (skill.id)}
          <div class="bds-skill-panel-item">
            <div class="bds-skill-item-info">
              <span class="bds-skill-item-name" title={skill.name}>{skill.name}</span>
              {#if skill.usage}
                <span class="bds-skill-item-usage" title={skill.usage}>{skill.usage}</span>
              {/if}
            </div>
            <button
              type="button"
              class="bds-skill-item-remove"
              onclick={(e) => disableSkill(skill.id, e)}
              title={t("skillChip.disableSingle", { name: skill.name })}
              aria-label={t("skillChip.disableSingle", { name: skill.name })}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                <path d="M2 2L10 10M10 2L2 10" />
              </svg>
            </button>
          </div>
        {/each}
      </div>

      <div class="bds-skill-panel-footer">
        <button
          type="button"
          class="bds-btn-text bds-btn-danger-text"
          onclick={disableAll}
        >
          {t("skillChip.disableAll")}
        </button>
        <button
          type="button"
          class="bds-btn-text bds-btn-primary-text"
          onclick={openDrawerSkills}
        >
          {t("skillChip.manageInDrawer")}
        </button>
      </div>
    </div>
  {/if}
{/if}

<style>
  :global(.bds-skill-chip-mount) {
    display: contents !important;
  }

  .bds-skill-chip {
    position: relative;
    display: inline-flex;
    align-items: center;
    flex: 0 0 auto;
    cursor: pointer;
    user-select: none;
    transition: all var(--bds-transition, 0.18s ease);
  }

  .bds-skill-chip:focus,
  .bds-skill-chip:focus-visible {
    outline: none !important;
  }

  .bds-skill-chip :global(svg) {
    display: block;
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

  .bds-skill-chip-dismiss {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    margin-left: 5px;
    padding: 0;
    border: none;
    background: transparent;
    color: inherit;
    opacity: 0.6;
    border-radius: 50%;
    cursor: pointer;
    transition:
      opacity 0.15s ease,
      background 0.15s ease,
      transform 0.15s ease;
    line-height: 1;
  }

  .bds-skill-chip-dismiss:hover {
    opacity: 1;
    background: rgba(255, 255, 255, 0.2);
    transform: scale(1.1);
  }

  /* ─── DROPDOWN PANEL ─── */
  .bds-skill-panel {
    position: fixed;
    width: 280px;
    background: var(--bds-bg-panel, #1e1f23);
    border: 1px solid var(--bds-border, #3a3b3f);
    border-radius: var(--bds-radius, 14px);
    box-shadow: var(--bds-shadow, 0 12px 32px rgba(0, 0, 0, 0.45));
    color: var(--bds-text-primary, #ececec);
    padding: 12px 14px;
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

  .bds-skill-panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
    padding-bottom: 6px;
    border-bottom: 1px solid var(--bds-border, #3a3b3f);
  }

  .bds-skill-panel-title {
    display: flex;
    align-items: center;
  }

  .bds-skill-panel-title h4 {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    line-height: 1.2;
    color: var(--bds-text-primary, #ececec);
  }

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

  .bds-skill-panel-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-height: 180px;
    overflow-y: auto;
    margin-bottom: 8px;
  }

  .bds-skill-panel-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 8px;
    border-radius: 8px;
    background: var(--bds-bg-secondary, rgba(255, 255, 255, 0.04));
    transition: background 0.15s ease;
  }

  .bds-skill-panel-item:hover {
    background: var(--bds-bg-hover, rgba(255, 255, 255, 0.08));
  }

  .bds-skill-item-info {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    margin-right: 8px;
  }

  .bds-skill-item-name {
    font-size: 12px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--bds-text-primary, #ececec);
  }

  .bds-skill-item-usage {
    font-size: 10px;
    color: var(--bds-text-tertiary, #8a8a9a);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .bds-skill-item-remove {
    background: transparent;
    border: none;
    color: var(--bds-text-tertiary, #8a8a9a);
    cursor: pointer;
    padding: 3px;
    border-radius: 4px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s ease;
    flex-shrink: 0;
  }

  .bds-skill-item-remove:hover {
    background: rgba(239, 68, 68, 0.15);
    color: #ef4444;
  }

  .bds-skill-panel-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 6px;
    border-top: 1px solid var(--bds-border, #3a3b3f);
  }

  .bds-btn-text {
    background: transparent;
    border: none;
    font-size: 11px;
    cursor: pointer;
    padding: 4px 6px;
    border-radius: 4px;
    transition: all 0.15s ease;
  }

  .bds-btn-danger-text {
    color: #ef4444;
  }

  .bds-btn-danger-text:hover {
    background: rgba(239, 68, 68, 0.15);
  }

  .bds-btn-primary-text {
    color: var(--bds-accent, #4d6bfe);
  }

  .bds-btn-primary-text:hover {
    background: rgba(77, 107, 254, 0.15);
  }

  .bds-icon-inline {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
</style>
