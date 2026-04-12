<script>
  import appState from "../state.js";

  let entries = $state(
    Object.entries(appState.memories).sort((a, b) => a[0].localeCompare(b[0]))
  );

  export function refresh() {
    entries = Object.entries(appState.memories).sort((a, b) =>
      a[0].localeCompare(b[0])
    );
  }
</script>

<h3 class="bds-subtitle">Stored Memory</h3>

<div id="bds-memory-list" class="bds-list">
  {#if entries.length === 0}
    <p class="bds-empty">No memory entries yet.</p>
  {:else}
    {#each entries as [key, item] (key)}
      <div class="bds-memory-item">
        <strong>{key}</strong>
        <span>{item.value}</span>
        <em>{item.importance}</em>
      </div>
    {/each}
  {/if}
</div>
