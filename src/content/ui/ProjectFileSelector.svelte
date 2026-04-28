<script>
  import appState from "../state.js";
  import { getFilesForProject, tickFile, untickFile, isFileTicked } from "../project-manager.js";
  import { pushConfigToPage } from "../bridge.js";

  let files = $state([]);
  let tickedIds = $state([...appState.activeFileIds]);

  export function refresh() {
    if (!appState.activeProjectId) {
      files = [];
      tickedIds = [];
      return;
    }
    files = getFilesForProject(appState.activeProjectId);
    tickedIds = [...appState.activeFileIds];
  }

  $effect(() => {
    refresh();
  });

  function formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  }

  function handleToggle(fileId, checked) {
    if (checked) {
      tickFile(fileId);
    } else {
      untickFile(fileId);
    }
    tickedIds = [...appState.activeFileIds];
    pushConfigToPage();
  }

  let tickedCount = $derived(tickedIds.length);
  let tickedSize = $derived(
    files
      .filter((f) => tickedIds.includes(f.id))
      .reduce((sum, f) => sum + f.size, 0)
  );
</script>

<div class="bds-subsection-title">Project Files</div>

{#if files.length === 0}
  <p class="bds-empty" style="font-size: 11px;">
    No files yet. Add files in <em>Manage Projects</em>.
  </p>
{:else}
  <div class="bds-list">
    {#each files as file (file.id)}
      <div class="bds-skill-item">
        <label style="flex: 1; min-width: 0;">
          <input
            type="checkbox"
            checked={tickedIds.includes(file.id)}
            onchange={(e) => handleToggle(file.id, e.target.checked)}
          />
          <div style="display: flex; flex-direction: column; overflow: hidden; min-width: 0;">
            <span style="text-overflow: ellipsis; overflow: hidden; white-space: nowrap; font-size: 12px;">
              {file.name}
            </span>
            <span style="font-size: 10px; opacity: 0.55;">{formatSize(file.size)}</span>
          </div>
        </label>
      </div>
    {/each}
  </div>

  <p style="font-size: 11px; opacity: 0.6; margin: 4px 0 0; padding: 0 2px;">
    {tickedCount} of {files.length} files active — {formatSize(tickedSize)} of context
  </p>
{/if}
