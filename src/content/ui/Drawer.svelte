<script>
  import SettingsPanel from "./SettingsPanel.svelte";
  import SkillList from "./SkillList.svelte";
  import MemoryList from "./MemoryList.svelte";

  let { open = false, onclose } = $props();

  let settingsRef = $state(null);
  let skillsRef = $state(null);
  let memoryRef = $state(null);

  export function refreshSettings() {
    if (settingsRef) settingsRef.refresh();
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
    <h2>Better DeepSeek</h2>
    <button id="bds-close" type="button" onclick={onclose} aria-label="Close">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    </button>
  </div>

  <SettingsPanel bind:this={settingsRef} />

  <hr />

  <SkillList bind:this={skillsRef} />

  <hr />

  <MemoryList bind:this={memoryRef} />
</aside>
