<script>
  import { t } from "../../lib/i18n.svelte.js";
  import {
    MIN_QUERY_LENGTH,
    downloadSkillMarkdown,
    formatInstalls,
    searchSkills,
  } from "../../lib/skills-sh.js";
  import appState from "../state.js";
  import { STORAGE_KEYS } from "../../lib/constants.js";
  import { makeId } from "../../lib/utils/helpers.js";
  import { pushConfigToPage } from "../bridge.js";

  let { onclose = () => {}, onsaved = () => {} } = $props();

  let query = $state("");
  let results = $state([]);
  let searched = $state(false);
  let searching = $state(false);
  let saving = $state("");
  let saved = $state([]);
  let error = $state("");
  let notice = $state("");

  // The drawer body is a scroll container; portal the dialog to <body> so the
  // fixed backdrop is never clipped. Theme vars live on :root, so they survive.
  function portal(node) {
    document.body.appendChild(node);
    return {
      destroy() {
        if (node.parentNode) node.parentNode.removeChild(node);
      },
    };
  }

  function focusOnMount(node) {
    requestAnimationFrame(() => node.focus());
  }

  $effect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") onclose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  async function handleSearch(event) {
    event?.preventDefault?.();
    const q = query.trim();
    if (q.length < MIN_QUERY_LENGTH) {
      error = t("findSkill.minChars");
      notice = "";
      return;
    }
    searching = true;
    error = "";
    notice = "";
    searched = true;
    try {
      results = await searchSkills(q);
    } catch (err) {
      results = [];
      error = `${t("findSkill.searchFailed")} ${String(err?.message || err)}`;
    } finally {
      searching = false;
    }
  }

  async function handleSave(skill) {
    if (saving) return;
    saving = skill.id;
    error = "";
    notice = "";
    try {
      const content = await downloadSkillMarkdown(skill);
      // Only skills imported by this feature carry sourceId. Matching by name
      // would silently overwrite a user-authored skill that happens to share it.
      const existing = appState.skills.find((item) => item.sourceId === skill.id);
      if (existing) {
        existing.name = skill.name;
        existing.usage = skill.source;
        existing.content = content;
        existing.active = true;
        existing.sourceId = skill.id;
      } else {
        appState.skills.push({
          id: makeId(),
          name: skill.name,
          usage: skill.source,
          content,
          active: true,
          sourceId: skill.id,
        });
      }
      await chrome.storage.local.set({ [STORAGE_KEYS.skills]: appState.skills });
      pushConfigToPage();
      onsaved();
      saved = saved.includes(skill.id) ? saved : [...saved, skill.id];
      notice = t("findSkill.savedNotice", { name: skill.name });
    } catch (err) {
      error = `${t("findSkill.saveFailed")} ${String(err?.message || err)}`;
    } finally {
      saving = "";
    }
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
  class="bds-fs-backdrop"
  use:portal
  role="dialog"
  aria-modal="true"
  aria-label={t("findSkill.title")}
  tabindex="-1"
  onclick={(event) => {
    if (event.target === event.currentTarget) onclose();
  }}
>
  <div class="bds-fs-modal">
    <div class="bds-drawer-header">
      <div class="ds-modal-content__title">{t("findSkill.title")}</div>
      <button
        type="button"
        class="bds-fs-close"
        onclick={onclose}
        aria-label={t("findSkill.closeAria")}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M14.1871 13.1265L13.1265 14.1872L1.81275 2.87347L2.87341 1.81281L14.1871 13.1265Z" fill="currentColor" />
          <path d="M13.1265 1.81282L14.1871 2.87348L2.8734 14.1872L1.81274 13.1265L13.1265 1.81282Z" fill="currentColor" />
        </svg>
      </button>
    </div>

    <p class="bds-fs-subtitle">{t("findSkill.subtitle")}</p>

    <form class="bds-fs-search" onsubmit={handleSearch}>
      <input
        class="bds-input bds-fs-input"
        type="search"
        bind:value={query}
        use:focusOnMount
        placeholder={t("findSkill.placeholder")}
        aria-label={t("findSkill.placeholder")}
      />
      <button class="bds-btn bds-fs-search-btn" type="submit" disabled={searching}>
        {searching ? t("findSkill.searching") : t("findSkill.search")}
      </button>
    </form>

    {#if error}
      <div class="bds-fs-error" role="alert">{error}</div>
    {/if}
    {#if notice}
      <div class="bds-fs-notice" role="status">{notice}</div>
    {/if}

    <div class="bds-fs-results">
      {#if searching}
        <p class="bds-empty">{t("findSkill.searching")}</p>
      {:else if !searched}
        <p class="bds-empty">{t("findSkill.hint")}</p>
      {:else if results.length === 0}
        <p class="bds-empty">{t("findSkill.noResults")}</p>
      {:else}
        {#each results as skill (skill.id)}
          <button
            type="button"
            class="bds-fs-result"
            onclick={() => handleSave(skill)}
            disabled={Boolean(saving)}
            title={t("findSkill.save")}
          >
            <span class="bds-fs-result-main">
              <span class="bds-fs-name">{skill.name}</span>
              <span class="bds-fs-source">{skill.source}</span>
            </span>
            <span class="bds-fs-result-side">
              <span class="bds-fs-installs">
                {t("findSkill.installs", { count: formatInstalls(skill.installs) })}
              </span>
              <span class="bds-fs-action">
                {saving === skill.id
                  ? t("findSkill.saving")
                  : saved.includes(skill.id)
                    ? t("findSkill.saved")
                    : t("findSkill.save")}
              </span>
            </span>
          </button>
        {/each}
      {/if}
    </div>

    <p class="bds-fs-footnote">{t("findSkill.footnote")}</p>
  </div>
</div>

<style>
  .bds-fs-backdrop {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    z-index: 2147483647;
  }

  .bds-fs-modal {
    box-sizing: border-box;
    width: min(92vw, 480px);
    max-height: 82vh;
    display: flex;
    flex-direction: column;
    padding: 24px;
    border: 1px solid var(--bds-border);
    border-radius: var(--bds-radius, 14px);
    background: var(--bds-bg-panel);
    box-shadow: var(--bds-shadow);
    color: var(--bds-text-primary);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
  }

  .bds-fs-modal * {
    box-sizing: border-box;
  }

  .bds-fs-modal .bds-drawer-header {
    margin-bottom: 12px;
  }

  .bds-fs-close {
    border: 0;
    background: transparent;
    color: var(--bds-text-secondary);
    cursor: pointer;
    padding: 4px;
    display: flex;
    align-items: center;
  }

  .bds-fs-close:hover {
    color: var(--bds-text-primary);
  }

  .bds-fs-subtitle {
    margin: 0 0 14px;
    font-size: 12px;
    line-height: 1.45;
    color: var(--bds-text-secondary);
  }

  .bds-fs-search {
    display: flex;
    gap: 8px;
    align-items: stretch;
    flex-shrink: 0;
  }

  .bds-fs-input {
    flex: 1;
    min-width: 0;
  }

  .bds-fs-search-btn {
    flex-shrink: 0;
    min-width: 84px;
  }

  .bds-fs-search-btn:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .bds-fs-error,
  .bds-fs-notice {
    margin-top: 10px;
    padding: 8px 10px;
    border-radius: 8px;
    font-size: 11.5px;
    line-height: 1.4;
    overflow-wrap: anywhere;
  }

  .bds-fs-error {
    background: rgba(239, 68, 68, 0.12);
    color: var(--bds-danger, #ef4444);
  }

  .bds-fs-notice {
    background: var(--bds-accent-glow);
    color: var(--bds-accent);
  }

  .bds-fs-results {
    display: grid;
    gap: 6px;
    margin-top: 12px;
    min-height: 72px;
    max-height: 320px;
    overflow-y: auto;
    align-content: start;
  }

  .bds-fs-result {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    width: 100%;
    padding: 9px 11px;
    border: 1px solid var(--bds-border);
    border-radius: 10px;
    background: var(--bds-bg-elevated);
    color: var(--bds-text-primary);
    text-align: left;
    cursor: pointer;
    font-family: inherit;
    transition: border-color var(--bds-transition);
  }

  .bds-fs-result:hover:not(:disabled) {
    border-color: var(--bds-accent);
  }

  .bds-fs-result:disabled {
    cursor: default;
    opacity: 0.75;
  }

  .bds-fs-result-main {
    display: flex;
    flex-direction: column;
    min-width: 0;
    gap: 2px;
  }

  .bds-fs-name {
    font-size: 12.5px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .bds-fs-source {
    font-size: 10.5px;
    color: var(--bds-text-tertiary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .bds-fs-result-side {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    flex-shrink: 0;
    gap: 2px;
  }

  .bds-fs-installs {
    font-size: 10px;
    color: var(--bds-text-tertiary);
    white-space: nowrap;
  }

  .bds-fs-action {
    font-size: 11px;
    font-weight: 600;
    color: var(--bds-accent);
    white-space: nowrap;
  }

  .bds-fs-footnote {
    margin: 12px 0 0;
    font-size: 10.5px;
    line-height: 1.4;
    color: var(--bds-text-tertiary);
  }
</style>
