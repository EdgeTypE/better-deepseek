<script>
  import { injectPureTextAndSend } from "../auto.js";
  import { t } from "../../lib/i18n.svelte.js";

  /** @type {{ label?: string, query?: string, button?: string }} */
  let { label = "", query = "", button = "" } = $props();

  let sending = $state(false);
  let sent = $state(false);

  const buttonText = $derived(
    sent ? t("followUp.sent") : button || t("followUp.accept"),
  );

  async function handleSend() {
    if (sending || sent || !query) return;
    sending = true;
    try {
      const ok = await injectPureTextAndSend(query, "Follow-up");
      if (ok) {
        sent = true;
      }
    } finally {
      sending = false;
    }
  }
</script>

{#if label || query}
  <div class="bds-followup-card" class:bds-followup-sent={sent}>
    <div class="bds-followup-label">{label || query}</div>
    <div class="bds-followup-actions">
      <button
        type="button"
        class="bds-followup-btn"
        title={query}
        disabled={sending || sent}
        onclick={handleSend}
      >
        {#if sent}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        {:else}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <polyline points="15 10 20 15 15 20"></polyline>
            <path d="M4 4v7a4 4 0 0 0 4 4h12"></path>
          </svg>
        {/if}
        <span>{buttonText}</span>
      </button>
    </div>
  </div>
{/if}

<style>
  .bds-followup-card {
    margin: 14px 0 4px;
    padding: 12px 0 2px;
    border-top: 1px solid var(--bds-border, rgba(255, 255, 255, 0.1));
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 10px 16px;
  }

  .bds-followup-label {
    flex: 1 1 260px;
    font-size: 14.5px;
    line-height: 1.5;
    color: var(--bds-text-primary, #ececec);
    user-select: text;
  }

  .bds-followup-actions {
    margin-left: auto;
    flex-shrink: 0;
    display: flex;
    align-items: center;
  }

  .bds-followup-btn {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 6px 14px;
    border-radius: 999px;
    border: 1px solid var(--bds-border, #3a3b3f);
    background: var(--bds-bg-elevated, #2a2b30);
    color: var(--bds-text-primary, #ececec);
    font-size: 13px;
    font-weight: 500;
    line-height: 1.3;
    cursor: pointer;
    white-space: nowrap;
    transition:
      background var(--bds-transition, 0.18s ease),
      border-color var(--bds-transition, 0.18s ease),
      color var(--bds-transition, 0.18s ease),
      transform 0.12s ease,
      opacity 0.15s ease;
  }

  .bds-followup-btn svg {
    opacity: 0.8;
    flex-shrink: 0;
  }

  .bds-followup-btn:hover:not(:disabled) {
    background: var(--bds-accent-glow, rgba(91, 123, 255, 0.15));
    border-color: var(--bds-accent, #5b7bff);
    color: var(--bds-accent, #5b7bff);
  }

  .bds-followup-btn:hover:not(:disabled) svg {
    opacity: 1;
  }

  .bds-followup-btn:active:not(:disabled) {
    transform: scale(0.98);
  }

  .bds-followup-btn:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .bds-followup-sent .bds-followup-label {
    color: var(--bds-text-secondary, #8e8ea0);
  }
</style>
