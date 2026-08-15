<script>
  import { t } from "../../lib/i18n.svelte.js";

  /**
   * @type {{
   *   query?: string,
   *   count?: number | string,
   *   results?: string | Array<any>,
   *   error?: string
   * }}
   */
  let {
    query = "",
    count = 0,
    results = [],
    error = ""
  } = $props();

  let parsedResults = $derived.by(() => {
    if (Array.isArray(results)) return results;
    if (typeof results === "string") {
      try {
        const parsed = JSON.parse(results);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  });

  let matchCount = $derived(Number(count) || parsedResults.length);
  let expandedIndices = $state(new Set([0])); // First match expanded by default
  let copiedIndex = $state(-1);

  function toggleExpand(idx) {
    const next = new Set(expandedIndices);
    if (next.has(idx)) {
      next.delete(idx);
    } else {
      next.add(idx);
    }
    expandedIndices = next;
  }

  async function handleCopySnippet(content, idx, event) {
    event?.stopPropagation?.();
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      copiedIndex = idx;
      setTimeout(() => {
        if (copiedIndex === idx) copiedIndex = -1;
      }, 2000);
    } catch {
      // ignore
    }
  }
</script>

<article class="bds-dir-search-card" class:bds-dir-search-error={Boolean(error)}>
  <div class="bds-dir-search-header">
    <div class="bds-dir-search-info">
      <div class="bds-dir-search-icon" class:bds-dir-search-icon-error={Boolean(error)}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
          <circle cx="12" cy="14" r="3"></circle>
          <line x1="14.5" y1="16.5" x2="17" y2="19"></line>
        </svg>
      </div>

      <div class="bds-dir-search-details">
        <h4 class="bds-dir-search-title">
          {t('directorySearchResult.resultsFor', { query: query || "Codebase Search" })}
        </h4>
        <p class="bds-dir-search-subtitle">
          {#if error}
            <span class="bds-dir-search-error-msg">{error}</span>
          {:else}
            {t('directorySearchResult.matchCount', { count: matchCount })}
          {/if}
        </p>
      </div>
    </div>
  </div>

  {#if parsedResults.length > 0}
    <div class="bds-dir-search-entries">
      {#each parsedResults as item, index}
        {@const isExpanded = expandedIndices.has(index)}
        {@const scorePercent = typeof item.score === "number" ? Math.round(item.score * 100) : null}
        <div class="bds-dir-entry" class:bds-dir-entry-expanded={isExpanded}>
          <div class="bds-dir-entry-header">
            <button
              type="button"
              class="bds-dir-entry-toggle"
              onclick={() => toggleExpand(index)}
            >
              <span class="bds-dir-entry-index">#{index + 1}</span>
              <span class="bds-dir-entry-file" title={item.fileName}>{item.fileName || "File"}</span>
              {#if item.query && item.query !== query}
                <span class="bds-dir-query-badge" title="Query: {item.query}">{item.query}</span>
              {/if}
              {#if item.startLine != null && item.endLine != null}
                <span class="bds-dir-line-badge">L{item.startLine}-{item.endLine}</span>
              {/if}
              {#if scorePercent != null}
                <span class="bds-dir-score-badge">{scorePercent}% score</span>
              {/if}
            </button>

            <div class="bds-dir-entry-controls">
              <button
                type="button"
                class="bds-dir-copy-btn"
                title={copiedIndex === index ? t('directorySearchResult.copied') : t('directorySearchResult.copySnippet')}
                onclick={(e) => handleCopySnippet(item.content, index, e)}
              >
                {#if copiedIndex === index}
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                  <span>{t('directorySearchResult.copied')}</span>
                {:else}
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  </svg>
                  <span>{t('directorySearchResult.copySnippet')}</span>
                {/if}
              </button>

              <button
                type="button"
                class="bds-dir-expand-btn"
                onclick={() => toggleExpand(index)}
                aria-label="Toggle details"
              >
                <span class="bds-dir-expand-chevron">{isExpanded ? "▾" : "▸"}</span>
              </button>
            </div>
          </div>

          {#if isExpanded}
            <div class="bds-dir-entry-body">
              <pre class="bds-dir-code-block"><code>{(item.content || "").trim()}</code></pre>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {:else if !error}
    <div class="bds-dir-search-empty">
      <p>{t('directorySearchResult.noMatches')}</p>
    </div>
  {/if}
</article>

<style>
  .bds-dir-search-card {
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

  .bds-dir-search-card:hover {
    border-color: var(--bds-border-hover, #4e4f56);
  }

  .bds-dir-search-error {
    border-left: 3px solid #ef4444;
  }

  .bds-dir-search-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px;
  }

  .bds-dir-search-info {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
    flex: 1;
  }

  .bds-dir-search-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    background: rgba(168, 85, 247, 0.1);
    border: 1px solid rgba(168, 85, 247, 0.25);
    border-radius: 8px;
    color: #a855f7;
    flex-shrink: 0;
  }

  .bds-dir-search-icon-error {
    background: rgba(239, 68, 68, 0.1);
    border-color: rgba(239, 68, 68, 0.25);
    color: #ef4444;
  }

  .bds-dir-search-details {
    flex: 1;
    min-width: 0;
  }

  .bds-dir-search-title {
    margin: 0;
    font-size: 13.5px;
    font-weight: 600;
    color: var(--bds-text-primary, #ececec);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    line-height: 1.3;
  }

  .bds-dir-search-subtitle {
    margin: 2px 0 0;
    font-size: 11px;
    color: var(--bds-text-tertiary, #6b6b7b);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .bds-dir-search-error-msg {
    color: #ef4444;
  }

  .bds-dir-search-entries {
    border-top: 1px solid var(--bds-border, #3a3b3f);
  }

  .bds-dir-entry {
    border-bottom: 1px solid var(--bds-border, #3a3b3f);
    transition: background 0.15s ease;
  }

  .bds-dir-entry:last-child {
    border-bottom: none;
  }

  .bds-dir-entry-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    width: 100%;
    padding: 6px 14px;
    background: transparent;
    border: none;
    text-align: left;
    color: var(--bds-text-primary, #ececec);
    font-size: 12px;
    box-sizing: border-box;
    transition: background 0.15s ease;
  }

  .bds-dir-entry-header:hover {
    background: var(--bds-bg-hover, rgba(255, 255, 255, 0.05));
  }

  .bds-dir-entry-toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    flex: 1;
    overflow: hidden;
    background: transparent;
    border: none;
    padding: 6px 0;
    cursor: pointer;
    text-align: left;
    color: inherit;
    font-family: inherit;
    font-size: inherit;
  }

  .bds-dir-expand-btn {
    background: transparent;
    border: none;
    padding: 4px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--bds-text-tertiary, #6b6b7b);
  }

  .bds-dir-expand-btn:hover {
    color: var(--bds-text-primary, #ececec);
  }

  .bds-dir-entry-index {
    font-size: 11px;
    font-weight: 600;
    color: var(--bds-text-tertiary, #6b6b7b);
    flex-shrink: 0;
  }

  .bds-dir-entry-file {
    font-weight: 500;
    font-size: 12.5px;
    color: var(--bds-text-primary, #ececec);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .bds-dir-line-badge {
    font-size: 10px;
    background: var(--bds-bg-elevated, #2a2b30);
    color: var(--bds-text-secondary, #8e8ea0);
    border: 1px solid var(--bds-border, #3a3b3f);
    padding: 1px 5px;
    border-radius: 4px;
    font-family: monospace;
    flex-shrink: 0;
  }

  .bds-dir-query-badge {
    font-size: 10px;
    font-weight: 500;
    background: rgba(168, 85, 247, 0.12);
    color: #c084fc;
    border: 1px solid rgba(168, 85, 247, 0.25);
    padding: 1px 5px;
    border-radius: 4px;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .bds-dir-score-badge {
    font-size: 10px;
    background: rgba(168, 85, 247, 0.1);
    color: #a855f7;
    border: 1px solid rgba(168, 85, 247, 0.2);
    padding: 1px 5px;
    border-radius: 4px;
    flex-shrink: 0;
  }

  .bds-dir-entry-controls {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .bds-dir-copy-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: var(--bds-bg-elevated, #2a2b30);
    border: 1px solid var(--bds-border, #3a3b3f);
    border-radius: 4px;
    color: var(--bds-text-secondary, #8e8ea0);
    font-size: 10.5px;
    font-weight: 500;
    padding: 3px 6px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .bds-dir-copy-btn:hover {
    background: var(--bds-bg-hover, rgba(255, 255, 255, 0.08));
    color: var(--bds-text-primary, #ececec);
    border-color: var(--bds-accent, #4d6bfe);
  }

  .bds-dir-expand-chevron {
    color: var(--bds-text-tertiary, #6b6b7b);
    font-size: 11px;
    width: 12px;
    text-align: center;
  }

  .bds-dir-entry-body {
    padding: 0 14px 12px;
    background: rgba(0, 0, 0, 0.12);
  }

  .bds-dir-code-block {
    margin: 0;
    max-height: 240px;
    overflow-y: auto;
    overflow-x: auto;
    background: var(--bds-bg-elevated, #2a2b30);
    border: 1px solid var(--bds-border, #3a3b3f);
    border-radius: 6px;
    padding: 10px 12px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 11.5px;
    line-height: 1.5;
    color: var(--bds-text-primary, #ececec);
    white-space: pre;
    tab-size: 2;
  }

  .bds-dir-code-block::-webkit-scrollbar {
    width: 5px;
    height: 5px;
  }
  .bds-dir-code-block::-webkit-scrollbar-thumb {
    background: var(--bds-border, rgba(255, 255, 255, 0.15));
    border-radius: 4px;
  }

  .bds-dir-search-empty {
    padding: 14px;
    text-align: center;
    font-size: 12px;
    color: var(--bds-text-tertiary, #6b6b7b);
  }
  .bds-dir-search-empty p {
    margin: 0;
  }
</style>
