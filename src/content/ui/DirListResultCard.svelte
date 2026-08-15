<script>
  import { t } from "../../lib/i18n.svelte.js";

  /**
   * @type {{
   *   path?: string,
   *   count?: number | string,
   *   entries?: string | Array<{name?: string, type?: string}>,
   *   error?: string
   * }}
   */
  let {
    path = "/",
    count = 0,
    entries = [],
    error = ""
  } = $props();

  let parsedEntries = $derived.by(() => {
    if (Array.isArray(entries)) return entries;
    if (typeof entries === "string") {
      try {
        const parsed = JSON.parse(entries);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  });

  let entryCount = $derived(Number(count) || parsedEntries.length);

  function isDir(entry) {
    return entry.type === "dir" || String(entry.name || "").endsWith("/");
  }
</script>

<article class="bds-dir-list-card" class:bds-dir-list-error={Boolean(error)}>
  <div class="bds-dir-list-header">
    <div class="bds-dir-list-info">
      <div class="bds-dir-list-icon" class:bds-dir-list-icon-error={Boolean(error)}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
          <line x1="12" y1="11" x2="12" y2="17"></line>
          <polyline points="9 14 12 17 15 14"></polyline>
        </svg>
      </div>

      <div class="bds-dir-list-details">
        <h4 class="bds-dir-list-title">
          {t('directoryListResult.title', { path: path || "/" })}
        </h4>
        <p class="bds-dir-list-subtitle">
          {#if error}
            <span class="bds-dir-list-error-msg">{error}</span>
          {:else}
            {t('directoryListResult.entryCount', { count: entryCount })}
          {/if}
        </p>
      </div>
    </div>
  </div>

  {#if parsedEntries.length > 0}
    <div class="bds-dir-list-entries">
      {#each parsedEntries as entry}
        {@const dir = isDir(entry)}
        <div class="bds-dir-list-entry" class:bds-dir-list-entry-dir={dir}>
          <span class="bds-dir-list-entry-icon">
            {#if dir}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
              </svg>
            {:else}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
              </svg>
            {/if}
          </span>
          <span class="bds-dir-list-entry-name" title={entry.name}>{entry.name}</span>
          <span class="bds-dir-list-entry-type">
            {dir ? t('directoryListResult.folder') : t('directoryListResult.file')}
          </span>
        </div>
      {/each}
    </div>
  {:else if !error}
    <div class="bds-dir-list-empty">
      <p>{t('directoryListResult.empty')}</p>
    </div>
  {/if}
</article>

<style>
  .bds-dir-list-card {
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

  .bds-dir-list-card:hover {
    border-color: var(--bds-border-hover, #4e4f56);
  }

  .bds-dir-list-error {
    border-left: 3px solid #ef4444;
  }

  .bds-dir-list-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px;
  }

  .bds-dir-list-info {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
    flex: 1;
  }

  .bds-dir-list-icon {
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

  .bds-dir-list-icon-error {
    background: rgba(239, 68, 68, 0.1);
    border-color: rgba(239, 68, 68, 0.25);
    color: #ef4444;
  }

  .bds-dir-list-details {
    flex: 1;
    min-width: 0;
  }

  .bds-dir-list-title {
    margin: 0;
    font-size: 13.5px;
    font-weight: 600;
    color: var(--bds-text-primary, #ececec);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    line-height: 1.3;
  }

  .bds-dir-list-subtitle {
    margin: 2px 0 0;
    font-size: 11px;
    color: var(--bds-text-tertiary, #6b6b7b);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .bds-dir-list-error-msg {
    color: #ef4444;
  }

  .bds-dir-list-entries {
    border-top: 1px solid var(--bds-border, #3a3b3f);
  }

  .bds-dir-list-entry {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 14px;
    border-bottom: 1px solid var(--bds-border, #3a3b3f);
    font-size: 12.5px;
    color: var(--bds-text-primary, #ececec);
    transition: background 0.15s ease;
  }

  .bds-dir-list-entry:last-child {
    border-bottom: none;
  }

  .bds-dir-list-entry:hover {
    background: var(--bds-bg-hover, rgba(255, 255, 255, 0.05));
  }

  .bds-dir-list-entry-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    flex-shrink: 0;
    color: var(--bds-text-secondary, #8e8ea0);
  }

  .bds-dir-list-entry-dir .bds-dir-list-entry-icon {
    color: #fbbf24;
  }

  .bds-dir-list-entry-name {
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    min-width: 0;
  }

  .bds-dir-list-entry-type {
    font-size: 10px;
    background: var(--bds-bg-elevated, #2a2b30);
    color: var(--bds-text-secondary, #8e8ea0);
    border: 1px solid var(--bds-border, #3a3b3f);
    padding: 1px 5px;
    border-radius: 4px;
    flex-shrink: 0;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .bds-dir-list-empty {
    padding: 14px;
    text-align: center;
    font-size: 12px;
    color: var(--bds-text-tertiary, #6b6b7b);
  }
  .bds-dir-list-empty p {
    margin: 0;
  }
</style>