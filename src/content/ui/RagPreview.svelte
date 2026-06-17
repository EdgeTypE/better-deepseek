<script>
  import { onMount, onDestroy } from "svelte";
  import { slide } from "svelte/transition";
  import { searchActiveProjectRAG } from "../../lib/rag-engine.js";
  import { getActiveProjects, getFilesForActiveProjects, getFilesForProject } from "../project-manager.js";
  import appState from "../state.js";
  import { t } from "../../lib/i18n.svelte.js";

  let allChunks = $state([]);
  let panelExpanded = $state(false);
  let isVisible = $state(false);
  let debounceTimer = null;
  let textarea = $state(null);
  let rootEl = $state(null);
  let expandedFiles = $state(new Set());

  const DEBOUNCE_MS = 350;
  const MIN_QUERY_LENGTH = 8;
  const MAX_FILES = 10;

  let totalUniqueFiles = $derived.by(() => {
    const s = new Set();
    for (const c of allChunks) s.add(c.fileName);
    return s.size;
  });

  let fileGroups = $derived.by(() => {
    const map = new Map();
    for (const chunk of allChunks) {
      const key = `${chunk.projectName || ""}|${chunk.fileName}`;
      if (!map.has(key)) {
        map.set(key, { fileName: chunk.fileName, projectName: chunk.projectName, chunks: [] });
      }
      map.get(key).chunks.push(chunk);
    }
    const entries = Array.from(map.values()).slice(0, MAX_FILES);
    return entries.map((group) => ({
      fileName: group.fileName,
      projectName: group.projectName,
      lines: group.chunks.map(c => `${c.startLine}-${c.endLine}`).join(", "),
      chunks: group.chunks.map(c => ({
        startLine: c.startLine,
        endLine: c.endLine,
        content: c.content,
      })),
    }));
  });

  function toggleFile(fileName) {
    const next = new Set(expandedFiles);
    if (next.has(fileName)) next.delete(fileName);
    else next.add(fileName);
    expandedFiles = next;
  }

  function findTextarea() {
    return document.querySelector("textarea#chat-input") ||
           document.querySelector(".ds-textarea textarea") ||
           document.querySelector("textarea");
  }

  function findChatContainer() {
    return document.querySelector("._75e1990") ||
           document.querySelector("._6f68655") ||
           document.querySelector("._77cefa5") ||
           document.querySelector("._24fad49") ||
           document.querySelector(".ds-textarea") ||
           findTextarea()?.closest(".ds-textarea") ||
           findTextarea()?.parentElement;
  }

  function attachToContainer() {
    if (!rootEl) return;
    const target = findChatContainer();
    if (target && rootEl.parentElement !== target) {
      target.prepend(rootEl);
    }
  }

  function getProjectFiles() {
    const projects = getActiveProjects();
    if (!projects.length) return null;

    if (appState.settings.projectRagEnabled) {
      return getFilesForActiveProjects(true);
    }
    return getFilesForActiveProjects(false);
  }

  function runRagSearch(query) {
    const files = getProjectFiles();
    if (!files || !files.length || !appState.settings.projectRagEnabled) {
      isVisible = false;
      return;
    }

    const limit = Number(appState.settings.projectRagLimit) || 5;
    const projectGroups = new Map();
    for (const file of files) {
      const projectName = file.projectName || "Project";
      if (!projectGroups.has(projectName)) projectGroups.set(projectName, []);
      projectGroups.get(projectName).push(file);
    }

    const chunks = [];
    const perProjectLimit = Math.max(1, Math.ceil(limit / projectGroups.size));
    for (const [projectName, projectFiles] of projectGroups) {
      const projectChunks = searchActiveProjectRAG(query, projectFiles, perProjectLimit);
      for (const chunk of projectChunks) {
        chunks.push({ ...chunk, projectName });
      }
    }
    chunks.sort((a, b) => (b.score || 0) - (a.score || 0));

    if (chunks && chunks.length > 0) {
      allChunks = chunks;
      expandedFiles = new Set();
      panelExpanded = false;
      isVisible = true;
      attachToContainer();
    } else {
      isVisible = false;
      panelExpanded = false;
    }
  }

  function handleInput() {
    if (!textarea) return;
    const text = textarea.value.trim();

    if (text.length < MIN_QUERY_LENGTH) {
      isVisible = false;
      panelExpanded = false;
      return;
    }

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      panelExpanded = false;
      runRagSearch(text);
    }, DEBOUNCE_MS);
  }

  let pollInterval = null;
  let prevListenerTextarea = null;

  function attachListener() {
    const ta = findTextarea();
    if (ta && ta !== prevListenerTextarea) {
      if (prevListenerTextarea) {
        prevListenerTextarea.removeEventListener("input", handleInput);
      }
      ta.addEventListener("input", handleInput);
      prevListenerTextarea = ta;
    }
    return ta;
  }

  onMount(() => {
    textarea = attachListener();
    attachToContainer();
    pollInterval = setInterval(() => {
      textarea = attachListener();
      if (isVisible) attachToContainer();
    }, 1000);
  });

  onDestroy(() => {
    clearInterval(pollInterval);
    clearTimeout(debounceTimer);
    if (prevListenerTextarea) {
      prevListenerTextarea.removeEventListener("input", handleInput);
    }
  });
</script>

<div bind:this={rootEl} class="bds-rag-preview" class:visible={isVisible} role="status" aria-live="polite">
  {#if isVisible && allChunks.length > 0}
    <button
      class="bds-rag-header"
      onclick={() => (panelExpanded = !panelExpanded)}
      aria-expanded={panelExpanded}
    >
      <span class="bds-rag-header-main">
        <span class="bds-rag-icon">&#x1F50D;</span>
        <span class="bds-rag-title">{t('ragPreview.title')}</span>
        <span class="bds-rag-count">{totalUniqueFiles}</span>
      </span>
      <span class="bds-rag-chevron">{panelExpanded ? "▲" : "▼"}</span>
    </button>

    {#if panelExpanded}
      <div class="bds-rag-files" transition:slide={{ duration: 200 }}>
        {#each fileGroups as group (group.fileName)}
          <div class="bds-rag-file-group">
            <button
              class="bds-rag-file-row"
              onclick={() => toggleFile(group.fileName)}
              aria-expanded={expandedFiles.has(group.fileName)}
            >
              <span class="bds-rag-file-chevron">
                {expandedFiles.has(group.fileName) ? "▼" : "▶"}
              </span>
              <span class="bds-rag-file-name">
                {#if group.projectName}<span class="bds-rag-project-name">{group.projectName}</span> {/if}
                {group.fileName}
              </span>
              <span class="bds-rag-file-lines">{group.lines}</span>
            </button>

            {#if expandedFiles.has(group.fileName)}
              <div class="bds-rag-chunks" transition:slide={{ duration: 150 }}>
                {#each group.chunks as chunk, i}
                  <div class="bds-rag-chunk">
                    <div class="bds-rag-chunk-label">
                      {t('ragPreview.lines', { start: chunk.startLine, end: chunk.endLine })}
                    </div>
                    <pre class="bds-rag-chunk-code"><code>{chunk.content}</code></pre>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/each}
        {#if totalUniqueFiles > MAX_FILES}
          <div class="bds-rag-more">{t('ragPreview.moreFiles', { count: totalUniqueFiles - MAX_FILES })}</div>
        {/if}
      </div>
    {/if}
  {/if}
</div>

<style>
  .bds-rag-preview {
    display: none;
    margin-bottom: 4px;
    user-select: none;
  }

  .bds-rag-preview.visible {
    display: block;
    animation: bds-rag-fadein 0.15s ease-out;
  }

  .bds-rag-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 6px 10px;
    background: var(--bds-bg-elevated, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--bds-border, rgba(255, 255, 255, 0.08));
    border-radius: 8px;
    color: var(--bds-text-tertiary, rgba(255, 255, 255, 0.5));
    font-size: 11px;
    cursor: pointer;
    transition: background 0.15s;
    box-sizing: border-box;
    -webkit-appearance: none;
    appearance: none;
    font-family: inherit;
    line-height: 1.4;
    gap: 8px;
  }

  .bds-rag-header:hover {
    background: var(--bds-bg-hover, rgba(255, 255, 255, 0.08));
  }

  .bds-rag-header-main {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .bds-rag-icon {
    font-size: 10px;
    flex-shrink: 0;
  }

  .bds-rag-title {
    opacity: 0.6;
    white-space: nowrap;
  }

  .bds-rag-count {
    background: var(--bds-accent, #4f9bff);
    color: #fff;
    font-size: 9px;
    font-weight: 700;
    padding: 1px 6px;
    border-radius: 99px;
    line-height: 1.5;
    flex-shrink: 0;
  }

  .bds-rag-chevron {
    font-size: 8px;
    opacity: 0.4;
    flex-shrink: 0;
  }

  .bds-rag-files {
    margin-top: 4px;
    border: 1px solid var(--bds-border, rgba(255, 255, 255, 0.08));
    border-radius: 8px;
    overflow: hidden;
  }

  .bds-rag-file-group {
    border-bottom: 1px solid var(--bds-border, rgba(255, 255, 255, 0.05));
  }

  .bds-rag-file-group:last-child {
    border-bottom: none;
  }

  .bds-rag-file-row {
    display: flex;
    align-items: baseline;
    gap: 6px;
    width: 100%;
    padding: 5px 10px;
    font-size: 10px;
    cursor: pointer;
    transition: background 0.12s;
    box-sizing: border-box;
    -webkit-appearance: none;
    appearance: none;
    border: none;
    background: transparent;
    color: inherit;
    font-family: inherit;
    line-height: inherit;
    text-align: left;
  }

  .bds-rag-file-row:hover {
    background: var(--bds-bg-hover, rgba(255, 255, 255, 0.06));
  }

  .bds-rag-file-chevron {
    font-size: 7px;
    opacity: 0.35;
    flex-shrink: 0;
    width: 10px;
  }

  .bds-rag-file-name {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 10px;
    color: var(--bds-accent, #4f9bff);
    opacity: 0.85;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
    flex: 1;
  }

  .bds-rag-project-name {
    display: inline-block;
    font-size: 9px;
    font-weight: 600;
    color: var(--bds-text-secondary, rgba(255, 255, 255, 0.65));
    background: var(--bds-bg-elevated, rgba(255, 255, 255, 0.06));
    padding: 1px 5px;
    border-radius: 4px;
    margin-right: 4px;
    vertical-align: middle;
  }

  .bds-rag-file-lines {
    font-size: 9px;
    color: var(--bds-text-tertiary);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .bds-rag-chunks {
    border-top: 1px solid var(--bds-border, rgba(255, 255, 255, 0.05));
  }

  .bds-rag-chunk {
    border-bottom: 1px solid var(--bds-border, rgba(255, 255, 255, 0.04));
  }

  .bds-rag-chunk:last-child {
    border-bottom: none;
  }

  .bds-rag-chunk-label {
    padding: 3px 10px 0;
    font-size: 9px;
    color: var(--bds-text-tertiary);
  }

  .bds-rag-chunk-code {
    margin: 0;
    padding: 4px 10px 6px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 10px;
    line-height: 1.5;
    color: var(--bds-text-secondary, rgba(255, 255, 255, 0.65));
    overflow-x: auto;
    white-space: pre;
    max-height: 160px;
    overflow-y: auto;
  }

  .bds-rag-chunk-code code {
    font-family: inherit;
  }

  .bds-rag-more {
    padding: 5px 10px;
    font-size: 10px;
    opacity: 0.4;
    text-align: center;
  }

  @keyframes bds-rag-fadein {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>
