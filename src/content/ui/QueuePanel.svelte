<script>
  import { onMount } from "svelte";
  import { t } from "../../lib/i18n.svelte.js";
  import { isSystemGenerating } from "../message-processor.svelte.js";
  import { setChatInputText } from "../auto.js";
  import { queueState, addToQueue, removeFromQueue, clearQueue, reorderQueue } from "../queue-manager.svelte.js";

  let panelElement = $state(null);
  let isGenerating = $state(false);

  onMount(() => {
    // Intercept Enter keydown in prompt box while AI is generating
    const handleKeyDown = (e) => {
      if (e.key !== "Enter" || e.shiftKey || e.isComposing) return;

      const activeEl = document.activeElement;
      if (!isChatInput(activeEl)) return;

      const generating = isSystemGenerating();
      if (!generating) return;

      const text = getInputValue(activeEl).trim();
      if (!text) return;

      // Intercept Enter key when generating: queue the prompt!
      e.preventDefault();
      e.stopPropagation();

      addToQueue(text);
      setChatInputText("");

      // Focus stop button as requested
      focusStopButton();
    };

    window.addEventListener("keydown", handleKeyDown, true);

    // Periodically re-check generation state & re-attach UI panel above prompt box
    const interval = setInterval(() => {
      isGenerating = isSystemGenerating();
      attachToPromptBox();
    }, 400);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      clearInterval(interval);
    };
  });

  // Keep the panel pinned to the prompt box from mount onward (and re-pin
  // before it becomes visible), so it never flashes in #bds-root at the
  // top-right while waiting for the interval tick.
  $effect(() => {
    attachToPromptBox();
  });

  function isChatInput(element) {
    if (!element) return false;
    const tagName = String(element.tagName || "").toLowerCase();
    if (tagName === "textarea" || tagName === "input") return true;
    return (
      element.isContentEditable ||
      element.contentEditable === "true" ||
      element.classList?.contains("ProseMirror") ||
      element.hasAttribute("contenteditable")
    );
  }

  function getInputValue(element) {
    if (!element) return "";
    const tagName = String(element.tagName || "").toLowerCase();
    if (tagName === "textarea" || tagName === "input") {
      return element.value || "";
    }
    return element.textContent || "";
  }

  function focusStopButton() {
    const stopButton = document.querySelector(
      ".ds-icon-stop-circle, .ds-icon-stop, div[role='button'] svg path[d*='M3 3h10v10H3z'], div[role='button'] svg path[d*='M6 6h12v12H6z']"
    )?.closest("div[role='button'], button");
    if (stopButton) {
      setTimeout(() => stopButton.focus(), 50);
    }
  }

  function attachToPromptBox() {
    if (!panelElement) return;

    const editor = findPromptEditor();
    const target =
      document.querySelector("._75e1990") ||
      document.querySelector("._6f68655") ||
      document.querySelector("._77cefa5") ||
      document.querySelector("._24fad49") ||
      document.querySelector(".ds-textarea") ||
      editor?.closest(".ds-textarea") ||
      editor?.parentElement;

    if (target && panelElement.parentElement !== target) {
      target.prepend(panelElement);
    }
  }

  function findPromptEditor() {
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
    return Boolean(element?.closest?.("#bds-root, .bds-question-panel, .bds-queue-panel"));
  }
</script>

<div
    bind:this={panelElement}
    class="bds-question-panel bds-queue-panel"
    class:bds-queue-panel--hidden={queueState.items.length === 0}
  >
    <!-- Header -->
    <div class="bds-question-header">
      <h3>{t("queue.title")}</h3>
      <div class="bds-header-controls">
        <span class="bds-pagination">
          {#if isGenerating}
            {t("queue.waitingForAI")}
          {:else if queueState.isAutoSending}
            {t("queue.sendingNext")}
          {:else}
            {t(queueState.items.length === 1 ? "queue.itemCount.one" : "queue.itemCount.other", { count: queueState.items.length })}
          {/if}
        </span>
        <button
          type="button"
          class="bds-close-btn"
          onclick={clearQueue}
          title={t("queue.clearAll")}
        >
          ×
        </button>
      </div>
    </div>

    <!-- Body -->
    <div class="bds-question-body">
      <div class="bds-options-list">
        {#each queueState.items as item, index (item.id)}
          <div class="bds-option-item">
            <span class="bds-option-index">{index + 1}</span>
            <span class="bds-option-text" title={item.text}>{item.text}</span>
            <div class="bds-item-tools">
              {#if index > 0}
                <button
                  type="button"
                  class="bds-tool-btn"
                  onclick={() => reorderQueue(index, index - 1)}
                  title={t("queue.moveUp")}
                >
                  ↑
                </button>
              {/if}
              {#if index < queueState.items.length - 1}
                <button
                  type="button"
                  class="bds-tool-btn"
                  onclick={() => reorderQueue(index, index + 1)}
                  title={t("queue.moveDown")}
                >
                  ↓
                </button>
              {/if}
              <button
                type="button"
                class="bds-tool-btn danger"
                onclick={() => removeFromQueue(item.id)}
                title={t("common.delete")}
              >
                ✕
              </button>
            </div>
          </div>
        {/each}
      </div>
    </div>

    <!-- Footer -->
    <div class="bds-question-footer">
      <div class="bds-keyboard-hints">
        <span>💡 Enter: {t("queue.enterToQueueTip")}</span>
      </div>
      <div class="bds-footer-actions">
        <button
          type="button"
          class="bds-action-btn bds-submit-btn"
          onclick={clearQueue}
        >
          {t("queue.clearAll")}
        </button>
      </div>
    </div>
  </div>

<style>
  .bds-queue-panel {
    position: relative;
    z-index: 99999;
    pointer-events: auto !important;
    background: var(--bds-bg-panel, #1e1f23);
    border: 1px solid var(--bds-border, #3a3b3f);
    border-radius: 14px;
    padding: 16px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 16px;
    font-family: inherit;
    width: 100%;
    margin-bottom: 12px;
    box-shadow: var(--bds-shadow, 0 12px 40px rgba(0, 0, 0, 0.4));
  }

  .bds-queue-panel.bds-queue-panel--hidden {
    display: none;
  }

  .bds-question-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }

  .bds-question-header h3 {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    color: var(--bds-text-primary, #ececec);
    line-height: 1.4;
  }

  .bds-header-controls {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .bds-pagination {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: var(--bds-text-secondary, #8e8ea0);
  }

  .bds-close-btn {
    background: none;
    border: none;
    color: var(--bds-text-tertiary, #6b6b7b);
    font-size: 20px;
    cursor: pointer;
    padding: 0 4px;
    transition: color 0.2s;
    line-height: 1;
  }

  .bds-close-btn:hover {
    color: var(--bds-text-primary, #ececec);
  }

  .bds-question-body {
    display: flex;
    flex-direction: column;
  }

  .bds-options-list {
    display: flex;
    flex-direction: column;
    background: var(--bds-bg-elevated, #2a2b30);
    border: 1px solid var(--bds-border, #3a3b3f);
    border-radius: var(--bds-radius, 14px);
    overflow-y: auto;
    max-height: 280px;
  }

  .bds-option-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    background: transparent;
    border: none;
    border-bottom: 1px solid var(--bds-border, #3a3b3f);
    color: var(--bds-text-primary, #ececec);
    font-size: 14px;
    text-align: left;
    transition: all 0.2s;
    width: 100%;
    box-sizing: border-box;
  }

  .bds-option-item:last-child {
    border-bottom: none;
  }

  .bds-option-item:hover {
    background: var(--bds-bg-hover, rgba(255, 255, 255, 0.08));
  }

  .bds-option-index {
    background: var(--bds-bg-hover, rgba(255, 255, 255, 0.08));
    color: var(--bds-text-secondary, #8e8ea0);
    width: 24px;
    height: 24px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: bold;
    flex-shrink: 0;
  }

  .bds-option-text {
    flex-grow: 1;
    line-height: 1.4;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .bds-item-tools {
    display: flex;
    align-items: center;
    gap: 4px;
    opacity: 0.7;
    transition: opacity 0.2s;
  }

  .bds-option-item:hover .bds-item-tools {
    opacity: 1;
  }

  .bds-tool-btn {
    background: transparent;
    border: none;
    color: var(--bds-text-secondary, #8e8ea0);
    cursor: pointer;
    font-size: 12px;
    padding: 2px 6px;
    border-radius: 4px;
    transition: all 0.15s;
  }

  .bds-tool-btn:hover {
    background: var(--bds-bg-hover, rgba(255, 255, 255, 0.12));
    color: var(--bds-text-primary, #ececec);
  }

  .bds-tool-btn.danger:hover {
    color: #f87171;
    background: rgba(239, 68, 68, 0.15);
  }

  /* Footer */
  .bds-question-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-top: 1px solid var(--bds-border, #3a3b3f);
    padding-top: 12px;
  }

  .bds-keyboard-hints {
    display: flex;
    gap: 12px;
    font-size: 11px;
    color: var(--bds-text-tertiary, #6b6b7b);
  }

  .bds-footer-actions {
    display: flex;
    gap: 8px;
  }

  .bds-action-btn {
    background: var(--bds-bg-hover, rgba(255, 255, 255, 0.08));
    color: var(--bds-text-primary, #ececec);
    border: 1px solid var(--bds-border, #3a3b3f);
    padding: 6px 16px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .bds-action-btn:hover {
    background: var(--bds-bg-hover, rgba(255, 255, 255, 0.12));
  }

  .bds-action-btn.bds-submit-btn {
    background: var(--bds-accent, #5b7bff);
    color: #fff;
    border-color: var(--bds-accent, #5b7bff);
  }

  .bds-action-btn.bds-submit-btn:hover {
    opacity: 0.95;
  }

  /* Custom Scrollbar */
  .bds-options-list::-webkit-scrollbar {
    width: 6px;
  }
  .bds-options-list::-webkit-scrollbar-track {
    background: transparent;
  }
  .bds-options-list::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.25);
    border-radius: 3px;
  }
  .bds-options-list::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.4);
  }
</style>
