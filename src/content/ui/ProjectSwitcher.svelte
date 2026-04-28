<script>
  import appState from "../state.js";
  import { setActiveProject, clearActiveProject } from "../project-manager.js";
  import { pushConfigToPage } from "../bridge.js";
  import { collectMessageNodes } from "../scanner.js";

  let { onManage } = $props();

  let projects = $state([...appState.projects]);
  let selectedId = $state(appState.activeProjectId || "");

  let pendingId = $state(null);
  let showConfirm = $state(false);

  export function refresh() {
    projects = [...appState.projects];
    selectedId = appState.activeProjectId || "";
  }

  function hasMessages() {
    return collectMessageNodes().some((n) => !n.closest("#bds-root"));
  }

  function handleChange(e) {
    const newId = e.target.value;
    if (hasMessages()) {
      pendingId = newId;
      showConfirm = true;
      e.target.value = selectedId;
    } else {
      applySwitch(newId);
    }
  }

  function applySwitch(id) {
    if (id) {
      setActiveProject(id);
    } else {
      clearActiveProject();
    }
    selectedId = id;
    pushConfigToPage();
  }

  function confirmSwitch() {
    applySwitch(pendingId);
    pendingId = null;
    showConfirm = false;
  }

  function cancelSwitch() {
    pendingId = null;
    showConfirm = false;
  }
</script>

<div class="bds-section-title">
  <div
    style="display: flex; align-items: center; justify-content: space-between; width: 100%;"
  >
    <div style="display: flex; align-items: center;">
      <span class="bds-icon-inline">
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M2 3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3Z"
            fill="currentColor"
            opacity="0.4"
          />
          <path
            d="M2 8a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8Z"
            fill="currentColor"
            opacity="0.6"
          />
          <path
            d="M3 12a1 1 0 0 0 0 2h10a1 1 0 0 0 0-2H3Z"
            fill="currentColor"
          />
        </svg>
      </span>
      Projects
    </div>
    <button
      type="button"
      class="bds-btn-outlined"
      style="font-size: 11px; padding: 3px 8px;"
      onclick={onManage}
    >
      Manage
    </button>
  </div>
</div>

<select class="bds-select" value={selectedId} onchange={handleChange}>
  <option value="">None (global mode)</option>
  {#each projects as project (project.id)}
    <option value={project.id}>{project.name}</option>
  {/each}
</select>

{#if selectedId && projects.find((p) => p.id === selectedId)?.description}
  <p style="font-size: 11px; opacity: 0.6; margin: 4px 0 0; padding: 0 2px;">
    {projects.find((p) => p.id === selectedId).description}
  </p>
{/if}

{#if showConfirm}
  <div class="bds-confirm-box">
    <p class="bds-confirm-text">
      Project context applies only to new conversations. Switch now to
      auto-associate future chats with this project.
    </p>
    <div class="bds-editor-actions">
      <button type="button" class="bds-btn-outlined" onclick={cancelSwitch}
        >Cancel</button
      >
      <button type="button" class="bds-btn" onclick={confirmSwitch}
        >Switch</button
      >
    </div>
  </div>
{/if}

<style>
  .bds-confirm-box {
    background: var(--bds-surface, #f8f8f8);
    border: 1px solid var(--bds-border, #ddd);
    border-radius: 6px;
    padding: 10px 12px;
    margin-top: 8px;
  }
  .bds-confirm-text {
    font-size: 12px;
    margin: 0 0 8px;
    line-height: 1.5;
    opacity: 0.85;
  }
</style>
