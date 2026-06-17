<script>
  let { onmanage } = $props();
  import appState from "../state.js";
  import { t } from "../../lib/i18n.svelte.js";
  import { getActiveProjects, getFilesForActiveProjects } from "../project-manager.js";

  let activeProjects = $derived(getActiveProjects());
  let activeFileCount = $derived(getFilesForActiveProjects(true).length);
</script>

<div class="bds-section-title">
  <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
    <div style="display: flex; align-items: center;">
      <span class="bds-icon-inline">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M2 3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3Z" fill="currentColor" opacity="0.4"/>
          <path d="M2 8a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8Z" fill="currentColor" opacity="0.6"/>
          <path d="M3 12a1 1 0 0 0 0 2h10a1 1 0 0 0 0-2H3Z" fill="currentColor"/>
        </svg>
      </span>
      {t('projectsCard.title')}
    </div>
    <button
      type="button"
      class="bds-btn-outlined"
      style="font-size: 11px; padding: 3px 8px;"
      onclick={onmanage}
    >
      {t('projectsCard.manage')}
    </button>
  </div>
</div>
{#if activeProjects.length > 0}
  <div class="bds-active-projects">
    {#each activeProjects as project (project.id)}
      <span class="bds-active-project-pill">{project.name}</span>
    {/each}
  </div>
  <p class="bds-active-projects-count">
    {t('projectsCard.activeFilesCount', { count: activeFileCount })}
  </p>
{:else}
  <p style="font-size: 11px; opacity: 0.45; margin: 0 0 4px; padding: 0 2px;">
    {t('projectsCard.description')}
  </p>
{/if}

<style>
  .bds-active-projects {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin: 0 0 4px;
    padding: 0 2px;
  }
  .bds-active-project-pill {
    display: inline-flex;
    align-items: center;
    font-size: 10px;
    font-weight: 600;
    color: var(--bds-accent);
    background: var(--bds-accent-glow);
    border: 1px solid var(--bds-accent);
    padding: 1px 6px;
    border-radius: 99px;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .bds-active-projects-count {
    font-size: 10px;
    opacity: 0.5;
    margin: 0 0 4px;
    padding: 0 2px;
  }
</style>
