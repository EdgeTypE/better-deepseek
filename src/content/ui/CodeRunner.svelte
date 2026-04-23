<script>
  import { onMount } from "svelte";
  import { triggerTextDownload } from "../../lib/utils/download.js";
  import { buildHeadlessRunnerDocument } from "../../lib/utils/html-utils.js";

  /** @type {{content: string, language: string}} */
  let { content, language } = $props();
  const instanceId = Math.random().toString(36).substring(2, 9);

  let code = $state(content);
  let output = $state([]);
  let status = $state("READY"); // READY, LOADING_PYODIDE, RUNNING, FINISHED, ERROR
  let iframe = $state();
  
  let isPython = $derived(language === "python" || language === "py");
  let isTypeScript = $derived(language === "typescript" || language === "ts");
  
  let headlessSrcDoc = $derived(buildHeadlessRunnerDocument(language));

  function handleMessage(event) {
    const { type, data, id } = event.data;
    if (id && id !== instanceId) return; // Ignore messages from other runners

    if (type === "CONSOLE_LOG") {
      output = [...output, { method: data.method, text: data.args.join(" ") }];
    } else if (type === "STATUS") {
      status = data;
    }
  }

  onMount(() => {
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  });

  function runCode() {
    output = [];
    iframe.contentWindow.postMessage({
      type: "RUN_CODE",
      code: code,
      id: instanceId
    }, "*");
  }

  function handleDownload() {
    const ext = isPython ? "py" : (isTypeScript ? "ts" : "js");
    triggerTextDownload(code, `script-${Date.now()}.${ext}`);
  }

  function getStatusText() {
    switch (status) {
      case "LOADING_PYODIDE": return "Loading Pyodide Runtime...";
      case "RUNNING": return "Running...";
      case "FINISHED": return "Finished.";
      case "ERROR": return "Execution Error.";
      default: return isPython ? "Python 3.x (WASM)" : (isTypeScript ? "TypeScript (Babel)" : "JavaScript (V8)");
    }
  }
</script>

<article class="bds-code-runner-card">
  <header class="bds-runner-header">
    <div class="bds-runner-title">
      <div class="bds-runner-icon" class:python={isPython} class:js={!isPython}>
        {#if isPython}
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
          </svg>
        {:else}
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M16 18l6-6-6-6M8 6l-6 6 6 6"></path>
          </svg>
        {/if}
      </div>
      <div class="bds-title-group">
        <h4>{isPython ? 'Python' : (isTypeScript ? 'TypeScript' : 'JavaScript')} Runner</h4>
        <span class="bds-status-text">{getStatusText()}</span>
      </div>
    </div>

    <div class="bds-runner-actions">
      <button type="button" class="bds-btn-small" onclick={handleDownload}>
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
        Download
      </button>
    </div>
  </header>

  <div class="bds-runner-content">
    <div class="bds-editor-wrapper">
      <textarea 
        class="bds-code-editor" 
        bind:value={code} 
        spellcheck="false"
        placeholder="Enter your code here..."
      ></textarea>
      
      <button 
        type="button" 
        class="bds-run-btn" 
        onclick={runCode} 
        disabled={status === 'RUNNING' || status === 'LOADING_PYODIDE'}
      >
        {#if status === 'RUNNING'}
          <span class="bds-spinner"></span> Running...
        {:else}
          ▶ Run {isPython ? 'Python' : (isTypeScript ? 'TS' : 'JS')}
        {/if}
      </button>
    </div>

    {#if output.length > 0 || status === 'ERROR' || status === 'FINISHED'}
      <div class="bds-output-area">
        <div class="bds-output-header">
          <span>Console Output</span>
          <button class="bds-clear-btn" onclick={() => output = []}>Clear</button>
        </div>
        <div class="bds-output-logs">
          {#each output as log}
            <div class="bds-log-line" class:error={log.method === 'error'} class:warn={log.method === 'warn'}>
              <span class="bds-log-text">{log.text}</span>
            </div>
          {/each}
          {#if output.length === 0 && status === 'FINISHED'}
            <div class="bds-log-line dim"><i>(Execution finished with no output)</i></div>
          {/if}
        </div>
      </div>
    {/if}
  </div>

  <iframe 
    bind:this={iframe} 
    srcdoc={headlessSrcDoc} 
    style="display: none;" 
    title="Headless Runner"
  ></iframe>
</article>

<style>
  .bds-code-runner-card {
    margin: 16px 0;
    border: 1px solid var(--bds-border);
    border-radius: var(--bds-radius);
    background: var(--bds-bg-panel);
    overflow: hidden;
    box-shadow: var(--bds-shadow);
    color: var(--bds-text-primary);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }

  .bds-runner-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--bds-border);
  }

  .bds-runner-title {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .bds-runner-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: 10px;
    background: var(--bds-bg-elevated);
    border: 1px solid var(--bds-border);
    flex-shrink: 0;
  }

  .bds-runner-icon.python { color: #10b981; }
  .bds-runner-icon.js { color: #f59e0b; }

  .bds-title-group {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .bds-title-group h4 {
    margin: 0;
    font-size: 15px;
    font-weight: 700;
    letter-spacing: -0.3px;
  }

  .bds-status-text {
    font-size: 11px;
    font-weight: 600;
    color: var(--bds-text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .bds-btn-small {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: transparent;
    border: 1px solid var(--bds-border);
    border-radius: 8px;
    color: var(--bds-text-secondary);
    font-size: 12px;
    font-weight: 600;
    padding: 6px 12px;
    cursor: pointer;
    transition: all var(--bds-transition);
  }

  .bds-btn-small:hover {
    background: var(--bds-bg-hover);
    color: var(--bds-text-primary);
    border-color: var(--bds-border-hover);
  }

  .bds-runner-content {
    padding: 20px;
    display: grid;
    gap: 16px;
  }

  .bds-editor-wrapper {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .bds-code-editor {
    width: 100%;
    min-height: 160px;
    padding: 14px;
    border-radius: 10px;
    border: 1px solid var(--bds-border);
    background: var(--bds-bg-input);
    color: var(--bds-text-primary);
    font-family: 'Consolas', 'Monaco', 'Ubuntu Mono', monospace;
    font-size: 13px;
    line-height: 1.6;
    resize: vertical;
    outline: none;
    transition: border-color var(--bds-transition), box-shadow var(--bds-transition);
  }

  .bds-code-editor:focus {
    border-color: var(--bds-accent);
    box-shadow: 0 0 0 3px var(--bds-accent-glow);
  }

  .bds-run-btn {
    width: 100%;
    background: var(--bds-accent);
    color: #ffffff;
    border: none;
    border-radius: 10px;
    padding: 10px 16px;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    transition: all var(--bds-transition);
  }

  .bds-run-btn:hover:not(:disabled) {
    opacity: 0.9;
    transform: translateY(-1px);
  }

  .bds-run-btn:active:not(:disabled) {
    transform: translateY(0);
  }

  .bds-run-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .bds-output-area {
    border: 1px solid var(--bds-border);
    border-radius: 10px;
    background: var(--bds-bg-elevated);
    overflow: hidden;
  }

  .bds-output-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 14px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    color: var(--bds-text-tertiary);
    background: rgba(0, 0, 0, 0.05);
    border-bottom: 1px solid var(--bds-border);
    letter-spacing: 0.5px;
  }

  .bds-clear-btn {
    background: transparent;
    border: none;
    color: var(--bds-accent);
    font-size: 10px;
    font-weight: 700;
    cursor: pointer;
    padding: 2px 6px;
    border-radius: 4px;
  }

  .bds-clear-btn:hover {
    background: var(--bds-bg-hover);
  }

  .bds-output-logs {
    padding: 12px;
    max-height: 300px;
    overflow-y: auto;
    font-family: 'Consolas', 'Monaco', monospace;
    font-size: 13px;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-all;
  }

  .bds-log-line {
    padding: 2px 0;
    border-bottom: 1px solid rgba(0,0,0,0.03);
    color: var(--bds-text-primary);
  }

  .bds-log-line.error { color: var(--bds-danger); }
  .bds-log-line.warn { color: #f59e0b; }
  .bds-log-line.dim { color: var(--bds-text-tertiary); }

  .bds-spinner {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: #fff;
    border-radius: 50%;
    animation: bds-spin 0.8s linear infinite;
  }

  @keyframes bds-spin {
    to { transform: rotate(360deg); }
  }

  :global(.dark) .bds-output-header {
    background: rgba(255, 255, 255, 0.03);
  }
</style>
