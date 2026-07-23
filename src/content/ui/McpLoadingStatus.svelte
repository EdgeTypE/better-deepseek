<script>
  let { toolName = "", serverName = "", args = "" } = $props();

  let parsedArgs = $derived.by(() => {
    try { return JSON.parse(args); } catch { return null; }
  });

  let argsPreview = $derived.by(() => {
    if (!parsedArgs || typeof parsedArgs !== "object") return "";
    const parts = [];
    for (const [k, v] of Object.entries(parsedArgs).slice(0, 3)) {
      parts.push(`${k}: ${typeof v === "string" ? `"${v.slice(0, 40)}"` : JSON.stringify(v)}`);
    }
    return parts.join("  ");
  });
</script>

<div class="bds-mcp-loading">
  <div class="bds-mcp-loading-spinner"></div>
  <div class="bds-mcp-loading-info">
    <span class="bds-mcp-loading-title">{toolName}</span>
    {#if serverName}
      <span class="bds-mcp-loading-server">{serverName}</span>
    {/if}
    {#if argsPreview}
      <span class="bds-mcp-loading-args">{argsPreview}</span>
    {/if}
  </div>
</div>

<style>
  .bds-mcp-loading {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    margin: 8px 0;
    background: var(--bds-bg-panel, #1e1f23);
    border: 1px solid var(--bds-border, #3a3b3f);
    border-radius: 10px;
    border-left: 3px solid #8b5cf6;
    animation: mcpFadeIn 0.3s ease-in-out;
  }

  .bds-mcp-loading-spinner {
    width: 18px;
    height: 18px;
    border: 2px solid var(--bds-border, #3a3b3f);
    border-top-color: #8b5cf6;
    border-radius: 50%;
    animation: mcpSpin 0.8s linear infinite;
    flex-shrink: 0;
  }

  .bds-mcp-loading-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    flex: 1;
  }

  .bds-mcp-loading-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--bds-text-primary, #ececec);
  }

  .bds-mcp-loading-server {
    font-size: 11px;
    color: var(--bds-text-secondary, #8e8ea0);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .bds-mcp-loading-args {
    font-size: 10px;
    color: var(--bds-text-tertiary, #6b6b7b);
    font-family: monospace;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @keyframes mcpSpin {
    to { transform: rotate(360deg); }
  }

  @keyframes mcpFadeIn {
    from { opacity: 0; transform: translateY(4px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>
