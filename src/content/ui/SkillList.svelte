<script>
  import appState from "../state.js";
  import { pushConfigToPage } from "../bridge.js";
  import { STORAGE_KEYS } from "../../lib/constants.js";
  import { makeId } from "../../lib/utils/helpers.js";
  import { openNativeFilePicker } from "../files/native-file-input.js";

  let skills = $state([...appState.skills]);
  let fileInput = $state(null);

  // Editing state
  let editingId = $state(null);
  let editingName = $state("");
  let editingContent = $state("");

  export function refresh() {
    skills = [...appState.skills];
  }

  function exportSkills() {
    const data = JSON.stringify(appState.skills, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "bds_skills.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function triggerImport() {
    openNativeFilePicker(fileInput, { preferSingle: true });
  }

  async function handleImportSkills(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const raw = JSON.parse(text);
      const { normalizeSkills } = await import("../storage.js");
      const normalized = normalizeSkills(raw);

      await chrome.storage.local.set({
        [STORAGE_KEYS.skills]: normalized,
      });

      if (appState.ui) {
        appState.ui.showToast("Skills imported successfully.");
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

  function startEdit(skill) {
    editingId = skill.id;
    editingName = skill.name;
    editingContent = skill.content;
  }

  function cancelEdit() {
    editingId = null;
  }

  async function saveEdit() {
    const skill = appState.skills.find(s => s.id === editingId);
    if (skill) {
      skill.name = editingName;
      skill.content = editingContent;
      
      await chrome.storage.local.set({
        [STORAGE_KEYS.skills]: appState.skills,
      });
      skills = [...appState.skills];
      pushConfigToPage();
      
      if (appState.ui) {
        appState.ui.showToast("Skill saved.");
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
          <path fill-rule="evenodd" clip-rule="evenodd" d="M12.0997 8.54554C12.2905 8.54989 12.3541 8.58056 12.4535 8.74614L12.8849 9.46387C12.9851 9.63071 13.0464 9.66013 13.2388 9.66447H14.1138C14.3417 9.66448 14.3512 9.66937 14.4686 9.86507L14.892 10.5717C14.9942 10.7422 14.9948 10.8247 14.892 10.9961L14.4756 11.6906C14.3741 11.8677 14.3694 11.9379 14.4756 12.115L14.892 12.8096C14.9942 12.9801 14.9947 13.0625 14.892 13.234L14.4686 13.9406C14.3643 14.1028 14.3063 14.1354 14.1138 14.1412H13.2388C13.0465 14.1456 12.985 14.1752 12.8849 14.3418L12.4535 15.0595C12.353 15.2195 12.2895 15.2558 12.0997 15.2601H11.2237C10.9962 15.2601 10.9871 15.2548 10.8699 15.0595L10.4384 14.3418C10.3383 14.175 10.2767 14.1456 10.0846 14.1412H9.2096C9.01854 14.1355 8.95761 14.1006 8.85477 13.9406L8.43139 13.234C8.32562 13.0576 8.33148 12.9862 8.43139 12.8096L8.84771 12.115C8.95165 11.9416 8.94659 11.863 8.84771 11.6906L8.43139 10.9961C8.32767 10.8232 8.33411 10.7437 8.43139 10.5717L8.85477 9.86507C8.95447 9.69891 9.01875 9.67017 9.2096 9.66447H10.0846C10.2741 9.66441 10.3414 9.62547 10.4384 9.46387L10.8699 8.74614C10.987 8.55106 10.9963 8.54554 11.2237 8.54554H12.0997ZM11.6612 10.232C11.3326 10.7798 10.8155 11.0948 10.1743 11.106C10.4443 11.61 10.4425 12.1976 10.1743 12.6987C10.803 12.7096 11.3391 13.0359 11.6612 13.5727C11.9855 13.0323 12.5131 12.7098 13.148 12.6987C12.879 12.196 12.879 11.6086 13.148 11.106C12.5076 11.0948 11.9894 10.7794 11.6612 10.232Z" fill="currentColor"></path>
          <path fill-rule="evenodd" clip-rule="evenodd" d="M7.51205 0.790627C9.19055 0.790649 10.7401 1.0691 11.892 1.54364C12.4664 1.78029 12.9719 2.07885 13.3436 2.4408C13.7171 2.80467 13.9916 3.27253 13.9918 3.82384V7.90442C13.6067 7.69532 13.1907 7.53597 12.7529 7.43366V5.66454C12.4928 5.82898 12.2028 5.97601 11.892 6.10405C10.74 6.57865 9.19071 6.85706 7.51205 6.85706C5.8337 6.85703 4.285 6.57852 3.13309 6.10405C2.82215 5.97593 2.53164 5.8291 2.27121 5.66454V7.4135C2.27134 7.75678 2.6066 8.27106 3.62502 8.73405C4.58641 9.17097 5.95762 9.45591 7.50499 9.45681C7.24582 9.83133 7.03684 10.2434 6.88706 10.6826C5.44388 10.6162 4.12516 10.3216 3.11192 9.86104C2.81708 9.72698 2.53185 9.56866 2.27121 9.38928V11.2542C2.27158 11.5974 2.60697 12.1109 3.62502 12.5737C4.41933 12.9347 5.4937 13.1898 6.71569 13.2693C6.80349 13.7128 6.9513 14.1345 7.14814 14.5273C5.60324 14.4862 4.18593 14.1889 3.11192 13.7007C2.01039 13.1998 1.03366 12.3814 1.03333 11.2542V3.82384C1.03352 3.27273 1.30721 2.80461 1.68049 2.4408C2.05211 2.07893 2.55887 1.78026 3.13309 1.54364C4.28492 1.06926 5.83393 0.790683 7.51205 0.790627ZM7.51205 2.02851C5.95492 2.02857 4.57354 2.29079 3.60486 2.68979C3.11958 2.88977 2.76667 3.11253 2.5454 3.32788C2.32671 3.54101 2.2714 3.7089 2.27121 3.82384C2.27121 3.93882 2.32624 4.10625 2.5454 4.3198C2.76667 4.53527 3.11927 4.75781 3.60486 4.9579C4.5736 5.35699 5.95467 5.61914 7.51205 5.61918C9.06942 5.61918 10.4505 5.35695 11.4192 4.9579C11.9051 4.75773 12.2584 4.53536 12.4797 4.3198C12.6988 4.10627 12.7529 3.93882 12.7529 3.82384C12.7527 3.70889 12.6984 3.54104 12.4797 3.32788C12.2584 3.11239 11.9049 2.88989 11.4192 2.68979C10.4505 2.29079 9.06925 2.02853 7.51205 2.02851Z" fill="currentColor"></path>
        </svg>
      </span>
      Skill Set
    </div>

    <div style="display: flex; gap: 6px;">
      <button type="button" class="bds-btn-outlined" onclick={exportSkills}>
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
        onchange={handleImportSkills}
      />
    </div>
  </div>
</div>

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
      {#if editingId === skill.id}
        <div class="bds-inline-editor">
          <input 
            class="bds-input" 
            bind:value={editingName} 
            placeholder="Skill Name"
          />
          <textarea 
            class="bds-input" 
            bind:value={editingContent} 
            placeholder="Skill persona/instructions..."
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
              type="checkbox"
              checked={skill.active}
              onchange={(e) => toggleSkill(skill.id, e.target.checked)}
            />
            <span>{skill.name}</span>
          </label>
          <div style="display: flex; gap: 6px;">
            <button type="button" class="bds-btn-outlined" style="font-size: 11px; padding: 4px 8px;" onclick={() => startEdit(skill)}>
              Edit
            </button>
            <button type="button" class="bds-btn-danger" onclick={() => deleteSkill(skill.id)}>
              Delete
            </button>
          </div>
        </div>
      {/if}
    {/each}
  {/if}
</div>
