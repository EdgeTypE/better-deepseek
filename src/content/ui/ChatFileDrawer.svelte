<script>
  import { onMount } from "svelte";

  let isOpen = $state(false);
  /** @type {Array<{name: string, size: number, source: string, attachedAt: number}>} */
  let attachedFiles = $state([]);

  function formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  }

  function formatTime(ts) {
    return new Date(ts).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  onMount(() => {
    function onFileAttached(e) {
      const detail = e.detail || {};
      attachedFiles = [
        ...attachedFiles,
        {
          name: detail.name || "unknown",
          size: detail.size || 0,
          source: detail.source || "upload",
          attachedAt: Date.now(),
        },
      ];
      isOpen = true;
    }

    function onUrlChanged() {
      attachedFiles = [];
    }

    window.addEventListener("bds:fileAttached", onFileAttached);
    window.addEventListener("bds:urlChanged", onUrlChanged);

    return () => {
      window.removeEventListener("bds:fileAttached", onFileAttached);
      window.removeEventListener("bds:urlChanged", onUrlChanged);
    };
  });

  function clearAll() {
    attachedFiles = [];
  }
</script>

<div class="bds-cfd" class:bds-cfd--open={isOpen}>
  {#if isOpen}
    <div class="bds-cfd-panel">
      <div class="bds-cfd-header">
        <span class="bds-cfd-title">Files in Chat</span>
        <button
          type="button"
          class="bds-cfd-clear"
          onclick={clearAll}
          title="Clear list"
        >
          Clear
        </button>
      </div>

      {#if attachedFiles.length === 0}
        <p class="bds-cfd-empty">No files attached yet.</p>
      {:else}
        <div class="bds-cfd-list">
          {#each attachedFiles as f, i (i)}
            <div class="bds-cfd-item">
              <div class="bds-cfd-item-icon">
                {#if f.source === "project"}
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    ><path
                      d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
                    /></svg
                  >
                {:else}
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    ><path
                      d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
                    /><polyline points="14 2 14 8 20 8" /></svg
                  >
                {/if}
              </div>
              <div class="bds-cfd-item-info">
                <div class="bds-cfd-item-name" title={f.name}>{f.name}</div>
                <div class="bds-cfd-item-meta">
                  {formatSize(f.size)} · {formatTime(f.attachedAt)}
                  {#if f.source === "project"}
                    · <span class="bds-cfd-badge">project</span>
                  {/if}
                </div>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  <button
    type="button"
    class="bds-cfd-tab"
    onclick={() => (isOpen = !isOpen)}
    title={isOpen ? "Collapse file panel" : "Show attached files"}
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path
        d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"
      />
    </svg>
    {#if attachedFiles.length > 0}
      <span class="bds-cfd-count">{attachedFiles.length}</span>
    {/if}
  </button>
</div>

<style>
  .bds-cfd {
    position: fixed;
    top: 50%;
    right: 0;
    transform: translateY(-50%);
    display: flex;
    align-items: flex-start;
    z-index: 9997;
    pointer-events: none;
  }

  .bds-cfd > * {
    pointer-events: all;
  }

  .bds-cfd-panel {
    width: 220px;
    max-height: 55vh;
    background: var(--dsw-color-bg-elevated, #1e1e1e);
    border: 1px solid var(--dsw-color-border-primary, #3d3d3d);
    border-right: none;
    border-radius: 10px 0 0 10px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    box-shadow: -4px 0 16px rgba(0, 0, 0, 0.3);
  }

  .bds-cfd-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px 8px;
    border-bottom: 1px solid var(--dsw-color-border-primary, #333);
    flex-shrink: 0;
  }

  .bds-cfd-title {
    font-size: 12px;
    font-weight: 600;
    color: var(--dsw-alias-text, #e0e0e0);
  }

  .bds-cfd-clear {
    background: none;
    border: none;
    font-size: 11px;
    color: var(--dsw-alias-text, #999);
    cursor: pointer;
    padding: 0;
    opacity: 0.6;
  }

  .bds-cfd-clear:hover {
    opacity: 1;
  }

  .bds-cfd-empty {
    font-size: 11px;
    color: var(--dsw-alias-text, #999);
    opacity: 0.5;
    padding: 12px;
    margin: 0;
    text-align: center;
  }

  .bds-cfd-list {
    overflow-y: auto;
    flex: 1;
    padding: 6px 0;
  }

  .bds-cfd-item {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 6px 12px;
  }

  .bds-cfd-item:hover {
    background: var(--dsw-color-bg-hover, rgba(255, 255, 255, 0.04));
  }

  .bds-cfd-item-icon {
    color: var(--dsw-alias-brand-text, #4d6bfe);
    opacity: 0.8;
    flex-shrink: 0;
    margin-top: 1px;
  }

  .bds-cfd-item-info {
    flex: 1;
    min-width: 0;
  }

  .bds-cfd-item-name {
    font-size: 12px;
    color: var(--dsw-alias-text, #e0e0e0);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .bds-cfd-item-meta {
    font-size: 10px;
    color: var(--dsw-alias-text, #999);
    opacity: 0.55;
    margin-top: 2px;
  }

  .bds-cfd-badge {
    background: rgba(77, 107, 254, 0.18);
    color: var(--dsw-alias-brand-text, #4d6bfe);
    border-radius: 3px;
    padding: 0 4px;
    font-size: 9px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .bds-cfd-tab {
    width: 28px;
    padding: 14px 0;
    background: var(--dsw-color-bg-elevated, #1e1e1e);
    border: 1px solid var(--dsw-color-border-primary, #3d3d3d);
    border-right: none;
    border-radius: 8px 0 0 8px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    cursor: pointer;
    color: var(--dsw-alias-text, #ccc);
    box-shadow: -2px 0 8px rgba(0, 0, 0, 0.2);
    transition: background 0.15s ease;
  }

  .bds-cfd--open .bds-cfd-tab {
    border-left: none;
    border-radius: 0;
    box-shadow: none;
  }

  .bds-cfd-tab:hover {
    background: var(--dsw-color-bg-hover, #2a2a2a);
    color: var(--dsw-alias-brand-text, #4d6bfe);
  }

  .bds-cfd-count {
    font-size: 10px;
    font-weight: 700;
    background: var(--dsw-alias-brand-text, #4d6bfe);
    color: #fff;
    border-radius: 10px;
    padding: 1px 5px;
    min-width: 16px;
    text-align: center;
  }
</style>
