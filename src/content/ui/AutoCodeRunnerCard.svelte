<script>
  import { onMount } from "svelte";
  import { t } from "../../lib/i18n.svelte.js";
  import { buildHeadlessRunnerDocument } from "../../lib/utils/html-utils.js";
  import { handleAutoCodeRunnerResult } from "../auto.js";

  /** @type {{content: string, language: string}} */
  let { content, language } = $props();
  const instanceId = Math.random().toString(36).substring(2, 9);

  let status = $state("pending"); // pending, running, success, error, rejected
  let output = $state([]);
  let showCode = $state(false);
  let copyFeedback = $state(false);
  let iframe = $state();

  let headlessSrcDoc = $derived(buildHeadlessRunnerDocument(language));

  let isPython = $derived(language === "python" || language === "py");
  let isTypeScript = $derived(language === "typescript" || language === "ts");
  let isLua = $derived(language === "lua");
  let isRuby = $derived(language === "ruby");
  let langLabel = $derived(isPython ? "Python" : isTypeScript ? "TypeScript" : isLua ? "Lua" : isRuby ? "Ruby" : "JavaScript");
  let langColor = $derived(isPython ? "#10b981" : isTypeScript ? "#3b82f6" : isLua ? "#a855f7" : isRuby ? "#dc2626" : "#f59e0b");

  function handleMessage(event) {
    const { type, data, id } = event.data;
    if (id && id !== instanceId) return;

    if (type === "CONSOLE_LOG") {
      output = [...output, { method: data.method, text: data.args.join(" ") }];
    } else if (type === "STATUS") {
      if (data === "FINISHED") {
        status = "success";
        handleAutoCodeRunnerResult(language, "success", output);
      }
      if (data === "ERROR") {
        status = "error";
        handleAutoCodeRunnerResult(language, "error", output);
      }
    }
  }

  onMount(() => {
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  });

  function runCode() {
    status = "running";
    output = [];
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage({
        type: "RUN_CODE",
        code: content,
        id: instanceId
      }, "*");
    }
  }

  function rejectCode() {
    status = "rejected";
    output = [{ method: "warn", text: "User rejected code execution." }];
    handleAutoCodeRunnerResult(language, "rejected", output);
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(content);
      copyFeedback = true;
      setTimeout(() => {
        copyFeedback = false;
      }, 2000);
    } catch {
      // fallback
    }
  }

  function toggleCode() {
    showCode = !showCode;
  }
</script>

<article class="bds-auto-runner-card" class:rejected={status === 'rejected'} style="--lang-color: {langColor}">
  <div class="bds-auto-runner-header">
    <div class="bds-auto-runner-info">
      <div class="bds-auto-runner-icon">
        {#if isPython}
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
          </svg>
        {:else if isLua}
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path>
          </svg>
        {:else if isRuby}
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M16 18L6 12l10-6v12z"></path>
          </svg>
        {:else}
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M16 18l6-6-6-6M8 6l-6 6 6 6"></path>
          </svg>
        {/if}
      </div>
      <div class="bds-auto-runner-details">
        <h4>{t('autoCodeRunner.aiWantsToRun', { lang: langLabel }) || `AI wants to run ${langLabel} code`}</h4>
        <p>{t('autoCodeRunner.safeSandbox') || 'This will execute in a safe sandbox.'}</p>
      </div>
    </div>

    <div class="bds-auto-runner-actions">
      {#if status === 'pending'}
        <button type="button" class="bds-btn run" onclick={runCode}>{t('autoCodeRunner.runCode') || '▶ Run Code'}</button>
        <button type="button" class="bds-btn reject" onclick={rejectCode}>{t('autoCodeRunner.reject') || '✕ Reject'}</button>
      {:else}
        {#if status === 'running'}
          <span class="bds-status-bubble">{t('autoCodeRunner.running') || 'Running...'}</span>
        {:else if status === 'success'}
          <span class="bds-status-bubble success">{t('autoCodeRunner.finished') || 'Finished'}</span>
          <button type="button" class="bds-btn-text" onclick={runCode}>{t('autoCodeRunner.runAgain') || 'Run Again'}</button>
        {:else if status === 'error'}
          <span class="bds-status-bubble error">{t('autoCodeRunner.error') || 'Error'}</span>
          <button type="button" class="bds-btn-text" onclick={runCode}>{t('autoCodeRunner.retry') || 'Retry'}</button>
        {:else if status === 'rejected'}
          <span class="bds-status-bubble">{t('autoCodeRunner.rejected') || 'Rejected'}</span>
          <button type="button" class="bds-btn-text" onclick={runCode}>{t('autoCodeRunner.actuallyRun') || 'Actually, Run'}</button>
        {/if}
      {/if}
      <button type="button" class="bds-btn-text toggle" onclick={toggleCode}>
        {showCode ? (t('autoCodeRunner.hideCode') || 'Hide Code ▴') : (t('autoCodeRunner.showCode') || 'Show Code ▾')}
      </button>
    </div>
  </div>

  {#if showCode}
    <div class="bds-auto-runner-source">
      <button 
        type="button" 
        class="bds-source-copy-btn bds-btn-copy" 
        onclick={copyCode}
        title={copyFeedback ? (t('autoCodeRunner.copied') || 'Copied!') : (t('autoCodeRunner.copyCode') || 'Copy')}
        aria-label={copyFeedback ? (t('autoCodeRunner.copied') || 'Copied!') : (t('autoCodeRunner.copyCode') || 'Copy')}
      >
        {#if copyFeedback}
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        {:else}
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
        {/if}
      </button>
      <pre>{content}</pre>
    </div>
  {/if}

  {#if output.length > 0}
    <div class="bds-auto-runner-output">
      <div class="bds-output-label">{t('autoCodeRunner.consoleOutput') || 'Console Output'}</div>
      <div class="bds-output-logs">
        {#each output as log}
          <div class="bds-log-line" class:error={log.method === 'error'} class:warn={log.method === 'warn'}>
            <span class="bds-log-text">{log.text}</span>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <iframe 
    bind:this={iframe} 
    srcdoc={headlessSrcDoc} 
    style="display: none;" 
    title="BDS Auto Code Runner Sandbox"
  ></iframe>
</article>

<style>
  .bds-auto-runner-card {
    margin: 10px 0;
    border: 1px solid var(--bds-border);
    border-radius: var(--bds-radius);
    background: var(--bds-bg-panel);
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }

  .bds-auto-runner-card.rejected {
    opacity: 0.8;
  }

  .bds-auto-runner-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
  }

  .bds-auto-runner-info {
    display: flex;
    align-items: center;
    gap: 14px;
    min-width: 0;
  }

  .bds-auto-runner-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 42px;
    height: 42px;
    background-color: var(--bds-bg-elevated);
    border: 1px solid var(--bds-border);
    border-radius: 10px;
    color: var(--lang-color);
    flex-shrink: 0;
  }

  .bds-auto-runner-details {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .bds-auto-runner-details h4 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--bds-text-primary);
  }

  .bds-auto-runner-details p {
    margin: 0;
    font-size: 11px;
    color: var(--bds-text-tertiary);
  }

  .bds-auto-runner-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .bds-btn {
    border: 1px solid var(--bds-border);
    border-radius: 8px;
    background: var(--bds-bg-elevated);
    color: var(--bds-text-primary);
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    padding: 6px 12px;
    transition: all 0.2s;
  }

  .bds-btn.run {
    background: var(--lang-color);
    color: #fff;
    border: none;
  }

  .bds-btn:hover {
    opacity: 0.9;
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

  .bds-status-bubble {
    font-size: 11px;
    font-weight: 700;
    color: var(--bds-text-tertiary);
    text-transform: uppercase;
  }

  .bds-status-bubble.success { color: #10b981; }
  .bds-status-bubble.error { color: #ef4444; }

  .bds-auto-runner-source {
    position: relative;
    padding: 0 16px 12px;
    border-top: 1px solid var(--bds-border);
    padding-top: 10px;
  }

  .bds-source-copy-btn {
    position: absolute;
    top: 16px;
    right: 24px;
    z-index: 2;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    padding: 0;
    background: var(--bds-bg-panel);
    border: 1px solid var(--bds-border);
    border-radius: 6px;
    color: var(--bds-text-secondary);
    cursor: pointer;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
    user-select: none;
    transition: all 0.15s ease;
  }

  .bds-source-copy-btn:hover {
    background: var(--bds-bg-hover);
    color: var(--bds-text-primary);
    border-color: var(--bds-border-hover);
  }

  .bds-source-copy-btn:active {
    transform: scale(0.92);
  }

  .bds-auto-runner-source pre {
    margin: 0;
    max-height: 150px;
    overflow-y: auto;
    background: var(--bds-bg-elevated);
    border-radius: 8px;
    padding: 10px;
    padding-right: 42px;
    font-size: 11px;
    border: 1px solid var(--bds-border);
    font-family: monospace;
    white-space: pre-wrap;
    color: var(--bds-text-primary);
  }

  .bds-auto-runner-output {
    padding: 12px 16px;
    border-top: 1px solid var(--bds-border);
    background: rgba(0,0,0,0.02);
  }

  :global(.dark) .bds-auto-runner-output {
    background: rgba(255,255,255,0.02);
  }

  .bds-output-label {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    color: var(--bds-text-tertiary);
    margin-bottom: 6px;
    letter-spacing: 0.5px;
  }

  .bds-output-logs {
    font-family: monospace;
    font-size: 12px;
    line-height: 1.4;
  }

  .bds-log-line {
    padding: 2px 0;
  }

  .bds-log-line.error { color: #ef4444; }
  .bds-log-line.warn { color: #f59e0b; }
</style>
