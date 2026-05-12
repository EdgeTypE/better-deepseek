<script>
  import { onMount } from "svelte";
  import { VERSION_HISTORY, LATEST_VERSION } from "../../lib/versions.js";
  import { STORAGE_KEYS } from "../../lib/constants.js";
  import appState from "../state.js";

  let { onDismiss } = $props();
  let modalRef = $state(null);
  let view = $state("latest"); // "latest" veya "history"

  function dismiss() {
    chrome.storage.local.set({ [STORAGE_KEYS.whatsNewPending]: false });
    appState.whatsNewPending = false;
    if (onDismiss) onDismiss();
  }

  function handleKeydown(e) {
    if (e.key === "Escape") {
      if (view === "history") {
        view = "latest";
      } else {
        dismiss();
      }
    }
  }

  onMount(() => {
    if (modalRef) modalRef.focus();
  });

  const ICON_MAP = {
    feature: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`,
    bugfix: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg>`,
    performance: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>`,
    memory: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>`,
    organization: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`,
    search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>`,
    settings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1V15a2 2 0 0 1-2-2 2 2 0 0 1 2-2v-.09A1.65 1.65 0 0 0 3 9.4a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2v.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`,
    interactive: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>`,
    export: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`,
    crossplatform: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>`,
    developer: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>`,
    voice: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>`,
  };

  function getIcon(type) {
    return ICON_MAP[type] || ICON_MAP.feature;
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="bds-modal-backdrop" onclick={dismiss} role="presentation">
  <div 
    bind:this={modalRef}
    class="bds-whats-new-modal" 
    onclick={(e) => e.stopPropagation()} 
    role="dialog" 
    aria-modal="true"
    tabindex="-1"
  >
    <div class="bds-modal-header">
      <div class="bds-header-left">
        {#if view === "history"}
          <button class="bds-back-btn" onclick={() => view = "latest"} aria-label="Back">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
          </button>
          <span class="bds-modal-title">Version History</span>
        {:else}
          <span class="bds-modal-title">What's New</span>
          <button class="bds-version-tag bds-version-tag--clickable" onclick={() => view = "history"}>
            v{LATEST_VERSION.version}
            <svg class="bds-chevron-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
          </button>
        {/if}
      </div>
      <button class="bds-close-btn" onclick={dismiss} aria-label="Close">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
    </div>

    <div class="bds-modal-body">
      {#if view === "latest"}
        <div class="bds-view-latest">
          <h2 class="bds-main-title">{LATEST_VERSION.title}</h2>
          
          <div class="bds-feature-list">
            {#each LATEST_VERSION.features as feature}
              <div class="bds-feature-row">
                <div class="bds-feature-icon-wrapper">
                  {@html getIcon(feature.type)}
                </div>
                <div class="bds-feature-info">
                  <h3>{feature.title}</h3>
                  <p>{@html feature.description}</p>
                </div>
              </div>
            {/each}
          </div>
          
          <a href="https://github.com/EdgeTypE/better-deepseek#changelog" target="_blank" class="bds-and-more-link">
            See all changes in v{LATEST_VERSION.version} on GitHub
          </a>
        </div>
      {:else}
        <div class="bds-view-history">
          {#each VERSION_HISTORY as ver}
            <div class="bds-history-item">
              <div class="bds-history-header">
                <span class="bds-history-version">v{ver.version}</span>
                <span class="bds-history-date">{ver.date}</span>
              </div>
              <h3 class="bds-history-title">{ver.title}</h3>
              <ul class="bds-history-features">
                {#each ver.features as feature}
                  <li>
                    <div class="bds-history-feature-icon">
                      {@html getIcon(feature.type)}
                    </div>
                    {feature.title}
                  </li>
                {/each}
              </ul>
            </div>
          {/each}

          <a href="https://github.com/EdgeTypE/better-deepseek#changelog" target="_blank" class="bds-see-more-link">
            See detailed release notes on GitHub
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
          </a>
        </div>
      {/if}
    </div>

    <div class="bds-modal-footer">
      <button class="bds-primary-btn" onclick={dismiss}>Got it, thanks!</button>
      
      <div class="bds-footer-links">
        <a href="https://github.com/EdgeTypE/better-deepseek/issues/new" target="_blank" class="bds-link">Report Bug</a>
        <span class="bds-link-sep">•</span>
        <a href="https://github.com/EdgeTypE/better-deepseek/issues/new" target="_blank" class="bds-link">Request Feature</a>
      </div>
      <div class="bds-branding-note">Better DeepSeek is an open-source community project.</div>
    </div>
  </div>
</div>

<style>
  .bds-modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
    z-index: 2147483647;
    display: flex;
    align-items: center;
    justify-content: center;
    animation: bdsFadeIn 0.2s ease-out;
  }

  @keyframes bdsFadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .bds-whats-new-modal {
    background: #1e1f23;
    border: 1px solid #3a3b3f;
    border-radius: 18px;
    width: min(92vw, 460px);
    max-height: 85vh;
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
    display: flex;
    flex-direction: column;
    outline: none;
    animation: bdsScaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  }

  @keyframes bdsScaleIn {
    from { transform: scale(0.95); opacity: 0; }
    to { transform: scale(1); opacity: 1; }
  }

  .bds-modal-header {
    padding: 20px 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid #3a3b3f;
  }

  .bds-header-left {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .bds-modal-title {
    font-size: 16px;
    font-weight: 700;
    color: #ececec;
  }

  .bds-version-tag {
    font-size: 11px;
    font-weight: 600;
    background: #2a2b30;
    color: #8e8ea0;
    padding: 2px 8px;
    border-radius: 6px;
    border: 1px solid #3a3b3f;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .bds-version-tag--clickable {
    cursor: pointer;
    transition: all 0.2s;
  }

  .bds-version-tag--clickable:hover {
    background: #3a3b3f;
    color: #ffffff;
    border-color: #4d6bfe;
  }

  .bds-chevron-icon {
    width: 10px;
    height: 10px;
    opacity: 0.6;
  }

  .bds-back-btn {
    background: transparent;
    border: none;
    color: #8e8ea0;
    cursor: pointer;
    padding: 4px;
    margin-left: -6px;
    display: flex;
    border-radius: 6px;
    transition: all 0.2s;
  }

  .bds-back-btn:hover {
    background: rgba(255, 255, 255, 0.05);
    color: #ffffff;
  }

  .bds-back-btn svg {
    width: 20px;
    height: 20px;
  }

  .bds-close-btn {
    background: transparent;
    border: none;
    color: #6b6b7b;
    cursor: pointer;
    padding: 4px;
    border-radius: 6px;
    transition: all 0.2s;
    display: flex;
  }

  .bds-close-btn:hover {
    background: rgba(255, 255, 255, 0.05);
    color: #ececec;
  }

  .bds-close-btn svg {
    width: 20px;
    height: 20px;
  }

  .bds-modal-body {
    padding: 24px;
    overflow-y: auto;
    flex: 1;
  }

  .bds-main-title {
    margin: 0 0 24px;
    font-size: 20px;
    font-weight: 800;
    color: #ffffff;
    line-height: 1.3;
  }

  .bds-feature-list {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .bds-feature-row {
    display: flex;
    gap: 16px;
    align-items: flex-start;
  }

  .bds-feature-icon-wrapper {
    width: 40px;
    height: 40px;
    min-width: 40px;
    background: #2a2b30;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 10px;
    border: 1px solid #3a3b3f;
    color: #4d6bfe;
  }

  .bds-feature-icon-wrapper :global(svg) {
    width: 20px;
    height: 20px;
  }

  .bds-feature-info h3 {
    margin: 0 0 4px;
    font-size: 14px;
    font-weight: 700;
    color: #ececec;
  }

  .bds-feature-info p {
    margin: 0;
    font-size: 13px;
    color: #8e8ea0;
    line-height: 1.5;
  }

  .bds-and-more-link {
    display: inline-block;
    margin-top: 16px;
    font-size: 12px;
    color: #6b6b7b;
    text-decoration: none;
    transition: color 0.2s;
  }

  .bds-and-more-link:hover {
    color: #4d6bfe;
    text-decoration: underline;
  }

  /* History View Styles */
  .bds-view-history {
    display: flex;
    flex-direction: column;
    gap: 32px;
  }

  .bds-history-item {
    position: relative;
  }

  .bds-history-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
  }

  .bds-history-version {
    font-size: 12px;
    font-weight: 800;
    color: #4d6bfe;
    letter-spacing: 0.5px;
  }

  .bds-history-date {
    font-size: 11px;
    color: #555565;
    font-weight: 600;
  }

  .bds-history-title {
    font-size: 16px;
    font-weight: 700;
    color: #ffffff;
    margin: 0 0 10px;
  }

  .bds-history-features {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .bds-history-features li {
    font-size: 13px;
    color: #8e8ea0;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .bds-history-feature-icon {
    width: 16px;
    height: 16px;
    color: #4d6bfe;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.8;
  }

  .bds-history-feature-icon :global(svg) {
    width: 100%;
    height: 100%;
  }

  .bds-see-more-link {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 12px;
    background: #2a2b30;
    border: 1px solid #3a3b3f;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 600;
    color: #ececec;
    text-decoration: none;
    transition: all 0.2s;
    margin-top: 8px;
  }

  .bds-see-more-link:hover {
    background: #3a3b3f;
    border-color: #4d6bfe;
    color: #ffffff;
  }

  .bds-see-more-link svg {
    width: 14px;
    height: 14px;
    color: #4d6bfe;
  }

  .bds-modal-footer {
    padding: 12px 24px 20px;
    border-top: 1px solid #3a3b3f;
  }

  .bds-primary-btn {
    width: 100%;
    background: #4d6bfe;
    color: white;
    border: none;
    padding: 12px;
    border-radius: 12px;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s;
  }

  .bds-primary-btn:hover {
    background: #5b7bff;
    box-shadow: 0 4px 12px rgba(77, 107, 254, 0.2);
  }

  .bds-primary-btn:active {
    transform: scale(0.98);
  }

  .bds-footer-links {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 8px;
    margin-top: 10px;
  }

  .bds-link {
    font-size: 11px;
    font-weight: 500;
    color: #6b6b7b;
    text-decoration: none;
    transition: color 0.2s;
  }

  .bds-link:hover {
    color: #4d6bfe;
  }

  .bds-link-sep {
    font-size: 10px;
    color: #3a3b3f;
  }

  .bds-branding-note {
    font-size: 10px;
    text-align: center;
    color: #6b6b7b;
    margin-top: 6px;
  }

  /* Scrollbar */
  .bds-modal-body::-webkit-scrollbar { width: 4px; }
  .bds-modal-body::-webkit-scrollbar-track { background: transparent; }
  .bds-modal-body::-webkit-scrollbar-thumb {
    background: #3a3b3f;
    border-radius: 10px;
  }
</style>
