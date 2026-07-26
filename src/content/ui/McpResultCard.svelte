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

  function parseCsv(text) {
    const rows = [];
    let curRow = [];
    let cur = "", inQ = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQ) {
        if (ch === '"') {
          if (i + 1 < text.length && text[i + 1] === '"') { cur += '"'; i++; }
          else inQ = false;
        } else cur += ch;
      } else {
        if (ch === '"') inQ = true;
        else if (ch === ',') { curRow.push(cur.trim()); cur = ""; }
        else if (ch === '\n') { curRow.push(cur.trim()); if (curRow.length > 0 && curRow.some(c => c.length > 0)) rows.push(curRow); curRow = []; cur = ""; }
        else if (ch === '\r') { /* skip, handled by \n */ }
        else cur += ch;
      }
    }
    curRow.push(inQ ? cur : cur.trim());
    if (curRow.length > 0 && curRow.some(c => c.length > 0)) rows.push(curRow);

    const filtered = rows.filter(r => r.length > 0);
    if (filtered.length < 2) return null;
    const commaCount = filtered[0].length;
    if (commaCount <= 1) return null;
    for (let i = 1; i < Math.min(filtered.length, 5); i++) {
      if (Math.abs(filtered[i].length - commaCount) > 2) return null;
    }
    return { headers: filtered[0], rows: filtered.slice(1) };
  }

  function tryParseJson(text) {
    const trimmed = text.trim();
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
    try {
      const val = JSON.parse(trimmed);
      if (Array.isArray(val)) {
        if (val.length === 0) return { type: "array" };
        if (typeof val[0] === "object" && val[0] !== null) {
          const columns = [...new Set(val.flatMap(Object.keys))];
          const rows = val.map(item => columns.map(c => formatJsonCell(item[c])));
          return { type: "table", columns, rows };
        }
        return { type: "pre", text: JSON.stringify(val, null, 2) };
      }
      if (typeof val === "object" && val !== null) {
        const pairs = Object.entries(val).map(([k, v]) => ({ key: k, value: formatJsonCell(v) }));
        return { type: "kv", pairs };
      }
      return { type: "pre", text: JSON.stringify(val, null, 2) };
    } catch { return null; }
  }

  function formatJsonCell(v) {
    if (v === null || v === undefined) return "";
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
  }

  let parsed = $derived.by(() => {
    if (!content) return { type: "empty" };
    const csv = parseCsv(content);
    if (csv) return { type: "csv", data: csv };
    const json = tryParseJson(content);
    if (json) return { type: "json", data: json };
    return { type: "plain" };
  });

  let entries = $derived.by(() => {
    if (parsed.type !== "plain") return [];
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
          {#if parsed.type === "csv"}
            <span class="bds-mcp-badge bds-mcp-badge--csv">CSV</span>
          {:else if parsed.type === "json"}
            <span class="bds-mcp-badge bds-mcp-badge--json">JSON</span>
          {/if}
        </p>
      </div>
    </div>
  </div>

  <div class="bds-mcp-result-body">
    {#if argsPreview}
      <div class="bds-mcp-args-inline">{argsPreview}</div>
    {/if}

    {#if parsed.type === "csv" && parsed.data}
      <div class="bds-mcp-table-wrap">
        <table class="bds-mcp-table">
          <thead>
            <tr>
              {#each parsed.data.headers as h}
                <th>{h}</th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each parsed.data.rows as row}
              <tr>
                {#each row as cell}
                  <td>{cell}</td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <div class="bds-mcp-table-info">{parsed.data.rows.length} rows</div>
    {:else if parsed.type === "json" && parsed.data}
      {#if parsed.data.type === "table"}
        <div class="bds-mcp-table-wrap">
          <table class="bds-mcp-table">
            <thead>
              <tr>
                {#each parsed.data.columns as col}
                  <th>{col}</th>
                {/each}
              </tr>
            </thead>
            <tbody>
              {#each parsed.data.rows as row}
                <tr>
                  {#each row as cell}
                    <td>{cell}</td>
                  {/each}
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        <div class="bds-mcp-table-info">{parsed.data.rows.length} rows</div>
      {:else if parsed.data.type === "kv"}
        <div class="bds-mcp-kv-list">
          {#if parsed.data.pairs.length === 0}
            <div class="bds-mcp-empty">Empty object</div>
          {:else}
            {#each parsed.data.pairs as { key, value }}
              <div class="bds-mcp-kv-row">
                <span class="bds-mcp-kv-key">{key}</span>
                <span class="bds-mcp-kv-value">{value}</span>
              </div>
            {/each}
          {/if}
        </div>
      {:else if parsed.data.type === "array"}
        <div class="bds-mcp-empty">Empty array</div>
      {:else}
        <pre class="bds-mcp-json-pre">{parsed.data.text}</pre>
      {/if}
    {:else if parsed.type === "empty"}
      <div class="bds-mcp-empty">Empty</div>
    {:else}
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
    {/if}
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

  .bds-mcp-badge--csv {
    background: rgba(16, 185, 129, 0.15);
    color: #34d399;
  }

  .bds-mcp-badge--json {
    background: rgba(245, 158, 11, 0.15);
    color: #fbbf24;
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

  .bds-mcp-table-wrap {
    overflow-x: auto;
    overflow-y: auto;
    max-height: 400px;
    margin-bottom: 6px;
  }

  .bds-mcp-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 11px;
    font-family: monospace;
    white-space: nowrap;
  }

  .bds-mcp-table thead {
    position: sticky;
    top: 0;
    z-index: 1;
  }

  .bds-mcp-table th {
    background: var(--bds-bg-elevated);
    color: var(--bds-text-secondary);
    font-weight: 600;
    padding: 6px 10px;
    border-bottom: 2px solid var(--bds-border);
    text-align: left;
  }

  .bds-mcp-table td {
    padding: 5px 10px;
    border-bottom: 1px solid var(--bds-border);
    color: var(--bds-text-primary);
    max-width: 300px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .bds-mcp-table tbody tr:nth-child(even) {
    background: rgba(128, 128, 128, 0.04);
  }

  .bds-mcp-table tbody tr:hover {
    background: rgba(139, 92, 246, 0.06);
  }

  .bds-mcp-table-info {
    font-size: 10px;
    color: var(--bds-text-tertiary);
    text-align: right;
  }

  .bds-mcp-kv-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .bds-mcp-kv-row {
    display: flex;
    gap: 12px;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 11.5px;
    line-height: 1.5;
  }

  .bds-mcp-kv-row:nth-child(even) {
    background: rgba(128, 128, 128, 0.04);
  }

  .bds-mcp-kv-key {
    font-weight: 600;
    color: var(--bds-accent, #5b7bff);
    min-width: 120px;
    flex-shrink: 0;
    font-family: monospace;
  }

  .bds-mcp-kv-value {
    color: var(--bds-text-primary);
    word-break: break-word;
    min-width: 0;
  }

  .bds-mcp-json-pre {
    margin: 0;
    font-size: 11px;
    font-family: monospace;
    color: var(--bds-text-primary);
    background: var(--bds-bg-elevated);
    padding: 8px;
    border-radius: 6px;
    overflow-x: auto;
    line-height: 1.5;
  }

  .bds-mcp-empty {
    font-size: 11px;
    color: var(--bds-text-tertiary);
    padding: 8px;
    text-align: center;
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
