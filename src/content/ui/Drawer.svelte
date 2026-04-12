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
    <button id="bds-close" type="button" onclick={onclose}>Close</button>
  </div>

  <SettingsPanel bind:this={settingsRef} />

  <hr />

  <SkillList bind:this={skillsRef} />

  <hr />

  <MemoryList bind:this={memoryRef} />
</aside>
