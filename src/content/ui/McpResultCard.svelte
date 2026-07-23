<script>
  import { t } from "../../lib/i18n.svelte.js";
  let { serverName = "", toolName = "", args = "", content = "" } = $props();

  let parsedArgs = $derived.by(() => {
    try { return JSON.parse(args); } catch { return null; }
  });

  let argsPreview = $derived.by(() => {
    if (!parsedArgs || typeof parsedArgs !== "object") return "";
    const parts = [];
    if ("query" in parsedArgs) parts.push(`query: "${String(parsedArgs.query).slice(0, 60)}"`);
    if ("numResults" in parsedArgs) parts.push(`numResults: ${parsedArgs.numResults}`);
    if ("url" in parsedArgs) parts.push(`url: "${String(parsedArgs.url).slice(0, 40)}"`);
    if (parts.length === 0) {
      for (const [k, v] of Object.entries(parsedArgs).slice(0, 3)) {
        parts.push(`${k}: ${typeof v === "string" ? `"${v.slice(0, 30)}"` : JSON.stringify(v)}`);
      }
    }
    return parts.join("  ");
  });

  let entries = $derived.by(() => {
    if (!content) return [];
    const rawEntries = content.split(/\n---\s*\n/).filter(e => e.trim());
    return rawEntries.map(entry => {
      const titleMatch = entry.match(/^Title:\s*(.+)/m);
      const urlMatch = entry.match(/^URL:\s*(.+)/m);
      const publishedMatch = entry.match(/^Published:\s*(.+)/m);
      const authorMatch = entry.match(/^Author:\s*(.+)/m);
      const hlIndex = entry.search(/^Highlights:\s*\n/m);

      if (titleMatch || urlMatch) {
        let highlights = "";
        if (hlIndex !== -1) {
          highlights = entry.slice(hlIndex).replace(/^Highlights:\s*\n/, "").trim();
        }
        return {
          type: "structured",
          title: (titleMatch?.[1] || "").trim(),
          url: (urlMatch?.[1] || "").trim(),
          published: (publishedMatch?.[1] || "").trim(),
          author: (authorMatch?.[1] || "").trim(),
          highlights,
        };
      }
      return { type: "plain", text: entry.trim() };
    });
  });

  let expandStates = $state({});

  function isValidDate(v) {
    if (!v) return false;
    const d = new Date(v);
    return !isNaN(d.getTime());
  }

  function toggleExpand(i) {
    expandStates[i] = !expandStates[i];
  }
</script>

<article class="bds-mcp-result-card">
  <div class="bds-mcp-result-header">
    <div class="bds-mcp-result-info">
      <div class="bds-mcp-result-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
          <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
          <line x1="12" y1="22.08" x2="12" y2="12"></line>
        </svg>
      </div>
      <div class="bds-mcp-result-details">
        <h4>MCP Result</h4>
        <p>
          <span class="bds-mcp-badge">{toolName}</span>
          {#if serverName}
            <span class="bds-mcp-server">{serverName}</span>
          {/if}
        </p>
      </div>
    </div>
  </div>

  <div class="bds-mcp-result-body">
    {#if argsPreview}
      <div class="bds-mcp-args-inline">{argsPreview}</div>
    {/if}

    <div class="bds-mcp-entries">
      {#each entries as entry, i}
        {#if entry.type === "structured"}
          <div class="bds-mcp-entry">
            {#if entry.title}
              <a href={entry.url} target="_blank" rel="noopener" class="bds-mcp-entry-title">{entry.title}</a>
            {/if}
            {#if entry.url}
              <div class="bds-mcp-entry-url">{entry.url.replace(/^https?:\/\//, "").slice(0, 60)}</div>
            {/if}
            <div class="bds-mcp-entry-meta">
              {#if entry.published && isValidDate(entry.published)}
                <span class="bds-mcp-entry-date">{new Date(entry.published).toLocaleDateString()}</span>
              {/if}
              {#if entry.author && entry.author !== "N/A"}
                <span class="bds-mcp-entry-author">{entry.author}</span>
              {/if}
            </div>
            {#if entry.highlights}
              <button type="button" class="bds-mcp-detail-toggle" onclick={() => toggleExpand(i)}>
                {expandStates[i] ? t('mcp.detailHide') : t('mcp.detailShow')}
              </button>
              {#if expandStates[i]}
                <div class="bds-mcp-entry-detail">{entry.highlights}</div>
              {/if}
            {/if}
          </div>
        {:else}
          <p class="bds-mcp-line">{entry.text}</p>
        {/if}
      {/each}
    </div>
  </div>
</article>

<style>
  .bds-mcp-result-card {
    margin: 8px 0;
    border: 1px solid var(--bds-border);
    border-radius: 12px;
    background: var(--bds-bg-panel);
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }

  .bds-mcp-result-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
  }

  .bds-mcp-result-info {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .bds-mcp-result-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    background-color: var(--bds-bg-elevated);
    border: 1px solid var(--bds-border);
    border-radius: 8px;
    color: #8b5cf6;
    flex-shrink: 0;
  }

  .bds-mcp-result-details h4 {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    color: var(--bds-text-primary);
  }

  .bds-mcp-result-details p {
    margin: 2px 0 0;
    font-size: 10.5px;
    color: var(--bds-text-tertiary);
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .bds-mcp-badge {
    display: inline-block;
    background: rgba(139, 92, 246, 0.15);
    color: #a78bfa;
    padding: 1px 6px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 600;
  }

  .bds-mcp-server {
    color: var(--bds-text-secondary);
    font-size: 10px;
  }

  .bds-mcp-result-body {
    border-top: 1px solid var(--bds-border);
    padding: 10px 14px;
  }

  .bds-mcp-args-inline {
    font-size: 10.5px;
    color: var(--bds-text-tertiary);
    font-family: monospace;
    margin-bottom: 10px;
    padding: 6px 8px;
    background: var(--bds-bg-elevated);
    border: 1px solid var(--bds-border);
    border-radius: 6px;
    white-space: nowrap;
    overflow-x: auto;
  }

  .bds-mcp-entries {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
  }

  .bds-mcp-entry {
    padding: 8px;
    background: var(--bds-bg-elevated);
    border: 1px solid var(--bds-border);
    border-radius: 8px;
    min-width: 0;
    overflow: hidden;
  }

  .bds-mcp-entry-title {
    display: block;
    font-size: 12.5px;
    font-weight: 600;
    color: var(--bds-accent, #5b7bff);
    text-decoration: none;
    line-height: 1.4;
    margin-bottom: 2px;
  }

  .bds-mcp-entry-title:hover {
    text-decoration: underline;
  }

  .bds-mcp-entry-url {
    font-size: 10px;
    color: var(--bds-text-tertiary);
    word-break: break-all;
    margin-bottom: 4px;
  }

  .bds-mcp-entry-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 10px;
    color: var(--bds-text-tertiary);
    margin-bottom: 4px;
  }

  .bds-mcp-entry-date {
    white-space: nowrap;
  }

  .bds-mcp-entry-author {
    white-space: nowrap;
  }

  .bds-mcp-detail-toggle {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: transparent;
    border: none;
    color: var(--bds-accent, #5b7bff);
    font-size: 10.5px;
    font-weight: 600;
    cursor: pointer;
    padding: 2px 4px;
    border-radius: 4px;
    transition: background 0.15s;
  }

  .bds-mcp-detail-toggle:hover {
    background: rgba(91, 123, 255, 0.1);
  }

  .bds-mcp-entry-detail {
    margin-top: 6px;
    padding-top: 6px;
    border-top: 1px solid var(--bds-border);
    font-size: 11px;
    color: var(--bds-text-primary);
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
    overflow-wrap: break-word;
    scrollbar-gutter: stable;
    max-height: 300px;
    overflow-y: auto;
  }

  .bds-mcp-line {
    margin: 2px 0;
    font-size: 11.5px;
    color: var(--bds-text-primary);
    line-height: 1.5;
    word-break: break-word;
    min-width: 0;
  }
</style>
