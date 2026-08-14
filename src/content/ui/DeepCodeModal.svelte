<script>
  import appState from "../state.js";
  import { linkDirectory, supportsLocalDirectoryLinking } from "../../lib/local-directory-source.js";
  import { setDeepCodeDirectory, getCachedPathForFolder, saveCachedPathForFolder, tryResolveHarnessWorkspacePath } from "../deep-code.js";

  let { show = false, activeDirectory = null, fileCount = 0, onclose = null } = $props();

  let loading = $state(false);
  let errorMessage = $state("");
  let successMessage = $state("");
  let manualPath = $state(appState.deepCode.manualPath || "");

  let prevShow = false;
  $effect(() => {
    if (show && !prevShow) {
      manualPath = appState.deepCode.manualPath || "";
      if (activeDirectory && !manualPath) {
        getCachedPathForFolder(activeDirectory).then((cached) => {
          if (cached) manualPath = cached;
        });
      }
    }
    prevShow = show;
  });

  async function handleSelectFolder() {
    errorMessage = "";
    successMessage = "";
    loading = true;
    try {
      if (!supportsLocalDirectoryLinking()) {
        throw new Error("File System Access API is not supported on this browser context.");
      }
      const res = await linkDirectory("deepcode-active-project");
      
      // Auto-retrieve path from cache or query Harness workspaces
      let pathForFolder = await getCachedPathForFolder(res.rootName);
      if (!pathForFolder) {
        pathForFolder = await tryResolveHarnessWorkspacePath(res.rootName);
      }
      if (!pathForFolder && manualPath.trim()) {
        pathForFolder = manualPath.trim();
      }

      await setDeepCodeDirectory(res.rootName, res.fileCount, pathForFolder);
      manualPath = appState.deepCode.manualPath || pathForFolder || "";

      if (pathForFolder) {
        successMessage = `Linked "${res.rootName}" (${res.fileCount} files) — Path: ${pathForFolder}`;
      } else {
        successMessage = `Linked "${res.rootName}" (${res.fileCount} files indexed). Please confirm system path below.`;
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        errorMessage = err.message || "Failed to select directory.";
      }
    } finally {
      loading = false;
    }
  }

  async function handleManualSubmit() {
    const p = manualPath.trim();
    if (!p) return;
    errorMessage = "";
    try {
      const folderName = activeDirectory || p.split(/[/\\]/).pop() || p;
      await setDeepCodeDirectory(folderName, fileCount, p);
      await saveCachedPathForFolder(folderName, p);
      successMessage = `Saved absolute workspace path: "${p}".`;
    } catch (err) {
      errorMessage = err.message || "Failed to save directory path.";
    }
  }

  function handleOverlayClick() {
    if (onclose) onclose();
  }
</script>

{#if show}
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="bds-modal-overlay"
    role="dialog"
    onclick={handleOverlayClick}
    onkeydown={(e) => e.key === 'Escape' && onclose?.()}
  >
    <div class="bds-modal-card" onclick={(e) => e.stopPropagation()}>
      <div class="bds-modal-header">
        <h3>⚡ DeepCode & Harness Workspace</h3>
        <button class="bds-close-btn" onclick={onclose}>×</button>
      </div>

      <div class="bds-modal-body">
        <p class="bds-subtitle">
          Select a local codebase folder for BDS tools (file reading, RAG indexing) and specify its absolute path for DeepSeek Harness execution.
        </p>

        {#if activeDirectory}
          <div class="bds-active-dir-badge">
            <span class="bds-dot"></span>
            <div>
              <strong>Active Codebase:</strong> {activeDirectory} ({fileCount} indexed files)
              {#if manualPath}
                <div class="bds-badge-path"><code>{manualPath}</code></div>
              {/if}
            </div>
          </div>
        {:else}
          <div class="bds-active-dir-badge bds-empty">
            No local directory currently linked.
          </div>
        {/if}

        <div class="bds-actions-group">
          <button
            type="button"
            class="bds-btn-primary"
            disabled={loading}
            onclick={handleSelectFolder}
          >
            {loading ? "Indexing..." : "📁 Pick Local Folder..."}
          </button>
        </div>

        <div class="bds-divider"><span>ABSOLUTE SYSTEM PATH (FOR HARNESS CWD)</span></div>

        <div class="bds-manual-section">
          <label class="bds-input-label" for="bds-manual-path-input">
            Full System Directory Path (Required for DeepSeek Harness):
          </label>
          <div class="bds-manual-input-row">
            <input
              id="bds-manual-path-input"
              type="text"
              placeholder="e.g. A:/Users/Edige/GitHub/asistan"
              bind:value={manualPath}
              class="bds-input-text"
            />
            <button type="button" class="bds-btn-secondary" onclick={handleManualSubmit}>
              Save Path
            </button>
          </div>
          <p class="bds-hint">
            Browser security prevents web apps from reading host paths directly. Saving it once permanently attaches it to "{activeDirectory || 'your project'}".
          </p>
        </div>

        {#if errorMessage}
          <div class="bds-error-msg">⚠️ {errorMessage}</div>
        {/if}
        {#if successMessage}
          <div class="bds-success-msg">✅ {successMessage}</div>
        {/if}
      </div>

      <div class="bds-modal-footer">
        <button type="button" class="bds-btn-outlined" onclick={onclose}>Done</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .bds-modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.65);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2147483647;
  }
  .bds-modal-card {
    background: var(--bds-bg-panel, #18191c);
    border: 1px solid var(--bds-border, #333438);
    border-radius: 16px;
    padding: 24px;
    max-width: 520px;
    width: 90%;
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.4);
    color: var(--bds-text-primary, #ececec);
    font-family: inherit;
  }
  .bds-modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
  }
  .bds-modal-header h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
  }
  .bds-close-btn {
    background: transparent;
    border: none;
    color: var(--bds-text-secondary, #9ca3af);
    font-size: 20px;
    cursor: pointer;
    line-height: 1;
  }
  .bds-subtitle {
    font-size: 13px;
    color: var(--bds-text-secondary, #9ca3af);
    margin: 0 0 16px;
    line-height: 1.5;
  }
  .bds-active-dir-badge {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding: 10px 14px;
    font-size: 13px;
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin-bottom: 16px;
  }
  .bds-badge-path {
    margin-top: 4px;
    font-size: 11px;
    color: #60a5fa;
  }
  .bds-active-dir-badge.bds-empty {
    color: #9ca3af;
  }
  .bds-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #10b981;
    display: inline-block;
    margin-top: 5px;
    flex-shrink: 0;
  }
  .bds-actions-group {
    display: flex;
    gap: 10px;
    margin-bottom: 16px;
  }
  .bds-btn-primary {
    background: #2563eb;
    color: white;
    border: none;
    border-radius: 8px;
    padding: 10px 18px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .bds-btn-primary:hover:not(:disabled) {
    background: #1d4ed8;
  }
  .bds-divider {
    display: flex;
    align-items: center;
    text-align: center;
    margin: 18px 0 12px;
    color: #6b7280;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.05em;
  }
  .bds-divider::before,
  .bds-divider::after {
    content: '';
    flex: 1;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }
  .bds-divider span {
    padding: 0 10px;
  }
  .bds-manual-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .bds-input-label {
    font-size: 11px;
    color: #9ca3af;
    font-weight: 500;
  }
  .bds-manual-input-row {
    display: flex;
    gap: 8px;
  }
  .bds-input-text {
    flex: 1;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 8px;
    padding: 8px 12px;
    font-size: 13px;
    color: white;
    font-family: monospace;
  }
  .bds-input-text:focus {
    outline: none;
    border-color: #2563eb;
  }
  .bds-btn-secondary {
    background: rgba(255, 255, 255, 0.1);
    color: white;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 8px;
    padding: 8px 14px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
  }
  .bds-btn-secondary:hover {
    background: rgba(255, 255, 255, 0.15);
  }
  .bds-hint {
    font-size: 11px;
    color: #6b7280;
    margin: 4px 0 0;
    line-height: 1.4;
  }
  .bds-error-msg {
    margin-top: 12px;
    padding: 8px 12px;
    background: rgba(239, 68, 68, 0.15);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 6px;
    color: #f87171;
    font-size: 12px;
  }
  .bds-success-msg {
    margin-top: 12px;
    padding: 8px 12px;
    background: rgba(16, 185, 129, 0.15);
    border: 1px solid rgba(16, 185, 129, 0.3);
    border-radius: 6px;
    color: #34d399;
    font-size: 12px;
  }
  .bds-modal-footer {
    display: flex;
    justify-content: flex-end;
    margin-top: 20px;
    padding-top: 12px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }
  .bds-btn-outlined {
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 8px;
    padding: 8px 16px;
    color: #ececec;
    cursor: pointer;
    font-size: 13px;
  }
  .bds-btn-outlined:hover {
    background: rgba(255, 255, 255, 0.05);
  }
</style>
