<script>
  import { t } from "../../lib/i18n.svelte.js";

  let { show = false, message = "", onconfirm, oncancel } = $props();
</script>

{#if show}
  <div class="bds-confirm-overlay" role="dialog" onclick={oncancel} onkeydown={(e) => e.key === 'Escape' && oncancel()}>
    <div class="bds-confirm-dialog" onclick={(e) => e.stopPropagation()}>
      <p class="bds-confirm-message">{message}</p>
      <div class="bds-confirm-actions">
        <button type="button" class="bds-btn-outlined" onclick={oncancel}>{t('common.cancel')}</button>
        <button type="button" class="bds-btn-danger" onclick={onconfirm}>{t('common.delete')}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .bds-confirm-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2147483647;
  }
  .bds-confirm-dialog {
    background: var(--bds-bg-panel, #1e1f23);
    border: 1px solid var(--bds-border, #333);
    border-radius: var(--bds-radius, 14px);
    padding: 24px;
    max-width: 420px;
    width: 90%;
    box-shadow: var(--bds-shadow, 0 12px 40px rgba(0,0,0,0.3));
  }
  .bds-confirm-message {
    margin: 0 0 20px;
    font-size: 14px;
    line-height: 1.5;
    color: var(--bds-text-primary, #e5e5e5);
    word-break: break-word;
  }
  .bds-confirm-actions {
    display: flex;
    gap: 10px;
    justify-content: flex-end;
  }
</style>
