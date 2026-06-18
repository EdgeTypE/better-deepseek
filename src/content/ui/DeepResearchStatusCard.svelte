<script>
  import { onMount } from "svelte";

  let {
    runId = "",
    status = null,
    raw = "",
    managed = false,
    steps = [],
    currentStepIndex = -1,
    awaitingStepId = null,
    reportRequested = false,
  } = $props();

  let parsedStatus = $derived.by(() => {
    if (status && typeof status === "object") return status;
    return null;
  });

  let completedSteps = $derived(parsedStatus ? (parsedStatus.completedSteps || 0) : 0);
  let totalSteps = $derived(parsedStatus ? (parsedStatus.totalSteps || 0) : 0);
  let currentAction = $derived(parsedStatus ? (parsedStatus.currentAction || "") : "");
  let progress = $derived(totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0);

  // Reactive managed execution state — initialized from props, updated via events
  let liveManaged = $state(managed);
  let liveSteps = $state(steps && Array.isArray(steps) ? steps : []);
  let liveCurrentStepIndex = $state(currentStepIndex);
  let liveAwaitingStepId = $state(awaitingStepId);
  let liveReportRequested = $state(reportRequested);

  onMount(() => {
    const handler = (event) => {
      const detail = event.detail || {};
      if (!runId || detail.runId !== runId) return;
      if (detail.managed) {
        liveManaged = true;
        liveSteps = detail.steps || [];
        liveCurrentStepIndex = detail.currentStepIndex ?? -1;
        liveAwaitingStepId = detail.awaitingStepId || null;
        liveReportRequested = detail.reportRequested || false;
      }
    };
    window.addEventListener("bds:deep-research-run-state", handler);
    return () => window.removeEventListener("bds:deep-research-run-state", handler);
  });

  // Derived from managed execution state
  let managedSteps = $derived(liveSteps);
  let managedTotal = $derived(managedSteps.length);
  let managedComplete = $derived(managedSteps.filter((s) => s.status === "complete").length);
  let managedProgress = $derived(managedTotal > 0 ? Math.round((managedComplete / managedTotal) * 100) : 0);
  let currentStep = $derived(managedSteps.find((s) => s.id === liveAwaitingStepId) || null);
  let currentStepLabel = $derived.by(() => {
    if (!currentStep) return "";
    return `Step ${currentStep.id}: ${currentStep.action} "${currentStep.query}"`;
  });

  let phase = $derived.by(() => {
    if (liveReportRequested) return "preparing report";
    if (liveAwaitingStepId) return "awaiting analysis";
    if (managedTotal > 0 && managedComplete < managedTotal) return "searching/fetching";
    return "";
  });

  let statusTitle = $derived(liveReportRequested ? "Deep Research — Preparing Report" : "Deep Research in Progress");
</script>

<div class="bds-deep-research-status-card" data-testid="deep-research-status-card">
  <div class="bds-drs-header">
    <span class="bds-drs-icon">DR</span>
    <span class="bds-drs-title">{statusTitle}</span>
    {#if runId}
      <span class="bds-drs-run-id">Run: {runId.slice(0, 8)}</span>
    {/if}
  </div>

  {#if managed && managedTotal > 0}
    <div class="bds-drs-progress">
      <div class="bds-drs-bar-bg">
        <div class="bds-drs-bar-fill" style="width: {managedProgress}%"></div>
      </div>
      <span class="bds-drs-progress-text">{managedComplete}/{managedTotal} steps ({managedProgress}%)</span>
      {#if phase}
        <span class="bds-drs-phase bds-drs-phase--{phase.replace(/[^a-z]/g, '-')}">{phase}</span>
      {/if}
    </div>

    {#each managedSteps as step}
      <div class="bds-drs-step-row" class:active={step.id === awaitingStepId} class:complete={step.status === "complete"} class:error={step.status === "tool_running" && step.error}>
        <span class="bds-drs-step-num">
          {#if step.status === "complete"}
            ✓
          {:else if step.status === "tool_running" && step.error}
            ✗
          {:else if step.status === "tool_running" || step.status === "awaiting_analysis"}
            <span class="bds-drs-spinner"></span>
          {:else}
            {step.id}
          {/if}
        </span>
        <span class="bds-drs-step-body">
          <span class="bds-drs-step-action action--{step.action}">{step.action}</span>
          <span class="bds-drs-step-query">{step.query}</span>
        </span>
        <span class="bds-drs-step-status">
          {step.status === "complete" ? "done" : step.status === "tool_running" ? "running" : step.status === "awaiting_analysis" ? "analyzing" : "pending"}
        </span>
      </div>
    {/each}
  {:else if parsedStatus}
    <div class="bds-drs-progress">
      <div class="bds-drs-bar-bg">
        <div class="bds-drs-bar-fill" style="width: {progress}%"></div>
      </div>
      <span class="bds-drs-progress-text">{completedSteps}/{totalSteps} steps ({progress}%)</span>
    </div>
    {#if currentAction}
      <div class="bds-drs-current">Current: {currentAction}</div>
    {/if}
  {:else if raw}
    <pre class="bds-drs-raw">{raw}</pre>
  {/if}
</div>

<style>
  .bds-deep-research-status-card {
    margin: 8px 0;
    border: 1px solid var(--bds-border, #3a3b3f);
    border-radius: 12px;
    background: var(--bds-bg-panel, #1e1f23);
    color: var(--bds-text-primary, #ececec);
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  .bds-drs-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
  }
  .bds-drs-icon {
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
  .bds-drs-title { font-size: 13px; font-weight: 600; flex: 1; }
  .bds-drs-run-id {
    font-size: 10.5px;
    color: var(--bds-text-tertiary, rgba(255, 255, 255, 0.5));
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
  .bds-drs-progress {
    padding: 10px 14px 0;
    border-top: 1px solid var(--bds-border, #3a3b3f);
  }
  .bds-drs-bar-bg {
    height: 8px;
    background: var(--bds-bg-elevated, #25262b);
    border-radius: 4px;
    overflow: hidden;
    margin-bottom: 4px;
  }
  .bds-drs-bar-fill {
    height: 100%;
    background: var(--bds-accent, #4f8cff);
    border-radius: 4px;
    transition: width 0.3s ease;
  }
  .bds-drs-progress-text {
    font-size: 11px;
    color: var(--bds-text-tertiary, rgba(255, 255, 255, 0.5));
  }
  .bds-drs-phase {
    display: inline-block;
    margin-left: 8px;
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 4px;
    text-transform: uppercase;
    font-weight: 600;
    background: var(--bds-bg-elevated, #25262b);
    border: 1px solid var(--bds-border, #3a3b3f);
    color: var(--bds-accent, #4f8cff);
  }
  .bds-drs-phase--preparing-report { color: #22c55e; }
  .bds-drs-current {
    padding: 6px 14px 12px;
    font-size: 12px;
    color: var(--bds-text-secondary, rgba(255, 255, 255, 0.7));
  }
  .bds-drs-raw {
    margin: 0;
    border-top: 1px solid var(--bds-border, #3a3b3f);
    font-size: 11px;
    overflow-x: auto;
    background: var(--bds-bg-elevated, #25262b);
    padding: 10px 14px;
  }

  /* Managed step rows */
  .bds-drs-step-row {
    display: grid;
    grid-template-columns: 20px minmax(0, 1fr) 60px;
    align-items: center;
    gap: 8px;
    padding: 6px 14px;
    font-size: 12px;
    border-top: 1px solid var(--bds-border, rgba(255, 255, 255, 0.05));
  }
  .bds-drs-step-row.active {
    background: var(--bds-bg-elevated, #25262b);
  }
  .bds-drs-step-row.complete {
    opacity: 0.6;
  }
  .bds-drs-step-row.error {
    color: #ef4444;
  }
  .bds-drs-step-num {
    font-size: 11px;
    color: var(--bds-text-tertiary, rgba(255, 255, 255, 0.5));
    text-align: center;
  }
  .bds-drs-step-body {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    overflow: hidden;
  }
  .bds-drs-step-action {
    flex-shrink: 0;
    font-size: 9px;
    padding: 0px 5px;
    border-radius: 3px;
    text-transform: uppercase;
    font-weight: 700;
    background: var(--bds-bg-elevated, rgba(255, 255, 255, 0.06));
    border: 1px solid var(--bds-border, rgba(255, 255, 255, 0.08));
  }
  .bds-drs-step-action.action--search { color: var(--bds-accent, #4f8cff); }
  .bds-drs-step-action.action--fetch { color: #22c55e; }
  .bds-drs-step-query {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 11px;
    color: var(--bds-text-secondary, rgba(255, 255, 255, 0.7));
  }
  .bds-drs-step-status {
    font-size: 10px;
    color: var(--bds-text-tertiary, rgba(255, 255, 255, 0.5));
    text-align: right;
  }
  .bds-drs-spinner {
    display: inline-block;
    width: 10px;
    height: 10px;
    border: 2px solid var(--bds-border, #3a3b3f);
    border-top-color: var(--bds-accent, #4f8cff);
    border-radius: 50%;
    animation: bds-drs-spin 0.6s linear infinite;
  }
  @keyframes bds-drs-spin {
    to { transform: rotate(360deg); }
  }
</style>
