<script>
  import { onMount, onDestroy } from "svelte";
  import { t } from "../../lib/i18n.svelte.js";
  import { buildVisualizerDocument } from "../../lib/utils/html-utils.js";
  import { sendPromptToChat } from "../auto.js";

  /** @type {{content: string, onopenpanel?: (srcdoc: string) => void}} */
  let { content, onopenpanel = () => {} } = $props();

  let iframeElement = $state(null);
  let hasError = $state(false);
  let errorDetails = $state(null);

  let showMenu = $state(false);
  let selectedOption = $state("buggy");
  let otherText = $state("");
  let isSending = $state(false);
  let sendFailed = $state(false);

  $effect(() => {
    if (content) {
      hasError = false;
      errorDetails = null;
      showMenu = false;
      sendFailed = false;
      selectedOption = "buggy";
      otherText = "";
    }
  });

  let iframeSrcDoc = $derived(buildVisualizerDocument(content));

  function handleMessage(event) {
    if (event.data && event.data.type === "BDS_VISUALIZER_ERROR") {
      if (iframeElement && event.source === iframeElement.contentWindow) {
        hasError = true;
        errorDetails = event.data;
      }
    }
  }

  onMount(() => {
    window.addEventListener("message", handleMessage);
  });

  onDestroy(() => {
    window.removeEventListener("message", handleMessage);
  });

  function openInPanel() {
    onopenpanel(iframeSrcDoc);
  }

  function handleFeedbackBtnClick() {
    if (hasError) {
      sendErrorPrompt();
    } else {
      showMenu = !showMenu;
    }
  }

  async function sendErrorPrompt() {
    if (isSending) return;
    isSending = true;

    const msg = errorDetails?.message || "Unknown runtime error";
    const line = errorDetails?.lineno != null ? `Line: ${errorDetails.lineno}` : "";
    const col = errorDetails?.colno != null ? `Col: ${errorDetails.colno}` : "";
    const stack = errorDetails?.stack ? `\nStack Trace:\n${errorDetails.stack}` : "";

    const promptText = `<BDS:VISUALIZER_FEEDBACK type="runtime_error" reason="Visualizer Runtime Error">
A runtime error occurred in the Visualizer code:
Error: ${msg}
${line} ${col}${stack}

Please fix the error and regenerate the <BDS:VISUALIZER> code.
</BDS:VISUALIZER_FEEDBACK>`;

    try {
      const ok = await sendPromptToChat(promptText, "Visualizer Error Feedback");
      if (!ok) sendFailed = true;
    } finally {
      isSending = false;
    }
  }

  async function handleSubmitMenuFeedback() {
    if (isSending) return;
    isSending = true;

    let reasonLabel = "";
    if (selectedOption === "buggy") {
      reasonLabel = t("visualizerCard.optionBuggy");
    } else if (selectedOption === "blank") {
      reasonLabel = t("visualizerCard.optionBlank");
    } else if (selectedOption === "other") {
      reasonLabel = `${t("visualizerCard.optionOther")}: ${otherText.trim() || t("visualizerCard.otherEmptyFallback")}`;
    }

    const promptText = `<BDS:VISUALIZER_FEEDBACK type="user_report" reason="${reasonLabel.replace(/"/g, '&quot;')}">
A Visualizer issue was reported:
Reason: ${reasonLabel}
Please consider the issue and regenerate the <BDS:VISUALIZER> code.
</BDS:VISUALIZER_FEEDBACK>`;

    try {
      const ok = await sendPromptToChat(promptText, "Visualizer User Feedback");
      if (ok) {
        showMenu = false;
      } else {
        sendFailed = true;
      }
    } finally {
      isSending = false;
    }
  }
</script>

<div class="bds-visualizer-card">
  <header class="bds-visualizer-header">
    <div class="bds-visualizer-header-left">
      <h4>{t('visualizerCard.title')}</h4>
      <p>{t('visualizerCard.subtitle')}</p>
    </div>
    <div class="bds-visualizer-header-actions">
      <button 
        class="bds-visualizer-feedback-btn" 
        class:error={hasError}
        class:warning={!hasError}
        onclick={handleFeedbackBtnClick} 
        title={hasError ? t('visualizerCard.reportErrorTooltip') : t('visualizerCard.reportWarningTooltip')}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          {#if hasError}
            <polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"></polygon>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          {:else}
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
            <line x1="12" y1="9" x2="12" y2="13"></line>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          {/if}
        </svg>
        <span>{hasError ? t('visualizerCard.runtimeError') : t('visualizerCard.reportIssue')}</span>
      </button>

      <button class="bds-visualizer-panel-btn" onclick={openInPanel} title={t('visualizerCard.openInPanel')}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 3 21 3 21 9"></polyline>
          <line x1="10" y1="14" x2="21" y2="3"></line>
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7"></path>
        </svg>
        {t('visualizerCard.openInPanel')}
      </button>
    </div>
  </header>

  {#if showMenu && !hasError}
    <div class="bds-visualizer-menu">
      <div class="bds-menu-header">
        <div class="bds-menu-title-row">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
            <line x1="12" y1="9" x2="12" y2="13"></line>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          </svg>
          <span class="bds-menu-title">{t('visualizerCard.reportIssue')}</span>
        </div>
        <button class="bds-menu-close-btn" onclick={() => (showMenu = false)}>✕</button>
      </div>

      <div class="bds-menu-options">
        <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
        <div 
          class="bds-menu-option-card" 
          class:active={selectedOption === 'buggy'}
          onclick={() => (selectedOption = 'buggy')}
        >
          <input type="radio" id="viz-opt-buggy" name="viz-reason" value="buggy" bind:group={selectedOption} />
          <label for="viz-opt-buggy">{t('visualizerCard.optionBuggy')}</label>
        </div>

        <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
        <div 
          class="bds-menu-option-card" 
          class:active={selectedOption === 'blank'}
          onclick={() => (selectedOption = 'blank')}
        >
          <input type="radio" id="viz-opt-blank" name="viz-reason" value="blank" bind:group={selectedOption} />
          <label for="viz-opt-blank">{t('visualizerCard.optionBlank')}</label>
        </div>

        <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
        <div 
          class="bds-menu-option-card" 
          class:active={selectedOption === 'other'}
          onclick={() => (selectedOption = 'other')}
        >
          <input type="radio" id="viz-opt-other" name="viz-reason" value="other" bind:group={selectedOption} />
          <label for="viz-opt-other">{t('visualizerCard.optionOther')}</label>
        </div>
      </div>

      {#if selectedOption === 'other'}
        <textarea
          class="bds-menu-textarea"
          bind:value={otherText}
          placeholder={t('visualizerCard.otherPlaceholder')}
          rows="2"
        ></textarea>
      {/if}

      {#if sendFailed}
        <p class="bds-menu-error">{t('visualizerCard.sendFailed')}</p>
      {/if}

      <div class="bds-menu-actions">
        <button class="bds-menu-cancel" onclick={() => (showMenu = false)}>{t('visualizerCard.cancel')}</button>
        <button class="bds-menu-submit" onclick={handleSubmitMenuFeedback} disabled={isSending}>
          {t('visualizerCard.sendAndRegenerate')}
        </button>
      </div>
    </div>
  {/if}

  <div class="bds-visualizer-body">
    <iframe
      bind:this={iframeElement}
      class="bds-visualizer-frame"
      title={t('visualizerCard.title')}
      sandbox="allow-scripts allow-forms"
      srcdoc={iframeSrcDoc}
    ></iframe>
  </div>
</div>

<style>
  .bds-visualizer-card {
    border: 1px solid var(--bds-border, #d1d5db);
    border-radius: 8px;
    background: var(--bds-bg-panel, #ffffff);
    padding: 12px;
    margin: 10px 0;
    font-family: inherit;
    color: var(--bds-text-primary, #111);
    height: 600px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .bds-visualizer-header {
    margin-bottom: 8px;
    border-bottom: 1px solid var(--bds-border, #e5e7eb);
    padding-bottom: 6px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .bds-visualizer-header-left {
    min-width: 0;
  }

  .bds-visualizer-header-left h4 {
    margin: 0;
    font-size: 11px;
    font-weight: 900;
    text-transform: uppercase;
    color: #1e3a8a;
    letter-spacing: 0.05em;
  }

  .bds-visualizer-header-left p {
    margin: 0;
    font-size: 10px;
    color: #666;
  }

  .bds-visualizer-header-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .bds-visualizer-feedback-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
    transition: all 0.15s ease;
  }

  .bds-visualizer-feedback-btn.warning {
    border: 1px solid rgba(245, 158, 11, 0.4);
    background: rgba(245, 158, 11, 0.08);
    color: #d97706;
  }

  .bds-visualizer-feedback-btn.warning:hover {
    background: rgba(245, 158, 11, 0.18);
    border-color: #f59e0b;
    box-shadow: 0 2px 6px rgba(245, 158, 11, 0.15);
  }

  .bds-visualizer-feedback-btn.error {
    border: 1px solid rgba(239, 68, 68, 0.4);
    background: rgba(239, 68, 68, 0.08);
    color: #dc2626;
  }

  .bds-visualizer-feedback-btn.error:hover {
    background: rgba(239, 68, 68, 0.18);
    border-color: #ef4444;
    box-shadow: 0 2px 6px rgba(239, 68, 68, 0.15);
  }

  .bds-visualizer-panel-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    border: 1px solid var(--bds-border, #d1d5db);
    border-radius: 6px;
    background: transparent;
    color: var(--bds-text-primary, #000);
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
    transition: all 0.15s;
  }

  .bds-visualizer-panel-btn:hover {
    background: var(--bds-bg-hover, rgba(0,0,0,0.05));
    border-color: var(--bds-accent, #1e3a8a);
    color: var(--bds-accent, #1e3a8a);
  }

  /* ── Sleek Popover Menu ── */
  .bds-visualizer-menu {
    border: 1px solid var(--bds-border, #e4e4e7);
    border-radius: 10px;
    background: var(--bds-bg-panel, #ffffff);
    color: var(--bds-text-primary, #18181b);
    padding: 12px 14px;
    margin-bottom: 10px;
    font-size: 12px;
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.12), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
    display: flex;
    flex-direction: column;
    gap: 10px;
    flex-shrink: 0;
    animation: bdsMenuFade 0.15s ease-out;
  }

  @keyframes bdsMenuFade {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .bds-menu-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .bds-menu-title-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .bds-menu-title {
    font-weight: 700;
    font-size: 12px;
    letter-spacing: -0.01em;
  }

  .bds-menu-close-btn {
    border: none;
    background: transparent;
    color: var(--bds-text-tertiary, #a1a1aa);
    cursor: pointer;
    font-size: 13px;
    padding: 2px 4px;
    border-radius: 4px;
    transition: all 0.15s;
  }

  .bds-menu-close-btn:hover {
    color: var(--bds-text-primary, #111);
    background: var(--bds-bg-hover, rgba(0,0,0,0.05));
  }

  .bds-menu-options {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .bds-menu-option-card {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border: 1px solid var(--bds-border, #e4e4e7);
    border-radius: 7px;
    background: var(--bds-bg, #fafafa);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .bds-menu-option-card:hover {
    background: var(--bds-bg-hover, #f4f4f5);
    border-color: rgba(245, 158, 11, 0.4);
  }

  .bds-menu-option-card.active {
    border-color: #f59e0b;
    background: rgba(245, 158, 11, 0.06);
  }

  .bds-menu-option-card input[type="radio"] {
    accent-color: #f59e0b;
    cursor: pointer;
    margin: 0;
  }

  .bds-menu-option-card label {
    cursor: pointer;
    font-size: 11px;
    font-weight: 500;
    flex-grow: 1;
    user-select: none;
  }

  .bds-menu-textarea {
    width: 100%;
    box-sizing: border-box;
    padding: 8px 10px;
    border: 1px solid var(--bds-border, #d4d4d8);
    border-radius: 7px;
    font-family: inherit;
    font-size: 11px;
    background: var(--bds-bg, #ffffff);
    color: inherit;
    resize: vertical;
    outline: none;
    transition: border-color 0.15s;
  }

  .bds-menu-textarea:focus {
    border-color: #f59e0b;
    box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.15);
  }

  .bds-menu-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 2px;
  }

  .bds-menu-cancel {
    padding: 5px 12px;
    border: 1px solid var(--bds-border, #d4d4d8);
    border-radius: 6px;
    background: transparent;
    color: var(--bds-text-primary, #3f3f46);
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
  }

  .bds-menu-cancel:hover {
    background: var(--bds-bg-hover, rgba(0,0,0,0.05));
  }

  .bds-menu-submit {
    padding: 6px 14px;
    border: none;
    border-radius: 6px;
    background: linear-gradient(135deg, #f59e0b, #d97706);
    color: #ffffff;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 2px 5px rgba(245, 158, 11, 0.25);
    transition: all 0.15s ease;
  }

  .bds-menu-submit:hover {
    background: linear-gradient(135deg, #d97706, #b45309);
    transform: translateY(-1px);
    box-shadow: 0 4px 8px rgba(245, 158, 11, 0.3);
  }

  .bds-menu-submit:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }

  .bds-menu-error {
    color: #ef4444;
    font-size: 11px;
    margin: 0;
  }

  .bds-visualizer-body {
    flex-grow: 1;
    overflow: hidden;
  }

  .bds-visualizer-frame {
    width: 100%;
    height: 100%;
    border: 1px solid var(--bds-border, #d1d5db);
    background: #fff;
    display: block;
    overflow: hidden;
    border-radius: 6px;
  }

  .bds-visualizer-frame::-webkit-scrollbar {
    display: none;
  }

  :global(.dark) .bds-visualizer-card {
    background: #111;
    border-color: #333;
    color: #ececec;
  }

  :global(.dark) .bds-visualizer-header-left h4 {
    color: #60a5fa;
  }

  :global(.dark) .bds-visualizer-header-left p {
    color: #9ca3af;
  }

  :global(.dark) .bds-visualizer-panel-btn {
    border-color: #444;
    color: var(--bds-text-primary, #ececec);
  }

  :global(.dark) .bds-visualizer-panel-btn:hover {
    background: rgba(255,255,255,0.08);
  }

  :global(.dark) .bds-visualizer-feedback-btn.warning {
    border-color: rgba(245, 158, 11, 0.5);
    background: rgba(245, 158, 11, 0.15);
    color: #fbbf24;
  }

  :global(.dark) .bds-visualizer-feedback-btn.warning:hover {
    background: rgba(245, 158, 11, 0.25);
    border-color: #fbbf24;
  }

  :global(.dark) .bds-visualizer-feedback-btn.error {
    border-color: rgba(239, 68, 68, 0.5);
    background: rgba(239, 68, 68, 0.15);
    color: #f87171;
  }

  :global(.dark) .bds-visualizer-feedback-btn.error:hover {
    background: rgba(239, 68, 68, 0.25);
    border-color: #f87171;
  }

  :global(.dark) .bds-visualizer-menu {
    background: #18181b;
    border-color: #27272a;
    color: #f4f4f5;
  }

  :global(.dark) .bds-menu-option-card {
    background: #202023;
    border-color: #27272a;
  }

  :global(.dark) .bds-menu-option-card:hover {
    background: #27272a;
  }

  :global(.dark) .bds-menu-option-card.active {
    border-color: #f59e0b;
    background: rgba(245, 158, 11, 0.12);
  }

  :global(.dark) .bds-menu-textarea {
    background: #121214;
    border-color: #27272a;
    color: #f4f4f5;
  }

  :global(.dark) .bds-menu-cancel {
    border-color: #3f3f46;
    color: #a1a1aa;
  }

  :global(.dark) .bds-menu-cancel:hover {
    background: #27272a;
    color: #f4f4f5;
  }
</style>