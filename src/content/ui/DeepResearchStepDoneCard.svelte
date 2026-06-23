<script>
  let {
    runId = "",
    stepId = "",
    analysis = null,
    raw = "",
    error = "",
  } = $props();

  let parsedAnalysis = $derived.by(() => {
    if (analysis && typeof analysis === "object") return analysis;
    return null;
  });

  let analysisText = $derived(parsedAnalysis ? (parsedAnalysis.analysis || "") : "");
  let insights = $derived(parsedAnalysis && Array.isArray(parsedAnalysis.newInsights) ? parsedAnalysis.newInsights : []);
  let hasContent = $derived(Boolean(analysisText || insights.length));
  let stepLabel = $derived(stepId || (parsedAnalysis && parsedAnalysis.stepId) || "");
</script>

<div class="bds-deep-research-step-done-card" data-testid="deep-research-step-done-card">
  <div class="bds-drsd-header">
    <span class="bds-drsd-icon">DR</span>
    <span class="bds-drsd-title">
      Deep Research - Step {stepLabel} Analysis
    </span>
    {#if runId}
      <span class="bds-drsd-run-id">Run: {runId.slice(0, 8)}</span>
    {/if}
  </div>

  {#if error}
    <div class="bds-drsd-error">
      <p>Failed to parse step result</p>
      <pre class="bds-drsd-error-detail">{error}</pre>
    </div>
  {:else if hasContent}
    <div class="bds-drsd-body">
      {#if analysisText}
        <div class="bds-drsd-section">
          <div class="bds-drsd-section-label">Analysis</div>
          <div class="bds-drsd-analysis">{analysisText}</div>
        </div>
      {/if}

      {#if insights.length > 0}
        <div class="bds-drsd-section">
          <div class="bds-drsd-section-label">New Insights</div>
          <ul class="bds-drsd-insights">
            {#each insights as insight}
              <li class="bds-drsd-insight">{insight}</li>
            {/each}
          </ul>
        </div>
      {/if}
    </div>
  {:else if raw}
    <pre class="bds-drsd-raw">{raw}</pre>
  {:else}
    <div class="bds-drsd-body">
      <p class="bds-drsd-empty">No analysis provided</p>
    </div>
  {/if}
</div>

<style>
  .bds-deep-research-step-done-card {
    margin: 8px 0;
    border: 1px solid var(--bds-border, #3a3b3f);
    border-radius: 12px;
    background: var(--bds-bg-panel, #1e1f23);
    color: var(--bds-text-primary, #ececec);
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  .bds-drsd-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
  }
  .bds-drsd-icon {
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
  .bds-drsd-title {
    min-width: 0;
    flex: 1;
    font-size: 13px;
    font-weight: 600;
    color: var(--bds-text-primary, #ececec);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .bds-drsd-run-id {
    font-size: 10.5px;
    color: var(--bds-text-tertiary, rgba(255, 255, 255, 0.5));
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    flex-shrink: 0;
  }
  .bds-drsd-body {
    border-top: 1px solid var(--bds-border, #3a3b3f);
    padding: 10px 14px 12px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .bds-drsd-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .bds-drsd-section-label {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--bds-text-tertiary, rgba(255, 255, 255, 0.5));
  }
  .bds-drsd-analysis {
    font-size: 13px;
    line-height: 1.5;
    color: var(--bds-text-primary, #ececec);
    white-space: pre-wrap;
  }
  .bds-drsd-insights {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .bds-drsd-insight {
    position: relative;
    padding-left: 16px;
    font-size: 12px;
    line-height: 1.5;
    color: var(--bds-text-secondary, rgba(255, 255, 255, 0.7));
  }
  .bds-drsd-insight::before {
    content: "•";
    position: absolute;
    left: 2px;
    color: var(--bds-accent, #4f8cff);
    font-weight: 700;
  }
  .bds-drsd-error {
    padding: 10px 14px 12px;
    border-top: 1px solid var(--bds-border, #3a3b3f);
    color: #ef4444;
  }
  .bds-drsd-error-detail,
  .bds-drsd-raw {
    font-size: 11px;
    overflow-x: auto;
    background: var(--bds-bg-elevated, #25262b);
    padding: 6px;
    border-radius: 4px;
    max-height: 120px;
    margin-top: 6px;
  }
  .bds-drsd-raw {
    margin: 0;
    border-top: 1px solid var(--bds-border, #3a3b3f);
    padding: 10px 14px;
  }
  .bds-drsd-empty {
    font-size: 12px;
    color: var(--bds-text-tertiary, rgba(255, 255, 255, 0.5));
    font-style: italic;
  }
</style>
