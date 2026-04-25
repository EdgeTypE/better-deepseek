<script>
  import SettingsPanel from "./SettingsPanel.svelte";
  import ExportPanel from "./ExportPanel.svelte";
  import CharacterList from "./CharacterList.svelte";
  import SkillList from "./SkillList.svelte";
  import MemoryList from "./MemoryList.svelte";

  let { open = false, onclose } = $props();

  let settingsRef = $state(null);
  let charactersRef = $state(null);
  let skillsRef = $state(null);
  let memoryRef = $state(null);

  export function refreshSettings() {
    if (settingsRef) settingsRef.refresh();
  }
  export function refreshCharacters() {
    if (charactersRef) charactersRef.refresh();
  }
  export function refreshSkills() {
    if (skillsRef) skillsRef.refresh();
  }
  export function refreshMemories() {
    if (memoryRef) memoryRef.refresh();
  }
</script>

<aside id="bds-drawer" class={open ? "bds-open" : "bds-closed"}>
  <div class="bds-drawer-header">
    <div class="ds-modal-content__title">Better DeepSeek</div>
    <button id="bds-close" type="button" onclick={onclose} aria-label="Close">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M14.1871 13.1265L13.1265 14.1872L1.81275 2.87347L2.87341 1.81281L14.1871 13.1265Z" fill="currentColor"></path>
        <path d="M13.1265 1.81282L14.1871 2.87348L2.8734 14.1872L1.81274 13.1265L13.1265 1.81282Z" fill="currentColor"></path>
      </svg>
    </button>
  </div>

  <SettingsPanel bind:this={settingsRef} />

  <hr />

  <ExportPanel />

  <hr />

<SkillList bind:this={skillsRef} />

  <hr />

    <CharacterList bind:this={charactersRef} />

  <hr />

  <MemoryList bind:this={memoryRef} />

  <div class="bds-drawer-footer">
    <a href="https://github.com/EdgeTypE/better-deepseek" target="_blank" rel="noopener noreferrer" class="bds-github-link">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"></path>
      </svg>
      <span>GitHub <small style="opacity: 0.6; font-weight: 400; margin-left: 4px;">v0.1.2</small></span>
    </a>
  </div>
</aside>
