<script>
  import { onMount } from "svelte";
  import { buildHeadlessRunnerDocument } from "../../lib/utils/html-utils.js";
  import { handleAutoCodeRunnerResult } from "../auto.js";

  /** @type {{content: string, language: string}} */
  let { content, language } = $props();
  const instanceId = Math.random().toString(36).substring(2, 9);

  let status = $state("pending"); // pending, running, success, error, rejected
  let output = $state([]);
  let showCode = $state(false);
  let iframe = $state();

  const sandboxUrl = chrome.runtime.getURL("sandbox.html");
  let headlessSrcDoc = $derived(buildHeadlessRunnerDocument(language));

  let isPython = $derived(language === "python" || language === "py");
  let isTypeScript = $derived(language === "typescript" || language === "ts");
  let langLabel = $derived(isPython ? "Python" : (isTypeScript ? "TypeScript" : "JavaScript"));
  let langColor = $derived(isPython ? "#10b981" : (isTypeScript ? "#3b82f6" : "#f59e0b"));

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
    iframe.contentWindow.postMessage({
      type: "RUN_CODE",
      code: content,
      id: instanceId
    }, "*");
  }

  function rejectCode() {
    status = "rejected";
    output = [{ method: "warn", text: "User rejected code execution." }];
    handleAutoCodeRunnerResult(language, "rejected", output);
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
        {:else}
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M16 18l6-6-6-6M8 6l-6 6 6 6"></path>
          </svg>
        {/if}
      </div>
      <div class="bds-auto-runner-details">
        <h4>AI wants to run {langLabel} code</h4>
        <p>This will execute in a safe sandbox.</p>
      </div>
    </div>

    <div class="bds-auto-runner-actions">
      {#if status === 'pending'}
        <button type="button" class="bds-btn run" onclick={runCode}>▶ Run Code</button>
        <button type="button" class="bds-btn reject" onclick={rejectCode}>✕ Reject</button>
      {:else if status === 'running'}
        <span class="bds-status-bubble">Running...</span>
      {:else if status === 'success'}
        <span class="bds-status-bubble success">Finished</span>
        <button type="button" class="bds-btn-text" onclick={runCode}>Run Again</button>
      {:else if status === 'error'}
        <span class="bds-status-bubble error">Error</span>
        <button type="button" class="bds-btn-text" onclick={runCode}>Retry</button>
      {:else if status === 'rejected'}
        <span class="bds-status-bubble">Rejected</span>
        <button type="button" class="bds-btn-text" onclick={runCode}>Actually, Run</button>
      {/if}
      <button type="button" class="bds-btn-text toggle" onclick={toggleCode}>
        {showCode ? 'Hide Code ▴' : 'Show Code ▾'}
      </button>
    </div>
  </div>

  {#if showCode}
    <div class="bds-auto-runner-source">
      <pre>{content.trim()}</pre>
    </div>
  {/if}

  {#if output.length > 0}
    <div class="bds-auto-runner-output">
      <div class="bds-output-label">Console Output</div>
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
    padding: 0 16px 12px;
    border-top: 1px solid var(--bds-border);
    padding-top: 10px;
  }

  .bds-auto-runner-source pre {
    margin: 0;
    max-height: 150px;
    overflow-y: auto;
    background: var(--bds-bg-elevated);
    border-radius: 8px;
    padding: 10px;
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
