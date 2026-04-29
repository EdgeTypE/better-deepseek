<script>
  import { onMount } from "svelte";
  import appState from "../state.js";
  import {
    getFilesForProject,
    setActiveProject,
    clearActiveProject,
    tickFile,
    untickFile,
  } from "../project-manager.js";
  import { pushConfigToPage } from "../bridge.js";
  import { projectFilesToFile } from "../files/project-file-builder.js";

  /** @type {{ nativeInput: HTMLInputElement }} */
  let { nativeInput } = $props();

  let projects = $state([...appState.projects]);
  let activeProjectId = $state(appState.activeProjectId || "");
  let files = $state([]);
  let tickedIds = $state([...appState.activeFileIds]);

  let pendingId = $state(null);
  let showConfirm = $state(false);

  export function refresh() {
    projects = [...appState.projects];
    activeProjectId = appState.activeProjectId || "";
    files = activeProjectId ? getFilesForProject(activeProjectId) : [];
    tickedIds = [...appState.activeFileIds];
  }

  $effect(() => {
    refresh();
  });

  onMount(() => {
    appState.heroBarRef = { refresh };
    return () => {
      if (appState.heroBarRef?.refresh === refresh) {
        appState.heroBarRef = null;
      }
    };
  });

  function hasMessages() {
    return document.querySelectorAll("div.ds-message").length > 0;
  }

  function handleProjectChange(e) {
    const newId = e.target.value || "";
    if (hasMessages() && newId !== activeProjectId) {
      pendingId = newId;
      showConfirm = true;
      e.target.value = activeProjectId;
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
    activeProjectId = appState.activeProjectId || "";
    files = activeProjectId ? getFilesForProject(activeProjectId) : [];
    tickedIds = [...appState.activeFileIds];
    pushConfigToPage();
    if (appState.ui) appState.ui.refreshProjects();
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

  function handleFileToggle(fileId, checked) {
    if (checked) tickFile(fileId);
    else untickFile(fileId);
    tickedIds = [...appState.activeFileIds];
    pushConfigToPage();
  }

  function attachFiles() {
    if (!nativeInput || !tickedIds.length) return;
    const activeFiles = files.filter((f) => tickedIds.includes(f.id));
    if (!activeFiles.length) return;
    const activeProject = projects.find((p) => p.id === activeProjectId);
    const file = projectFilesToFile(activeFiles, activeProject?.name || "Project");
    if (!file) return;

    const dt = new DataTransfer();
    if (nativeInput.files) {
      for (let i = 0; i < nativeInput.files.length; i++) {
        dt.items.add(nativeInput.files[i]);
      }
    }
    dt.items.add(file);
    nativeInput.files = dt.files;
    nativeInput.dispatchEvent(new Event("change", { bubbles: true }));

    window.dispatchEvent(
      new CustomEvent("bds:fileAttached", {
        detail: { name: file.name, size: file.size, source: "project" },
      })
    );
  }

  let tickedCount = $derived(tickedIds.length);
</script>

{#if projects.length > 0}
  <div class="bds-hero-bar">
    <div class="bds-hero-project">
      <span class="bds-hero-label">Project</span>
      <select
        class="bds-hero-select"
        value={activeProjectId}
        onchange={handleProjectChange}
      >
        <option value="">None</option>
        {#each projects as p (p.id)}
          <option value={p.id}>{p.name}</option>
        {/each}
      </select>
    </div>

    {#if activeProjectId && files.length > 0}
      <div class="bds-hero-files">
        {#each files as file (file.id)}
          <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <label
            class="bds-hero-pill {tickedIds.includes(file.id) ? 'bds-hero-pill--active' : ''}"
            title={file.name}
          >
            <input
              type="checkbox"
              class="bds-sr-only"
              checked={tickedIds.includes(file.id)}
              onchange={(e) => handleFileToggle(file.id, e.target.checked)}
            />
            <span class="bds-hero-pill-name"
              >{file.name.split("/").pop()}</span
            >
          </label>
        {/each}
      </div>

      {#if tickedCount > 0}
        <button
          type="button"
          class="bds-hero-attach"
          onclick={attachFiles}
          title="Attach {tickedCount} selected file{tickedCount !== 1 ? 's' : ''} to chat as a file"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path
              d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"
            />
          </svg>
          Attach ({tickedCount})
        </button>
      {/if}
    {:else if activeProjectId && files.length === 0}
      <span class="bds-hero-empty">No files — add via Manage Projects</span>
    {/if}

    {#if showConfirm}
      <div class="bds-hero-confirm">
        <span class="bds-hero-confirm-text"
          >Switch project? Context applies to new chats.</span
        >
        <button type="button" class="bds-hero-confirm-cancel" onclick={cancelSwitch}
          >Cancel</button
        >
        <button type="button" class="bds-hero-confirm-ok" onclick={confirmSwitch}
          >Switch</button
        >
      </div>
    {/if}
  </div>
{/if}

<style>
  .bds-hero-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 12px;
    background: var(--dsw-color-bg-elevated, rgba(0, 0, 0, 0.04));
    border-top: 1px solid var(--dsw-color-border-primary, rgba(0, 0, 0, 0.08));
    flex-wrap: wrap;
    font-size: 12px;
    min-height: 32px;
  }

  .bds-hero-label {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    opacity: 0.45;
    flex-shrink: 0;
  }

  .bds-hero-project {
    display: flex;
    align-items: center;
    gap: 5px;
    flex-shrink: 0;
  }

  .bds-hero-select {
    background: transparent;
    border: 1px solid var(--dsw-color-border-primary, #3d3d3d);
    border-radius: 5px;
    color: var(--dsw-alias-text, #e0e0e0);
    font-size: 12px;
    padding: 2px 6px;
    cursor: pointer;
    max-width: 150px;
    outline: none;
  }

  .bds-hero-select:focus {
    border-color: var(--dsw-alias-brand-text, #4d6bfe);
  }

  .bds-hero-files {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    flex: 1;
    min-width: 0;
  }

  .bds-hero-pill {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 2px 8px;
    border-radius: 20px;
    border: 1px solid var(--dsw-color-border-primary, #3d3d3d);
    background: transparent;
    color: var(--dsw-alias-text, #ccc);
    cursor: pointer;
    font-size: 11px;
    opacity: 0.55;
    transition: all 0.15s ease;
    user-select: none;
    white-space: nowrap;
  }

  .bds-hero-pill:hover {
    opacity: 0.85;
  }

  .bds-hero-pill--active {
    border-color: var(--dsw-alias-brand-text, #4d6bfe);
    background: rgba(77, 107, 254, 0.12);
    color: var(--dsw-alias-brand-text, #4d6bfe);
    opacity: 1;
  }

  .bds-sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    border: 0;
  }

  .bds-hero-pill-name {
    max-width: 110px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .bds-hero-attach {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 10px;
    background: var(--dsw-alias-brand-text, #4d6bfe);
    color: #fff;
    border: none;
    border-radius: 5px;
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
    flex-shrink: 0;
    transition: background 0.15s ease;
  }

  .bds-hero-attach:hover {
    background: #3d5bde;
  }

  .bds-hero-empty {
    font-size: 11px;
    opacity: 0.4;
    font-style: italic;
  }

  .bds-hero-confirm {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .bds-hero-confirm-text {
    font-size: 11px;
    opacity: 0.7;
  }

  .bds-hero-confirm-cancel,
  .bds-hero-confirm-ok {
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 4px;
    border: 1px solid var(--dsw-color-border-primary, #3d3d3d);
    cursor: pointer;
    font-weight: 500;
  }

  .bds-hero-confirm-cancel {
    background: transparent;
    color: var(--dsw-alias-text, #ccc);
  }

  .bds-hero-confirm-ok {
    background: var(--dsw-alias-brand-text, #4d6bfe);
    border-color: transparent;
    color: #fff;
  }
</style>
