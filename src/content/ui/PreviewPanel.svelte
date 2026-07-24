<script>
  import { onMount, onDestroy } from "svelte";
  import { t } from "../../lib/i18n.svelte.js";
  import { triggerTextDownload } from "../../lib/utils/download.js";
  import { sendPromptToChat } from "../auto.js";

  let { visible = false, title = "", content = "", onclose } = $props();

  let panelWidth = $state(520);
  let isDragging = $state(false);

  let iframeElement = $state(null);
  let hasError = $state(false);
  let errorDetails = $state(null);

  let showMenu = $state(false);
  let selectedOption = $state("buggy");
  let otherText = $state("");
  let isSending = $state(false);
  let sendFailed = $state(false);

  let dragCleanup = null;

  function handleMessage(event) {
    if (event.data && event.data.type === "BDS_VISUALIZER_ERROR") {
      if (iframeElement && event.source === iframeElement.contentWindow) {
        hasError = true;
        errorDetails = event.data;
      }
    }
  }

  $effect(() => {
    if (visible) {
      hasError = false;
      errorDetails = null;
      showMenu = false;
      sendFailed = false;
      selectedOption = "buggy";
      otherText = "";
    }
  });

  let prevContent = $state(content);
  $effect(() => {
    if (visible && content !== prevContent) {
      prevContent = content;
      hasError = false;
      errorDetails = null;
      showMenu = false;
      sendFailed = false;
      selectedOption = "buggy";
      otherText = "";
    }
  });

  function handleMouseDown(e) {
    e.preventDefault();
    isDragging = true;
    const startX = e.clientX;
    const startWidth = panelWidth;

    function onMove(e) {
      const delta = e.clientX - startX;
      panelWidth = Math.min(Math.max(startWidth - delta, 300), window.innerWidth * 0.8);
    }

    function onUp() {
      isDragging = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('mouseleave', onUp);
    }

    dragCleanup = onUp;

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('mouseleave', onUp);
  }

  function handleDownload() {
    const name = (title || "preview").replace(/[<>:"|?*]/g, "_");
    triggerTextDownload(content, `${name}.html`);
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

  function handleKeydown(e) {
    if (e.key === 'Escape') close();
  }

  function close() {
    if (onclose) onclose();
  }

  function onBackdropClick(e) {
    if (e.target === e.currentTarget) close();
  }

  onMount(() => {
    window.addEventListener('keydown', handleKeydown);
    window.addEventListener('message', handleMessage);
  });

  onDestroy(() => {
    window.removeEventListener('keydown', handleKeydown);
    window.removeEventListener('message', handleMessage);
    if (dragCleanup) dragCleanup();
  });
</script>

{#if visible}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="bds-preview-backdrop" onclick={onBackdropClick} role="presentation">
    <div class="bds-preview-panel" style="width: {panelWidth}px" role="dialog" class:bds-dragging={isDragging}>
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="bds-preview-resize-handle" onmousedown={handleMouseDown}></div>
      <div class="bds-preview-header">
        <h3 class="bds-preview-title">{title}</h3>
        <div class="bds-preview-header-actions">
          <button 
            class="bds-preview-feedback-btn" 
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
          </button>

          <button class="bds-preview-btn" onclick={handleDownload} aria-label={t('previewPanel.download')} title={t('previewPanel.download')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
          </button>
          <button class="bds-preview-close" onclick={close} aria-label={t('previewPanel.close')}>✕</button>
        </div>
      </div>

      {#if showMenu && !hasError}
        <div class="bds-preview-menu">
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
              <input type="radio" id="preview-opt-buggy" name="preview-viz-reason" value="buggy" bind:group={selectedOption} />
              <label for="preview-opt-buggy">{t('visualizerCard.optionBuggy')}</label>
            </div>

            <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
            <div 
              class="bds-menu-option-card" 
              class:active={selectedOption === 'blank'}
              onclick={() => (selectedOption = 'blank')}
            >
              <input type="radio" id="preview-opt-blank" name="preview-viz-reason" value="blank" bind:group={selectedOption} />
              <label for="preview-opt-blank">{t('visualizerCard.optionBlank')}</label>
            </div>

            <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
            <div 
              class="bds-menu-option-card" 
              class:active={selectedOption === 'other'}
              onclick={() => (selectedOption = 'other')}
            >
              <input type="radio" id="preview-opt-other" name="preview-viz-reason" value="other" bind:group={selectedOption} />
              <label for="preview-opt-other">{t('visualizerCard.optionOther')}</label>
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

      <div class="bds-preview-body">
        <iframe
          bind:this={iframeElement}
          class="bds-preview-frame"
          sandbox="allow-scripts allow-forms"
          srcdoc={content}
          title={title}
        ></iframe>
      </div>
    </div>
  </div>
{/if}

<style>
  .bds-preview-backdrop {
    position: fixed;
    inset: 0;
    z-index: 2147483645;
    background: transparent;
    pointer-events: auto;
  }

  .bds-preview-panel {
    position: fixed;
    top: 0;
    right: 0;
    height: 100vh;
    max-height: 100vh;
    background: var(--bds-bg-panel, #ffffff);
    border-left: 1px solid var(--bds-border, #e4e4e7);
    box-shadow: -8px 0 32px rgba(0, 0, 0, 0.15);
    display: flex;
    flex-direction: column;
    z-index: 2147483646;
    animation: bdsPreviewSlideIn 0.2s ease-out;
  }

  @keyframes bdsPreviewSlideIn {
    from { transform: translateX(100%); }
    to { transform: translateX(0); }
  }

  .bds-preview-resize-handle {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 8px;
    margin-left: -4px;
    cursor: ew-resize;
    background: transparent;
    transition: background 0.15s;
    z-index: 1;
    user-select: none;
    -webkit-user-select: none;
  }

  .bds-preview-resize-handle:hover,
  .bds-preview-resize-handle:active {
    background: var(--bds-accent, #1e3a8a);
  }

  .bds-dragging {
    user-select: none !important;
    -webkit-user-select: none !important;
    pointer-events: none;
  }

  .bds-dragging .bds-preview-resize-handle,
  .bds-dragging .bds-preview-btn,
  .bds-dragging .bds-preview-feedback-btn,
  .bds-dragging .bds-preview-close {
    pointer-events: auto;
  }

  .bds-preview-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--bds-border, #e4e4e7);
    flex-shrink: 0;
  }

  .bds-preview-title {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    color: var(--bds-text-primary, #111);
  }

  .bds-preview-header-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .bds-preview-feedback-btn {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s ease;
  }

  .bds-preview-feedback-btn.warning {
    border: 1px solid rgba(245, 158, 11, 0.4);
    background: rgba(245, 158, 11, 0.08);
    color: #d97706;
  }

  .bds-preview-feedback-btn.warning:hover {
    background: rgba(245, 158, 11, 0.18);
    border-color: #f59e0b;
  }

  .bds-preview-feedback-btn.error {
    border: 1px solid rgba(239, 68, 68, 0.4);
    background: rgba(239, 68, 68, 0.08);
    color: #dc2626;
  }

  .bds-preview-feedback-btn.error:hover {
    background: rgba(239, 68, 68, 0.18);
    border-color: #ef4444;
  }

  .bds-preview-btn {
    width: 32px;
    height: 32px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--bds-text-tertiary, #666);
    cursor: pointer;
    font-size: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
  }

  .bds-preview-btn:hover {
    background: var(--bds-bg-hover, rgba(0,0,0,0.05));
    color: var(--bds-accent, #1e3a8a);
  }

  .bds-preview-close {
    width: 32px;
    height: 32px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--bds-text-tertiary, #666);
    cursor: pointer;
    font-size: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
  }

  .bds-preview-close:hover {
    background: var(--bds-bg-hover, rgba(0,0,0,0.05));
    color: var(--bds-text-primary, #111);
  }

  /* Popover menu inside Preview Panel */
  .bds-preview-menu {
    border-bottom: 1px solid var(--bds-border, #e4e4e7);
    background: var(--bds-bg, #fafafa);
    color: var(--bds-text-primary, #18181b);
    padding: 14px 20px;
    font-size: 12px;
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
    background: var(--bds-bg-panel, #ffffff);
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
    background: var(--bds-bg-panel, #ffffff);
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

  .bds-preview-body {
    flex-grow: 1;
    overflow: hidden;
  }

  .bds-preview-frame {
    width: 100%;
    height: 100%;
    border: none;
    background: #fff;
  }

  :global(.dark) .bds-preview-panel {
    box-shadow: -8px 0 32px rgba(0, 0, 0, 0.4);
    background: #18181b;
    border-color: #27272a;
  }

  :global(.dark) .bds-preview-feedback-btn.warning {
    border-color: rgba(245, 158, 11, 0.5);
    background: rgba(245, 158, 11, 0.15);
    color: #fbbf24;
  }

  :global(.dark) .bds-preview-feedback-btn.warning:hover {
    background: rgba(245, 158, 11, 0.25);
    border-color: #fbbf24;
  }

  :global(.dark) .bds-preview-feedback-btn.error {
    border-color: rgba(239, 68, 68, 0.5);
    background: rgba(239, 68, 68, 0.15);
    color: #f87171;
  }

  :global(.dark) .bds-preview-feedback-btn.error:hover {
    background: rgba(239, 68, 68, 0.25);
    border-color: #f87171;
  }

  :global(.dark) .bds-preview-menu {
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
