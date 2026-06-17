<script>
  import { t } from "../../lib/i18n.svelte.js";
  import appState from "../state.js";

  /** @type {{attrs: {file_a: string, file_b: string}}} */
  let { attrs } = $props();

  const fileA = String(attrs.file_a || "");
  const fileB = String(attrs.file_b || "");

  const basename = (path) => String(path || "").split(/[\\/]/).pop() || path;

  const resolved = $derived.by(() => {
    const nameA = basename(fileA);
    const nameB = basename(fileB);
    const allFiles = appState.projectFiles || [];
    const find = (name) => allFiles.find((f) => f.name === name || basename(f.name) === name);
    return { sourceA: find(nameA), sourceB: find(nameB), nameA, nameB };
  });

  const diffResult = $derived.by(() => {
    if (!resolved.sourceA || !resolved.sourceB) return [];
    const a = String(resolved.sourceA.content || "").split("\n");
    const b = String(resolved.sourceB.content || "").split("\n");
    return computeDiff(a, b);
  });

  /**
   * Compute a simple line-based diff using LCS backtracking.
   * @param {string[]} a
   * @param {string[]} b
   * @returns {Array<{type: 'same'|'add'|'del', value: string, oldLine?: number, newLine?: number}>}
   */
  function computeDiff(a, b) {
    const m = a.length;
    const n = b.length;
    const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }

    const result = [];
    let i = m;
    let j = n;
    let oldLine = m;
    let newLine = n;

    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
        result.unshift({ type: "same", value: a[i - 1], oldLine, newLine });
        i--;
        j--;
        oldLine--;
        newLine--;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        result.unshift({ type: "add", value: b[j - 1], newLine });
        j--;
        newLine--;
      } else {
        result.unshift({ type: "del", value: a[i - 1], oldLine });
        i--;
        oldLine--;
      }
    }
    return result;
  }
</script>

<article class="bds-diff-card">
  <div class="bds-diff-header">
    <div class="bds-diff-icon">
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="6" cy="18" r="3"></circle>
        <circle cx="6" cy="6" r="3"></circle>
        <circle cx="18" cy="18" r="3"></circle>
        <line x1="6" y1="9" x2="6" y2="15"></line>
        <path d="M15 6a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"></path>
      </svg>
    </div>
    <div class="bds-diff-title">
      <h4>{t('messageOverlay.diffRequest')}</h4>
      <span class="bds-diff-files">{resolved.nameA} ↔ {resolved.nameB}</span>
    </div>
  </div>

  <div class="bds-diff-body">
    {#if !resolved.sourceA || !resolved.sourceB}
      <div class="bds-diff-error">
        {t('messageOverlay.diffMissingFile', {
          file_a: resolved.nameA,
          file_b: resolved.nameB,
        })}
      </div>
    {:else if diffResult.length === 0}
      <div class="bds-diff-empty">{t('messageOverlay.diffEmpty')}</div>
    {:else}
      <div class="bds-diff-table">
        {#each diffResult as row}
          <div class="bds-diff-row {row.type}">
            <span class="bds-diff-line old">{row.oldLine ?? ""}</span>
            <span class="bds-diff-line new">{row.newLine ?? ""}</span>
            <span class="bds-diff-marker">
              {#if row.type === "add"}+
              {:else if row.type === "del"}-
              {:else}&nbsp;{/if}
            </span>
            <span class="bds-diff-value">{row.value}</span>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</article>

<style>
  .bds-diff-card {
    margin: 10px 0;
    border: 1px solid var(--bds-border, #3a3b3f);
    border-radius: var(--bds-radius, 12px);
    background: var(--bds-bg-panel, #1e1f23);
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }

  .bds-diff-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--bds-border, #3a3b3f);
  }

  .bds-diff-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 38px;
    height: 38px;
    border-radius: 10px;
    background: rgba(245, 158, 11, 0.12);
    color: #f59e0b;
    flex-shrink: 0;
  }

  .bds-diff-title {
    display: flex;
    flex-direction: column;
    min-width: 0;
    gap: 2px;
  }

  .bds-diff-title h4 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--bds-text-primary, #ececec);
  }

  .bds-diff-files {
    font-size: 11px;
    color: var(--bds-text-tertiary, #6b6b7b);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .bds-diff-body {
    padding: 12px 16px;
    max-height: 320px;
    overflow: auto;
  }

  .bds-diff-error,
  .bds-diff-empty {
    font-size: 13px;
    color: var(--bds-text-secondary, #8e8ea0);
    padding: 8px 0;
  }

  .bds-diff-table {
    display: flex;
    flex-direction: column;
    font-family: monospace;
    font-size: 12px;
    border: 1px solid var(--bds-border, #3a3b3f);
    border-radius: 8px;
    overflow: hidden;
  }

  .bds-diff-row {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 2px 8px;
    white-space: pre-wrap;
  }

  .bds-diff-row:nth-child(even) {
    background: rgba(255, 255, 255, 0.02);
  }

  .bds-diff-row.add {
    background: rgba(16, 185, 129, 0.08);
  }

  .bds-diff-row.del {
    background: rgba(239, 68, 68, 0.08);
  }

  .bds-diff-line {
    width: 28px;
    text-align: right;
    color: var(--bds-text-tertiary, #6b6b7b);
    flex-shrink: 0;
  }

  .bds-diff-marker {
    width: 14px;
    text-align: center;
    font-weight: 700;
    flex-shrink: 0;
  }

  .bds-diff-row.add .bds-diff-marker {
    color: #10b981;
  }

  .bds-diff-row.del .bds-diff-marker {
    color: #ef4444;
  }

  .bds-diff-value {
    flex: 1;
    min-width: 0;
    color: var(--bds-text-primary, #ececec);
  }
</style>
