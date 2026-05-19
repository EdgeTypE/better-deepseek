<script>
  import appState from "../state.js";
  import { t } from "../../lib/i18n.svelte.js";
  import {
    createProject,
    updateProject,
    deleteProject,
    addProjectFilesBatch,
    deleteProjectFile,
    getFilesForProject,
    setProjectLinkedDir,
    clearProjectLinkedDir,
  } from "../project-manager.js";
  import { pushConfigToPage } from "../bridge.js";
  import { pickFolderSelection } from "../../lib/utils/folder-picker.js";
  import { openNativeFilePicker } from "../files/native-file-input.js";
  import {
    isNativeFilePickerAvailable,
    nativePickFiles,
  } from "../../platform/android-file-picker.js";
  import {
    supportsLocalDirectoryLinking,
    linkDirectory,
    unlinkDirectory,
    getLinkedDirectoryInfo,
    refreshDirectoryCache,
  } from "../../lib/local-directory-source.js";

  let { onback } = $props();

  const BDS_TARGET = process.env.BDS_TARGET || "chrome";
  const isAndroidTarget = BDS_TARGET === "android";
  // Android native bridge re-enables folder upload when pickFiles exists.
  const supportsFolderUpload = !isAndroidTarget || isNativeFilePickerAvailable();

  // view: "list" | "detail"
  let view = $state("list");
  let projects = $state([...appState.projects]);
  let selectedProject = $state(null);
  let projectFiles = $state([]);
  // Create form
  let createName = $state("");
  let createDescription = $state("");
  let createError = $state("");
  let showCreateForm = $state(false);

  // Detail edit state
  let editName = $state("");
  let editDescription = $state("");
  let editInstructions = $state("");
  let saveTimer = null;

  // Delete confirmation (project-level only)
  let showDeleteConfirm = $state(false);

  // File upload
  let fileInput = $state(null);
  let fileError = $state("");
  let uploading = $state(false);

  // Local directory linking
  let linkedDirInfo = $state(null);
  let linkingDir = $state(false);
  let linkDirError = $state("");

  export function refresh() {
    if (uploading) return;
    projects = [...appState.projects];
    if (selectedProject) {
      const updated = appState.projects.find(
        (p) => p.id === selectedProject.id,
      );
      if (updated) {
        selectedProject = updated;
        projectFiles = getFilesForProject(updated.id);
      } else {
        goBack();
      }
    }
  }

  function openProject(project) {
    selectedProject = project;
    editName = project.name;
    editDescription = project.description;
    editInstructions = project.customInstructions;
    projectFiles = getFilesForProject(project.id);
    showDeleteConfirm = false;
    fileError = "";
    view = "detail";
    refreshLinkedDirInfo();
  }

  function goBack() {
    view = "list";
    selectedProject = null;
    showDeleteConfirm = false;
  }

  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      saveTimer = null;
      if (!selectedProject) return;
      await updateProject(selectedProject.id, {
        name: editName.trim() || selectedProject.name,
        description: editDescription.trim(),
        customInstructions: editInstructions,
      });
      projects = [...appState.projects];
      pushConfigToPage();
    }, 600);
  }

  async function handleCreate() {
    createError = "";
    if (!createName.trim()) {
      createError = t('projectsManager.nameIsRequired');
      return;
    }
    await createProject(createName.trim(), createDescription.trim());
    projects = [...appState.projects];
    createName = "";
    createDescription = "";
    showCreateForm = false;
  }

  function promptDeleteProject() {
    showDeleteConfirm = true;
  }

  async function confirmDeleteProject() {
    if (!selectedProject) return;
    await deleteProject(selectedProject.id);
    projects = [...appState.projects];
    pushConfigToPage();
    goBack();
  }

  async function triggerFileUpload() {
    if (isAndroidTarget && isNativeFilePickerAvailable()) {
      try {
        const result = await nativePickFiles("files");
        if (result.cancelled || !result.files || result.files.length === 0) {
          return;
        }
        if (!fileInput) return;
        const dataTransfer = new DataTransfer();
        for (const file of result.files) {
          const blob = new Blob([file.content], { type: "text/plain" });
          dataTransfer.items.add(
            new File([blob], file.name, { type: "text/plain" }),
          );
        }
        fileInput.files = dataTransfer.files;
        fileInput.dispatchEvent(new Event("change", { bubbles: true }));
      } catch (err) {
        if (appState.ui) {
          appState.ui.showToast(err?.message || t('projectsManager.filePickFailed'));
        }
      }
      return;
    }

    openNativeFilePicker(fileInput, { preferSingle: isAndroidTarget });
  }

  async function handleFileUpload(event) {
    uploading = true;
    fileError = "";
    const files = Array.from(event.target.files || []);
    if (files.length === 0) {
      uploading = false;
      return;
    }

    const MAX_SIZE = 500 * 1024;
    const errors = [];
    const filesToAdd = [];

    try {
      // Validate and read all files before touching storage so we can
      // do a single write — avoiding the onChanged race condition.
      for (const file of files) {
        if (file.size > MAX_SIZE) {
          errors.push(
            t('projectsManager.fileTooLarge', { name: file.name, size: (file.size / 1024).toFixed(1) }),
          );
          continue;
        }

        let content;
        try {
          content = await file.text();
        } catch {
          errors.push(t('projectsManager.fileUnreadable', { name: file.name }));
          continue;
        }

        if (!content.trim()) {
          errors.push(t('projectsManager.fileEmpty', { name: file.name }));
          continue;
        }

        filesToAdd.push({ name: file.name, content });
      }

      if (filesToAdd.length > 0) {
        try {
          await addProjectFilesBatch(selectedProject.id, filesToAdd);
        } catch (err) {
          errors.push(t('projectsManager.storageError', { msg: err?.message || String(err) }));
        }
      }

      if (errors.length > 0) {
        fileError = errors.join("; ");
      }
    } finally {
      uploading = false;
      projectFiles = getFilesForProject(selectedProject.id);
      // Reset via bound ref so the same files can be re-selected if needed.
      if (fileInput) fileInput.value = "";
    }
  }

  async function handleFolderUpload() {
    if (isAndroidTarget) {
      if (isNativeFilePickerAvailable()) {
        uploading = true;
        fileError = "";
        try {
          const result = await nativePickFiles("folder");
          if (!result.cancelled && result.files && result.files.length > 0) {
            const MAX_SIZE = 500 * 1024;
            const filesToAdd = [];
            let skippedCount = 0;

            for (const file of result.files) {
              if (new TextEncoder().encode(file.content).length > MAX_SIZE) {
                skippedCount++;
                continue;
              }
              if (!file.content.trim()) {
                skippedCount++;
                continue;
              }
              filesToAdd.push({ name: file.name, content: file.content });
            }

            if (filesToAdd.length > 0) {
              try {
                await addProjectFilesBatch(selectedProject.id, filesToAdd);
              } catch (err) {
                fileError = t('projectsManager.storageError', { msg: err?.message || String(err) });
              }
            }

            if (skippedCount > 0) {
              fileError = t('projectsManager.filesUploadedShort', { count: filesToAdd.length, skipped: skippedCount });
            }
          }
        } catch (err) {
          fileError = err?.message || t('projectsManager.folderPickFailed');
        } finally {
          uploading = false;
          projectFiles = getFilesForProject(selectedProject.id);
        }
      } else if (appState.ui) {
        appState.ui.showToast(t('projectsManager.folderRequiresNewer'));
      }
      return;
    }

    uploading = true;
    fileError = "";

    let selection;
    try {
      selection = await pickFolderSelection({
        processGitignore: Boolean(appState.settings.processGitignoreOnUpload),
      });
    } catch (err) {
      uploading = false;
      if (err?.name !== "AbortError") {
        fileError = t('projectsManager.folderUploadFailed', { msg: err?.message || String(err) });
      }
      return;
    }

    if (!selection?.files.length) {
      uploading = false;
      return;
    }

    const MAX_SIZE = 500 * 1024;
    const TEXT_EXTS = new Set([
      "txt", "md", "json", "csv",
      "js", "ts", "jsx", "tsx",
      "py", "go", "rs",
      "java", "kt", "swift",
      "c", "cpp", "cs",
      "rb", "php",
      "html", "css", "sh",
      "yaml", "yml", "toml", "env",
    ]);

    const filesToAdd = [];
    let skippedCount = 0;

    try {
      // Read all files first, then do a single storage write.
      for (const file of selection.files) {
        const ext = file.name.split(".").pop()?.toLowerCase();
        if (!ext || !TEXT_EXTS.has(ext)) continue; // non-text — silently skip

        if (file.size > MAX_SIZE) {
          skippedCount++;
          continue;
        }

        let content;
        try {
          content = await file.text();
        } catch {
          skippedCount++;
          continue;
        }

        if (!content.trim()) {
          skippedCount++;
          continue;
        }

        filesToAdd.push({ name: file.path || file.name, content });
      }

      if (filesToAdd.length > 0) {
        try {
          await addProjectFilesBatch(selectedProject.id, filesToAdd);
        } catch (err) {
          fileError = t('projectsManager.storageError', { msg: err?.message || String(err) });
        }
      }

      if (skippedCount > 0) {
        fileError = t('projectsManager.filesUploaded', { count: filesToAdd.length, skipped: skippedCount });
      }
    } finally {
      uploading = false;
      projectFiles = getFilesForProject(selectedProject.id);
    }
  }

  async function handleDeleteFile(file) {
    await deleteProjectFile(file.id);
    projectFiles = getFilesForProject(selectedProject.id);
    pushConfigToPage();
  }

  async function refreshLinkedDirInfo() {
    if (!selectedProject) { linkedDirInfo = null; return; }
    try {
      const info = await getLinkedDirectoryInfo(selectedProject.id);
      linkedDirInfo = info;
    } catch {
      linkedDirInfo = null;
    }
  }

  async function handleLinkDirectory() {
    if (!selectedProject) return;
    linkingDir = true;
    linkDirError = "";
    try {
      const dirInfo = await linkDirectory(selectedProject.id);
      setProjectLinkedDir(selectedProject.id, selectedProject.id);
      linkedDirInfo = await getLinkedDirectoryInfo(selectedProject.id);
    } catch (err) {
      if (err?.name !== "AbortError") {
        linkDirError = err?.message || t('projectsManager.linkFailed');
      }
    } finally {
      linkingDir = false;
      projects = [...appState.projects];
    }
  }

  async function handleUnlinkDirectory() {
    if (!selectedProject) return;
    clearProjectLinkedDir(selectedProject.id);
    linkedDirInfo = null;
    projects = [...appState.projects];
  }

  async function handleRefreshDirectory() {
    if (!selectedProject) return;
    try {
      await refreshDirectoryCache(selectedProject.id);
      linkedDirInfo = await getLinkedDirectoryInfo(selectedProject.id);
    } catch (err) {
      linkDirError = err?.message || t('projectsManager.refreshFailed');
    }
  }

  function formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  }

  function formatDate(ts) {
    return new Date(ts).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function exportFile(file) {
    const blob = new Blob([file.content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name.split("/").pop();
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportAll() {
    if (!projectFiles.length) return;
    let text = `Project: ${selectedProject.name}\n\nFiles:\n`;
    projectFiles.forEach((f) => { text += `  ${f.name}\n`; });
    text += "\n========================================\n";
    for (const file of projectFiles) {
      text += `\n\n--- [FILE: ${file.name}] ---\n\n`;
      text += file.content;
    }
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safeName = selectedProject.name.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
    a.download = `${safeName}_all_files.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }
</script>

<div class="bds-manager-header">
  <button
    type="button"
    class="bds-back-btn"
    onclick={view === "detail" ? goBack : onback}
  >
    ← {view === "detail" ? t('projectsManager.title') : t('projectsManager.back')}
  </button>
  <div class="bds-section-title" style="margin: 0; padding: 0; border: none;">
    {view === "detail" ? selectedProject?.name || "Project" : t('projectsManager.manage')}
  </div>
</div>

{#if view === "list"}
  <div style="margin-bottom: 8px;">
    {#if !showCreateForm}
      <button
        type="button"
        class="bds-btn"
        style="width: 100%;"
        onclick={() => (showCreateForm = true)}
      >
        {t('projectsManager.newProject')}
      </button>
    {:else}
      <div class="bds-inline-editor">
        <input
          class="bds-input"
          bind:value={createName}
          placeholder={t('projectsManager.nameRequired')}
          onkeydown={(e) => e.key === "Enter" && handleCreate()}
        />
        <textarea
          class="bds-input bds-desc-input"
          bind:value={createDescription}
          placeholder={t('projectsManager.descriptionOptional')}
        ></textarea>
        {#if createError}
          <p class="bds-field-error">{createError}</p>
        {/if}
        <div class="bds-editor-actions">
          <button
            type="button"
            class="bds-btn-outlined"
            onclick={() => {
              showCreateForm = false;
              createError = "";
            }}
          >
            {t('projectsManager.cancel')}
          </button>
          <button type="button" class="bds-btn" onclick={handleCreate}
            >{t('projectsManager.create')}</button
          >
        </div>
      </div>
    {/if}
  </div>

  <div class="bds-list">
    {#if projects.length === 0}
      <p class="bds-empty">{t('projectsManager.empty')}</p>
    {:else}
      {#each projects as project (project.id)}
        <div
          class="bds-skill-item"
          style="cursor: pointer;"
          onclick={() => openProject(project)}
          role="button"
          tabindex="0"
          onkeydown={(e) => e.key === "Enter" && openProject(project)}
        >
          <div style="flex: 1; min-width: 0;">
            <div
              style="font-weight: 500; text-overflow: ellipsis; overflow: hidden; white-space: nowrap; font-size: 13px;"
            >
              {project.name}
            </div>
            {#if project.description}
              <div class="bds-project-desc-snippet">
                {project.description}
              </div>
            {/if}
          </div>
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            style="opacity: 0.4; flex-shrink: 0;"
          >
            <path
              d="M4.5 2L8.5 6L4.5 10"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </div>
      {/each}
    {/if}
  </div>
{:else if view === "detail" && selectedProject}
  <!-- Name + Description -->
  <div class="bds-field-group">
    <label class="bds-label" for="pm-name">{t('projectsManager.nameLabel')}</label>
    <input
      id="pm-name"
      class="bds-input"
      bind:value={editName}
      oninput={scheduleSave}
    />
  </div>

  <div class="bds-field-group">
    <label class="bds-label" for="pm-desc">{t('projectsManager.descriptionLabel')}</label>
    <textarea
      id="pm-desc"
      class="bds-input"
      bind:value={editDescription}
      placeholder={t('projectsManager.optional')}
      oninput={scheduleSave}
    ></textarea>
  </div>

  <div class="bds-field-group">
    <label class="bds-label" for="pm-instructions">{t('projectsManager.customInstructions')}</label>
    <textarea
      id="pm-instructions"
      class="bds-input"
      bind:value={editInstructions}
      placeholder={t('projectsManager.instructionsPlaceholder')}
      oninput={scheduleSave}
    ></textarea>
    <p style="font-size: 10px; opacity: 0.5; margin: 2px 0 0;">{t('projectsManager.autoSaved')}</p>
  </div>

  <hr style="margin: 12px 0;" />

  <!-- Files section -->
  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
    <div class="bds-subsection-title" style="margin: 0;">{t('projectsManager.files')}</div>
    {#if projectFiles.length > 0}
      <button
        type="button"
        class="bds-btn-outlined"
        style="font-size: 10px; padding: 2px 7px;"
        onclick={exportAll}
        title={t('projectsManager.downloadAll')}
      >
        {t('projectsManager.exportAll')}
      </button>
    {/if}
  </div>

  {#if fileError}
    <p class="bds-field-error">{fileError}</p>
  {/if}

  <div class="bds-list" style="margin-bottom: 8px;">
    {#if projectFiles.length === 0}
      <p class="bds-empty" style="font-size: 11px;">{t('projectsManager.noFiles')}</p>
    {:else}
      {#each projectFiles as file (file.id)}
          <div class="bds-skill-item">
            <div style="flex: 1; min-width: 0;">
              <div
                style="font-size: 12px; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;"
              >
                {file.name}
              </div>
              <div style="font-size: 10px; opacity: 0.5;">
                {formatSize(file.size)}
              </div>
            </div>
            <div style="display: flex; gap: 4px;">
              <button
                type="button"
                class="bds-btn-outlined"
                style="font-size: 11px; padding: 3px 8px;"
                onclick={() => exportFile(file)}
                title={t('projectsManager.downloadFile', { name: file.name })}
              >
                {t('projectsManager.export')}
              </button>
              <button
                type="button"
                class="bds-btn-danger"
                style="font-size: 11px; padding: 3px 8px;"
                onclick={() => handleDeleteFile(file)}
                title={t('projectsManager.removeFile', { name: file.name })}
              >
                {t('projectsManager.delete')}
              </button>
            </div>
          </div>
      {/each}
    {/if}
  </div>

  <button
    type="button"
    class="bds-btn-outlined"
    style="width: 100%;"
    onclick={triggerFileUpload}
  >
    {t('projectsManager.uploadFile')}
  </button>
  {#if supportsFolderUpload}
    <button
      type="button"
      class="bds-btn-outlined"
      style="width: 100%; margin-top: 6px;"
      onclick={handleFolderUpload}
    >
      {t('projectsManager.uploadFolder')}
    </button>
  {/if}

  <input
    type="file"
    multiple
    accept=".txt,.md,.json,.csv,.js,.ts,.jsx,.tsx,.py,.go,.rs,.java,.kt,.swift,.c,.cpp,.cs,.rb,.php,.html,.css,.sh,.yaml,.yml,.toml,.env"
    style="display: none;"
    bind:this={fileInput}
    onchange={handleFileUpload}
  />
  <p style="font-size: 10px; opacity: 0.45; margin: 4px 0 0;">
    {t('projectsManager.fileHint')}
  </p>

  <!-- Local Directory Linking -->
  {#if supportsLocalDirectoryLinking()}
    <hr style="margin: 12px 0;" />
    <div class="bds-subsection-title" style="margin-bottom: 6px;">{t('projectsManager.localDirectory')}</div>

    {#if linkDirError}
      <p class="bds-field-error">{linkDirError}</p>
    {/if}

    {#if linkedDirInfo}
      <div class="bds-linked-dir-status">
        <span class="bds-linked-dir-name">{linkedDirInfo.rootName}</span>
        <span class="bds-linked-dir-meta">
          {linkedDirInfo.fileCount} file{linkedDirInfo.fileCount !== 1 ? "s" : ""}
          {#if !linkedDirInfo.hasPermission}
            <span class="bds-linked-dir-warning">{t('projectsManager.permissionLost')}</span>
          {/if}
        </span>
      </div>
      <div class="bds-linked-dir-actions">
        <button
          type="button"
          class="bds-btn-outlined"
          style="font-size: 10px; padding: 2px 7px;"
          onclick={handleRefreshDirectory}
        >
          {t('projectsManager.refresh')}
        </button>
        <button
          type="button"
          class="bds-btn-danger"
          style="font-size: 10px; padding: 2px 7px;"
          onclick={handleUnlinkDirectory}
        >
          {t('projectsManager.unlink')}
        </button>
      </div>
    {:else}
      <button
        type="button"
        class="bds-btn-outlined"
        style="width: 100%;"
        onclick={handleLinkDirectory}
        disabled={linkingDir}
      >
        {linkingDir ? t('projectsManager.selectingDir') : t('projectsManager.linkDirectory')}
      </button>
      <p style="font-size: 10px; opacity: 0.45; margin: 4px 0 0;">
        {t('projectsManager.dirHint')}
      </p>
    {/if}
  {/if}

  <hr style="margin: 12px 0;" />

  <!-- Delete project -->
  {#if showDeleteConfirm}
    <div class="bds-confirm-box bds-confirm-danger">
      <p class="bds-confirm-text">
        {@html t('projectsManager.deleteConfirm', { name: selectedProject.name, count: projectFiles.length })}
      </p>
      <div class="bds-editor-actions">
        <button
          type="button"
          class="bds-btn-outlined"
          onclick={() => (showDeleteConfirm = false)}>{t('projectsManager.cancel')}</button
        >
        <button
          type="button"
          class="bds-btn-danger"
          onclick={confirmDeleteProject}>{t('projectsManager.deleteProject')}</button
        >
      </div>
    </div>
  {:else}
    <button
      type="button"
      class="bds-btn-danger"
      style="width: 100%;"
      onclick={promptDeleteProject}
    >
      {t('projectsManager.deleteProject')}
    </button>
  {/if}
{/if}

<style>
  .bds-manager-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 14px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--bds-border, rgba(0, 0, 0, 0.08));
  }
  .bds-back-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--bds-accent, #4f6ef7);
    font-size: 12px;
    padding: 2px 0;
    flex-shrink: 0;
  }
  .bds-back-btn:hover {
    text-decoration: underline;
  }
  .bds-field-group {
    margin-bottom: 10px;
  }
  .bds-subsection-title {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    opacity: 0.5;
    margin: 0 0 6px;
  }
  .bds-field-error {
    color: #e05252;
    font-size: 11px;
    margin: 2px 0 0;
  }
  .bds-confirm-box {
    background: var(--bds-surface, #f8f8f8);
    border: 1px solid var(--bds-border, #ddd);
    border-radius: 6px;
    padding: 10px 12px;
    margin-bottom: 8px;
  }
  .bds-confirm-danger {
    border-color: rgba(224, 82, 82, 0.4);
    background: rgba(224, 82, 82, 0.05);
  }
  .bds-confirm-text {
    font-size: 12px;
    margin: 0 0 8px;
    line-height: 1.5;
    opacity: 0.85;
  }

  /* ── Description snippet in project list card ── */
  .bds-project-desc-snippet {
    font-size: 11px;
    opacity: 0.55;
    overflow: hidden;
    /* Allow up to 2 lines; preserve intentional newlines from textarea input */
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    white-space: pre-line;
  }

  /* ── Description textarea (smaller than custom instructions) ── */
  .bds-desc-input {
    min-height: 60px;
  }

  /* ── Linked directory status ── */
  .bds-linked-dir-status {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 8px 10px;
    background: var(--bds-surface, #f8f8f8);
    border: 1px solid var(--bds-border, #ddd);
    border-radius: 6px;
    margin-bottom: 6px;
  }
  .bds-linked-dir-name {
    font-size: 12px;
    font-weight: 600;
    color: var(--bds-accent, #4f6ef7);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .bds-linked-dir-meta {
    font-size: 10px;
    opacity: 0.6;
  }
  .bds-linked-dir-warning {
    color: #e05252;
    font-weight: 500;
  }
  .bds-linked-dir-actions {
    display: flex;
    gap: 6px;
  }
</style>
