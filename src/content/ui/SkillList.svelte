<script>
  import appState from "../state.js";
  import { pushConfigToPage } from "../bridge.js";
  import { STORAGE_KEYS } from "../../lib/constants.js";
  import { makeId } from "../../lib/utils/helpers.js";

  let skills = $state([...appState.skills]);

  export function refresh() {
    skills = [...appState.skills];
  }

  async function handleUpload(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    const content = await file.text();
    const name = file.name.replace(/\.md$/i, "") || `skill-${appState.skills.length + 1}`;

    appState.skills.push({
      id: makeId(),
      name,
      content,
      active: true,
    });

    await chrome.storage.local.set({
      [STORAGE_KEYS.skills]: appState.skills,
    });
    skills = [...appState.skills];
    pushConfigToPage();

    if (appState.ui) {
      appState.ui.showToast(`Skill loaded: ${name}`);
    }

    event.target.value = "";
  }

  async function toggleSkill(skillId, checked) {
    const skill = appState.skills.find((s) => s.id === skillId);
    if (!skill) return;

    skill.active = checked;
    await chrome.storage.local.set({
      [STORAGE_KEYS.skills]: appState.skills,
    });
    skills = [...appState.skills];
    pushConfigToPage();
  }

  async function deleteSkill(skillId) {
    const before = appState.skills.length;
    appState.skills = appState.skills.filter((s) => s.id !== skillId);
    if (appState.skills.length === before) return;

    await chrome.storage.local.set({
      [STORAGE_KEYS.skills]: appState.skills,
    });
    skills = [...appState.skills];
    pushConfigToPage();

    if (appState.ui) {
      appState.ui.showToast("Skill removed.");
    }
  }
</script>

<label class="bds-label" for="bds-skill-upload">Upload Skill (.md)</label>
<input
  id="bds-skill-upload"
  type="file"
  accept=".md,text/markdown"
  onchange={handleUpload}
/>

<div id="bds-skill-list" class="bds-list">
  {#if skills.length === 0}
    <p class="bds-empty">No skills loaded.</p>
  {:else}
    {#each skills as skill (skill.id)}
      <div class="bds-skill-item">
        <label>
          <input
            type="checkbox"
            checked={skill.active}
            onchange={(e) => toggleSkill(skill.id, e.target.checked)}
          />
          <span>{skill.name}</span>
        </label>
        <button type="button" onclick={() => deleteSkill(skill.id)}>
          Delete
        </button>
      </div>
    {/each}
  {/if}
</div>
