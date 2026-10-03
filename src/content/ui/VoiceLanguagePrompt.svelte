<script>
  import { t } from "../../lib/i18n.svelte.js";
  import { SPEECH_LANGUAGES } from "../../lib/constants.js";

  let { show = false, current = "", onconfirm, oncancel } = $props();

  const fallbackLang =
    typeof navigator !== "undefined" && navigator.language ? navigator.language : "en-US";

  let selected = $state(current || fallbackLang);

  // Re-seed on each open so the dialog starts from the saved language, not the
  // previous attempt.
  $effect(() => {
    if (show) selected = current || fallbackLang;
  });

  /** Keep an unlisted saved language visible in the list. */
  const languages = $derived(
    selected && !SPEECH_LANGUAGES.some((l) => l.value === selected)
      ? [{ value: selected, label: selected }, ...SPEECH_LANGUAGES]
      : SPEECH_LANGUAGES,
  );
</script>

{#if show}
  <div
    class="bds-vlp-overlay"
    role="dialog"
    aria-modal="true"
    onclick={oncancel}
    onkeydown={(e) => e.key === "Escape" && oncancel()}
  >
    <div class="bds-vlp-dialog" onclick={(e) => e.stopPropagation()}>
      <h3 class="bds-vlp-title">{t('voiceLangPrompt.title')}</h3>
      <p class="bds-vlp-hint">{t('voiceLangPrompt.hint')}</p>
      <select class="bds-select" bind:value={selected}>
        {#each languages as lang (lang.value)}
          <option value={lang.value}>{lang.label}</option>
        {/each}
      </select>
      <div class="bds-vlp-actions">
        <button type="button" class="bds-btn-outlined" onclick={oncancel}>{t('common.cancel')}</button>
        <button type="button" class="bds-btn" onclick={() => onconfirm(selected)}>{t('voiceLangPrompt.confirm')}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .bds-vlp-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2147483647;
  }
  .bds-vlp-dialog {
    background: var(--bds-bg-panel, #1e1f23);
    border: 1px solid var(--bds-border, #333);
    border-radius: var(--bds-radius, 14px);
    padding: 24px;
    max-width: 420px;
    width: 90%;
    box-shadow: var(--bds-shadow, 0 12px 40px rgba(0, 0, 0, 0.3));
  }
  .bds-vlp-title {
    margin: 0 0 8px;
    font-size: 15px;
    font-weight: 700;
    color: var(--bds-text-primary, #e5e5e5);
  }
  .bds-vlp-hint {
    margin: 0 0 16px;
    font-size: 12px;
    line-height: 1.5;
    color: var(--bds-text-secondary, #8e8ea0);
  }
  .bds-vlp-actions {
    display: flex;
    gap: 10px;
    justify-content: flex-end;
    margin-top: 16px;
  }
</style>
