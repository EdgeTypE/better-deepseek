<script>
  import { onMount } from "svelte";

  let {
    runId = "",
    plan = null,
    raw = "",
    error = "",
    interactive = true,
    onApprove = null,
    onRequestChanges = null,
    onCancel = null,
  } = $props();

  let parsedPlan = $derived.by(() => {
    if (plan && typeof plan === "object") return plan;
    return null;
  });

  let steps = $derived(parsedPlan && Array.isArray(parsedPlan.steps) ? parsedPlan.steps : []);
  let title = $derived(parsedPlan ? (parsedPlan.title || "Research Plan") : "Research Plan");
  let hasMalformedJson = $derived(!parsedPlan && (!!raw || !!error));

  let feedbackText = $state("");
  let showFeedback = $state(false);
  let isInteractive = $state(true);

  $effect(() => {
    const nextInteractive = Boolean(interactive);
    isInteractive = nextInteractive;
    if (!nextInteractive) {
      showFeedback = false;
    }
  });

  onMount(() => {
    const handler = (event) => {
      const detail = event.detail || {};
      if (!runId || detail.runId !== runId) return;
      isInteractive = Boolean(detail.interactive);
      if (!isInteractive) {
        showFeedback = false;
      }
    };
    window.addEventListener("bds:deep-research-run-state", handler);
    return () => window.removeEventListener("bds:deep-research-run-state", handler);
  });

  function stopNativeClick(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
  }

  function handleApprove(event) {
    stopNativeClick(event);
    if (!isInteractive) return;
    if (onApprove) onApprove(runId);
  }

  function handleRequestChanges(event) {
    stopNativeClick(event);
    if (!isInteractive) return;
    if (!showFeedback) {
      showFeedback = true;
      return;
    }
    if (onRequestChanges) {
      onRequestChanges(runId, feedbackText.trim());
      feedbackText = "";
      showFeedback = false;
    }
  }

  function handleCancel(event) {
    stopNativeClick(event);
    if (!isInteractive) return;
    if (onCancel) onCancel(runId);
  }
</script>

<div class="bds-deep-research-plan-card" data-testid="deep-research-plan-card">
  <div class="bds-dr-header">
    <span class="bds-dr-icon">DR</span>
    <span class="bds-dr-title">{title}</span>
    {#if runId}
      <span class="bds-dr-run-id">Run: {runId.slice(0, 8)}</span>
    {/if}
  </div>

  {#if hasMalformedJson}
    <div class="bds-dr-error">
      <p>Failed to parse research plan JSON</p>
      {#if error}
        <pre class="bds-dr-error-detail">{error}</pre>
      {/if}
      {#if raw}
        <pre class="bds-dr-raw">{raw}</pre>
      {/if}
    </div>
  {:else if parsedPlan}
    <div class="bds-dr-steps">
      {#each steps as step, i}
        <div class="bds-dr-step">
          <span class="bds-dr-step-num">{step.id || i + 1}.</span>
          <span
            class="bds-dr-step-action"
            class:search={step.action === "search"}
            class:fetch={step.action === "fetch"}
          >
            {step.action || "search"}
          </span>
          <span class="bds-dr-step-query">{step.query || ""}</span>
          {#if step.purpose}
            <span class="bds-dr-step-purpose">- {step.purpose}</span>
          {/if}
        </div>
      {/each}
    </div>

    {#if isInteractive}
      <div class="bds-dr-actions">
        <button type="button" class="bds-dr-btn bds-dr-btn-approve" onclick={handleApprove} data-testid="dr-approve-btn">
          Approve
        </button>
        <button type="button" class="bds-dr-btn bds-dr-btn-revise" onclick={handleRequestChanges} data-testid="dr-revise-btn">
          Request Changes
        </button>
        <button type="button" class="bds-dr-btn bds-dr-btn-cancel" onclick={handleCancel} data-testid="dr-cancel-btn">
          Cancel
        </button>
      </div>
    {/if}

    {#if isInteractive && showFeedback}
      <div class="bds-dr-feedback">
        <textarea
          class="bds-dr-feedback-input"
          placeholder="Describe what changes you want in the research plan..."
          bind:value={feedbackText}
          data-testid="dr-feedback-input"
        ></textarea>
        <button type="button" class="bds-dr-btn bds-dr-btn-submit" onclick={handleRequestChanges} data-testid="dr-submit-feedback-btn">
          Submit Feedback
        </button>
      </div>
    {/if}
  {/if}
</div>

<style>
  .bds-deep-research-plan-card {
    margin: 8px 0;
    border: 1px solid var(--bds-border, #3a3b3f);
    border-radius: 12px;
    background: var(--bds-bg-panel, #1e1f23);
    color: var(--bds-text-primary, #ececec);
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  .bds-dr-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
  }
  .bds-dr-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border-radius: 8px;
    color: var(--bds-accent, #4f8cff);
    background: var(--bds-bg-elevated, #25262b);
    border: 1px solid var(--bds-border, #3a3b3f);
    font-size: 10px;
    font-weight: 700;
    flex-shrink: 0;
  }
  .bds-dr-title {
    min-width: 0;
    flex: 1;
    font-size: 13px;
    font-weight: 600;
    color: var(--bds-text-primary, #ececec);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .bds-dr-run-id {
    font-size: 10.5px;
    color: var(--bds-text-tertiary, rgba(255, 255, 255, 0.5));
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    flex-shrink: 0;
  }
  .bds-dr-steps {
    border-top: 1px solid var(--bds-border, #3a3b3f);
    padding: 8px 14px 10px;
  }
  .bds-dr-step {
    display: flex;
    align-items: baseline;
    gap: 6px;
    padding: 5px 0;
    flex-wrap: wrap;
    font-size: 12px;
  }
  .bds-dr-step-num {
    color: var(--bds-text-tertiary, rgba(255, 255, 255, 0.5));
    font-weight: 600;
    min-width: 20px;
  }
  .bds-dr-step-action {
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 4px;
    text-transform: uppercase;
    font-weight: 700;
    background: var(--bds-bg-elevated, rgba(255, 255, 255, 0.06));
    border: 1px solid var(--bds-border, rgba(255, 255, 255, 0.08));
  }
  .bds-dr-step-action.search { color: var(--bds-accent, #4f8cff); }
  .bds-dr-step-action.fetch { color: #22c55e; }
  .bds-dr-step-query {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 12px;
    overflow-wrap: anywhere;
    color: var(--bds-text-primary, #ececec);
  }
  .bds-dr-step-purpose {
    font-size: 11px;
    color: var(--bds-text-tertiary, rgba(255, 255, 255, 0.5));
  }
  .bds-dr-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    padding: 10px 14px;
    border-top: 1px solid var(--bds-border, #3a3b3f);
    background: var(--bds-bg-panel, #1e1f23);
  }
  .bds-dr-btn {
    -webkit-appearance: none;
    appearance: none;
    padding: 6px 11px;
    border-radius: 8px;
    border: 1px solid var(--bds-border, #3a3b3f);
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    color: var(--bds-text-primary, #ececec);
    background: var(--bds-bg-elevated, #25262b);
    line-height: 1.3;
  }
  .bds-dr-btn:hover { background: var(--bds-bg-hover, rgba(255, 255, 255, 0.08)); }
  .bds-dr-btn-approve { color: #22c55e; }
  .bds-dr-btn-revise { color: var(--bds-accent, #4f8cff); }
  .bds-dr-btn-cancel { color: var(--bds-text-tertiary, rgba(255, 255, 255, 0.5)); }
  .bds-dr-feedback {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 0 14px 12px;
    background: var(--bds-bg-panel, #1e1f23);
  }
  .bds-dr-feedback-input {
    width: 100%;
    min-height: 64px;
    padding: 8px;
    border-radius: 6px;
    border: 1px solid var(--bds-border, #3a3b3f);
    font-size: 13px;
    resize: vertical;
    color: var(--bds-text-primary, #ececec);
    background: var(--bds-bg-elevated, #25262b);
    box-sizing: border-box;
  }
  .bds-dr-btn-submit { align-self: flex-end; }
  .bds-dr-error {
    padding: 10px 14px 12px;
    border-top: 1px solid var(--bds-border, #3a3b3f);
    color: #ef4444;
  }
  .bds-dr-error-detail,
  .bds-dr-raw {
    font-size: 11px;
    overflow-x: auto;
    background: var(--bds-bg-elevated, #25262b);
    padding: 6px;
    border-radius: 4px;
    max-height: 120px;
  }
</style>
