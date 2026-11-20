<script>
  import { t } from "../../lib/i18n.svelte.js";
  import appState from "../state.js";
  import { STORAGE_KEYS } from "../../lib/constants.js";
  import { parseAnnouncementMessage } from "../../lib/announcement-parser.js";

  let announcements = $state(appState.remoteAnnouncements || []);
  let dismissedAnnouncements = $state(appState.dismissedAnnouncements || []);
  let showHistory = $state(false);

  $effect(() => {
    const onRemoteUpdated = (event) => {
      announcements = Array.isArray(event.detail) ? event.detail : [];
    };
    const onOpenHistory = () => {
      showHistory = true;
    };
    window.addEventListener("bds:remote-announcement-updated", onRemoteUpdated);
    window.addEventListener("bds:open-announcement-history", onOpenHistory);
    return () => {
      window.removeEventListener("bds:remote-announcement-updated", onRemoteUpdated);
      window.removeEventListener("bds:open-announcement-history", onOpenHistory);
    };
  });

  // Keep dismissed list in sync with global state
  $effect(() => {
    if (Array.isArray(appState.dismissedAnnouncements)) {
      dismissedAnnouncements = appState.dismissedAnnouncements;
    }
  });

  const getAnnouncementId = (ann) => {
    if (!ann) return "";
    return ann.id || ann.message || "";
  };

  const isDismissed = (ann) => {
    if (!ann || !ann.show) return true;
    const id = getAnnouncementId(ann);
    return dismissedAnnouncements.includes(id);
  };

  const dismiss = async (ann, e) => {
    if (e) e.stopPropagation();
    
    const id = getAnnouncementId(ann);
    if (!id) return;

    if (!dismissedAnnouncements.includes(id)) {
      const newList = [...dismissedAnnouncements, id];
      appState.dismissedAnnouncements = newList;
      dismissedAnnouncements = newList;
      await chrome.storage.local.set({ [STORAGE_KEYS.dismissedAnnouncements]: newList });
    }
  };

  let validAnnouncements = $derived((Array.isArray(announcements) ? announcements : [])
    .filter(ann => ann && ann.message));

  let activeAnnouncements = $derived(validAnnouncements
    .filter(ann => ann.show && !isDismissed(ann)));

  let pastAnnouncements = $derived(validAnnouncements
    .filter(ann => !ann.show || isDismissed(ann))
    .slice()
    .reverse());
</script>

{#snippet announcementBody(ann)}
  <div class="bds-announcement-icon">
    {#if ann.type === 'error'}
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
    {:else if ann.type === 'warning'}
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
    {:else}
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
    {/if}
  </div>
  <div class="bds-announcement-content">
    {#each parseAnnouncementMessage(ann.message) as token}
      {#if token.type === 'link'}
        <a
          href={token.href}
          target="_blank"
          rel="noopener noreferrer"
          class="bds-announcement-link"
          onclick={(e) => e.stopPropagation()}
        >{token.text}</a>
      {:else if token.type === 'bold'}
        <strong>{token.text}</strong>
      {:else if token.type === 'italic'}
        <em>{token.text}</em>
      {:else if token.type === 'code'}
        <code class="bds-announcement-code">{token.text}</code>
      {:else}
        {token.text}
      {/if}
    {/each}
  </div>
{/snippet}

{#if activeAnnouncements.length > 0 || showHistory}
<div class="bds-announcements-container">
  {#each activeAnnouncements as ann (getAnnouncementId(ann))}
  <div class="bds-announcement bds-announcement--{ann.type || 'info'}">
    {@render announcementBody(ann)}
    <div class="bds-announcement-actions">
      {#if pastAnnouncements.length > 0}
      <button
        class="bds-announcement-history-btn"
        class:active={showHistory}
        type="button"
        onclick={(e) => { e.stopPropagation(); showHistory = !showHistory; }}
        aria-label={t('announcementBanner.viewPast')}
        aria-expanded={showHistory}
        title={t('announcementBanner.viewPast')}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>
      </button>
      {/if}
      <button 
        class="bds-announcement-close" 
        type="button"
        onclick={(e) => dismiss(ann, e)}
        aria-label={t('announcementBanner.dismiss')}
        title={t('announcementBanner.dismiss')}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  </div>
  {/each}

  {#if showHistory}
  <div class="bds-announcement-history">
    <div class="bds-announcement-history-header">
      <span class="bds-announcement-history-title">{t('announcementBanner.pastTitle')}</span>
      <button
        class="bds-announcement-close"
        type="button"
        onclick={() => showHistory = false}
        aria-label={t('announcementBanner.closePast')}
        title={t('announcementBanner.closePast')}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div class="bds-announcement-history-list">
      {#if pastAnnouncements.length === 0}
        <div class="bds-announcement-history-empty">{t('announcementBanner.noPast')}</div>
      {:else}
        {#each pastAnnouncements as ann (getAnnouncementId(ann))}
        <div class="bds-announcement-history-item bds-announcement--{ann.type || 'info'}">
          {@render announcementBody(ann)}
        </div>
        {/each}
      {/if}
    </div>
  </div>
  {/if}
</div>
{/if}

<style>
  .bds-announcements-container {
    position: fixed;
    top: 16px;
    left: 50%;
    transform: translateX(-50%);
    width: 90%;
    max-width: 600px;
    z-index: 10001;
    display: flex;
    flex-direction: column;
    gap: 12px;
    pointer-events: none;
  }

  .bds-announcement {
    pointer-events: auto;
    padding: 12px 16px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    gap: 12px;
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    box-shadow: var(--bds-shadow);
    border: 1px solid var(--bds-border);
    animation: bds-announcement-slide 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    color: var(--bds-text-primary);
    background: color-mix(in srgb, var(--bds-bg-panel) 88%, transparent);
  }

  @keyframes bds-announcement-slide {
    from { transform: translateY(-20px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }

  .bds-announcement--info {
    border-left: 4px solid #3b82f6;
  }
  .bds-announcement--warning {
    border-left: 4px solid #f59e0b;
  }
  .bds-announcement--error {
    border-left: 4px solid #ef4444;
  }

  .bds-announcement-icon {
    flex-shrink: 0;
    width: 20px;
    height: 20px;
    opacity: 0.9;
  }

  .bds-announcement--info .bds-announcement-icon { color: #60a5fa; }
  .bds-announcement--warning .bds-announcement-icon { color: #fbbf24; }
  .bds-announcement--error .bds-announcement-icon { color: #f87171; }

  .bds-announcement-content {
    flex-grow: 1;
    font-size: 13px;
    font-weight: 500;
    line-height: 1.4;
    overflow-wrap: anywhere;
    word-break: break-word;
  }

  .bds-announcement-content a,
  .bds-announcement-link {
    color: inherit;
    text-decoration: underline;
    text-underline-offset: 3px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.2s;
  }

  .bds-announcement-content a:hover,
  .bds-announcement-link:hover {
    opacity: 0.8;
  }

  .bds-announcement-code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 0.9em;
    padding: 2px 5px;
    border-radius: 4px;
    background: color-mix(in srgb, currentColor 12%, transparent);
  }

  .bds-announcement-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  .bds-announcement-close,
  .bds-announcement-history-btn {
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    padding: 4px;
    border: none;
    background: transparent;
    color: var(--bds-text-tertiary);
    cursor: pointer;
    border-radius: 6px;
    transition: all 0.2s;
  }

  .bds-announcement-close:hover,
  .bds-announcement-history-btn:hover,
  .bds-announcement-history-btn.active {
    background: var(--bds-bg-hover);
    color: var(--bds-text-primary);
  }

  .bds-announcement-history {
    pointer-events: auto;
    border-radius: 12px;
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    box-shadow: var(--bds-shadow);
    border: 1px solid var(--bds-border);
    background: color-mix(in srgb, var(--bds-bg-panel) 92%, transparent);
    color: var(--bds-text-primary);
    overflow: hidden;
    animation: bds-announcement-slide 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .bds-announcement-history-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    border-bottom: 1px solid var(--bds-border);
  }

  .bds-announcement-history-title {
    font-size: 12px;
    font-weight: 600;
    color: var(--bds-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .bds-announcement-history-list {
    max-height: 320px;
    overflow-y: auto;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .bds-announcement-history-item {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 8px;
    border: 1px solid var(--bds-border);
    background: color-mix(in srgb, var(--bds-bg-panel) 65%, transparent);
  }

  .bds-announcement-history-empty {
    padding: 16px;
    text-align: center;
    font-size: 13px;
    color: var(--bds-text-tertiary);
  }
</style>
