<script>
  import appState from "../state.js";
  import { pushConfigToPage } from "../bridge.js";
  import { STORAGE_KEYS } from "../../lib/constants.js";
  import { makeId } from "../../lib/utils/helpers.js";
  import { openNativeFilePicker } from "../files/native-file-input.js";
  import { t } from "../../lib/i18n.svelte.js";

  let characters = $state([...appState.characters]);
  let uploadInput = $state(null);

  // Editing state
  let editingId = $state(null);
  let editingName = $state("");
  let editingUsage = $state("");
  let editingContent = $state("");

  export function refresh() {
    characters = [...appState.characters];
  }

  function exportCharacters() {
    const data = JSON.stringify(appState.characters, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "bds_characters.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function triggerImport() {
    openNativeFilePicker(uploadInput, { preferSingle: true });
  }

  async function handleUpload(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    const isJson = file.name.toLowerCase().endsWith(".json");
    const isMd = file.name.toLowerCase().endsWith(".md");
    if (!isJson && !isMd) {
      if (appState.ui) appState.ui.showToast(t('characterList.onlyMdOrJson'));
      event.target.value = "";
      return;
    }

    const raw = await file.text();

      if (isJson) {
      try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) throw new Error("Not an array");
        appState.characters.forEach(c => c.active = false);
        let count = 0;
        for (const item of parsed) {
          if (!item.content || !String(item.content).trim()) continue;
          appState.characters.push({
            id: makeId(),
            name: String(item.name || `char-${appState.characters.length + 1}`),
            usage: String(item.usage || ""),
            content: String(item.content),
            active: item.active === true,
          });
          count++;
        }
        await chrome.storage.local.set({ [STORAGE_KEYS.characters]: appState.characters });
        characters = [...appState.characters];
        pushConfigToPage();
        if (appState.ui) appState.ui.showToast(t('characterList.importedCount', { count }));
      } catch (e) {
        if (appState.ui) appState.ui.showToast(t('characterList.importFailed'));
      }
    } else {
      const name = file.name.replace(/\.md$/i, "") || `char-${appState.characters.length + 1}`;
      appState.characters.forEach(c => c.active = false);
      appState.characters.push({
        id: makeId(),
        name,
        usage: "uploaded",
        content: raw,
        active: true,
      });
      await chrome.storage.local.set({ [STORAGE_KEYS.characters]: appState.characters });
      characters = [...appState.characters];
      pushConfigToPage();
      if (appState.ui) appState.ui.showToast(t('characterList.loaded', { name }));
    }

    event.target.value = "";
  }

  async function activateCharacter(charId) {
    appState.characters.forEach((c) => {
      c.active = c.id === charId;
    });

    await chrome.storage.local.set({
      [STORAGE_KEYS.characters]: appState.characters,
    });
    characters = [...appState.characters];
    pushConfigToPage();
  }

  async function deactivateAll() {
    appState.characters.forEach((c) => {
      c.active = false;
    });
    await chrome.storage.local.set({
      [STORAGE_KEYS.characters]: appState.characters,
    });
    characters = [...appState.characters];
    pushConfigToPage();
  }

  async function deleteCharacter(charId) {
    const char = appState.characters.find((c) => c.id === charId);
    if (!char) return;
    if (!appState.settings?.skipDeletionConfirmation) {
      if (!(await appState.ui.showConfirm(`Delete character "${char.name}"?`))) return;
    }
    appState.characters = appState.characters.filter((c) => c.id !== charId);
    await chrome.storage.local.set({
      [STORAGE_KEYS.characters]: appState.characters,
    });
    characters = [...appState.characters];
    pushConfigToPage();

    if (appState.ui) {
      appState.ui.showToast(t('characterList.removed'));
    }
  }

  function startEdit(char) {
    editingId = char.id;
    editingName = char.name;
    editingUsage = char.usage || "";
    editingContent = char.content;
  }

  function cancelEdit() {
    editingId = null;
  }

  async function saveEdit() {
    const char = appState.characters.find(c => c.id === editingId);
    if (char) {
      char.name = editingName;
      char.usage = editingUsage;
      char.content = editingContent;
      
      await chrome.storage.local.set({
        [STORAGE_KEYS.characters]: appState.characters,
      });
      characters = [...appState.characters];
      pushConfigToPage();
      
      if (appState.ui) {
        appState.ui.showToast(t('characterList.saved'));
      }
    }
    editingId = null;
  }
</script>

<div class="bds-section-title">
  <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
    <div style="display: flex; align-items: center;">
      <span class="bds-icon-inline">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M8 8C10.2091 8 12 6.20914 12 4C12 1.79086 10.2091 0 8 0C5.79086 0 4 1.79086 4 4C4 6.20914 5.79086 8 8 8Z" fill="currentColor"></path>
          <path d="M8 9C5.33 9 0 10.34 0 13V16H16V13C16 10.34 10.67 9 8 9Z" fill="currentColor"></path>
        </svg>
      </span>
      {t('characterList.title')}
    </div>

    <div style="display: flex; gap: 6px;">
      <button type="button" class="bds-btn-outlined" onclick={exportCharacters}>
        {t('characterList.export')}
      </button>
      <button type="button" class="bds-btn-outlined" onclick={triggerImport}>
        {t('characterList.import')}
      </button>
    </div>
  </div>
</div>

<label class="bds-label" for="bds-char-upload">{t('characterList.uploadLabel')}</label>
<input
  id="bds-char-upload"
  type="file"
  accept=".md,.json"
  bind:this={uploadInput}
  onchange={handleUpload}
/>

<div id="bds-character-list" class="bds-list">
  <div class="bds-skill-item">
    <label>
      <input
        type="radio"
        name="active-character"
        checked={characters.every(c => !c.active)}
        onchange={deactivateAll}
      />
      <span>{t('characterList.defaultOption')}</span>
    </label>
  </div>

  {#if characters.length === 0}
    <p class="bds-empty">{t('characterList.empty')}</p>
  {:else}
    {#each characters as char (char.id)}
      {#if editingId === char.id}
        <div class="bds-inline-editor">
          <input 
            class="bds-input" 
            bind:value={editingName} 
            placeholder={t('characterList.namePlaceholder')}
          />
          <input 
            class="bds-input" 
            bind:value={editingUsage} 
            placeholder={t('characterList.usagePlaceholder')}
          />
          <textarea 
            class="bds-input" 
            bind:value={editingContent} 
            placeholder={t('characterList.contentPlaceholder')}
          ></textarea>
          <div class="bds-editor-actions">
            <button type="button" class="bds-btn-outlined" onclick={cancelEdit}>{t('characterList.cancel')}</button>
            <button type="button" class="bds-btn" onclick={saveEdit}>{t('characterList.save')}</button>
          </div>
        </div>
      {:else}
        <div class="bds-skill-item">
          <label>
            <input
              type="radio"
              name="active-character"
              checked={char.active}
              onchange={() => activateCharacter(char.id)}
            />
            <div style="display: flex; flex-direction: column; overflow: hidden;">
              <span style="font-weight: 500; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">{char.name}</span>
              {#if char.usage}
                <span style="font-size: 10px; opacity: 0.6; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">
                  {char.usage.length > 50 ? char.usage.slice(0, 50) + "..." : char.usage}
                </span>
              {/if}
            </div>
          </label>
          <div style="display: flex; gap: 6px;">
            <button type="button" class="bds-btn-outlined" style="font-size: 11px; padding: 4px 8px;" onclick={() => startEdit(char)}>
              {t('characterList.edit')}
            </button>
            <button type="button" class="bds-btn-danger" onclick={() => deleteCharacter(char.id)}>
              {t('characterList.delete')}
            </button>
          </div>
        </div>
      {/if}
    {/each}
  {/if}
</div>
