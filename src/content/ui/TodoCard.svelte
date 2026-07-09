<script>
  import { t } from "../../lib/i18n.svelte.js";
  import { marked } from "marked";
  import { triggerBlobDownload } from "../../lib/utils/download.js";

  /** @type {{content: string}} */
  let { content = "" } = $props();

  let copied = $state(false);

  // Parse markdown content into structured steps
  let steps = $derived.by(() => {
    const raw = String(content || "").trim();
    if (!raw) return [];

    // Split by headings starting with #
    const parts = raw.split(/(?=(?:^|\n)#{1,6}\s+)/);
    const result = [];

    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;

      // Match headings: e.g. ### Title\nDescription
      const match = trimmed.match(/^#{1,6}\s+(.+)(?:\r?\n)([\s\S]*)$/);
      if (match) {
        let title = match[1].trim();
        const description = match[2].trim();

        // Strip leading step numbers if any (e.g., "1. Title", "Step 2: Title", "(3) Title")
        title = title.replace(/^(\d+[\s.:)-]*|step\s*\d+[\s.:)-]*|\(\d+\)\s*)/i, "").trim();

        result.push({
          title,
          description
        });
      } else {
        // Fallback if there are no headers at the start
        if (result.length > 0) {
          result[result.length - 1].description += "\n\n" + trimmed;
        } else {
          result.push({
            title: "Task",
            description: trimmed
          });
        }
      }
    }
    return result;
  });

  function handleCopy() {
    if (copied) return;

    let markdown = `# ${t("todoCard.title", "To-Do List")}\n\n`;
    steps.forEach((step, index) => {
      markdown += `### ${index + 1}. ${step.title}\n${step.description}\n\n`;
    });

    navigator.clipboard.writeText(markdown.trim())
      .then(() => {
        copied = true;
        setTimeout(() => { copied = false; }, 2000);
      })
      .catch(err => {
        console.error("Failed to copy todo content: ", err);
      });
  }

  function handleDownload() {
    let markdown = `# ${t("todoCard.title", "To-Do List")}\n\n`;
    steps.forEach((step, index) => {
      markdown += `### ${index + 1}. ${step.title}\n${step.description}\n\n`;
    });

    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    triggerBlobDownload(blob, "todo-list.md");
  }
</script>

<article class="bds-todo-card">
  <div class="bds-todo-header">
    <div class="bds-todo-header-left">
      <div class="bds-todo-header-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="9 11 12 14 22 4"></polyline>
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
        </svg>
      </div>
      <h4>{t("todoCard.title", "To-Do List")}</h4>
    </div>

    <div class="bds-todo-actions">
      <button type="button" class="bds-todo-action-btn" onclick={handleCopy} title={t("todoCard.copy", "Copy Markdown")}>
        {#if copied}
          <span class="copied-text">{t("todoCard.copied", "Copied!")}</span>
        {:else}
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
        {/if}
      </button>
      <button type="button" class="bds-todo-action-btn" onclick={handleDownload} title={t("todoCard.download", "Download")}>
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7 10 12 15 17 10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
      </button>
    </div>
  </div>

  <div class="bds-todo-body">
    {#each steps as step, i}
      <div class="bds-todo-step">
        <div class="bds-todo-step-left">
          <div class="bds-todo-step-number">
            <span class="number-circle">{i + 1}</span>
          </div>
          {#if i < steps.length - 1}
            <div class="bds-todo-step-line"></div>
          {/if}
        </div>
        <div class="bds-todo-step-right">
          <h5 class="bds-todo-step-title">{step.title}</h5>
          {#if step.description}
            <div class="bds-todo-step-desc ds-markdown">
              {@html marked.parse(step.description)}
            </div>
          {/if}
        </div>
      </div>
    {/each}
  </div>
</article>

<style>
  .bds-todo-card {
    --todo-card-bg: #ffffff;
    --todo-card-border: #e5e7eb;
    --todo-card-title: #1f2937;
    --todo-card-text: #4b5563;
    --todo-accent: #3b82f6;
    --todo-btn-hover: #f3f4f6;

    background-color: var(--todo-card-bg);
    border: 1px solid var(--todo-card-border);
    border-radius: var(--bds-radius, 12px);
    padding: 16px;
    margin: 12px 0;
    max-width: 100%;
    min-width: 0;
    box-sizing: border-box;
  }

  /* Dark Theme Overrides */
  :global(.dark) .bds-todo-card {
    --todo-card-bg: var(--bds-bg-panel, #1e1f23);
    --todo-card-border: var(--bds-border, #3a3b3f);
    --todo-card-title: var(--bds-text-primary, #ececec);
    --todo-card-text: var(--bds-text-secondary, #b4b4c3);
    --todo-accent: var(--bds-accent, #5b7bff);
    --todo-btn-hover: var(--bds-bg-hover, rgba(255, 255, 255, 0.08));
  }

  .bds-todo-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 14px;
    margin-bottom: 16px;
    border-bottom: 1px solid var(--todo-card-border);
  }

  .bds-todo-header-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .bds-todo-header-icon {
    color: var(--todo-accent);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .bds-todo-header h4 {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    color: var(--todo-card-title);
  }

  .bds-todo-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .bds-todo-action-btn {
    background: transparent;
    border: none;
    color: var(--todo-card-text);
    border-radius: 6px;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s ease;
    padding: 0;
  }

  .bds-todo-action-btn:hover {
    background-color: var(--todo-btn-hover);
    color: var(--todo-card-title);
  }

  .copied-text {
    font-size: 11px;
    font-weight: 600;
    color: #10b981;
    padding: 0 4px;
    white-space: nowrap;
  }

  .bds-todo-body {
    display: flex;
    flex-direction: column;
  }

  .bds-todo-step {
    display: flex;
    gap: 12px;
    align-items: stretch;
  }

  .bds-todo-step-left {
    display: flex;
    flex-direction: column;
    align-items: center;
    flex-shrink: 0;
    width: 24px;
  }

  .bds-todo-step-number {
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .number-circle {
    width: 22px;
    height: 22px;
    border: 1.5px solid var(--todo-card-title);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 700;
    color: var(--todo-card-title);
  }

  .bds-todo-step-line {
    flex: 1;
    width: 0;
    border-left: 2px dotted var(--todo-card-border);
    margin: 4px 0;
  }

  .bds-todo-step-right {
    flex: 1;
    padding-bottom: 20px;
    min-width: 0;
  }

  /* Remove padding bottom on the last step */
  .bds-todo-step:last-child .bds-todo-step-right {
    padding-bottom: 4px;
  }

  .bds-todo-step-title {
    margin: 3px 0 6px 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--todo-card-title);
    line-height: 1.4;
  }

  .bds-todo-step-desc {
    font-size: 13px;
    color: var(--todo-card-text);
    line-height: 1.6;
  }

  /* Support markdown formatting inside description */
  .bds-todo-step-desc :global(p) {
    margin: 0 0 8px 0;
  }
  .bds-todo-step-desc :global(p:last-child) {
    margin-bottom: 0;
  }
  .bds-todo-step-desc :global(strong) {
    font-weight: 600;
    color: var(--todo-card-title);
  }
  .bds-todo-step-desc :global(code) {
    font-family: monospace;
    font-size: 12px;
    background-color: var(--todo-btn-hover);
    padding: 2px 4px;
    border-radius: 4px;
    border: 1px solid var(--todo-card-border);
  }
</style>
