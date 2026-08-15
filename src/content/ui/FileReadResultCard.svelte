<script>
  import { t } from "../../lib/i18n.svelte.js";

  /**
   * @type {{
   *   path?: string,
   *   fileName?: string,
   *   linesCount?: number | string,
   *   success?: boolean,
   *   error?: string,
   *   content?: string
   * }}
   */
  let {
    path = "",
    fileName = "",
    linesCount = 0,
    success = true,
    error = "",
    content = ""
  } = $props();

  let showContent = $state(true);
  let copyFeedback = $state(false);

  let displayName = $derived.by(() => {
    if (fileName) return fileName;
    if (path) return path.split(/[/\\]/).pop() || path;
    return "file.txt";
  });

  let fullPath = $derived(path || fileName || "");
  let lines = $derived(Number(linesCount) || (content ? content.split("\n").length : 0));
  let isSuccess = $derived(Boolean(success) && !error);

  async function handleCopy() {
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      copyFeedback = true;
      setTimeout(() => { copyFeedback = false; }, 2000);
    } catch {
      // ignore
    }
  }

  function handleDownload() {
    if (!content) return;
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = displayName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function toggleContent() {
    showContent = !showContent;
  }
</script>

<article class="bds-file-read-card" class:bds-file-error={!isSuccess}>
  <div class="bds-file-header">
    <div class="bds-file-info">
      <div class="bds-file-icon" class:bds-file-icon-error={!isSuccess}>
        {#if isSuccess}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
            <polyline points="10 9 9 9 8 9"></polyline>
          </svg>
        {:else}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
        {/if}
      </div>

      <div class="bds-file-details">
        <div class="bds-file-title-row">
          <h4 class="bds-file-name" title={fullPath}>{displayName}</h4>
          {#if isSuccess && lines > 0}
            <span class="bds-lines-badge">{t('fileReadResult.linesRead', { count: lines })}</span>
          {/if}
        </div>
        {#if !isSuccess}
          <p class="bds-file-error-msg">{error || t('fileReadResult.error')}</p>
        {:else if fullPath && fullPath !== displayName}
          <p class="bds-file-path" title={fullPath}>{fullPath}</p>
        {/if}
      </div>
    </div>

    {#if isSuccess && content}
      <div class="bds-file-actions">
        <button
          type="button"
          class="bds-btn-action"
          onclick={handleCopy}
          title={copyFeedback ? t('fileReadResult.copied') : t('fileReadResult.copyCode')}
        >
          {#if copyFeedback}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            <span>{t('fileReadResult.copied')}</span>
          {:else}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            <span>{t('fileReadResult.copyCode')}</span>
          {/if}
        </button>

        <button
          type="button"
          class="bds-btn-action"
          onclick={handleDownload}
          title="Download File"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
        </button>

        <button
          type="button"
          class="bds-btn-toggle"
          onclick={toggleContent}
        >
          {showContent ? t('fileReadResult.hideContent') : t('fileReadResult.showContent')}
        </button>
      </div>
    {/if}
  </div>

  {#if isSuccess && content && showContent}
    <div class="bds-file-body">
      <pre class="bds-code-block"><code>{content.trim()}</code></pre>
    </div>
  {/if}
</article>

<style>
  .bds-file-read-card {
    margin: 10px 0;
    box-sizing: border-box;
    width: 100%;
    max-width: 100%;
    min-width: 0;
    border: 1px solid var(--bds-border, #3a3b3f);
    border-radius: 12px;
    background: var(--bds-bg-panel, #1e1f23);
    overflow: hidden;
    font-family: inherit;
    transition: border-color 0.2s ease;
  }

  .bds-file-read-card:hover {
    border-color: var(--bds-border-hover, #4e4f56);
  }

  .bds-file-error {
    border-left: 3px solid #ef4444;
  }

  .bds-file-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px;
    gap: 12px;
    flex-wrap: wrap;
  }

  .bds-file-info {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
    flex: 1 1 200px;
  }

  .bds-file-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    background: rgba(59, 130, 246, 0.1);
    border: 1px solid rgba(59, 130, 246, 0.25);
    border-radius: 8px;
    color: #3b82f6;
    flex-shrink: 0;
  }

  .bds-file-icon-error {
    background: rgba(239, 68, 68, 0.1);
    border-color: rgba(239, 68, 68, 0.25);
    color: #ef4444;
  }

  .bds-file-details {
    flex: 1;
    min-width: 0;
  }

  .bds-file-title-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .bds-file-name {
    margin: 0;
    font-size: 13.5px;
    font-weight: 600;
    color: var(--bds-text-primary, #ececec);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    line-height: 1.3;
  }

  .bds-lines-badge {
    font-size: 10px;
    font-weight: 500;
    background: var(--bds-bg-elevated, #2a2b30);
    color: var(--bds-text-secondary, #8e8ea0);
    border: 1px solid var(--bds-border, #3a3b3f);
    padding: 1px 6px;
    border-radius: 4px;
    flex-shrink: 0;
  }

  .bds-file-path {
    margin: 2px 0 0;
    font-size: 11px;
    color: var(--bds-text-tertiary, #6b6b7b);
    font-family: monospace;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .bds-file-error-msg {
    margin: 2px 0 0;
    font-size: 11px;
    color: #ef4444;
  }

  .bds-file-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .bds-btn-action {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background: var(--bds-bg-elevated, #2a2b30);
    border: 1px solid var(--bds-border, #3a3b3f);
    border-radius: 6px;
    color: var(--bds-text-secondary, #8e8ea0);
    font-size: 11.5px;
    font-weight: 500;
    padding: 5px 9px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .bds-btn-action:hover {
    background: var(--bds-bg-hover, rgba(255, 255, 255, 0.08));
    color: var(--bds-text-primary, #ececec);
    border-color: var(--bds-accent, #4d6bfe);
  }

  .bds-btn-toggle {
    background: transparent;
    border: none;
    color: var(--bds-accent, #4d6bfe);
    font-size: 11.5px;
    font-weight: 600;
    cursor: pointer;
    padding: 5px 6px;
    text-decoration: underline;
    transition: opacity 0.15s ease;
  }

  .bds-btn-toggle:hover {
    opacity: 0.8;
  }

  .bds-file-body {
    border-top: 1px solid var(--bds-border, #3a3b3f);
    background: rgba(0, 0, 0, 0.15);
    padding: 10px 14px 14px;
  }

  .bds-code-block {
    margin: 0;
    max-height: 320px;
    overflow-y: auto;
    overflow-x: auto;
    background: var(--bds-bg-elevated, #2a2b30);
    border: 1px solid var(--bds-border, #3a3b3f);
    border-radius: 8px;
    padding: 12px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 12px;
    line-height: 1.5;
    color: var(--bds-text-primary, #ececec);
    white-space: pre;
    tab-size: 2;
  }

  .bds-code-block::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }
  .bds-code-block::-webkit-scrollbar-thumb {
    background: var(--bds-border, rgba(255, 255, 255, 0.15));
    border-radius: 4px;
  }
</style>
