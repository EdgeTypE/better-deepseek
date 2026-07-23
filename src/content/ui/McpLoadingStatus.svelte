<script>
  let { toolName = "", serverName = "" } = $props();
</script>

<div class="bds-mcp-loading">
  <div class="bds-mcp-loading-spinner"></div>
  <div class="bds-mcp-loading-info">
    <span class="bds-mcp-loading-title">MCP Tool: {toolName}</span>
    {#if serverName}
      <span class="bds-mcp-loading-server">{serverName}</span>
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

  @keyframes mcpSpin {
    to { transform: rotate(360deg); }
  }

  @keyframes mcpFadeIn {
    from { opacity: 0; transform: translateY(4px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>
