<script>
  let { serverName = "", toolName = "", args = "", error = "" } = $props();

  let parsedArgs = $derived.by(() => {
    try { return JSON.parse(args); } catch { return null; }
  });

  let argsPreview = $derived.by(() => {
    if (!parsedArgs || typeof parsedArgs !== "object") return "";
    const parts = [];
    for (const [k, v] of Object.entries(parsedArgs).slice(0, 3)) {
      parts.push(`${k}: ${typeof v === "string" ? `"${v.slice(0, 30)}"` : JSON.stringify(v)}`);
    }
    return parts.join("  ");
  });
</script>

<article class="bds-mcp-error-card">
  <div class="bds-mcp-error-header">
    <div class="bds-mcp-error-info">
      <div class="bds-mcp-error-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="15" y1="9" x2="9" y2="15"></line>
          <line x1="9" y1="9" x2="15" y2="15"></line>
        </svg>
      </div>
      <div class="bds-mcp-error-details">
        <h4>MCP Call Failed</h4>
        <p>
          <span class="bds-mcp-error-badge">{toolName}</span>
          {#if serverName}
            <span class="bds-mcp-error-server">{serverName}</span>
          {/if}
        </p>
      </div>
    </div>
  </div>

  <div class="bds-mcp-error-body">
    <div class="bds-mcp-error-message">{error}</div>

    {#if argsPreview}
      <div class="bds-mcp-error-args-label">Args</div>
      <div class="bds-mcp-error-args-inline">{argsPreview}</div>
    {/if}
  </div>
</article>

<style>
  .bds-mcp-error-card {
    margin: 8px 0;
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 12px;
    background: var(--bds-bg-panel);
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }

  .bds-mcp-error-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
  }

  .bds-mcp-error-info {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .bds-mcp-error-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    background-color: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.25);
    border-radius: 8px;
    color: #ef4444;
    flex-shrink: 0;
  }

  .bds-mcp-error-details h4 {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    color: #ef4444;
  }

  .bds-mcp-error-details p {
    margin: 2px 0 0;
    font-size: 10.5px;
    color: var(--bds-text-tertiary);
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .bds-mcp-error-badge {
    display: inline-block;
    background: rgba(239, 68, 68, 0.15);
    color: #f87171;
    padding: 1px 6px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 600;
  }

  .bds-mcp-error-server {
    color: var(--bds-text-secondary);
    font-size: 10px;
  }

  .bds-mcp-error-body {
    border-top: 1px solid rgba(239, 68, 68, 0.15);
    padding: 10px 14px;
  }

  .bds-mcp-error-message {
    font-size: 12px;
    color: var(--bds-text-primary);
    line-height: 1.5;
    padding: 8px 10px;
    background: rgba(239, 68, 68, 0.06);
    border: 1px solid rgba(239, 68, 68, 0.15);
    border-radius: 8px;
    font-family: ui-monospace, "SFMono-Regular", monospace;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .bds-mcp-error-args-label {
    font-size: 10px;
    font-weight: 600;
    color: var(--bds-text-tertiary);
    margin-top: 10px;
    margin-bottom: 4px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .bds-mcp-error-args-inline {
    font-size: 10.5px;
    color: var(--bds-text-tertiary);
    font-family: monospace;
    padding: 6px 8px;
    background: var(--bds-bg-elevated);
    border: 1px solid var(--bds-border);
    border-radius: 6px;
    white-space: nowrap;
    overflow-x: auto;
  }
</style>
