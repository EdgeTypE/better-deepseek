<script>
  import { onMount } from "svelte";
  import appState from "../state.js";

  let questions = $state([]);
  let answers = $state({});
  let customAnswers = $state({});
  let visible = $state(false);
  let currentQuestionIndex = $state(0);
  let focusedOptionIndex = $state(0);
  let panelElement = $state(null);

  onMount(() => {
    const handleQuestions = (event) => {
      questions = event.detail.questions;
      answers = {};
      customAnswers = {};
      currentQuestionIndex = 0;
      focusedOptionIndex = 0;

      // Initialize answers state
      questions.forEach((q, index) => {
        const key = q.id || `q_${index}`;
        if (q.type === "checkbox" || q.type === "multiple") {
          answers[key] = [];
        } else {
          answers[key] = "";
        }
        customAnswers[key] = "";
      });

      visible = true;

      // Inject directly into the prompt box
      setTimeout(attachToPromptBox, 100);
    };

    const handleKeyDown = (e) => {
      if (!visible || questions.length === 0) return;
      
      if (document.activeElement && document.activeElement.tagName === "INPUT") {
        return;
      }

      const q = questions[currentQuestionIndex];
      const optionsCount = q.options?.length || 0;
      const hasCustom = q.allowCustom;
      const maxIndex = optionsCount + (hasCustom ? 1 : 0) - 1;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        focusedOptionIndex = focusedOptionIndex < maxIndex ? focusedOptionIndex + 1 : 0;
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        focusedOptionIndex = focusedOptionIndex > 0 ? focusedOptionIndex - 1 : Math.max(0, maxIndex);
      } else if (e.key === "Enter") {
        e.preventDefault();
        handleEnterSelection();
      } else if (e.key === "Escape") {
        e.preventDefault();
        dismiss();
      }
    };

    window.addEventListener("bds-ask-questions", handleQuestions);
    window.addEventListener("keydown", handleKeyDown);

    // Keep checking if target changed or was replaced by framework
    const interval = setInterval(() => {
      if (visible) attachToPromptBox();
    }, 500);

    return () => {
      window.removeEventListener("bds-ask-questions", handleQuestions);
      window.removeEventListener("keydown", handleKeyDown);
      clearInterval(interval);
    };
  });

  function focusOnMount(node) {
    setTimeout(() => {
      if (node) {
        node.focus();
      }
    }, 150);
  }

  function attachToPromptBox() {
    if (!panelElement) return;
    
    const target = document.querySelector("._75e1990") || 
                   document.querySelector("._6f68655") || 
                   document.querySelector("._77cefa5") || 
                   document.querySelector("._24fad49") || 
                   document.querySelector(".ds-textarea") || 
                   findTextarea()?.closest(".ds-textarea") ||
                   findTextarea()?.parentElement;

    if (target) {
      if (panelElement.parentElement !== target) {
        const activeEl = document.activeElement;
        const wasFocused = activeEl && panelElement.contains(activeEl);

        target.prepend(panelElement);

        if (wasFocused && activeEl) {
          setTimeout(() => activeEl.focus(), 10);
        }
      }
    }
  }

  function findTextarea() {
    return document.querySelector("textarea#chat-input") || 
           document.querySelector(".ds-textarea textarea") || 
           document.querySelector("textarea");
  }

  function prevQuestion() {
    if (currentQuestionIndex > 0) {
      currentQuestionIndex--;
      focusedOptionIndex = 0;
    }
  }

  function nextQuestion() {
    if (currentQuestionIndex < questions.length - 1) {
      currentQuestionIndex++;
      focusedOptionIndex = 0;
    }
  }

  function nextOrSubmit() {
    if (currentQuestionIndex < questions.length - 1) {
      nextQuestion();
    } else {
      submitAnswers();
    }
  }

  function selectSingleOption(option) {
    const q = questions[currentQuestionIndex];
    const key = q.id || `q_${currentQuestionIndex}`;
    answers[key] = option;
    
    if (option !== "Other") {
      setTimeout(() => {
        nextOrSubmit();
      }, 250);
    }
  }

  function toggleMultipleOption(option) {
    const q = questions[currentQuestionIndex];
    const key = q.id || `q_${currentQuestionIndex}`;
    if (!Array.isArray(answers[key])) {
      answers[key] = [];
    }
    
    if (answers[key].includes(option)) {
      answers[key] = answers[key].filter(o => o !== option);
    } else {
      answers[key] = [...answers[key], option];
    }
  }

  function handleEnterSelection() {
    const q = questions[currentQuestionIndex];
    const key = q.id || `q_${currentQuestionIndex}`;
    const options = q.options || [];
    
    if (q.type === "test" || q.type === "radio" || q.type === "single") {
      if (focusedOptionIndex < options.length) {
        selectSingleOption(options[focusedOptionIndex]);
      } else if (q.allowCustom && focusedOptionIndex === options.length) {
        selectSingleOption("Other");
      }
    } else if (q.type === "checkbox" || q.type === "multiple") {
      if (focusedOptionIndex < options.length) {
        toggleMultipleOption(options[focusedOptionIndex]);
      } else if (q.allowCustom && focusedOptionIndex === options.length) {
        const inputEl = document.querySelector(".bds-custom-text-input");
        if (inputEl) inputEl.focus();
      }
    } else {
      nextOrSubmit();
    }
  }

  function hasAnswer(q, key) {
    if (q.type === "checkbox" || q.type === "multiple") {
      return (answers[key] && answers[key].length > 0) || (customAnswers[key] && customAnswers[key].trim());
    }
    if (q.type === "input" || q.type === "text") {
      return customAnswers[key] && customAnswers[key].trim();
    }
    return answers[key] && answers[key] !== "";
  }

  function submitAnswers() {
    let responseText = "Here are the answers to your clarifying questions:\n\n";
    
    questions.forEach((q, index) => {
      const key = q.id || `q_${index}`;
      const answer = answers[key];
      const custom = customAnswers[key];
      
      responseText += `### ${q.question}\n`;
      
      if (Array.isArray(answer)) {
        const selected = [...answer];
        if (q.allowCustom && custom && custom.trim()) {
          selected.push(`Other: ${custom.trim()}`);
        }
        responseText += selected.length > 0 ? `- ${selected.join("\n- ")}` : "*(No option selected / Skipped)*";
      } else {
        if (q.allowCustom && answer === "Other" && custom && custom.trim()) {
          responseText += `- ${custom.trim()}`;
        } else if (answer) {
          responseText += `- ${answer}`;
        } else if (q.type === "input" || q.type === "text") {
          responseText += custom && custom.trim() ? `- ${custom.trim()}` : "*(No answer provided / Skipped)*";
        } else if (q.type === "single" || q.type === "test" || q.type === "radio") {
          responseText += "*(No option selected / Skipped)*";
        } else {
          responseText += custom && custom.trim() ? `- ${custom.trim()}` : "*(No answer provided / Skipped)*";
        }
      }
      responseText += "\n\n";
    });

    injectTextIntoDeepSeek(responseText.trim());
    visible = false;
  }

  function injectTextIntoDeepSeek(text) {
    const textarea = findTextarea();
    if (!textarea) {
      if (appState.ui) appState.ui.showToast("Could not find DeepSeek input field.");
      return;
    }

    textarea.value = text;
    textarea.dispatchEvent(new Event("input", { bubbles: true }));

    setTimeout(robustSend, 300);
  }

  function robustSend() {
    let attempts = 0;
    const maxAttempts = 50;

    const attempt = () => {
      attempts++;
      const buttons = Array.from(document.querySelectorAll('div[role="button"], button'));
      const sendBtn = buttons.find(b => {
        const isSend = b.querySelector('svg path[d*="M8.3125"], .ds-icon-send') || 
                       b.querySelector('svg path[d*="M13.12 19.98"]') ||
                       b.title === "Send message" || 
                       b.ariaLabel === "Send Message";
        const isAttach = b.classList.contains('bds-plus-btn') || b.querySelector('svg line');
        return isSend && !isAttach;
      });

      if (sendBtn) {
        const isDisabled = sendBtn.getAttribute("aria-disabled") === "true" || 
                           sendBtn.classList.contains("ds-icon-button--disabled");
        
        if (!isDisabled) {
          sendBtn.click();
          return;
        }
      }

      if (attempts < maxAttempts) {
        setTimeout(attempt, 200);
      } else {
        const textarea = findTextarea();
        if (textarea) {
          textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, keyCode: 13 }));
        }
      }
    };

    attempt();
  }

  function dismiss() {
    visible = false;
  }
</script>

{#if visible && questions.length > 0}
  {@const q = questions[currentQuestionIndex]}
  {@const key = q.id || `q_${currentQuestionIndex}`}
  
  <div class="bds-question-panel" bind:this={panelElement}>
    <div class="bds-question-header">
      <h3>{q.question}</h3>
      <div class="bds-header-controls">
        {#if questions.length > 1}
          <div class="bds-pagination">
            <button class="bds-nav-btn" onclick={prevQuestion} disabled={currentQuestionIndex === 0}>
              &lt;
            </button>
            <span>{currentQuestionIndex + 1} of {questions.length}</span>
            <button class="bds-nav-btn" onclick={nextQuestion} disabled={currentQuestionIndex === questions.length - 1}>
              &gt;
            </button>
          </div>
        {/if}
        <button class="bds-close-btn" onclick={dismiss} title="Dismiss">&times;</button>
      </div>
    </div>

    <div class="bds-question-body">
      {#if q.type === "test" || q.type === "radio" || q.type === "single"}
        <div class="bds-options-list">
          {#each q.options || [] as option, optIndex (option)}
            <button 
              class="bds-option-item {answers[key] === option ? 'selected' : ''} {focusedOptionIndex === optIndex ? 'focused' : ''}"
              onclick={() => selectSingleOption(option)}
            >
              <span class="bds-option-index">{optIndex + 1}</span>
              <span class="bds-option-text">{option}</span>
              <span class="bds-option-arrow">→</span>
            </button>
          {/each}
          
          {#if q.allowCustom}
            <div 
              class="bds-option-item custom-item {answers[key] === 'Other' ? 'selected' : ''} {focusedOptionIndex === (q.options?.length || 0) ? 'focused' : ''}"
              role="button"
              tabindex="0"
              onclick={(e) => {
                const input = e.currentTarget.querySelector('input');
                if (input) input.focus();
                selectSingleOption("Other");
              }}
              onkeydown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  const input = e.currentTarget.querySelector('input');
                  if (input) input.focus();
                  selectSingleOption("Other");
                }
              }}
            >
              <span class="bds-option-index">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 20h9"></path>
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                </svg>
              </span>
              <input 
                type="text" 
                use:focusOnMount
                class="bds-custom-text-input" 
                placeholder="Something else..." 
                bind:value={customAnswers[key]}
                oninput={() => answers[key] = "Other"}
                onmousedown={(e) => e.stopPropagation()}
                onclick={(e) => e.stopPropagation()}
                onkeydown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (customAnswers[key].trim()) {
                      answers[key] = "Other";
                      nextOrSubmit();
                    }
                  }
                }}
                onkeyup={(e) => e.stopPropagation()}
              />
              {#if answers[key] === "Other" && customAnswers[key].trim()}
                <button class="bds-custom-confirm" onclick={() => { answers[key] = "Other"; nextOrSubmit(); }}>→</button>
              {/if}
            </div>
          {/if}
        </div>

      {:else if q.type === "checkbox" || q.type === "multiple"}
        <div class="bds-options-list">
          {#each q.options || [] as option, optIndex (option)}
            <button 
              class="bds-option-item {answers[key]?.includes(option) ? 'selected' : ''} {focusedOptionIndex === optIndex ? 'focused' : ''}"
              onclick={() => toggleMultipleOption(option)}
            >
              <span class="bds-option-index">{optIndex + 1}</span>
              <span class="bds-option-text">{option}</span>
              <span class="bds-option-checkbox-mark {answers[key]?.includes(option) ? 'checked' : ''}"></span>
            </button>
          {/each}
          
          {#if q.allowCustom}
            <div 
              class="bds-option-item custom-item {focusedOptionIndex === (q.options?.length || 0) ? 'focused' : ''}"
              role="button"
              tabindex="0"
              onclick={(e) => {
                const input = e.currentTarget.querySelector('input');
                if (input) input.focus();
              }}
              onkeydown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  const input = e.currentTarget.querySelector('input');
                  if (input) input.focus();
                }
              }}
            >
              <span class="bds-option-index">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 20h9"></path>
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                </svg>
              </span>
              <input 
                type="text" 
                use:focusOnMount
                class="bds-custom-text-input" 
                placeholder="Something else..." 
                bind:value={customAnswers[key]}
                onmousedown={(e) => e.stopPropagation()}
                onclick={(e) => e.stopPropagation()}
                onkeydown={(e) => e.stopPropagation()}
                onkeyup={(e) => e.stopPropagation()}
              />
            </div>
          {/if}
        </div>

      {:else}
        <div 
          class="bds-free-input-wrapper"
          onclick={(e) => {
            const input = e.currentTarget.querySelector('input');
            if (input) input.focus();
          }}
        >
          <input 
            type="text" 
            use:focusOnMount
            class="bds-text-input" 
            placeholder="Type your answer here..." 
            bind:value={customAnswers[key]} 
            onmousedown={(e) => e.stopPropagation()}
            onclick={(e) => e.stopPropagation()}
            onkeydown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') {
                e.preventDefault();
                nextOrSubmit();
              }
            }}
            onkeyup={(e) => e.stopPropagation()}
            autofocus
          />
        </div>
      {/if}
    </div>

    <div class="bds-question-footer">
      <div class="bds-keyboard-hints">
        <span>↑↓ to navigate</span>
        <span>Enter to select</span>
        <span>Esc to close</span>
      </div>
      <div class="bds-footer-actions">
        {#if currentQuestionIndex === questions.length - 1}
          <button class="bds-action-btn bds-submit-btn" onclick={submitAnswers}>
            {hasAnswer(q, key) ? 'Send Answers' : 'Skip'}
          </button>
        {:else}
          <button class="bds-action-btn bds-next-btn" onclick={nextOrSubmit}>
            {hasAnswer(q, key) ? 'Next' : 'Skip'}
          </button>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .bds-question-panel {
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

  .bds-nav-btn {
    background: var(--bds-bg-hover, rgba(255, 255, 255, 0.08));
    border: none;
    color: var(--bds-text-primary, #ececec);
    width: 24px;
    height: 24px;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
  }

  .bds-nav-btn:hover:not(:disabled) {
    opacity: 0.8;
  }

  .bds-nav-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .bds-close-btn {
    background: none;
    border: none;
    color: var(--bds-text-tertiary, #6b6b7b);
    font-size: 20px;
    cursor: pointer;
    padding: 0 4px;
    transition: color 0.2s;
  }

  .bds-close-btn:hover {
    color: var(--bds-text-primary, #ececec);
  }

  .bds-question-body {
    display: flex;
    flex-direction: column;
    max-height: 450px;
    overflow-y: auto;
  }

  .bds-options-list {
    display: flex;
    flex-direction: column;
    background: var(--bds-bg-elevated, #2a2b30);
    border: 1px solid var(--bds-border, #3a3b3f);
    border-radius: var(--bds-radius, 14px);
    overflow: hidden;
  }

  .bds-option-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 16px;
    background: transparent;
    border: none;
    border-bottom: 1px solid var(--bds-border, #3a3b3f);
    color: var(--bds-text-primary, #ececec);
    font-size: 14px;
    text-align: left;
    cursor: pointer;
    transition: all 0.2s;
    width: 100%;
    box-sizing: border-box;
  }

  .bds-option-item:last-child {
    border-bottom: none;
  }

  .bds-option-item:hover,
  .bds-option-item.focused {
    background: var(--bds-bg-hover, rgba(255, 255, 255, 0.08));
  }

  .bds-option-item.selected {
    background: var(--bds-bg-hover, rgba(255, 255, 255, 0.08));
    color: var(--bds-accent, #5b7bff);
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

  .bds-option-item.selected .bds-option-index {
    background: var(--bds-accent, #5b7bff);
    color: #fff;
  }

  .bds-option-text {
    flex-grow: 1;
    line-height: 1.4;
  }

  .bds-option-arrow {
    color: var(--bds-text-tertiary, #6b6b7b);
    font-size: 14px;
    transition: transform 0.2s;
  }

  .bds-option-item:hover .bds-option-arrow {
    transform: translateX(2px);
    color: var(--bds-accent, #5b7bff);
  }

  .bds-option-checkbox-mark {
    width: 18px;
    height: 18px;
    border: 2px solid var(--bds-border, #3a3b3f);
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .bds-option-checkbox-mark.checked {
    background: var(--bds-accent, #5b7bff);
    border-color: var(--bds-accent, #5b7bff);
  }

  .bds-option-checkbox-mark.checked::after {
    content: '✓';
    color: #fff;
    font-size: 12px;
  }

  /* Custom Input inside options list */
  .custom-item {
    cursor: text;
  }

  .bds-custom-text-input {
    background: transparent;
    border: none;
    color: var(--bds-text-primary, #ececec);
    font-size: 14px;
    flex-grow: 1;
    outline: none;
    padding: 0;
    font-family: inherit;
  }

  .bds-custom-confirm {
    background: var(--bds-accent, #5b7bff);
    color: #fff;
    border: none;
    width: 24px;
    height: 24px;
    border-radius: 4px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
  }

  /* Free text box */
  .bds-free-input-wrapper {
    background: var(--bds-bg-elevated, #2a2b30);
    border: 1px solid var(--bds-border, #3a3b3f);
    border-radius: var(--bds-radius, 14px);
    padding: 12px;
  }

  .bds-text-input {
    background: transparent;
    border: none;
    color: var(--bds-text-primary, #ececec);
    font-size: 14px;
    width: 100%;
    outline: none;
    font-family: inherit;
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
    background: var(--bds-bg-hover, rgba(255, 255, 255, 0.08));
    opacity: 0.9;
  }

  .bds-action-btn.bds-submit-btn,
  .bds-action-btn.bds-next-btn {
    background: var(--bds-accent, #5b7bff);
    color: #fff;
    border-color: var(--bds-accent, #5b7bff);
  }

  .bds-action-btn.bds-submit-btn:hover,
  .bds-action-btn.bds-next-btn:hover {
    opacity: 0.95;
  }

  /* Scrollbar */
  .bds-question-body::-webkit-scrollbar {
    width: 6px;
  }
  .bds-question-body::-webkit-scrollbar-track {
    background: transparent;
  }
  .bds-question-body::-webkit-scrollbar-thumb {
    background: var(--bds-bg-hover, rgba(255, 255, 255, 0.08));
    border-radius: 3px;
  }
</style>
