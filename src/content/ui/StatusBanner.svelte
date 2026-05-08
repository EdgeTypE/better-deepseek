<script>
  import appState from "../state.js";

  let status = $state(appState.serverStatus);

  window.addEventListener("bds:status-updated", (event) => {
    status = event.detail;
  });

  const isOutage = $derived(status.indicator && status.indicator !== 'none');
  const bannerClass = $derived(`ds-status-banner ds-status-${status.indicator}`);
</script>

{#if isOutage}
<div class={bannerClass}>
  <div class="ds-status-icon">
    {#if status.indicator === 'critical'}
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
    {:else}
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
    {/if}
  </div>
  <div class="ds-status-content">
    <div class="ds-status-title">
      DeepSeek {status.indicator} issue detected | {status.description}
    </div>
    <div class="ds-status-message">
      The problem is not on your end, it's on DeepSeek's side. Servers may be experiencing issues due to high load or maintenance.
    </div>
  </div>
</div>
{/if}

<style>
  .ds-status-banner {
    position: fixed;
    top: 24px;
    left: 50%;
    transform: translateX(-50%);
    width: 92%;
    max-width: 480px;
    z-index: 2147483647;
    padding: 14px 20px;
    border-radius: 12px;
    display: flex;
    align-items: flex-start;
    gap: 14px;
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
    border: 1px solid var(--ds-border-color, rgba(0, 0, 0, 0.1));
    animation: ds-banner-slide 0.5s cubic-bezier(0.16, 1, 0.3, 1);
    color: var(--ds-text-primary, #000);
    background: var(--ds-bg-nav, rgba(255, 255, 255, 0.9));
  }

  /* DeepSeek usually has a dark theme mode */
  :global(.dark) .ds-status-banner {
    background: var(--ds-bg-nav, rgba(30, 30, 33, 0.9));
    color: var(--ds-text-primary, #fff);
    border-color: var(--ds-border-color, rgba(255, 255, 255, 0.1));
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  }

  @keyframes ds-banner-slide {
    from { transform: translate(-50%, -40px); opacity: 0; }
    to { transform: translate(-50%, 0); opacity: 1; }
  }

  .ds-status-icon {
    flex-shrink: 0;
    width: 20px;
    height: 20px;
    margin-top: 2px;
  }

  /* DeepSeek native status colors */
  .ds-status-minor .ds-status-icon { color: var(--ds-warning-color, #eab308); }
  .ds-status-major .ds-status-icon { color: var(--ds-warning-color, #f97316); }
  .ds-status-critical .ds-status-icon { color: var(--ds-error-color, #ef4444); }

  .ds-status-critical {
    border-color: var(--ds-error-color, rgba(239, 68, 68, 0.4));
  }

  .ds-status-content {
    flex-grow: 1;
  }

  .ds-status-title {
    font-weight: 700;
    font-size: 13px;
    margin-bottom: 2px;
    color: var(--ds-text-primary, inherit);
  }

  .ds-status-message {
    font-size: 12px;
    color: var(--ds-text-secondary, rgba(0, 0, 0, 0.6));
    line-height: 1.5;
  }

  :global(.dark) .ds-status-message {
    color: var(--ds-text-secondary, rgba(255, 255, 255, 0.6));
  }
</style>
