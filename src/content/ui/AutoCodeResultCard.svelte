<script>
  import { onMount } from "svelte";

  /** @type {{language: string, status: string, output: string}} */
  let { language, status, output } = $props();

  let showOutput = $state(status !== "REJECTED");
  
  let isPython = $derived(language?.toLowerCase() === "python" || language?.toLowerCase() === "py");
  let isTypeScript = $derived(language?.toLowerCase() === "typescript" || language?.toLowerCase() === "ts");
  let langLabel = $derived(isPython ? "Python" : (isTypeScript ? "TypeScript" : "JavaScript"));
  let langColor = $derived(isPython ? "#10b981" : (isTypeScript ? "#3b82f6" : "#f59e0b"));

  let statusLabel = $derived(status === "SUCCESS" ? "Execution Successful" : (status === "REJECTED" ? "Request Rejected" : "Execution Failed"));
  let statusColor = $derived(status === "SUCCESS" ? "#10b981" : (status === "REJECTED" ? "#6b7280" : "#ef4444"));

  function toggleOutput() {
    showOutput = !showOutput;
  }
</script>

<article class="bds-result-card" style="--lang-color: {langColor}; --status-color: {statusColor}">
  <div class="bds-result-header">
    <div class="bds-result-info">
      <div class="bds-result-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      </div>
      <div class="bds-result-details">
        <h4>{statusLabel}</h4>
        <p>{langLabel} code was processed.</p>
      </div>
    </div>
    
    <div class="bds-result-actions">
      {#if output && output.trim() && output !== "(No output)"}
        <button type="button" class="bds-btn-text" onclick={toggleOutput}>
          {showOutput ? 'Hide Output ▴' : 'Show Output ▾'}
        </button>
      {/if}
    </div>
  </div>

  {#if showOutput && output && output.trim() && output !== "(No output)"}
    <div class="bds-result-output">
      <pre>{output.trim()}</pre>
    </div>
  {/if}
</article>

<style>
  .bds-result-card {
    margin: 8px 0;
    border: 1px solid var(--bds-border);
    border-radius: 12px;
    background: var(--bds-bg-panel);
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }

  .bds-result-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
  }

  .bds-result-info {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .bds-result-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    background-color: var(--bds-bg-elevated);
    border: 1px solid var(--bds-border);
    border-radius: 8px;
    color: var(--status-color);
    flex-shrink: 0;
  }

  .bds-result-details h4 {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    color: var(--bds-text-primary);
  }

  .bds-result-details p {
    margin: 0;
    font-size: 10.5px;
    color: var(--bds-text-tertiary);
  }

  .bds-btn-text {
    background: transparent;
    border: none;
    color: var(--bds-text-tertiary);
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    text-decoration: underline;
  }

  .bds-btn-text:hover {
    color: var(--bds-text-secondary);
  }

  .bds-result-output {
    padding: 0 14px 12px;
    border-top: 1px solid var(--bds-border);
    padding-top: 10px;
    background: rgba(0,0,0,0.01);
  }

  :global(.dark) .bds-result-output {
    background: rgba(255,255,255,0.01);
  }

  .bds-result-output pre {
    margin: 0;
    max-height: 120px;
    overflow-y: auto;
    background: var(--bds-bg-elevated);
    border-radius: 6px;
    padding: 8px;
    font-size: 11px;
    border: 1px solid var(--bds-border);
    font-family: monospace;
    white-space: pre-wrap;
    color: var(--bds-text-secondary);
  }
</style>
