<script>
  import appState from "../state.js";
  import { pushConfigToPage } from "../bridge.js";
  import { STORAGE_KEYS } from "../../lib/constants.js";
  import { makeId } from "../../lib/utils/helpers.js";

  let characters = $state([...appState.characters]);
  let fileInput = $state(null);

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
    if (fileInput) fileInput.click();
  }

  async function handleImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const raw = JSON.parse(text);
      const { normalizeCharacters } = await import("../storage.js");
      const normalized = normalizeCharacters(raw);

      await chrome.storage.local.set({
        [STORAGE_KEYS.characters]: normalized,
      });

      if (appState.ui) {
        appState.ui.showToast("Characters imported.");
      }
    } catch (err) {
      console.error("Import failed:", err);
      if (appState.ui) {
        appState.ui.showToast("Import failed: Invalid JSON.");
      }
    }
    event.target.value = "";
  }

  async function handleUpload(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    const content = await file.text();
    const name = file.name.replace(/\.md$/i, "") || `char-${appState.characters.length + 1}`;

    // Deactivate others
    appState.characters.forEach(c => c.active = false);

    appState.characters.push({
      id: makeId(),
      name,
      usage: "uploaded",
      content,
      active: true,
    });

    await chrome.storage.local.set({
      [STORAGE_KEYS.characters]: appState.characters,
    });
    characters = [...appState.characters];
    pushConfigToPage();

    if (appState.ui) {
      appState.ui.showToast(`Character loaded: ${name}`);
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
    appState.characters = appState.characters.filter((c) => c.id !== charId);
    await chrome.storage.local.set({
      [STORAGE_KEYS.characters]: appState.characters,
    });
    characters = [...appState.characters];
    pushConfigToPage();

    if (appState.ui) {
      appState.ui.showToast("Character removed.");
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
        appState.ui.showToast("Character saved.");
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
      RP Characters
    </div>

    <div style="display: flex; gap: 6px;">
      <button type="button" class="bds-btn-outlined" onclick={exportCharacters}>
        Export
      </button>
      <button type="button" class="bds-btn-outlined" onclick={triggerImport}>
        Import
      </button>
      <input 
        type="file" 
        accept=".json" 
        style="display: none;" 
        bind:this={fileInput} 
        onchange={handleImport}
      />
    </div>
  </div>
</div>

<label class="bds-label" for="bds-char-upload">Upload Persona (.md)</label>
<input
  id="bds-char-upload"
  type="file"
  accept=".md,text/markdown"
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
      <span>None (Assistant)</span>
    </label>
  </div>

  {#if characters.length === 0}
    <p class="bds-empty">No personas saved.</p>
  {:else}
    {#each characters as char (char.id)}
      {#if editingId === char.id}
        <div class="bds-inline-editor">
          <input 
            class="bds-input" 
            bind:value={editingName} 
            placeholder="Character Name"
          />
          <input 
            class="bds-input" 
            bind:value={editingUsage} 
            placeholder="Usage (e.g. fun, philosophy)"
          />
          <textarea 
            class="bds-input" 
            bind:value={editingContent} 
            placeholder="Character instructions/background..."
          ></textarea>
          <div class="bds-editor-actions">
            <button type="button" class="bds-btn-outlined" onclick={cancelEdit}>Cancel</button>
            <button type="button" class="bds-btn" onclick={saveEdit}>Save</button>
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
              Edit
            </button>
            <button type="button" class="bds-btn-danger" onclick={() => deleteCharacter(char.id)}>
              Delete
            </button>
          </div>
        </div>
      {/if}
    {/each}
  {/if}
</div>
