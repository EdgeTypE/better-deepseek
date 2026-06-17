<script>
  import { t } from "../../lib/i18n.svelte.js";

  /** @type {{content: string}} */
  let { content } = $props();

  const statusConfig = {
    done: { label: "done", color: "#10b981", bg: "rgba(16, 185, 129, 0.12)" },
    pending: { label: "pending", color: "#3b82f6", bg: "rgba(59, 130, 246, 0.12)" },
    todo: { label: "todo", color: "#6b7280", bg: "rgba(107, 114, 128, 0.12)" },
    error: { label: "error", color: "#ef4444", bg: "rgba(239, 68, 68, 0.12)" },
  };

  const parsed = $derived.by(() => {
    try {
      const data = JSON.parse(content);
      if (Array.isArray(data)) return data;
      return [];
    } catch {
      return [];
    }
  });
</script>

<article class="bds-workflow-card">
  <div class="bds-workflow-header">
    <div class="bds-workflow-icon">
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="8" y1="6" x2="21" y2="6"></line>
        <line x1="8" y1="12" x2="21" y2="12"></line>
        <line x1="8" y1="18" x2="21" y2="18"></line>
        <line x1="3" y1="6" x2="3.01" y2="6"></line>
        <line x1="3" y1="12" x2="3.01" y2="12"></line>
        <line x1="3" y1="18" x2="3.01" y2="18"></line>
      </svg>
    </div>
    <h4>{t('messageOverlay.workflowSteps')}</h4>
  </div>

  {#if parsed.length === 0}
    <div class="bds-workflow-empty">{t('messageOverlay.workflowStepsInvalid')}</div>
  {:else}
    <ol class="bds-workflow-list">
      {#each parsed as step}
        {@const status = statusConfig[String(step.status || "todo").toLowerCase()] || statusConfig.todo}
        <li class="bds-workflow-step">
          <span class="bds-workflow-step-num">{step.step ?? "-"}</span>
          <div class="bds-workflow-step-body">
            <div class="bds-workflow-step-title">{step.title ?? ""}</div>
            {#if step.cmd}
              <code class="bds-workflow-step-cmd">{step.cmd}</code>
            {/if}
          </div>
          <span class="bds-workflow-step-status" style="color: {status.color}; background: {status.bg};">
            {status.label}
          </span>
        </li>
      {/each}
    </ol>
  {/if}
</article>

<style>
  .bds-workflow-card {
    margin: 10px 0;
    border: 1px solid var(--bds-border, #3a3b3f);
    border-radius: var(--bds-radius, 12px);
    background: var(--bds-bg-panel, #1e1f23);
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }

  .bds-workflow-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--bds-border, #3a3b3f);
  }

  .bds-workflow-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 38px;
    height: 38px;
    border-radius: 10px;
    background: rgba(139, 92, 246, 0.12);
    color: #8b5cf6;
    flex-shrink: 0;
  }

  .bds-workflow-header h4 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--bds-text-primary, #ececec);
  }

  .bds-workflow-empty {
    padding: 16px;
    font-size: 13px;
    color: var(--bds-text-secondary, #8e8ea0);
  }

  .bds-workflow-list {
    list-style: none;
    margin: 0;
    padding: 12px 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .bds-workflow-step {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 8px;
    background: var(--bds-bg-elevated, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--bds-border, #3a3b3f);
  }

  .bds-workflow-step-num {
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: var(--bds-bg-hover, rgba(255, 255, 255, 0.08));
    color: var(--bds-text-secondary, #8e8ea0);
    font-size: 11px;
    font-weight: 700;
    flex-shrink: 0;
  }

  .bds-workflow-step-body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .bds-workflow-step-title {
    font-size: 13px;
    font-weight: 500;
    color: var(--bds-text-primary, #ececec);
  }

  .bds-workflow-step-cmd {
    font-family: monospace;
    font-size: 11px;
    color: var(--bds-text-secondary, #8e8ea0);
    background: rgba(0, 0, 0, 0.2);
    padding: 3px 6px;
    border-radius: 4px;
    white-space: pre-wrap;
  }

  .bds-workflow-step-status {
    font-size: 10px;
    text-transform: uppercase;
    font-weight: 700;
    padding: 3px 8px;
    border-radius: 99px;
    flex-shrink: 0;
  }
</style>
