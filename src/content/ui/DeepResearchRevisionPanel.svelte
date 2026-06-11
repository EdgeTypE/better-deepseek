<script>
  import { onMount, tick } from "svelte";
  import appState from "../state.js";

  let visible = $state(false);
  let runId = $state("");
  let plan = $state(null);
  let feedbackText = $state("");
  let panelElement = $state(null);
  let attached = $state(false);
  let initialAttachAttempted = $state(false);

  onMount(() => {
    const handleOpenRevision = (event) => {
      const detail = event.detail || {};
      runId = String(detail.runId || "");
      plan = detail.plan || null;
      feedbackText = "";
      attached = false;
      initialAttachAttempted = false;
      visible = true;
      void tick().then(() => {
        attachToPromptBox();
        initialAttachAttempted = true;
        focusFeedbackInput();
      });
    };

    window.addEventListener("bds:deep-research-open-revision", handleOpenRevision);

    const interval = setInterval(() => {
      if (visible) attachToPromptBox();
    }, 500);

    return () => {
      window.removeEventListener("bds:deep-research-open-revision", handleOpenRevision);
      clearInterval(interval);
    };
  });

  function attachToPromptBox() {
    if (!panelElement) return;

    const editor = findEditor();
    const target = document.querySelector("._75e1990") ||
                   document.querySelector("._6f68655") ||
                   document.querySelector("._77cefa5") ||
                   document.querySelector("._24fad49") ||
                   document.querySelector(".ds-textarea") ||
                   editor?.closest(".ds-textarea") ||
                   editor?.parentElement;

    if (target && panelElement.parentElement !== target) {
      const activeElement = document.activeElement;
      const wasFocused = activeElement && panelElement.contains(activeElement);
      target.prepend(panelElement);
      if (wasFocused && activeElement) {
        setTimeout(() => activeElement.focus(), 10);
      }
    }
    attached = Boolean(target && panelElement.parentElement === target);
  }

  function findEditor() {
    const selectors = [
      "textarea#chat-input",
      ".ds-textarea textarea",
      '[role="textbox"][contenteditable]',
      '[role="textbox"]',
      ".ProseMirror[contenteditable]",
      "textarea[placeholder]",
      "input[placeholder]",
      "[contenteditable]",
      "textarea",
    ];

    for (const selector of selectors) {
      const matches = Array.from(document.querySelectorAll(selector));
      const editor = matches.find((candidate) => !isBdsPanelElement(candidate));
      if (editor) return editor;
    }

    return null;
  }

  function isBdsPanelElement(element) {
    return Boolean(element?.closest?.("#bds-root, .bds-question-panel, .bds-dr-revision-panel"));
  }

  function focusFeedbackInput() {
    panelElement?.querySelector?.(".bds-dr-revision-input")?.focus();
  }

  async function submitFeedback(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    const feedback = feedbackText.trim();
    const detail = { runId, plan, feedback };

    attached = false;
    initialAttachAttempted = false;
    visible = false;
    feedbackText = "";
    await tick();

    window.dispatchEvent(new CustomEvent("bds:deep-research-revise", { detail }));
    window.dispatchEvent(new CustomEvent("bds:deep-research-revision-submitted", {
      detail: { runId: detail.runId, feedback: detail.feedback },
    }));
  }

  function dismiss(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    attached = false;
    initialAttachAttempted = false;
    visible = false;
    feedbackText = "";
    if (appState.ui?.showToast) {
      appState.ui.showToast("Deep Research revision cancelled.");
    }
  }

  function stopNativeEvent(event) {
    event?.stopPropagation?.();
    event?.stopImmediatePropagation?.();
  }

  function handlePanelPointerDown(event) {
    event?.stopPropagation?.();
    event?.stopImmediatePropagation?.();
    if (event?.target?.closest?.("button")) return;
    setTimeout(focusFeedbackInput, 0);
  }

  function handleFeedbackPointerDown(event) {
    event?.stopPropagation?.();
    event?.stopImmediatePropagation?.();
    setTimeout(focusFeedbackInput, 0);
  }
</script>

{#if visible}
  <div
    class="bds-dr-revision-panel"
    class:bds-dr-revision-panel--hidden={!attached && !initialAttachAttempted}
    bind:this={panelElement}
    onpointerdown={handlePanelPointerDown}
    aria-hidden={!attached && !initialAttachAttempted}
    data-testid="deep-research-revision-panel"
  >
    <div class="bds-dr-revision-header">
      <div>
        <div class="bds-dr-revision-title">Request Plan Changes</div>
        {#if runId}
          <div class="bds-dr-revision-run">Run: {runId.slice(0, 8)}</div>
        {/if}
      </div>
      <button type="button" class="bds-dr-revision-close" onclick={dismiss} aria-label="Close Deep Research revision">&times;</button>
    </div>

    <textarea
      class="bds-dr-revision-input"
      placeholder="Describe what should change in the research plan..."
      bind:value={feedbackText}
      onpointerdown={handleFeedbackPointerDown}
      onmousedown={stopNativeEvent}
      onclick={stopNativeEvent}
      onkeydown={stopNativeEvent}
      onkeyup={stopNativeEvent}
      data-testid="deep-research-revision-input"
    ></textarea>

    <div class="bds-dr-revision-actions">
      <button type="button" class="bds-dr-revision-btn" onclick={dismiss}>
        Cancel
      </button>
      <button type="button" class="bds-dr-revision-btn bds-dr-revision-submit" onclick={submitFeedback} data-testid="deep-research-revision-submit">
        Submit Feedback
      </button>
    </div>
  </div>
{/if}

<style>
  .bds-dr-revision-panel {
    position: relative;
    z-index: 99999;
    pointer-events: auto !important;
    background: var(--bds-bg-panel, #1e1f23);
    border: 1px solid var(--bds-border, #3a3b3f);
    border-radius: 14px;
    padding: 14px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 12px;
    font-family: inherit;
    width: 100%;
    margin-bottom: 12px;
  }

  .bds-dr-revision-panel--hidden {
    visibility: hidden;
    pointer-events: none !important;
  }

  .bds-dr-revision-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .bds-dr-revision-title {
    font-size: 15px;
    font-weight: 600;
    color: var(--bds-text-primary, #ececec);
    line-height: 1.35;
  }

  .bds-dr-revision-run {
    margin-top: 2px;
    font-size: 11px;
    color: var(--bds-text-tertiary, rgba(255, 255, 255, 0.5));
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }

  .bds-dr-revision-close {
    background: none;
    border: none;
    color: var(--bds-text-tertiary, #6b6b7b);
    font-size: 20px;
    line-height: 1;
    cursor: pointer;
    padding: 0 4px;
  }

  .bds-dr-revision-close:hover {
    color: var(--bds-text-primary, #ececec);
  }

  .bds-dr-revision-input {
    width: 100%;
    min-height: 86px;
    padding: 10px;
    border-radius: 10px;
    border: 1px solid var(--bds-border, #3a3b3f);
    font-size: 14px;
    resize: vertical;
    color: var(--bds-text-primary, #ececec);
    background: var(--bds-bg-elevated, #2a2b30);
    box-sizing: border-box;
    font-family: inherit;
    outline: none;
  }

  .bds-dr-revision-input:focus {
    border-color: var(--bds-accent, #5b7bff);
  }

  .bds-dr-revision-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    border-top: 1px solid var(--bds-border, #3a3b3f);
    padding-top: 12px;
  }

  .bds-dr-revision-btn {
    background: var(--bds-bg-hover, rgba(255, 255, 255, 0.08));
    color: var(--bds-text-primary, #ececec);
    border: 1px solid var(--bds-border, #3a3b3f);
    padding: 6px 14px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
  }

  .bds-dr-revision-btn:hover {
    opacity: 0.9;
  }

  .bds-dr-revision-submit {
    background: var(--bds-accent, #5b7bff);
    color: #fff;
    border-color: var(--bds-accent, #5b7bff);
  }
</style>
