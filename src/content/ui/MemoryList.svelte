<script>
  import appState from "../state.js";
  import { STORAGE_KEYS } from "../../lib/constants.js";
  import { normalizeMemories } from "../storage.js";
  import { openNativeFilePicker } from "../files/native-file-input.js";
  import { onMount } from "svelte";
  import { t } from "../../lib/i18n.svelte.js";
  import MemoryImportModal from "./MemoryImport.svelte";

  let entries = $state(
    Object.entries(appState.memories).sort((a, b) => a[0].localeCompare(b[0]))
  );

  const DISPLAY_LIMIT = 5;
  let fileInput = $state(null);
  let showMemoryImport = $state(false);
  let showPopup = $state(false);
  let confirmActive = $state(false);
  let popupRef = $state(null);
  let editingKey = $state(null);
  let editingValue = $state("");
  let editingImportance = $state("called");

  export function refresh() {
    entries = Object.entries(appState.memories).sort((a, b) =>
      a[0].localeCompare(b[0])
    );
  }

  function exportMemories() {
    const data = JSON.stringify(appState.memories, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "bds_memories.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function triggerImport() {
    openNativeFilePicker(fileInput, { preferSingle: true });
  }

  async function handleImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const raw = JSON.parse(e.target.result);
        const normalized = normalizeMemories(raw);

        // This will trigger the storage listener in storage.js, 
        // which updates appState.memories and refreshes the UI.
        await chrome.storage.local.set({
          [STORAGE_KEYS.memories]: normalized,
        });

        if (appState.ui) {
          appState.ui.showToast(t('memoryList.importSuccess'));
        }
      } catch (err) {
        console.error("Import failed:", err);
        if (appState.ui) {
          appState.ui.showToast(t('memoryList.importFailed'));
        }
      }
      event.target.value = "";
    };
    reader.readAsText(file);
  }

  async function deleteMemory(key) {
    if (!appState.settings?.skipDeletionConfirmation) {
      confirmActive = true;
      if (!(await appState.ui.showConfirm(`Delete memory "${key}"?`))) {
        confirmActive = false;
        return;
      }
      confirmActive = false;
    }
    delete appState.memories[key];
    await chrome.storage.local.set({
      [STORAGE_KEYS.memories]: { ...appState.memories },
    });
    if (appState.ui) {
      appState.ui.showToast(t('memoryList.deleted', { key }));
    }
  }

  function startEdit(key, item) {
    editingKey = key;
    editingValue = item.value;
    editingImportance = item.importance;
  }

  function cancelEdit() {
    editingKey = null;
    editingValue = "";
    editingImportance = "called";
  }

  async function saveEdit() {
    if (!editingKey || !editingValue.trim()) return;
    appState.memories[editingKey].value = editingValue.trim();
    appState.memories[editingKey].importance = editingImportance;
    await chrome.storage.local.set({
      [STORAGE_KEYS.memories]: { ...appState.memories },
    });
    if (appState.ui) {
      appState.ui.showToast(t('memoryList.saved', { key: editingKey }));
    }
    cancelEdit();
  }

  function closePopup() {
    showPopup = false;
  }

  function handleKeydown(e) {
    if (e.key === "Escape" && !confirmActive) showPopup = false;
  }

  onMount(() => {
    function handleClick(e) {
      if (showPopup && !confirmActive && popupRef && !popupRef.contains(e.target)) {
        showPopup = false;
      }
    }
    window.addEventListener("click", handleClick, true);
    return () => window.removeEventListener("click", handleClick, true);
  });
</script>

<div class="bds-section-title">
  <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
    <div style="display: flex; align-items: center;">
      <span class="bds-icon-inline">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M11.0307 5.46369C11.0305 3.78995 9.6734 2.43357 7.99961 2.43357C6.32601 2.43379 4.96972 3.79009 4.96949 5.46369C4.96949 7.13748 6.32587 8.49455 7.99961 8.49477C9.67354 8.49477 11.0307 7.13762 11.0307 5.46369ZM12.3163 5.46369C12.3163 7.84777 10.3837 9.78042 7.99961 9.78042C5.61572 9.7802 3.68288 7.84763 3.68288 5.46369C3.6831 3.07993 5.61586 1.14718 7.99961 1.14695C10.3836 1.14695 12.3161 3.0798 12.3163 5.46369Z" fill="currentColor"></path>
          <path d="M8.00002 10.3316C11.7343 10.3316 14.1864 11.8997 15.0387 14.4445L14.4292 14.6483L13.8197 14.8531C13.1955 12.9893 11.3673 11.6182 8.00002 11.6182C4.63277 11.6182 2.80455 12.9893 2.18031 14.8531L1.5708 14.6483L0.961304 14.4445C1.81368 11.8997 4.26579 10.3316 8.00002 10.3316Z" fill="currentColor"></path>
        </svg>
      </span>
      {t('memoryList.title')}
    </div>
    
    <div style="display: flex; gap: 6px;">
      <button type="button" class="bds-btn-outlined" onclick={exportMemories}>
        {t('memoryList.export')}
        
      </button>
      <button type="button" class="bds-btn-outlined" onclick={triggerImport}>
        {t('memoryList.import')}
        
      </button>
      <input 
        id="bds-memory-upload"
        type="file" 
        accept=".json" 
        style="display: none;" 
        bind:this={fileInput} 
        onchange={handleImport}
      />
    </div>
  </div>
</div>

<svelte:window onkeydown={handleKeydown} />

<div id="bds-memory-list" class="bds-list">
  {#if entries.length === 0}
    <p class="bds-empty">{t('memoryList.empty')}</p>
  {:else}
    {#each entries.slice(0, DISPLAY_LIMIT) as [key, item] (key)}
      <div class="bds-memory-item">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px;">
          <div style="display: grid; gap: 4px; flex: 1; min-width: 0;">
            <strong>{key}</strong>
            <span>{item.value}</span>
            <em>{item.importance}</em>
          </div>
          <div style="display: flex; gap: 4px; align-items: flex-start;">
            <button type="button" class="bds-btn-outlined bds-btn-xs" onclick={() => startEdit(key, item)}>
              {t('memoryList.edit')}
            </button>
            <button type="button" class="bds-btn-danger" onclick={() => deleteMemory(key)}>
              {t('memoryList.delete')}
            </button>
          </div>
        </div>
      </div>
    {/each}

    {#if entries.length > DISPLAY_LIMIT}
      <button
        type="button"
        class="bds-memory-more-badge"
        onclick={() => showPopup = true}
      >
        {t('memoryList.more', { count: entries.length - DISPLAY_LIMIT })}
      </button>
    {/if}
  {/if}
</div>

{#if showPopup}
  <div class="bds-memory-popup-backdrop" onclick={closePopup} role="presentation">
    <div
      bind:this={popupRef}
      class="bds-memory-popup"
      onclick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      tabindex="-1"
    >
      <div class="bds-memory-popup-header">
        <span class="bds-memory-popup-title">{t('memoryList.title')}<span class="bds-memory-popup-count"> ({entries.length})</span></span>
        <div class="bds-memory-popup-actions">
          <button type="button" class="bds-btn-outlined bds-btn-xs" onclick={exportMemories}>
            {t('memoryList.export')}
          </button>
          <button type="button" class="bds-btn-outlined bds-btn-xs" onclick={triggerImport}>
            {t('memoryList.import')}
          </button>
          <button
            type="button"
            class="bds-memory-popup-close"
            onclick={closePopup}
            aria-label={t('common.close')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="bds-memory-popup-body">
        {#if entries.length === 0}
          <p class="bds-memory-popup-empty">{t('memoryList.empty')}</p>
        {:else}
          {#each entries as [key, item] (key)}
            <div class="bds-memory-popup-item">
              <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px;">
                <div style="display: grid; gap: 4px; flex: 1; min-width: 0;">
                  <strong>{key}</strong>
                  <span>{item.value}</span>
                  <em>{item.importance}</em>
                </div>
                <div style="display: flex; gap: 4px; align-items: flex-start;">
                  <button type="button" class="bds-btn-outlined bds-btn-xs" onclick={() => startEdit(key, item)}>
                    {t('memoryList.edit')}
                  </button>
                  <button type="button" class="bds-btn-danger" onclick={() => deleteMemory(key)}>
                    {t('memoryList.delete')}
                  </button>
                </div>
              </div>
            </div>
          {/each}
        {/if}
        <div class="bds-memory-popup-import-label" onclick={() => { closePopup(); showMemoryImport = true; }}>
          <span>{t('memoryImport.title')}</span>
        </div>
      </div>
    </div>
  </div>
{/if}

{#if editingKey}
  <div class="bds-edit-overlay" onclick={cancelEdit} role="presentation">
    <div
      class="bds-edit-modal"
      onclick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      tabindex="-1"
    >
      <div class="bds-edit-header">
        <span>{t('memoryList.editTitle')}</span>
        <button
          type="button"
          class="bds-edit-close"
          onclick={cancelEdit}
          aria-label={t('common.close')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <div class="bds-edit-body">
        <div class="bds-edit-field">
          <label class="bds-edit-label" for="bds-edit-key">Key</label>
          <input id="bds-edit-key" class="bds-edit-input" value={editingKey} disabled />
        </div>
        <div class="bds-edit-field">
          <label class="bds-edit-label" for="bds-edit-value">Value</label>
          <textarea id="bds-edit-value" class="bds-edit-textarea" bind:value={editingValue}></textarea>
        </div>
        <div class="bds-edit-field">
          <label class="bds-edit-label" for="bds-edit-importance">Importance</label>
          <select id="bds-edit-importance" class="bds-edit-select" bind:value={editingImportance}>
            <option value="always">Always</option>
            <option value="called">Called</option>
          </select>
        </div>
      </div>
      <div class="bds-edit-footer">
        <button type="button" class="bds-btn-outlined" onclick={cancelEdit}>{t('common.cancel')}</button>
        <button type="button" class="bds-btn" onclick={saveEdit}>{t('common.save')}</button>
      </div>
    </div>
  </div>
{/if}

<div class="bds-memory-import-label" onclick={() => showMemoryImport = true}>
  <span>{t('memoryImport.title')}</span>
</div>

{#if showMemoryImport}
  <MemoryImportModal onclose={() => showMemoryImport = false} />
{/if}
