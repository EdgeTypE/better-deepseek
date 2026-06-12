<script>
  import { t } from "../../lib/i18n.svelte.js";

  let { query = "", count = "0", results = "[]" } = $props();

  let parsedResults = $derived.by(() => {
    try {
      return JSON.parse(results);
    } catch {
      return [];
    }
  });

  let resultCount = $derived(Number(count));

  let expandedResults = $state(new Set());

  function toggleResult(index) {
    const next = new Set(expandedResults);
    if (next.has(index)) {
      next.delete(index);
    } else {
      next.add(index);
    }
    expandedResults = next;
  }

  function openUrl(url) {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
</script>

<article class="bds-search-card bds-search-results">
    <div class="bds-search-header">
      <div class="bds-search-info">
        <div class="bds-search-icon bds-search-icon-results">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
        </div>
        <div class="bds-search-details">
          <h4>{t('searchResult.resultsFor', { query })}</h4>
          <p>{t('searchResult.resultCount', { count: resultCount })}</p>
        </div>
      </div>
    </div>

    <div class="bds-search-entries">
      {#each parsedResults as result, index}
        <div class="bds-search-entry">
          <button type="button" class="bds-search-entry-header" onclick={() => toggleResult(index)}>
            <span class="bds-search-rank">{index + 1}.</span>
            <span class="bds-search-title">{result.title}</span>
            <span class="bds-search-expand-icon">{expandedResults.has(index) ? '▾' : '▸'}</span>
          </button>
          {#if expandedResults.has(index)}
            <div class="bds-search-entry-body">
              {#if result.snippet}
                <p class="bds-search-snippet">{result.snippet}</p>
              {/if}
              {#if result.url}
                <button type="button" class="bds-search-url" onclick={() => openUrl(result.url)}>
                  {result.url}
                </button>
              {/if}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  </article>

<style>
  .bds-search-card {
    margin: 8px 0;
    box-sizing: border-box;
    width: 100%;
    max-width: 100%;
    min-width: 0;
    border: 1px solid var(--bds-border);
    border-radius: 12px;
    background: var(--bds-bg-panel);
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }

  .bds-search-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    min-width: 0;
    max-width: 100%;
  }

  .bds-search-info {
    display: flex;
    align-items: center;
    flex: 1 1 auto;
    gap: 12px;
    min-width: 0;
    max-width: 100%;
  }

  .bds-search-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    background-color: var(--bds-bg-elevated);
    border: 1px solid var(--bds-border);
    border-radius: 8px;
    color: var(--bds-text-tertiary);
    flex-shrink: 0;
  }

  .bds-search-icon-results {
    color: #22c55e;
  }

  .bds-search-details {
    flex: 1 1 auto;
    min-width: 0;
    max-width: 100%;
  }

  .bds-search-details h4 {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    color: var(--bds-text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .bds-search-details p {
    margin: 2px 0 0;
    font-size: 10.5px;
    color: var(--bds-text-tertiary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .bds-search-entries {
    border-top: 1px solid var(--bds-border);
    min-width: 0;
    max-width: 100%;
    overflow: hidden;
  }

  .bds-search-entry {
    border-bottom: 1px solid var(--bds-border);
    min-width: 0;
    max-width: 100%;
  }

  .bds-search-entry:last-child {
    border-bottom: none;
  }

  .bds-search-entry-header {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    max-width: 100%;
    min-width: 0;
    box-sizing: border-box;
    padding: 10px 14px;
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--bds-text-primary);
    font-size: 12px;
    text-align: left;
    transition: background 0.15s;
  }

  .bds-search-entry-header:hover {
    background: var(--bds-bg-elevated);
  }

  .bds-search-rank {
    color: var(--bds-text-tertiary);
    font-weight: 600;
    font-size: 11px;
    flex-shrink: 0;
    width: 20px;
  }

  .bds-search-title {
    flex: 1;
    display: block;
    min-width: 0;
    max-width: 100%;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .bds-search-expand-icon {
    color: var(--bds-text-tertiary);
    font-size: 11px;
    flex-shrink: 0;
  }

  .bds-search-entry-body {
    padding: 0 14px 10px 44px;
    box-sizing: border-box;
    min-width: 0;
    max-width: 100%;
    overflow: hidden;
  }

  .bds-search-snippet {
    margin: 0 0 6px;
    font-size: 11px;
    color: var(--bds-text-secondary);
    line-height: 1.4;
    display: -webkit-box;
    overflow: hidden;
    text-overflow: ellipsis;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .bds-search-url {
    display: block;
    max-width: 100%;
    margin: 0;
    padding: 0;
    background: transparent;
    border: none;
    color: #22c55e;
    font-size: 10.5px;
    cursor: pointer;
    text-decoration: underline;
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    word-break: normal;
  }

  .bds-search-url:hover {
    opacity: 0.8;
  }
</style>
