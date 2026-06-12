<script>
  import appState from "../state.js";
  import { pushConfigToPage } from "../bridge.js";
  import { STORAGE_KEYS, CSS_PRESETS } from "../../lib/constants.js";
  import { t } from "../../lib/i18n.svelte.js";

  let { isOpen = $bindable(false), onedit } = $props();

  let snippets = $state([...appState.cssSnippets]);

  export function refresh() {
    snippets = [...appState.cssSnippets];
  }

  async function toggleSnippet(snippetId, checked) {
    const snippet = appState.cssSnippets.find((s) => s.id === snippetId);
    if (!snippet) return;

    snippet.active = checked;
    await chrome.storage.local.set({
      [STORAGE_KEYS.cssSnippets]: appState.cssSnippets,
    });
    snippets = [...appState.cssSnippets];
    window.dispatchEvent(new CustomEvent("bds:cssSnippetsChanged"));
    pushConfigToPage();
  }

  async function deleteSnippet(snippetId) {
    const snippet = appState.cssSnippets.find((s) => s.id === snippetId);
    if (!snippet) return;
    if (!appState.settings?.skipDeletionConfirmation) {
      if (!(await appState.ui.showConfirm(`Delete CSS snippet "${snippet.name}"?`))) return;
    }
    const before = appState.cssSnippets.length;
    appState.cssSnippets = appState.cssSnippets.filter((s) => s.id !== snippetId);
    if (appState.cssSnippets.length === before) return;

    await chrome.storage.local.set({
      [STORAGE_KEYS.cssSnippets]: appState.cssSnippets,
    });
    snippets = [...appState.cssSnippets];
    window.dispatchEvent(new CustomEvent("bds:cssSnippetsChanged"));
    pushConfigToPage();

    if (appState.ui) {
      appState.ui.showToast(t("settings.snippetDeleted"));
    }
  }

  async function restorePreset(snippetId) {
    const snippet = appState.cssSnippets.find((s) => s.id === snippetId);
    if (!snippet || !snippet.isPreset) return;

    const originalKey = snippet.name.replace(/^preset/, "");
    const lowerKey = originalKey.charAt(0).toLowerCase() + originalKey.slice(1);
    const originalPreset = CSS_PRESETS[lowerKey];

    if (originalPreset) {
      snippet.css = originalPreset.css;
      await chrome.storage.local.set({
        [STORAGE_KEYS.cssSnippets]: appState.cssSnippets,
      });
      snippets = [...appState.cssSnippets];
      window.dispatchEvent(new CustomEvent("bds:cssSnippetsChanged"));
      pushConfigToPage();

      if (appState.ui) {
        appState.ui.showToast(t("settings.presetRestored"));
      }
    }
  }

  function getSnippetDisplayName(snippet) {
    if (snippet.isPreset) {
      return t("settings." + snippet.name);
    }
    return snippet.name;
  }
</script>

{#if isOpen}
  <div class="bds-snippets-list">
    {#if snippets.length === 0}
      <p class="bds-snippets-empty">{t("settings.noSnippets")}</p>
    {:else}
      {#each snippets as snippet (snippet.id)}
        <div class="bds-snippet-item {snippet.active ? 'bds-snippet-active' : ''}">
          <label class="bds-snippet-label">
            <input
              type="checkbox"
              checked={snippet.active}
              onchange={(e) => toggleSnippet(snippet.id, e.target.checked)}
            />
            <span class="bds-snippet-name">{getSnippetDisplayName(snippet)}</span>
          </label>

          <div class="bds-snippet-actions">
            <button
              type="button"
              class="bds-snippet-btn-action bds-edit-btn"
              onclick={() => onedit?.(snippet.id)}
              title={t("settings.edit")}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
              <span>{t("settings.edit")}</span>
            </button>

            {#if snippet.isPreset}
              <button
                type="button"
                class="bds-snippet-btn-action bds-restore-btn"
                onclick={() => restorePreset(snippet.id)}
                title={t("settings.restore")}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                  <polyline points="3 3 3 8 8 8"/>
                </svg>
                <span>{t("settings.restore")}</span>
              </button>
            {:else}
              <button
                type="button"
                class="bds-snippet-btn-action bds-delete-btn"
                onclick={() => deleteSnippet(snippet.id)}
                title={t("settings.delete")}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                  <line x1="10" y1="11" x2="10" y2="17"/>
                  <line x1="14" y1="11" x2="14" y2="17"/>
                </svg>
                <span>{t("settings.delete")}</span>
              </button>
            {/if}
          </div>
        </div>
      {/each}
    {/if}
  </div>
{/if}

<style>
  .bds-snippets-list {
    border: 1px solid var(--bds-border);
    border-top: none;
    border-bottom-left-radius: 8px;
    border-bottom-right-radius: 8px;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    background: var(--bds-bg-panel);
    max-height: 200px;
    overflow-y: auto;
  }

  .bds-snippets-empty {
    font-size: 11px;
    color: var(--bds-text-tertiary);
    text-align: center;
    padding: 12px;
    margin: 0;
  }

  .bds-snippet-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 10px;
    border-radius: 6px;
    background: var(--bds-bg-elevated);
    border: 1px solid var(--bds-border);
    transition: all var(--bds-transition);
  }

  .bds-snippet-item:hover {
    border-color: var(--bds-border-hover);
  }

  .bds-snippet-active {
    border-color: var(--bds-accent);
    background: var(--bds-accent-glow);
  }

  .bds-snippet-label {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    flex: 1;
    min-width: 0;
    user-select: none;
  }

  .bds-snippet-label input[type="checkbox"] {
    margin: 0;
    cursor: pointer;
    accent-color: var(--bds-accent);
  }

  .bds-snippet-name {
    font-size: 12px;
    font-weight: 500;
    color: var(--bds-text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .bds-snippet-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-left: 8px;
  }

  .bds-snippet-btn-action {
    display: flex;
    align-items: center;
    gap: 4px;
    background: none;
    border: none;
    padding: 3px 6px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 10px;
    font-weight: 600;
    transition: all var(--bds-transition);
  }

  .bds-edit-btn {
    color: var(--bds-text-secondary);
    border: 1px solid var(--bds-border);
  }

  .bds-edit-btn:hover {
    color: var(--bds-accent);
    border-color: var(--bds-accent);
    background: var(--bds-accent-glow);
  }

  .bds-restore-btn {
    color: var(--bds-text-secondary);
    border: 1px solid var(--bds-border);
  }

  .bds-restore-btn:hover {
    color: var(--bds-accent);
    border-color: var(--bds-accent);
    background: var(--bds-accent-glow);
  }

  .bds-delete-btn {
    color: var(--bds-text-secondary);
    border: 1px solid var(--bds-border);
  }

  .bds-delete-btn:hover {
    color: var(--bds-danger);
    border-color: var(--bds-danger);
    background: rgba(239, 68, 68, 0.08);
  }
</style>
