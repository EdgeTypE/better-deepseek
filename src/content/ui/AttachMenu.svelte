<script>
  import { onMount } from "svelte";
  import { pickFolderAndConcatenate } from "../files/folder-reader.js";
  import { fetchGitHubRepo, parseGitHubUrl } from "../files/github-reader.js";
  import { fetchAndConvertWebPage } from "../files/web-reader.js";
  import appState from "../state.js";
  import { BRIDGE_EVENTS } from "../../lib/constants.js";

  // The native input[type="file"] reference passed from scanner
  export let nativeInput;

  let isOpen = false;
  let menuRef;
  let dropdownStyle = "";

  // GitHub dialog state
  let showGithubDialog = false;
  let githubUrl = "";
  let githubStatus = "";
  let githubLoading = false;
  let githubError = "";

  // Web Import dialog state
  let showWebDialog = false;
  let webUrl = "";
  let webStatus = "";
  let webLoading = false;
  let webError = "";

  let dialogRef;

  // Speech Recognition state
  let isRecording = false;
  let recognition = null;

  function stopTTS() {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }

  function toggleSpeechRecognition() {
    if (isRecording) {
      if (recognition) recognition.stop();
      isRecording = false;
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      if (appState.ui) appState.ui.showToast("Browser does not support Speech Recognition.");
      return;
    }

    stopTTS();

    recognition = new SpeechRecognition();
    recognition.lang = appState.settings.voiceLanguage || navigator.language || 'en-US';
    recognition.interimResults = true;
    recognition.continuous = false;

    recognition.onstart = () => {
      isRecording = true;
    };

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map(result => result[0])
        .map(result => result.transcript)
        .join('');
      
      injectTextIntoDeepSeek(transcript, event.results[0].isFinal);
    };

    recognition.onerror = (event) => {
      console.error("Speech Recognition Error:", event.error);
      isRecording = false;
      if (appState.ui) appState.ui.showToast(`Voice Error: ${event.error}`);
    };

    recognition.onend = () => {
      isRecording = false;
    };

    recognition.start();
  }

  function injectTextIntoDeepSeek(text, isFinal) {
    // DeepSeek uses a <textarea> or a contenteditable div. 
    // Usually it's #chat-input in modern DeepSeek.
    const textarea = document.querySelector('textarea#chat-input') || 
                     document.querySelector('.ds-textarea textarea') ||
                     document.querySelector('textarea');

    if (!textarea) {
      if (isFinal && appState.ui) appState.ui.showToast("Could not find input field.");
      return;
    }

    // textarea.value = text;
    textarea.value = text;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));

    if (isFinal && appState.settings.autoSubmitVoice) {
      setTimeout(robustSend, 400);
    }
  }

  function robustSend() {
    // Notify the injected script that this is a voice message
    window.dispatchEvent(new CustomEvent(BRIDGE_EVENTS.markVoiceMessage));

    let attempts = 0;
    const maxAttempts = 50;

    const attempt = () => {
      attempts++;
      const buttons = Array.from(document.querySelectorAll('div[role="button"], button'));
      const sendBtn = buttons.find(b => {
        // Match logic from auto.js
        const isSend = b.querySelector('svg path[d*="M8.3125"], .ds-icon-send') || 
                       b.querySelector('svg path[d*="M13.12 19.98"]') ||
                       b.title === "Send message" || 
                       b.ariaLabel === "Send Message";
        const isAttach = b.classList.contains('bds-plus-btn') || b.querySelector('svg line');
        return isSend && !isAttach;
      });

      if (sendBtn) {
        const isDisabled = sendBtn.getAttribute('aria-disabled') === 'true' || 
                           sendBtn.classList.contains('ds-icon-button--disabled');
        
        if (!isDisabled) {
          sendBtn.click();
          return;
        }
      }

      if (attempts < maxAttempts) {
        setTimeout(attempt, 200);
      } else {
        // Fallback: Try Enter key on input
        const textarea = document.querySelector('textarea#chat-input') || 
                         document.querySelector('.ds-textarea textarea');
        if (textarea) {
          textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, keyCode: 13 }));
        }
      }
    };

    attempt();
  }

  function toggleMenu(e) {
    e.stopPropagation();
    if (!isOpen) {
      updatePosition();
      isOpen = true;
    } else {
      isOpen = false;
    }
  }

  function updatePosition() {
    if (!menuRef) return;
    const rect = menuRef.getBoundingClientRect();
    dropdownStyle = `bottom: calc(100vh - ${rect.top}px + 8px); right: calc(100vw - ${rect.right}px);`;
  }

  function portal(node) {
    document.body.appendChild(node);
    return {
      destroy() {
        if (node.parentNode) {
          node.parentNode.removeChild(node);
        }
      }
    };
  }

  function closeMenu() {
    isOpen = false;
  }

  onMount(() => {
    document.addEventListener("click", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("click", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  });

  function handleClickOutside(e) {
    if (menuRef && !menuRef.contains(e.target)) {
      if (dialogRef && dialogRef.contains(e.target)) return;
      closeMenu();
    }
  }

  function handleEscape(e) {
    if (e.key === "Escape") {
      if (showGithubDialog && !githubLoading) {
        showGithubDialog = false;
      }
      if (showWebDialog && !webLoading) {
        showWebDialog = false;
      }
      closeMenu();
    }
  }

  function handleUploadFile() {
    closeMenu();
    if (nativeInput) {
      nativeInput.click();
    }
  }

  async function handleUploadFolder() {
    closeMenu();
    if (!nativeInput) return;

    try {
      const fakeFile = await pickFolderAndConcatenate();
      if (fakeFile) {
        injectFile(fakeFile);
      }
    } catch (err) {
      if (err?.name === "AbortError") {
        return;
      }

      console.error("[AttachMenu] Folder upload failed:", err);
      if (appState.ui) {
        appState.ui.showToast(err?.message || "Folder upload failed.");
      }
    }
  }

  function handleGithubImport() {
    closeMenu();
    githubUrl = "";
    githubStatus = "";
    githubError = "";
    githubLoading = false;
    showGithubDialog = true;
  }

  async function submitGithubUrl() {
    if (!githubUrl.trim() || githubLoading) return;

    const parsed = parseGitHubUrl(githubUrl);
    if (!parsed) {
      githubError = "Invalid URL. Use: https://github.com/owner/repo or owner/repo";
      return;
    }

    githubError = "";
    githubLoading = true;

    try {
      const file = await fetchGitHubRepo(githubUrl, (status) => {
        githubStatus = status;
      });

      if (file) {
        showGithubDialog = false;
        injectFile(file);
      }
    } catch (err) {
      githubError = err.message || "Failed to fetch repository.";
    } finally {
      githubLoading = false;
    }
  }

  function handleWebImport() {
    closeMenu();
    webUrl = "";
    webStatus = "";
    webError = "";
    webLoading = false;
    showWebDialog = true;
  }

  async function submitWebUrl() {
    if (!webUrl.trim() || webLoading) return;

    try {
      new URL(webUrl); // Basic validation
    } catch {
      webError = "Please enter a valid URL (including http/https).";
      return;
    }

    webError = "";
    webLoading = true;

    try {
      const file = await fetchAndConvertWebPage(webUrl, (status) => {
        webStatus = status;
      });

      if (file) {
        showWebDialog = false;
        injectFile(file);
      }
    } catch (err) {
      webError = err.message || "Could not fetch page content.";
    } finally {
      webLoading = false;
    }
  }

  function injectFile(file) {
    if (!nativeInput) return;
    const dt = new DataTransfer();
    if (nativeInput.files) {
      for (let i = 0; i < nativeInput.files.length; i++) {
        dt.items.add(nativeInput.files[i]);
      }
    }
    dt.items.add(file);
    nativeInput.files = dt.files;
    nativeInput.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function handleDialogKeydown(e, type) {
    if (e.key === "Enter") {
      if (type === "github" && !githubLoading) submitGithubUrl();
      if (type === "web" && !webLoading) submitWebUrl();
    }
  }
</script>

<div class="bds-attach-wrapper" bind:this={menuRef}>
  <button class="bds-plus-btn" on:click={toggleMenu} title="Advanced Upload">
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"></line>
      <line x1="5" y1="12" x2="19" y2="12"></line>
    </svg>
  </button>

  <button 
    class="bds-mic-btn {isRecording ? 'bds-recording' : ''}" 
    on:click={toggleSpeechRecognition} 
    title={isRecording ? "Stop Recording" : "Voice Prompt"}
  >
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill={isRecording ? "currentColor" : "none"} stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
      <line x1="12" y1="19" x2="12" y2="23"></line>
      <line x1="8" y1="23" x2="16" y2="23"></line>
    </svg>
    {#if isRecording}
      <div class="bds-recording-pulse"></div>
    {/if}
  </button>
  
  {#if isOpen}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="bds-attach-dropdown" style={dropdownStyle} use:portal on:click|stopPropagation>
      <button class="bds-attach-item" on:click={handleUploadFile}>
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="bds-item-icon"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><line x1="9" y1="15" x2="15" y2="15"></line></svg>
        Upload File
      </button>
      <button class="bds-attach-item" on:click={handleUploadFolder}>
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="bds-item-icon"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path><line x1="12" y1="11" x2="12" y2="17"></line><line x1="9" y1="14" x2="15" y2="14"></line></svg>
        Upload Folder
      </button>
      <div class="bds-attach-divider"></div>
      <button class="bds-attach-item" on:click={handleGithubImport}>
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" class="bds-item-icon"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"></path></svg>
        GitHub Repo
      </button>
      <button class="bds-attach-item" on:click={handleWebImport}>
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="bds-item-icon"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
        Fetch Web Page
      </button>
    </div>
  {/if}
</div>

{#if showGithubDialog}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="bds-github-overlay" use:portal on:click|self={() => { if (!githubLoading) showGithubDialog = false; }}>
    <div class="bds-github-dialog" bind:this={dialogRef} on:click|stopPropagation on:keydown|stopPropagation>
      <div class="bds-github-header">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" class="bds-github-logo"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"></path></svg>
        <span>GitHub Repo Import</span>
        {#if !githubLoading}
          <button class="bds-github-close" on:click={() => showGithubDialog = false}>&times;</button>
        {/if}
      </div>

      <div class="bds-github-body">
        <input
          class="bds-github-input"
          type="text"
          placeholder="https://github.com/owner/repo or owner/repo"
          bind:value={githubUrl}
          on:keydown={(e) => handleDialogKeydown(e, 'github')}
          disabled={githubLoading}
          autofocus
        />

        {#if githubError}
          <div class="bds-github-error">{githubError}</div>
        {/if}

        {#if githubStatus && githubLoading}
          <div class="bds-github-status">
            <div class="bds-spinner"></div>
            <span>{githubStatus}</span>
          </div>
        {/if}
      </div>

      <div class="bds-github-footer">
        <button
          class="bds-github-btn bds-github-btn-cancel"
          on:click={() => { if (!githubLoading) showGithubDialog = false; }}
          disabled={githubLoading}
        >
          Close
        </button>
        <button
          class="bds-github-btn bds-github-btn-import"
          on:click={submitGithubUrl}
          disabled={githubLoading || !githubUrl.trim()}
        >
          {githubLoading ? "Fetching..." : "Fetch"}
        </button>
      </div>
    </div>
  </div>
{/if}

{#if showWebDialog}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="bds-github-overlay" use:portal on:click|self={() => { if (!webLoading) showWebDialog = false; }}>
    <div class="bds-github-dialog" bind:this={dialogRef} on:click|stopPropagation on:keydown|stopPropagation>
      <div class="bds-github-header">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
        <span>Fetch Web Page</span>
        {#if !webLoading}
          <button class="bds-github-close" on:click={() => showWebDialog = false}>&times;</button>
        {/if}
      </div>

      <div class="bds-github-body">
        <input
          class="bds-github-input"
          type="text"
          placeholder="https://example.com/article"
          bind:value={webUrl}
          on:keydown={(e) => handleDialogKeydown(e, 'web')}
          disabled={webLoading}
          autofocus
        />

        {#if webError}
          <div class="bds-github-error">{webError}</div>
        {/if}

        {#if webStatus && webLoading}
          <div class="bds-github-status">
            <div class="bds-spinner"></div>
            <span>{webStatus}</span>
          </div>
        {/if}
      </div>

      <div class="bds-github-footer">
        <button
          class="bds-github-btn bds-github-btn-cancel"
          on:click={() => { if (!webLoading) showWebDialog = false; }}
          disabled={webLoading}
        >
          Close
        </button>
        <button
          class="bds-github-btn bds-github-btn-import"
          on:click={submitWebUrl}
          disabled={webLoading || !webUrl.trim()}
        >
          {webLoading ? "Fetching..." : "Fetch"}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .bds-attach-wrapper {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-right: 6px;
  }

  .bds-plus-btn {
    background: transparent;
    border: none;
    color: var(--dsw-alias-brand-text, #4d6bfe);
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background-color 0.2s ease, transform 0.1s ease;
  }

  .bds-plus-btn:hover {
    background-color: var(--dsw-alias-brand-hover-bg, rgba(77, 107, 254, 0.1));
  }

  .bds-plus-btn:active {
    transform: scale(0.95);
  }

  .bds-mic-btn {
    position: relative;
    background: transparent;
    border: none;
    color: var(--dsw-alias-brand-text, #4d6bfe);
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s ease;
    margin-right: 2px;
  }

  .bds-mic-btn:hover {
    background-color: var(--dsw-alias-brand-hover-bg, rgba(77, 107, 254, 0.1));
  }

  .bds-mic-btn.bds-recording {
    color: #ef4444;
    background-color: rgba(239, 68, 68, 0.1);
  }

  .bds-recording-pulse {
    position: absolute;
    inset: -2px;
    border: 2px solid #ef4444;
    border-radius: 50%;
    animation: bds-pulse 1.5s infinite;
    opacity: 0;
  }

  @keyframes bds-pulse {
    0% { transform: scale(1); opacity: 0.6; }
    100% { transform: scale(1.5); opacity: 0; }
  }

  .bds-attach-dropdown {
    position: fixed;
    background: var(--dsw-color-bg-elevated, #2a2a2a);
    border: 1px solid var(--dsw-color-border-primary, #3d3d3d);
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
    padding: 6px;
    display: flex;
    flex-direction: column;
    min-width: 160px;
    z-index: 999999;
  }

  .bds-attach-item {
    background: none;
    border: none;
    color: var(--dsw-alias-text, #e0e0e0);
    padding: 10px 12px;
    text-align: left;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    display: flex;
    align-items: center;
    gap: 10px;
    transition: background-color 0.2s ease, color 0.2s ease;
    white-space: nowrap;
  }

  .bds-attach-item:hover {
    background: var(--dsw-color-bg-hover, #3d3d3d);
    color: var(--dsw-alias-brand-text, #ffffff);
  }

  .bds-item-icon {
    opacity: 0.8;
    flex-shrink: 0;
  }

  .bds-attach-divider {
    height: 1px;
    background: var(--dsw-color-border-primary, #3d3d3d);
    margin: 4px 6px;
  }

  /* ─── GitHub Dialog ─── */

  .bds-github-overlay {
    position: fixed;
    inset: 0;
    z-index: 9999999;
    background: rgba(0, 0, 0, 0.55);
    display: flex;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(2px);
  }

  .bds-github-dialog {
    background: var(--dsw-color-bg-elevated, #1e1e1e);
    border: 1px solid var(--dsw-color-border-primary, #3d3d3d);
    border-radius: 12px;
    width: 440px;
    max-width: 90vw;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    overflow: hidden;
  }

  .bds-github-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 14px 16px;
    border-bottom: 1px solid var(--dsw-color-border-primary, #333);
    font-size: 15px;
    font-weight: 600;
    color: var(--dsw-alias-text, #e0e0e0);
  }

  .bds-github-logo {
    opacity: 0.9;
  }

  .bds-github-close {
    margin-left: auto;
    background: none;
    border: none;
    color: var(--dsw-alias-text, #999);
    font-size: 20px;
    cursor: pointer;
    padding: 0 4px;
    line-height: 1;
  }

  .bds-github-close:hover {
    color: #fff;
  }

  .bds-github-body {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .bds-github-input {
    background: var(--dsw-color-bg-primary, #141414);
    border: 1px solid var(--dsw-color-border-primary, #3d3d3d);
    border-radius: 8px;
    padding: 10px 12px;
    font-size: 14px;
    color: var(--dsw-alias-text, #e0e0e0);
    outline: none;
    transition: border-color 0.2s;
    font-family: inherit;
  }

  .bds-github-input:focus {
    border-color: var(--dsw-alias-brand-text, #4d6bfe);
  }

  .bds-github-input:disabled {
    opacity: 0.6;
  }

  .bds-github-error {
    color: #f87171;
    font-size: 13px;
    padding: 0 2px;
  }

  .bds-github-status {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--dsw-alias-brand-text, #4d6bfe);
    padding: 0 2px;
  }

  .bds-spinner {
    width: 14px;
    height: 14px;
    border: 2px solid transparent;
    border-top-color: var(--dsw-alias-brand-text, #4d6bfe);
    border-radius: 50%;
    animation: bds-spin 0.6s linear infinite;
    flex-shrink: 0;
  }

  @keyframes bds-spin {
    to { transform: rotate(360deg); }
  }

  .bds-github-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid var(--dsw-color-border-primary, #333);
  }

  .bds-github-btn {
    padding: 8px 16px;
    border-radius: 6px;
    border: none;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.2s, opacity 0.2s;
  }

  .bds-github-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .bds-github-btn-cancel {
    background: var(--dsw-color-bg-hover, #333);
    color: var(--dsw-alias-text, #ccc);
  }

  .bds-github-btn-cancel:hover:not(:disabled) {
    background: #444;
  }

  .bds-github-btn-import {
    background: var(--dsw-alias-brand-text, #4d6bfe);
    color: #fff;
  }

  .bds-github-btn-import:hover:not(:disabled) {
    background: #3d5bde;
  }

  @media (prefers-color-scheme: light) {
    .bds-attach-dropdown {
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
    }
  }
</style>
