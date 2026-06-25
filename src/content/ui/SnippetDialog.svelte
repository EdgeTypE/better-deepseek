<script>
  import { t } from "../../lib/i18n.svelte.js";
  import { findCommand } from "../commands/registry.js";
  import appState from "../state.js";

  let { item = null, onsave, oncancel } = $props();

  let title = $state(item ? item.title : "");
  let content = $state(item ? item.content : "");
  let error = $state("");
  let commandShortcut = $state(item ? (Object.entries(appState.commands?.customMappings || {}).find(([, v]) => v === item.id)?.[0] || "") : "")

  function validateCommand(val) {
    if (!val) return ""
    if (!/^[a-z0-9_]+$/.test(val)) return "Only lowercase letters, numbers, and underscores allowed"
    if (findCommand(val)) return "Conflicts with a built-in command"
    const mappings = appState.commands?.customMappings || {}
    if (mappings[val] && mappings[val] !== item?.id) return "Command already in use by another snippet"
    return ""
  }

  let cmdError = $state("")
  $effect(() => { cmdError = validateCommand(commandShortcut) })

  function handleSave() {
    if (!title.trim()) { error = t('savedItems.titleRequired'); return; }
    if (!content.trim()) { error = t('savedItems.contentRequired'); return; }
    const cmdVal = commandShortcut.trim().toLowerCase()
    if (cmdVal) { const msg = validateCommand(cmdVal); if (msg) { error = msg; return } }
    error = "";
    onsave({ title: title.trim(), content: content.trim(), command: cmdVal || null });
  }

  function handleKeydown(e) {
    if (e.key === "Escape" && !e.shiftKey) oncancel()
  }
</script>

<div class="bds-snippet-overlay" onkeydown={handleKeydown}>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="bds-snippet-dialog" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
    <div class="bds-snippet-header">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
      </svg>
      <span>{item ? t('savedItems.editSnippet') : t('savedItems.newSnippet')}</span>
      <button type="button" class="bds-snippet-close" onclick={oncancel}>&times;</button>
    </div>
    <div class="bds-snippet-body">
      <input
        class="bds-snippet-input"
        type="text"
        placeholder={t('savedItems.namePlaceholder')}
        bind:value={title}
        autofocus
      />
      <textarea
        class="bds-snippet-textarea"
        placeholder={t('savedItems.contentPlaceholder')}
        bind:value={content}
      ></textarea>
      <div class="bds-snippet-cmd-row">
        <span class="bds-snippet-cmd-prefix">/</span>
        <input
          class="bds-snippet-cmd-input"
          type="text"
          placeholder="command (optional)"
          bind:value={commandShortcut}
        />
        {#if commandShortcut && cmdError}
          <span class="bds-snippet-cmd-error">{cmdError}</span>
        {:else if commandShortcut && !cmdError}
          <span class="bds-snippet-cmd-ok">OK</span>
        {/if}
      </div>
      {#if error}
        <div class="bds-snippet-error">{error}</div>
      {/if}
    </div>
    <div class="bds-snippet-footer">
      <button type="button" class="bds-btn-outlined" onclick={oncancel}>{t('savedItems.cancel')}</button>
      <button type="button" class="bds-btn" onclick={handleSave}>{t('savedItems.save')}</button>
    </div>
  </div>
</div>

<style>
  .bds-snippet-overlay {
    position: fixed;
    inset: 0;
    z-index: 9999999;
    background: rgba(0, 0, 0, 0.55);
    display: flex;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(2px);
  }
  .bds-snippet-dialog {
    background: var(--bds-bg-panel);
    border: 1px solid var(--bds-border);
    border-radius: var(--bds-radius, 14px);
    width: 480px;
    max-width: 90vw;
    box-shadow: var(--bds-shadow);
    overflow: hidden;
  }
  .bds-snippet-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 14px 16px;
    border-bottom: 1px solid var(--bds-border);
    font-size: 15px;
    font-weight: 600;
    color: var(--bds-text-primary);
  }
  .bds-snippet-close {
    margin-left: auto;
    background: none;
    border: none;
    color: var(--bds-text-tertiary);
    font-size: 20px;
    cursor: pointer;
    padding: 0 4px;
    line-height: 1;
  }
  .bds-snippet-close:hover {
    color: var(--bds-text-primary);
  }
  .bds-snippet-body {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .bds-snippet-input {
    display: block;
    box-sizing: border-box;
    width: 100%;
    background: var(--bds-bg-input);
    border: 1px solid var(--bds-border);
    border-radius: 8px;
    padding: 10px 12px;
    font-size: 13px;
    color: var(--bds-text-primary);
    outline: none;
    font-family: inherit;
    transition: border-color var(--bds-transition, 0.18s ease);
  }
  .bds-snippet-input:focus {
    border-color: var(--bds-accent);
    box-shadow: 0 0 0 3px var(--bds-accent-glow);
  }
  .bds-snippet-textarea {
    display: block;
    box-sizing: border-box;
    width: 100%;
    min-height: 160px;
    background: var(--bds-bg-input);
    border: 1px solid var(--bds-border);
    border-radius: 8px;
    padding: 10px 12px;
    font-size: 13px;
    color: var(--bds-text-primary);
    outline: none;
    resize: vertical;
    font-family: inherit;
    line-height: 1.5;
    transition: border-color var(--bds-transition, 0.18s ease);
  }
  .bds-snippet-textarea:focus {
    border-color: var(--bds-accent);
    box-shadow: 0 0 0 3px var(--bds-accent-glow);
  }
  .bds-snippet-cmd-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .bds-snippet-cmd-prefix {
    color: var(--bds-text-tertiary);
    font-size: 16px;
    font-weight: 600;
    width: 20px;
    text-align: center;
  }
  .bds-snippet-cmd-input {
    flex: 1;
    background: var(--bds-bg-input);
    border: 1px solid var(--bds-border);
    border-radius: 8px;
    padding: 8px 10px;
    font-size: 13px;
    color: var(--bds-text-primary);
    outline: none;
    font-family: monospace;
    transition: border-color var(--bds-transition, 0.18s ease);
  }
  .bds-snippet-cmd-input:focus {
    border-color: var(--bds-accent);
    box-shadow: 0 0 0 3px var(--bds-accent-glow);
  }
  .bds-snippet-cmd-error {
    color: var(--bds-danger, #f87171);
    font-size: 11px;
    white-space: nowrap;
  }
  .bds-snippet-cmd-ok {
    color: var(--bds-success, #34d399);
    font-size: 11px;
    font-weight: 600;
  }
  .bds-snippet-error {
    color: var(--bds-danger, #f87171);
    font-size: 13px;
    padding: 0 2px;
  }
  .bds-snippet-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid var(--bds-border);
  }
</style>
