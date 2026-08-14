<script>
  import { onMount, onDestroy } from "svelte";
  import appState from "../state.js";
  import { getCachedPathForFolder } from "../deep-code.js";
  import { BetterDeepSeekHarnessBridge, runFallbackMode } from "../../lib/harness-bridge.js";

  let { attrs = {}, content = "" } = $props();

  let initialPath = appState.deepCode.manualPath || attrs.cwd || attrs.path || appState.deepCode.activeDirectory || "";
  let cwdInput = $state(initialPath);
  let workspaceId = $derived(attrs.workspaceId || attrs.workspaceid || "");
  let taskPrompt = $derived(content.trim() || attrs.task || "Execute task");

  $effect(() => {
    const cur = cwdInput.trim();
    if (cur && !cur.startsWith('/') && !cur.startsWith('\\') && !/^[a-zA-Z]:[/\\]/.test(cur)) {
      getCachedPathForFolder(cur).then((cached) => {
        if (cached) cwdInput = cached;
      });
    }
  });

  let status = $state("idle"); // idle | connecting | running | finishing | completed | fallback | cancelled | error
  let sessionId = $state("");
  let errorMessage = $state("");
  let debugInfo = $state(null);
  let showDebug = $state(false);

  let pluginActive = $state(false);
  let pluginVersion = $state("");
  let bridge = new BetterDeepSeekHarnessBridge();

  let liveLogs = $state([]);
  let assistantOutput = $state("");
  let finalMarkdownReport = $state("");
  let showLiveStream = $state(true);
  let copyFeedback = $state("");
  let insertFeedback = $state("");

  onMount(async () => {
    const ping = await bridge.checkPluginActive();
    if (ping.active) {
      pluginActive = true;
      pluginVersion = ping.version || "1.6.0";
    }
  });

  onDestroy(() => {
    bridge.disconnect();
  });

  async function runHarnessTask() {
    errorMessage = "";
    debugInfo = null;
    liveLogs = [];
    assistantOutput = "";
    finalMarkdownReport = "";
    copyFeedback = "";
    insertFeedback = "";

    const targetCwd = cwdInput.trim() || appState.deepCode.manualPath || attrs.cwd;

    // Detect mode: MOD A (Enhanced Bridge) vs MOD B (Fallback)
    const mode = await bridge.detectMode();

    if (mode === "enhanced") {
      // ──── MOD A: Tam Otomatik Mod ────
      status = "connecting";
      pluginActive = true;

      try {
        // 1. Create Session
        const sid = await bridge.createSession(targetCwd);
        sessionId = sid;
        status = "running";
        liveLogs = [{ type: "info", text: `🚀 Session ${sid} created on Harness.` }];

        // 2. Connect Live SSE Stream
        bridge.connectEvents((event) => {
          if (!sessionId || event.payload?.sessionId === sessionId) {
            const timeStr = new Date(event.timestamp || Date.now()).toLocaleTimeString();

            if (event.type === "assistant/chunk" && event.payload?.delta) {
              assistantOutput += event.payload.delta;
            } else if (event.type === "assistant/message" && event.payload?.text) {
              assistantOutput = event.payload.text;
            } else if (event.type === "tool/call") {
              const toolName = event.payload?.tool || "tool";
              const argsStr = event.payload?.args ? ` (${JSON.stringify(event.payload.args).slice(0, 60)}...)` : "";
              liveLogs = [...liveLogs, { type: "tool-call", text: `[${timeStr}] 🛠️ Running tool: ${toolName}${argsStr}` }];
            } else if (event.type === "tool/result") {
              const toolName = event.payload?.tool || "tool";
              liveLogs = [...liveLogs, { type: "tool-result", text: `[${timeStr}] ✅ Finished tool: ${toolName}` }];
            } else if (event.type === "turn/stopping") {
              if (status === "running") {
                status = "finishing";
                liveLogs = [...liveLogs, { type: "info", text: `[${timeStr}] ⏳ Results compiling...` }];
              }
            } else if (event.type === "turn/complete") {
              status = "completed";
              if (event.payload?.finalText) {
                finalMarkdownReport = event.payload.finalText;
              } else if (assistantOutput) {
                finalMarkdownReport = assistantOutput;
              }
              liveLogs = [...liveLogs, { type: "info", text: `[${timeStr}] ✨ Turn completed with final report.` }];
            }
          }
        });

        // 3. Send Prompt
        await bridge.sendPrompt(sessionId, taskPrompt);

      } catch (err) {
        status = "error";
        errorMessage = err.message || "Failed to execute session on Harness.";
        debugInfo = { url: "http://127.0.0.1:3080/api/better-deepseek/session.create", error: String(err) };
      }
    } else {
      // ──── MOD B: Hafif Çözüm Modu (Fallback) ────
      status = "fallback";
      await runFallbackMode(taskPrompt);
    }
  }

  async function cancelCurrentTask() {
    if (!sessionId) {
      status = "cancelled";
      return;
    }
    const cancelled = await bridge.cancelSession(sessionId);
    if (cancelled) {
      status = "cancelled";
      liveLogs = [...liveLogs, { type: "info", text: `🛑 Task cancelled by user.` }];
    }
  }

  async function copyPromptAgain() {
    try {
      await navigator.clipboard.writeText(taskPrompt);
      copyFeedback = "Prompt copied to clipboard! 📋";
      setTimeout(() => { copyFeedback = ""; }, 2500);
    } catch {
      copyFeedback = "Failed to copy.";
    }
  }

  function openHarnessTab() {
    window.open("http://127.0.0.1:3080", "_blank");
  }

  async function copyFinalReport() {
    const textToCopy = finalMarkdownReport || assistantOutput;
    if (!textToCopy) return;
    try {
      await navigator.clipboard.writeText(textToCopy);
      copyFeedback = "Report copied to clipboard! 📋";
      setTimeout(() => { copyFeedback = ""; }, 2500);
    } catch {
      copyFeedback = "Failed to copy.";
    }
  }

  function insertIntoChat() {
    const textToInsert = finalMarkdownReport || assistantOutput;
    if (!textToInsert) return;

    const textarea = document.querySelector('textarea[placeholder*="DeepSeek"], textarea[id*="chat"], #chat-input');
    if (textarea) {
      textarea.value = textToInsert;
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      textarea.focus();
      insertFeedback = "Inserted into chat! 💬";
      setTimeout(() => { insertFeedback = ""; }, 2500);
    } else {
      copyFinalReport();
      insertFeedback = "Copied to clipboard (chat input not found) 📋";
      setTimeout(() => { insertFeedback = ""; }, 2500);
    }
  }

  function toggleDebug() {
    showDebug = !showDebug;
  }
</script>

<div class="bds-harness-card">
  <div class="bds-harness-header">
    <div class="bds-harness-title">
      <span class="bds-harness-icon">⚡</span>
      <div>
        <strong>DeepSeek Harness Task</strong>
        {#if pluginActive}
          <span class="bds-plugin-tag">Bridge Plugin v{pluginVersion} (Auto SSE)</span>
        {/if}
      </div>
    </div>
    <span
      class="bds-harness-badge"
      class:bds-success={status === 'completed'}
      class:bds-running={status === 'running' || status === 'connecting' || status === 'finishing'}
      class:bds-fallback={status === 'fallback'}
      class:bds-cancelled={status === 'cancelled'}
      class:bds-error={status === 'error'}
    >
      {#if status === 'idle'}
        Ready
      {:else if status === 'connecting'}
        Connecting...
      {:else if status === 'running'}
        Running...
      {:else if status === 'finishing'}
        Compiling...
      {:else if status === 'completed'}
        Completed ✨
      {:else if status === 'fallback'}
        Manual Mode 📋
      {:else if status === 'cancelled'}
        Cancelled 🛑
      {:else}
        Failed
      {/if}
    </span>
  </div>

  <div class="bds-harness-body">
    <div class="bds-harness-row">
      <span class="bds-label">Absolute Codebase Path (CWD):</span>
      <input
        type="text"
        bind:value={cwdInput}
        placeholder="e.g. A:/Users/Edige/GitHub/asistan"
        class="bds-path-input"
      />
    </div>

    <div class="bds-harness-task-box">
      <div class="bds-label">Task Description & Plan:</div>
      <pre class="bds-task-content">{taskPrompt}</pre>
    </div>

    <!-- MOD B: FALLBACK MANUAL MODE CARD -->
    {#if status === "fallback"}
      <div class="bds-fallback-card">
        <div class="bds-fallback-title">
          <span>🌐 Harness Manual Execution (Bridge Plugin Not Installed)</span>
        </div>
        <p class="bds-fallback-desc">
          Görev metni panoya kopyalandı! Harness sekmesine yapıştırıp Enter'a basın.
        </p>
        <div class="bds-fallback-actions">
          <button type="button" class="bds-btn-fallback" onclick={copyPromptAgain}>
            Tekrar Kopyala 📋
          </button>
          <button type="button" class="bds-btn-fallback bds-primary" onclick={openHarnessTab}>
            Harness'ı Aç 🔗
          </button>
          {#if copyFeedback}
            <span class="bds-feedback-text">{copyFeedback}</span>
          {/if}
        </div>
        <div class="bds-fallback-hint">
          💡 <strong>Tam otomatik mod için</strong> terminalde Bridge eklentisini kurun:
          <code>irm https://raw.githubusercontent.com/EdgeTypE/better-deepseek/main/scripts/install.ps1 | iex</code>
        </div>
      </div>
    {/if}

    <!-- MOD A: LIVE LOGS & OUTPUT -->
    {#if (liveLogs.length > 0 || assistantOutput) && status !== "fallback"}
      <div class="bds-harness-live-box">
        <div class="bds-live-header" onclick={() => showLiveStream = !showLiveStream}>
          <span>📡 Live Execution Stream ({liveLogs.length} events)</span>
          <span class="bds-collapse-icon">{showLiveStream ? '▲' : '▼'}</span>
        </div>
        {#if showLiveStream}
          <div class="bds-live-logs">
            {#each liveLogs as item}
              <div class="bds-live-log-item {item.type}">{item.text}</div>
            {/each}
          </div>
          {#if assistantOutput && (status === 'running' || status === 'finishing')}
            <div class="bds-assistant-output">
              <div class="bds-assistant-output-label">Live Assistant Output:</div>
              <pre class="bds-assistant-pre">{assistantOutput}</pre>
            </div>
          {/if}
        {/if}
      </div>
    {/if}

    <!-- MOD A: FINAL REPORT CARD -->
    {#if finalMarkdownReport || (status === 'completed' && assistantOutput)}
      <div class="bds-final-report-card">
        <div class="bds-final-report-header">
          <div class="bds-final-report-title">
            <span>✨</span>
            <strong>Final Task Report / Nihai Rapor</strong>
          </div>
          <div class="bds-report-actions">
            {#if copyFeedback}
              <span class="bds-copy-feedback">{copyFeedback}</span>
            {/if}
            {#if insertFeedback}
              <span class="bds-copy-feedback">{insertFeedback}</span>
            {/if}
            <button type="button" class="bds-btn-copy" onclick={copyFinalReport}>
              📋 Kopyala
            </button>
            <button type="button" class="bds-btn-insert" onclick={insertIntoChat}>
              💬 Chat'e Yapıştır
            </button>
          </div>
        </div>
        <div class="bds-final-report-body">
          <pre class="bds-report-pre">{finalMarkdownReport || assistantOutput}</pre>
        </div>
      </div>
    {/if}

    <!-- ERROR DETAILS -->
    {#if errorMessage}
      <div class="bds-harness-error-container">
        <div class="bds-harness-error-title">
          ⚠️ {errorMessage}
        </div>
        {#if debugInfo}
          <button type="button" class="bds-debug-toggle-btn" onclick={toggleDebug}>
            {showDebug ? '▲ Hide Debug Details' : '▼ Show Detailed Error Log'}
          </button>
          {#if showDebug}
            <div class="bds-debug-box">
              <div class="bds-debug-row"><strong>URL:</strong> <code>{debugInfo.url || 'http://127.0.0.1:3080'}</code></div>
              {#if debugInfo.error}
                <div class="bds-debug-row"><strong>Error:</strong> <code>{debugInfo.error}</code></div>
              {/if}
            </div>
          {/if}
        {/if}
      </div>
    {/if}
  </div>

  <div class="bds-harness-actions">
    {#if status === 'running' || status === 'connecting' || status === 'finishing'}
      <button type="button" class="bds-btn-cancel" onclick={cancelCurrentTask}>
        ⏹️ Durdur / İptal
      </button>
    {/if}
    <button
      type="button"
      class="bds-btn-run"
      disabled={status === 'running' || status === 'connecting' || status === 'finishing'}
      onclick={runHarnessTask}
    >
      {#if status === 'running' || status === 'connecting' || status === 'finishing'}
        Executing on Harness...
      {:else if status === 'completed'}
        🔄 Yeniden Çalıştır
      {:else if status === 'fallback'}
        📋 Tekrar Çalıştır
      {:else}
        ▶ Run in DeepSeek Harness
      {/if}
    </button>
  </div>
</div>

<style>
  .bds-harness-card {
    background: var(--bds-bg-panel, #1a1b1e);
    border: 1px solid var(--bds-border, #333438);
    border-radius: 12px;
    padding: 16px;
    margin: 12px 0;
    font-family: inherit;
    color: var(--bds-text-primary, #ececec);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
  }
  .bds-harness-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }
  .bds-harness-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
  }
  .bds-plugin-tag {
    display: inline-block;
    background: rgba(37, 99, 235, 0.2);
    color: #60a5fa;
    border: 1px solid rgba(37, 99, 235, 0.4);
    border-radius: 4px;
    font-size: 10px;
    padding: 2px 6px;
    margin-left: 6px;
    font-weight: 500;
  }
  .bds-harness-icon {
    font-size: 16px;
  }
  .bds-harness-badge {
    font-size: 11px;
    padding: 3px 8px;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.1);
    color: var(--bds-text-secondary, #9ca3af);
  }
  .bds-harness-badge.bds-running {
    background: rgba(59, 130, 246, 0.2);
    color: #60a5fa;
  }
  .bds-harness-badge.bds-success {
    background: rgba(16, 185, 129, 0.2);
    color: #34d399;
  }
  .bds-harness-badge.bds-fallback {
    background: rgba(245, 158, 11, 0.2);
    color: #fbbf24;
  }
  .bds-harness-badge.bds-error {
    background: rgba(239, 68, 68, 0.2);
    color: #f87171;
  }
  .bds-harness-badge.bds-cancelled {
    background: rgba(107, 114, 128, 0.2);
    color: #9ca3af;
  }
  .bds-harness-body {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .bds-harness-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .bds-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--bds-text-secondary, #9ca3af);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .bds-path-input {
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid var(--bds-border, #333438);
    border-radius: 6px;
    padding: 8px 10px;
    font-size: 13px;
    color: #ffffff;
    font-family: monospace;
  }
  .bds-path-input:focus {
    outline: none;
    border-color: #2563eb;
  }
  .bds-harness-task-box {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .bds-task-content {
    background: rgba(0, 0, 0, 0.35);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 6px;
    padding: 10px;
    font-size: 12px;
    line-height: 1.5;
    color: #d1d5db;
    max-height: 160px;
    overflow-y: auto;
    white-space: pre-wrap;
    word-break: break-word;
    margin: 0;
    font-family: monospace;
  }
  .bds-fallback-card {
    background: rgba(245, 158, 11, 0.08);
    border: 1px solid rgba(245, 158, 11, 0.3);
    border-radius: 8px;
    padding: 12px;
  }
  .bds-fallback-title {
    font-size: 12px;
    font-weight: 600;
    color: #fbbf24;
    margin-bottom: 6px;
  }
  .bds-fallback-desc {
    font-size: 12px;
    color: #e5e7eb;
    margin: 0 0 10px;
    line-height: 1.4;
  }
  .bds-fallback-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
  }
  .bds-btn-fallback {
    background: rgba(255, 255, 255, 0.1);
    color: #ffffff;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 6px;
    padding: 6px 12px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
  }
  .bds-btn-fallback.bds-primary {
    background: #d97706;
    border-color: #f59e0b;
  }
  .bds-btn-fallback:hover {
    opacity: 0.9;
  }
  .bds-feedback-text {
    font-size: 11px;
    color: #34d399;
  }
  .bds-fallback-hint {
    font-size: 11px;
    color: #9ca3af;
    line-height: 1.4;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    padding-top: 8px;
  }
  .bds-fallback-hint code {
    display: block;
    margin-top: 4px;
    background: rgba(0, 0, 0, 0.4);
    padding: 4px 8px;
    border-radius: 4px;
    color: #60a5fa;
    font-size: 10px;
  }
  .bds-harness-live-box {
    background: rgba(0, 0, 0, 0.4);
    border: 1px solid rgba(37, 99, 235, 0.3);
    border-radius: 8px;
    padding: 10px;
  }
  .bds-live-header {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    font-weight: 600;
    color: #60a5fa;
    cursor: pointer;
    user-select: none;
  }
  .bds-live-logs {
    margin-top: 8px;
    max-height: 140px;
    overflow-y: auto;
    font-family: monospace;
    font-size: 11px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .bds-live-log-item {
    padding: 3px 6px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.03);
    color: #d1d5db;
  }
  .bds-live-log-item.tool-call {
    color: #fbbf24;
    border-left: 2px solid #f59e0b;
  }
  .bds-live-log-item.tool-result {
    color: #34d399;
    border-left: 2px solid #10b981;
  }
  .bds-assistant-output {
    margin-top: 10px;
    padding-top: 8px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }
  .bds-assistant-output-label {
    font-size: 11px;
    color: #9ca3af;
    margin-bottom: 4px;
  }
  .bds-assistant-pre {
    background: rgba(0, 0, 0, 0.5);
    border-radius: 6px;
    padding: 8px;
    font-size: 11px;
    color: #e5e7eb;
    max-height: 120px;
    overflow-y: auto;
    white-space: pre-wrap;
    word-break: break-word;
    margin: 0;
  }
  .bds-final-report-card {
    background: #181926;
    border: 1px solid #10b981;
    border-radius: 10px;
    padding: 14px;
    box-shadow: 0 4px 20px rgba(16, 185, 129, 0.15);
  }
  .bds-final-report-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
    padding-bottom: 8px;
    border-bottom: 1px solid rgba(16, 185, 129, 0.2);
  }
  .bds-final-report-title {
    display: flex;
    align-items: center;
    gap: 6px;
    color: #34d399;
    font-size: 13px;
  }
  .bds-report-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .bds-copy-feedback {
    font-size: 11px;
    color: #34d399;
  }
  .bds-btn-copy, .bds-btn-insert {
    background: #059669;
    color: white;
    border: none;
    border-radius: 6px;
    padding: 5px 10px;
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.2s;
  }
  .bds-btn-insert {
    background: #2563eb;
  }
  .bds-btn-copy:hover {
    background: #047857;
  }
  .bds-btn-insert:hover {
    background: #1d4ed8;
  }
  .bds-report-pre {
    background: rgba(0, 0, 0, 0.4);
    border-radius: 6px;
    padding: 12px;
    font-size: 12px;
    line-height: 1.6;
    color: #f3f4f6;
    max-height: 320px;
    overflow-y: auto;
    white-space: pre-wrap;
    word-break: break-word;
    margin: 0;
    font-family: monospace;
  }
  .bds-harness-error-container {
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.25);
    border-radius: 8px;
    padding: 10px 12px;
  }
  .bds-harness-error-title {
    color: #f87171;
    font-size: 12px;
    font-weight: 500;
  }
  .bds-debug-toggle-btn {
    background: transparent;
    border: none;
    color: #60a5fa;
    font-size: 11px;
    cursor: pointer;
    padding: 0;
    margin-top: 6px;
    text-decoration: underline;
  }
  .bds-debug-box {
    margin-top: 8px;
    padding: 8px;
    background: rgba(0, 0, 0, 0.4);
    border-radius: 6px;
    font-size: 11px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .bds-debug-row {
    color: #d1d5db;
  }
  .bds-harness-actions {
    margin-top: 12px;
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
  .bds-btn-cancel {
    background: rgba(239, 68, 68, 0.2);
    color: #f87171;
    border: 1px solid rgba(239, 68, 68, 0.4);
    border-radius: 8px;
    padding: 8px 14px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }
  .bds-btn-cancel:hover {
    background: rgba(239, 68, 68, 0.3);
  }
  .bds-btn-run {
    background: linear-gradient(135deg, #2563eb, #1d4ed8);
    color: white;
    border: none;
    border-radius: 8px;
    padding: 9px 18px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.2s;
  }
  .bds-btn-run:hover:not(:disabled) {
    opacity: 0.9;
  }
  .bds-btn-run:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
