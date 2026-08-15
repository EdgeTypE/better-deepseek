<script>
  import { onMount, onDestroy, tick } from "svelte";
  import appState from "../state.js";
  import { getCachedPathForFolder, setPendingHarnessReport } from "../deep-code.js";
  import { BetterDeepSeekHarnessBridge, runFallbackMode } from "../../lib/harness-bridge.js";
  import { t } from "../../lib/i18n.svelte.js";

  let { attrs = {}, content = "" } = $props();

  let initialPath = appState.deepCode.manualPath || attrs.cwd || attrs.path || appState.deepCode.activeDirectory || "";
  let cwdInput = $state(initialPath);
  let workspaceId = $derived(attrs.workspaceId || attrs.workspaceid || "");
  let taskPrompt = $derived(content.trim() || attrs.task || t("harnessTaskCard.taskDefault"));

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
  let cardEl = $state(null);

  let pluginActive = $state(false);
  let pluginVersion = $state("");
  let bridge = new BetterDeepSeekHarnessBridge();

  let liveLogs = $state([]);
  let assistantOutput = $state("");
  let finalMarkdownReport = $state("");
  let showLiveStream = $state(true);
  let copyFeedback = $state("");
  let insertFeedback = $state("");

  let logsEl = $state(null);
  let outputEl = $state(null);

  $effect(() => {
    if (liveLogs.length && logsEl) logsEl.scrollTop = logsEl.scrollHeight;
  });

  $effect(() => {
    if (assistantOutput && outputEl) outputEl.scrollTop = outputEl.scrollHeight;
  });

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
        liveLogs = [{ type: "info", text: t("harnessTaskCard.logSessionCreated", { sid }) }];

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
              liveLogs = [...liveLogs, { type: "tool-call", text: t("harnessTaskCard.logToolCall", { time: timeStr, tool: toolName }) + argsStr }];
            } else if (event.type === "tool/result") {
              const toolName = event.payload?.tool || "tool";
              liveLogs = [...liveLogs, { type: "tool-result", text: t("harnessTaskCard.logToolResult", { time: timeStr, tool: toolName }) }];
            } else if (event.type === "turn/stopping") {
              if (status === "running") {
                status = "finishing";
                liveLogs = [...liveLogs, { type: "info", text: t("harnessTaskCard.logCompiling", { time: timeStr }) }];
              }
            } else if (event.type === "turn/complete") {
              status = "completed";
              if (event.payload?.finalText) {
                finalMarkdownReport = event.payload.finalText;
              } else if (assistantOutput) {
                finalMarkdownReport = assistantOutput;
              }
              setPendingHarnessReport({
                cwd: targetCwd,
                sessionId,
                report: finalMarkdownReport || assistantOutput,
                completedAt: Date.now(),
              });
              liveLogs = [...liveLogs, { type: "info", text: t("harnessTaskCard.logComplete", { time: timeStr }) }];
            }
          }
        });

        // 3. Send Prompt
        await bridge.sendPrompt(sessionId, taskPrompt);

      } catch (err) {
        status = "error";
        errorMessage = err.message || t("harnessTaskCard.executeFailed");
        debugInfo = { url: "http://127.0.0.1:3080/api/better-deepseek/session.create", error: String(err) };
      }
    } else {
      // ──── MOD B: Hafif Çözüm Modu (Fallback) ────
      // Grow the card FIRST and let DeepSeek's layout re-measure before the
      // new tab opens: window.open steals focus and can freeze the scroll
      // container's measurement while the card is still growing, which makes
      // the card's bottom unreachable. (Same effect as toggling the Thinking
      // block, which the user confirmed fixes the layout.)
      status = "fallback";
      await tick();
      cardEl?.scrollIntoView({ block: "end" });
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
      liveLogs = [...liveLogs, { type: "info", text: t("harnessTaskCard.logCancelled") }];
    }
  }

  async function copyPromptAgain() {
    try {
      await navigator.clipboard.writeText(taskPrompt);
      copyFeedback = t("harnessTaskCard.copyPromptFeedback");
      setTimeout(() => { copyFeedback = ""; }, 2500);
    } catch {
      copyFeedback = t("harnessTaskCard.copyFailed");
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
      copyFeedback = t("harnessTaskCard.copyFeedback");
      setTimeout(() => { copyFeedback = ""; }, 2500);
    } catch {
      copyFeedback = t("harnessTaskCard.copyFailed");
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
      insertFeedback = t("harnessTaskCard.insertFeedback");
      setTimeout(() => { insertFeedback = ""; }, 2500);
    } else {
      copyFinalReport();
      insertFeedback = t("harnessTaskCard.insertFallback");
      setTimeout(() => { insertFeedback = ""; }, 2500);
    }
  }

  function toggleDebug() {
    showDebug = !showDebug;
  }
</script>

<div class="bds-harness-card" bind:this={cardEl}>
  <div class="bds-harness-header">
    <div class="bds-harness-title">
      <span class="bds-harness-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
        </svg>
      </span>
      <div>
        <strong>{t("harnessTaskCard.title")}</strong>
        {#if pluginActive}
          <span class="bds-plugin-tag">{t("harnessTaskCard.pluginTag", { version: pluginVersion })}</span>
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
        {t("harnessTaskCard.statusReady")}
      {:else if status === 'connecting'}
        {t("harnessTaskCard.statusConnecting")}
      {:else if status === 'running'}
        {t("harnessTaskCard.statusRunning")}
      {:else if status === 'finishing'}
        {t("harnessTaskCard.statusFinishing")}
      {:else if status === 'completed'}
        {t("harnessTaskCard.statusCompleted")}
      {:else if status === 'fallback'}
        {t("harnessTaskCard.statusFallback")}
      {:else if status === 'cancelled'}
        {t("harnessTaskCard.statusCancelled")}
      {:else}
        {t("harnessTaskCard.statusError")}
      {/if}
    </span>
  </div>

  <div class="bds-harness-body">
    <div class="bds-harness-row">
      <span class="bds-label bds-field-label">{t("harnessTaskCard.cwdLabel")}</span>
      <input
        type="text"
        bind:value={cwdInput}
        placeholder={t("harnessTaskCard.cwdPlaceholder")}
        class="bds-path-input"
      />
    </div>

    <div class="bds-harness-task-box">
      <div class="bds-label bds-field-label">{t("harnessTaskCard.taskLabel")}</div>
      <pre class="bds-task-content">{taskPrompt}</pre>
    </div>

    <!-- MOD B: FALLBACK MANUAL MODE CARD -->
    {#if status === "fallback"}
      <div class="bds-fallback-card">
        <div class="bds-fallback-title">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="16" x2="12" y2="12"></line>
            <line x1="12" y1="8" x2="12.01" y2="8"></line>
          </svg>
          <span>{t("harnessTaskCard.fallbackTitle")}</span>
        </div>
        <p class="bds-fallback-desc">
          {t("harnessTaskCard.fallbackDesc")}
        </p>
        <div class="bds-fallback-actions">
          <button type="button" class="bds-btn-outlined" onclick={copyPromptAgain}>
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            <span>{t("harnessTaskCard.copyPrompt")}</span>
          </button>
          <button type="button" class="bds-btn" onclick={openHarnessTab}>
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
              <polyline points="15 3 21 3 21 9"></polyline>
              <line x1="10" y1="14" x2="21" y2="3"></line>
            </svg>
            <span>{t("harnessTaskCard.openHarness")}</span>
          </button>
          {#if copyFeedback}
            <span class="bds-feedback-text">{copyFeedback}</span>
          {/if}
        </div>
        <div class="bds-fallback-hint">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="9" y1="18" x2="15" y2="18"></line>
            <line x1="10" y1="22" x2="14" y2="22"></line>
            <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5.76.76 1.23 1.52 1.41 2.5"></path>
          </svg>
          <div>
            <strong>{t("harnessTaskCard.fallbackHint")}</strong>
            <!-- Install script temporarily disabled while broken. Re-add once fixed.
            <code>irm https://raw.githubusercontent.com/EdgeTypE/better-deepseek/main/scripts/install.ps1 | iex</code>
            -->
            <a
              class="bds-plugin-repo-link"
              href="https://github.com/EdgeTypE/dsh-better-deepseek"
              target="_blank"
              rel="noopener noreferrer"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
              <span>{t("harnessTaskCard.pluginRepoButton")}</span>
            </a>
          </div>
        </div>
      </div>
    {/if}

    <!-- MOD A: LIVE LOGS & OUTPUT -->
    {#if (liveLogs.length > 0 || assistantOutput) && status !== "fallback"}
      <div class="bds-harness-live-box">
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div class="bds-live-header" role="button" tabindex="0" onclick={() => showLiveStream = !showLiveStream} onkeydown={(e) => e.key === 'Enter' && (showLiveStream = !showLiveStream)}>
          <span>
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="2"></circle>
              <path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14"></path>
            </svg>
            {t("harnessTaskCard.liveHeader", { count: liveLogs.length })}
          </span>
          <span class="bds-collapse-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              {#if showLiveStream}
                <polyline points="18 15 12 9 6 15"></polyline>
              {:else}
                <polyline points="6 9 12 15 18 9"></polyline>
              {/if}
            </svg>
          </span>
        </div>
        {#if showLiveStream}
          <div class="bds-live-logs" bind:this={logsEl}>
            {#each liveLogs as item}
              <div class="bds-live-log-item {item.type}">{item.text}</div>
            {/each}
          </div>
          {#if assistantOutput && (status === 'running' || status === 'finishing')}
            <div class="bds-assistant-output">
              <div class="bds-assistant-output-label">{t("harnessTaskCard.liveAssistantLabel")}</div>
              <pre class="bds-assistant-pre" bind:this={outputEl}>{assistantOutput}</pre>
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
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            <strong>{t("harnessTaskCard.reportTitle")}</strong>
          </div>
          <div class="bds-report-actions">
            {#if copyFeedback}
              <span class="bds-copy-feedback">{copyFeedback}</span>
            {/if}
            {#if insertFeedback}
              <span class="bds-copy-feedback">{insertFeedback}</span>
            {/if}
            <button type="button" class="bds-btn-outlined" onclick={copyFinalReport}>
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              <span>{t("harnessTaskCard.reportCopy")}</span>
            </button>
            <button type="button" class="bds-btn" onclick={insertIntoChat}>
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              </svg>
              <span>{t("harnessTaskCard.reportInsert")}</span>
            </button>
          </div>
        </div>
        <div class="bds-final-report-body">
          <pre class="bds-report-pre">{finalMarkdownReport || assistantOutput}</pre>
        </div>
        <div class="bds-auto-inject-notice">
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="16" x2="12" y2="12"></line>
            <line x1="12" y1="8" x2="12.01" y2="8"></line>
          </svg>
          <span>{@html t("harnessTaskCard.autoInjectNotice")}</span>
        </div>
      </div>
    {/if}

    <!-- ERROR DETAILS -->
    {#if errorMessage}
      <div class="bds-harness-error-container">
        <div class="bds-harness-error-title">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
            <line x1="12" y1="9" x2="12" y2="13"></line>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          </svg>
          <span>{errorMessage}</span>
        </div>
        {#if debugInfo}
          <button type="button" class="bds-debug-toggle-btn" onclick={toggleDebug}>
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              {#if showDebug}
                <polyline points="18 15 12 9 6 15"></polyline>
              {:else}
                <polyline points="6 9 12 15 18 9"></polyline>
              {/if}
            </svg>
            {showDebug ? t("harnessTaskCard.debugToggleHide") : t("harnessTaskCard.debugToggleShow")}
          </button>
          {#if showDebug}
            <div class="bds-debug-box">
              <div class="bds-debug-row"><strong>{t("harnessTaskCard.debugUrl")}</strong> <code>{debugInfo.url || 'http://127.0.0.1:3080'}</code></div>
              {#if debugInfo.error}
                <div class="bds-debug-row"><strong>{t("harnessTaskCard.debugError")}</strong> <code>{debugInfo.error}</code></div>
              {/if}
            </div>
          {/if}
        {/if}
      </div>
    {/if}
  </div>

  <div class="bds-harness-actions">
    {#if status === 'running' || status === 'connecting' || status === 'finishing'}
      <button type="button" class="bds-btn-outlined bds-btn-cancel" onclick={cancelCurrentTask}>
        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="6" y="6" width="12" height="12" rx="2" ry="2"></rect>
        </svg>
        <span>{t("harnessTaskCard.cancelBtn")}</span>
      </button>
    {/if}
    <button
      type="button"
      class="bds-btn bds-btn-run"
      disabled={status === 'running' || status === 'connecting' || status === 'finishing'}
      onclick={runHarnessTask}
    >
      {#if status === 'running' || status === 'connecting' || status === 'finishing'}
        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <polyline points="12 6 12 12 16 14"></polyline>
        </svg>
        <span>{t("harnessTaskCard.runExecuting")}</span>
      {:else if status === 'completed'}
        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="23 4 23 10 17 10"></polyline>
          <polyline points="1 20 1 14 7 14"></polyline>
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
        </svg>
        <span>{t("harnessTaskCard.runAgain")}</span>
      {:else if status === 'fallback'}
        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="23 4 23 10 17 10"></polyline>
          <polyline points="1 20 1 14 7 14"></polyline>
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
        </svg>
        <span>{t("harnessTaskCard.runFallback")}</span>
      {:else}
        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="5 3 19 12 5 21 5 3"></polygon>
        </svg>
        <span>{t("harnessTaskCard.runDefault")}</span>
      {/if}
    </button>
  </div>
</div>

<style>
  .bds-harness-card {
    background: var(--bds-bg-panel);
    border: 1px solid var(--bds-border);
    border-radius: var(--bds-radius);
    padding: 16px;
    margin: 12px 0;
    font-family: inherit;
    color: var(--bds-text-primary);
    box-shadow: var(--bds-shadow);
  }
  .bds-harness-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 14px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--bds-border);
    gap: 8px;
  }
  .bds-harness-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    min-width: 0;
  }
  .bds-harness-title > div {
    min-width: 0;
  }
  .bds-harness-title strong {
    color: var(--bds-text-primary);
  }
  .bds-plugin-tag {
    display: inline-block;
    background: var(--bds-accent-glow);
    color: var(--bds-accent);
    border: 1px solid var(--bds-border);
    border-radius: 6px;
    font-size: 10px;
    padding: 2px 6px;
    margin-left: 6px;
    font-weight: 500;
    vertical-align: middle;
  }
  .bds-harness-icon {
    color: var(--bds-accent);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .bds-harness-badge {
    font-size: 11px;
    padding: 3px 8px;
    border-radius: 999px;
    background: var(--bds-bg-elevated);
    color: var(--bds-text-secondary);
    white-space: nowrap;
    flex-shrink: 0;
  }
  .bds-harness-badge.bds-running {
    background: var(--bds-accent-glow);
    color: var(--bds-accent);
  }
  .bds-harness-badge.bds-success {
    background: rgba(16, 185, 129, 0.14);
    color: #10b981;
  }
  .bds-harness-badge.bds-fallback {
    background: rgba(245, 158, 11, 0.14);
    color: #f59e0b;
  }
  .bds-harness-badge.bds-error {
    background: var(--bds-danger-border);
    color: var(--bds-danger);
  }
  .bds-harness-badge.bds-cancelled {
    background: var(--bds-bg-hover);
    color: var(--bds-text-tertiary);
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
  .bds-field-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--bds-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .bds-path-input {
    background: var(--bds-bg-input);
    border: 1px solid var(--bds-border);
    border-radius: 8px;
    padding: 8px 10px;
    font-size: 13px;
    color: var(--bds-text-primary);
    font-family: monospace;
    transition: border-color var(--bds-transition);
  }
  .bds-path-input:focus {
    outline: none;
    border-color: var(--bds-accent);
  }
  .bds-harness-task-box {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .bds-task-content {
    background: var(--bds-bg-elevated);
    border: 1px solid var(--bds-border);
    border-radius: 8px;
    padding: 10px;
    font-size: 12px;
    line-height: 1.5;
    color: var(--bds-text-primary);
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
    border-radius: var(--bds-radius);
    padding: 12px;
    /* Never let the manual-run section push the card past the viewport. */
    max-height: min(55vh, 440px);
    overflow-y: auto;
  }
  .bds-fallback-title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 600;
    color: #f59e0b;
    margin-bottom: 6px;
  }
  .bds-fallback-title svg {
    flex-shrink: 0;
  }
  .bds-fallback-desc {
    font-size: 12px;
    color: var(--bds-text-primary);
    margin: 0 0 10px;
    line-height: 1.4;
  }
  .bds-fallback-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
    flex-wrap: wrap;
  }
  .bds-fallback-actions button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
  }
  .bds-feedback-text {
    font-size: 11px;
    color: #10b981;
  }
  .bds-fallback-hint {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    font-size: 11px;
    color: var(--bds-text-secondary);
    line-height: 1.4;
    border-top: 1px solid var(--bds-border);
    padding-top: 8px;
  }
  .bds-fallback-hint svg {
    flex-shrink: 0;
    margin-top: 1px;
  }
  .bds-fallback-hint strong {
    color: var(--bds-text-primary);
  }
  .bds-fallback-hint code {
    display: block;
    margin-top: 4px;
    background: var(--bds-bg-input);
    border: 1px solid var(--bds-border);
    padding: 4px 8px;
    border-radius: 6px;
    color: var(--bds-accent);
    font-size: 10px;
    word-break: break-all;
  }
  .bds-plugin-repo-link {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-top: 6px;
    padding: 6px 12px;
    border: 1px solid var(--bds-border);
    border-radius: 8px;
    background: var(--bds-bg-elevated);
    color: var(--bds-text-primary);
    font-size: 12px;
    font-weight: 500;
    text-decoration: none;
    transition: border-color 0.15s ease, background-color 0.15s ease;
  }
  .bds-plugin-repo-link:hover {
    border-color: var(--bds-accent);
    background: var(--bds-accent-glow);
  }
  .bds-plugin-repo-link svg {
    flex-shrink: 0;
    color: var(--bds-text-primary);
  }
  .bds-harness-live-box {
    background: var(--bds-bg-elevated);
    border: 1px solid var(--bds-border);
    border-radius: var(--bds-radius);
    padding: 10px;
  }
  .bds-live-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    font-weight: 600;
    color: var(--bds-accent);
    cursor: pointer;
    user-select: none;
  }
  .bds-live-header > span:first-child {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .bds-collapse-icon {
    display: flex;
    align-items: center;
    color: var(--bds-text-tertiary);
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
    background: var(--bds-bg-hover);
    color: var(--bds-text-primary);
    border-left: 2px solid transparent;
  }
  .bds-live-log-item.tool-call {
    color: #f59e0b;
    border-left: 2px solid #f59e0b;
  }
  .bds-live-log-item.tool-result {
    color: #10b981;
    border-left: 2px solid #10b981;
  }
  .bds-assistant-output {
    margin-top: 10px;
    padding-top: 8px;
    border-top: 1px solid var(--bds-border);
  }
  .bds-assistant-output-label {
    font-size: 11px;
    color: var(--bds-text-secondary);
    margin-bottom: 4px;
  }
  .bds-assistant-pre {
    background: var(--bds-bg-input);
    border: 1px solid var(--bds-border);
    border-radius: 8px;
    padding: 8px;
    font-size: 11px;
    color: var(--bds-text-primary);
    max-height: 120px;
    overflow-y: auto;
    white-space: pre-wrap;
    word-break: break-word;
    margin: 0;
  }
  .bds-final-report-card {
    background: var(--bds-bg-elevated);
    border: 1px solid rgba(16, 185, 129, 0.35);
    border-radius: var(--bds-radius);
    padding: 14px;
    box-shadow: 0 4px 20px rgba(16, 185, 129, 0.12);
  }
  .bds-auto-inject-notice {
    margin-top: 10px;
    padding: 8px 10px;
    background: rgba(16, 185, 129, 0.08);
    border: 1px solid rgba(16, 185, 129, 0.2);
    border-radius: 8px;
    font-size: 11px;
    color: var(--bds-text-secondary);
    display: flex;
    align-items: center;
    gap: 6px;
    line-height: 1.4;
  }
  .bds-auto-inject-notice svg {
    flex-shrink: 0;
    color: #10b981;
  }
  .bds-auto-inject-notice code {
    background: var(--bds-bg-input);
    border: 1px solid var(--bds-border);
    padding: 1px 4px;
    border-radius: 4px;
    color: #10b981;
    font-size: 10px;
    font-family: monospace;
  }
  .bds-final-report-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
    padding-bottom: 8px;
    border-bottom: 1px solid rgba(16, 185, 129, 0.2);
    flex-wrap: wrap;
  }
  .bds-final-report-title {
    display: flex;
    align-items: center;
    gap: 6px;
    color: #10b981;
    font-size: 13px;
  }
  .bds-report-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .bds-report-actions button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 10px;
  }
  .bds-copy-feedback {
    font-size: 11px;
    color: #10b981;
  }
  .bds-report-pre {
    background: var(--bds-bg-input);
    border: 1px solid var(--bds-border);
    border-radius: 8px;
    padding: 12px;
    font-size: 12px;
    line-height: 1.6;
    color: var(--bds-text-primary);
    max-height: 320px;
    overflow-y: auto;
    white-space: pre-wrap;
    word-break: break-word;
    margin: 0;
    font-family: monospace;
  }
  .bds-harness-error-container {
    background: rgba(239, 68, 68, 0.08);
    border: 1px solid var(--bds-danger-border);
    border-radius: var(--bds-radius);
    padding: 10px 12px;
  }
  .bds-harness-error-title {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--bds-danger);
    font-size: 12px;
    font-weight: 500;
  }
  .bds-harness-error-title svg {
    flex-shrink: 0;
  }
  .bds-debug-toggle-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: transparent;
    border: none;
    color: var(--bds-accent);
    font-size: 11px;
    cursor: pointer;
    padding: 0;
    margin-top: 6px;
    text-decoration: underline;
  }
  .bds-debug-box {
    margin-top: 8px;
    padding: 8px;
    background: var(--bds-bg-input);
    border: 1px solid var(--bds-border);
    border-radius: 8px;
    font-size: 11px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .bds-debug-row {
    color: var(--bds-text-primary);
    word-break: break-all;
  }
  .bds-debug-row code {
    font-family: monospace;
  }
  .bds-harness-actions {
    margin-top: 12px;
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
  .bds-harness-actions button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    font-size: 12px;
  }
  .bds-btn-cancel {
    color: var(--bds-danger);
    border-color: var(--bds-danger-border);
  }
  .bds-btn-cancel:hover {
    background: rgba(239, 68, 68, 0.1);
    border-color: var(--bds-danger);
  }
  .bds-btn-run {
    font-weight: 600;
  }
  .bds-btn-run:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>