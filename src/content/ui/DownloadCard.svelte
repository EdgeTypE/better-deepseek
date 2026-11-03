<script>
  import { t } from "../../lib/i18n.svelte.js";
  import { triggerBlobDownload } from "../../lib/utils/download.js";
  import { buildTreeRows } from "../../lib/utils/file-tree.js";

  /** @type {{ title: string, description: string, fileName: string, blob: Blob, files?: Array<{path: string, content: string}> }} */
  let { title, description, fileName, blob, files = [] } = $props();

  let expanded = $state(false);
  let copyFeedback = $state(false);

  let isMultiFile = $derived(files.length > 1);
  let hasBrowse = $derived(files.length > 0);

  let treeRows = $derived(isMultiFile ? buildTreeRows(files.map((f) => f.path)) : []);

  let singleContent = $derived(
    !isMultiFile && files.length === 1 ? String(files[0].content || "") : "",
  );

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(singleContent);
      copyFeedback = true;
      setTimeout(() => {
        copyFeedback = false;
      }, 2000);
    } catch {
      // fallback
    }
  }

  function handleDownload() {
    triggerBlobDownload(blob, fileName);
  }
</script>

<article class="bds-download-card">
  <div class="bds-download-card-main">
    <div class="card-left">
      <div class="icon-wrapper">
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
        </svg>
      </div>

      <div class="text-content">
        <h4>{title}</h4>
        <p>{description}</p>
      </div>
    </div>

    <div class="bds-download-actions">
      {#if hasBrowse}
        <button type="button" class="bds-btn" onclick={() => (expanded = !expanded)}>
          {isMultiFile
            ? (expanded ? t('downloadCard.hideFiles') : t('downloadCard.viewFiles'))
            : (expanded ? t('downloadCard.hideCode') : t('downloadCard.showCode'))}
        </button>
      {/if}
      <button type="button" class="bds-btn" onclick={handleDownload}>
        {t('downloadCard.download')}
      </button>
    </div>
  </div>

  {#if expanded}
    <div class="bds-download-card-panel">
      {#if isMultiFile}
        <div class="bds-download-card-tree">
          {#each treeRows as row}
            <div
              class="bds-download-card-row"
              class:bds-download-card-row-dir={row.dir}
              style="padding-left: {12 + row.depth * 16}px"
            >
              <span class="bds-download-card-row-icon">
                {#if row.dir}
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                  </svg>
                {:else}
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                  </svg>
                {/if}
              </span>
              <span class="bds-download-card-row-name">{row.name}</span>
            </div>
          {/each}
        </div>
      {:else}
        <div class="bds-download-card-code-wrapper">
          <button
            type="button"
            class="bds-download-code-copy-btn bds-btn-copy"
            onclick={handleCopy}
            title={copyFeedback ? (t('downloadCard.copied') || 'Copied!') : (t('downloadCard.copyCode') || 'Copy')}
            aria-label={copyFeedback ? (t('downloadCard.copied') || 'Copied!') : (t('downloadCard.copyCode') || 'Copy')}
          >
            {#if copyFeedback}
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            {:else}
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            {/if}
          </button>
          <pre class="bds-download-card-code">{singleContent}</pre>
        </div>
      {/if}
    </div>
  {/if}
</article>

<style>
  /* Basic Variables (Light Mode) */
  .bds-download-card {
    --bg-color: #ffffff;
    --border-color: #e5e7eb;
    --icon-bg: #f3f4f6;
    --icon-color: #6b7280;
    --title-color: #111827;
    --desc-color: #6b7280;
    --btn-border: #d1d5db;
    --btn-text: #374151;
    --btn-hover-bg: #f9fafb;
    --panel-bg: #fafafa;
    --row-hover-bg: #f3f4f6;
    --code-color: #1f2937;

    margin: 10px 0;
    border: 1px solid var(--border-color);
    border-radius: 10px;
    background-color: var(--bg-color);
    transition: all 0.2s ease;
    overflow: hidden;
  }

  /* Dark Mode Settings */
  :global(.dark) .bds-download-card {
    --bg-color: #18181b;
    --border-color: #27272a;
    --icon-bg: #27272a;
    --icon-color: #a1a1aa;
    --title-color: #ffffff;
    --desc-color: #a1a1aa;
    --btn-border: #3f3f46;
    --btn-text: #ffffff;
    --btn-hover-bg: #27272a;
    --panel-bg: #131316;
    --row-hover-bg: #27272a;
    --code-color: #e5e7eb;
  }

  .bds-download-card-main {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    gap: 12px;
  }

  .bds-download-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .card-left {
    display: flex;
    align-items: center;
    gap: 14px;
    min-width: 0;
  }

  .icon-wrapper {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 42px;
    height: 48px;
    background-color: var(--icon-bg);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    color: var(--icon-color);
  }

  .text-content {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  h4 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--title-color);
  }

  p {
    margin: 0;
    font-size: 12px;
    font-weight: 500;
    text-transform: uppercase; /* Makes ZIP text uppercase as in common UI patterns */
    color: var(--desc-color);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .bds-btn {
    background-color: transparent;
    color: var(--btn-text);
    border: 1px solid var(--btn-border);
    border-radius: 8px;
    padding: 8px 16px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .bds-btn:hover {
    background-color: var(--btn-hover-bg);
  }

  .bds-download-card-panel {
    border-top: 1px solid var(--border-color);
    background-color: var(--panel-bg);
  }

  .bds-download-card-tree {
    max-height: 280px;
    overflow-y: auto;
  }

  .bds-download-card-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 16px;
    font-size: 12.5px;
    color: var(--title-color);
    transition: background 0.15s ease;
  }

  .bds-download-card-row:hover {
    background-color: var(--row-hover-bg);
  }

  .bds-download-card-row-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    color: var(--icon-color);
  }

  .bds-download-card-row-dir .bds-download-card-row-icon {
    color: #f59e0b;
  }

  .bds-download-card-row-name {
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .bds-download-card-code-wrapper {
    position: relative;
  }

  .bds-download-code-copy-btn {
    position: absolute;
    top: 10px;
    right: 14px;
    z-index: 2;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    padding: 0;
    background: var(--bg-color);
    border: 1px solid var(--btn-border);
    border-radius: 6px;
    color: var(--icon-color);
    cursor: pointer;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
    user-select: none;
    transition: all 0.15s ease;
  }

  .bds-download-code-copy-btn:hover {
    background: var(--btn-hover-bg);
    color: var(--title-color);
    border-color: var(--btn-border);
  }

  .bds-download-code-copy-btn:active {
    transform: scale(0.92);
  }

  .bds-download-card-code {
    margin: 0;
    padding: 12px 16px;
    padding-right: 48px;
    max-height: 320px;
    overflow: auto;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 12.5px;
    line-height: 1.5;
    color: var(--code-color);
    white-space: pre;
  }
</style>