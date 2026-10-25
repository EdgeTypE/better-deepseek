<script>
  /**
   * Card shown next to a user message that carries a Better DeepSeek settings
   * backup. Applying is section-selective and downloads a snapshot of the
   * current settings first, so a mis-click is recoverable.
   */
  import appState from "../state.js";
  import { t } from "../../lib/i18n.svelte.js";
  import { triggerBlobDownload } from "../../lib/utils/download.js";
  import {
    CONFIG_ERRORS,
    CONFIG_SECTIONS,
    buildSyncPayload,
    decodeConfigBlock,
  } from "../../lib/config-sync.js";
  import { applyConfigPayload, availableSections, currentSyncSources } from "../config-sync/apply.js";

  /** @type {{ block: { attrs: Record<string,string>, body: string }, messageId?: string|null }} */
  let { block, messageId = null } = $props();

  const SECTION_LABELS = {
    settings: "drawer.sectionSettings",
    customSystemPrompts: "drawer.sectionPrompts",
    cssSnippets: "drawer.sectionCssSnippets",
    skills: "drawer.sectionSkills",
    characters: "drawer.sectionCharacters",
    memories: "drawer.sectionMemories",
    mcpServers: "drawer.sectionMcpServers",
    projects: "drawer.sectionProjects",
    projectFiles: "drawer.sectionProjectFiles",
    chatTags: "drawer.sectionChatTags",
    savedItems: "drawer.sectionSavedItems",
  };

  const encrypted = $derived(block?.attrs?.enc === "aes");
  const redactedCount = $derived(Number(block?.attrs?.red || 0));
  const byteCount = $derived(Number(block?.attrs?.bytes || 0));

  let payload = $state(null);
  let decodeError = $state("");
  let password = $state("");
  let passwordError = $state("");
  let busy = $state(false);
  let showPanel = $state(false);
  let selected = $state(new Set());
  let backupFirst = $state(true);
  let appliedCount = $state(0);

  const available = $derived(payload ? availableSections(payload, CONFIG_SECTIONS) : []);

  function formatSize(bytes) {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  function formatDate(value) {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return "";
    try {
      return date.toLocaleString();
    } catch {
      return date.toISOString().slice(0, 10);
    }
  }

  function errorMessage(code) {
    switch (code) {
      case CONFIG_ERRORS.PASSWORD_REQUIRED:
        return t("configSync.errorPasswordRequired");
      case CONFIG_ERRORS.PASSWORD_WRONG:
        return t("configSync.errorPasswordWrong");
      case CONFIG_ERRORS.CHECKSUM:
        return t("configSync.errorChecksum");
      case CONFIG_ERRORS.VERSION:
        return t("configSync.errorVersion");
      default:
        return t("configSync.errorFormat");
    }
  }

  async function decode(secret = "") {
    const result = await decodeConfigBlock(block, { password: secret });
    if (result.error) return { error: result.error };
    return { payload: result.payload };
  }

  // Unencrypted blocks are decoded up front so the section list is ready.
  $effect(() => {
    if (encrypted || payload) return;
    let cancelled = false;
    decode().then((result) => {
      if (cancelled) return;
      if (result.error) {
        decodeError = errorMessage(result.error);
        return;
      }
      payload = result.payload;
      selected = new Set(availableSections(result.payload, CONFIG_SECTIONS));
    });
    return () => {
      cancelled = true;
    };
  });

  async function unlock() {
    passwordError = "";
    busy = true;
    const result = await decode(password);
    busy = false;

    if (result.error === CONFIG_ERRORS.PASSWORD_WRONG) {
      passwordError = t("configSync.errorPasswordWrong");
      return;
    }
    if (result.error) {
      decodeError = errorMessage(result.error);
      return;
    }
    payload = result.payload;
    password = "";
    selected = new Set(availableSections(result.payload, CONFIG_SECTIONS));
  }

  function toggleSection(key) {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    selected = next;
  }

  function handleDownload() {
    if (!payload) return;
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    triggerBlobDownload(
      blob,
      `bds_backup_${new Date().toISOString().slice(0, 10)}.json`,
    );
  }

  function openPanel() {
    if (!payload) return;
    selected = new Set(available);
    showPanel = true;
  }

  function backupCurrentSettings() {
    const { payload: current } = buildSyncPayload(currentSyncSources(), {
      includeSecrets: true,
    });
    // Same policy as "Export All": the GitHub token stays on the device that
    // owns it, so the two backup files are interchangeable.
    if (current.settings) current.settings.githubToken = "";
    const blob = new Blob([JSON.stringify(current, null, 2)], {
      type: "application/json",
    });
    triggerBlobDownload(
      blob,
      `bds_before_sync_${new Date().toISOString().slice(0, 10)}.json`,
    );
  }

  async function apply() {
    if (!payload || selected.size === 0) return;
    busy = true;
    try {
      if (backupFirst) backupCurrentSettings();

      const { applied } = await applyConfigPayload(payload, selected);
      appliedCount = applied.length;

      // The injected world holds its own copy of the config; without this the
      // new settings only take effect after a reload.
      window.dispatchEvent(new CustomEvent("bds:request-config-push"));

      showPanel = false;
      if (appState.ui) {
        appState.ui.showToast(
          t("configSync.appliedToast", { count: String(applied.length) }),
          4000,
        );
      }
    } finally {
      busy = false;
    }
  }
</script>

<article class="bds-config-sync-card" data-bds-message-id={messageId || undefined}>
  <div class="bds-config-sync-main">
    <div class="bds-config-sync-left">
      <div class="bds-config-sync-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 12a9 9 0 1 1-3-6.7"></path>
          <polyline points="21 3 21 9 15 9"></polyline>
        </svg>
      </div>

      <div class="bds-config-sync-text">
        <h4>{t("configSync.cardTitle")}</h4>
        <p>
          {#if formatDate(block?.attrs?.at)}{formatDate(block.attrs.at)} · {/if}
          {#if byteCount}{formatSize(byteCount)} · {/if}
          {encrypted ? t("configSync.cardEncrypted") : t("configSync.cardPlain")}
          {#if redactedCount} · {t("configSync.cardRedacted", { count: String(redactedCount) })}{/if}
        </p>
      </div>
    </div>

    <div class="bds-config-sync-actions">
      {#if payload}
        <button type="button" class="bds-cfg-btn" onclick={handleDownload}>
          {t("configSync.download")}
        </button>
        <button
          type="button"
          class="bds-cfg-btn bds-cfg-btn-primary"
          onclick={openPanel}
          disabled={appliedCount > 0}
        >
          {appliedCount > 0 ? t("configSync.applied") : t("configSync.apply")}
        </button>
      {:else if !encrypted}
        <span class="bds-config-sync-note">{decodeError || t("configSync.decoding")}</span>
      {/if}
    </div>
  </div>

  {#if encrypted && !payload}
    <div class="bds-config-sync-panel">
      <p class="bds-config-sync-hint">{t("configSync.passwordHint")}</p>
      <div class="bds-config-sync-row">
        <input
          type="password"
          class="bds-cfg-input"
          bind:value={password}
          placeholder={t("configSync.passwordPlaceholder")}
          onkeydown={(e) => e.key === "Enter" && !busy && unlock()}
        />
        <button
          type="button"
          class="bds-cfg-btn bds-cfg-btn-primary"
          onclick={unlock}
          disabled={busy || !password}
        >
          {t("configSync.unlock")}
        </button>
      </div>
      {#if passwordError}<p class="bds-config-sync-error">{passwordError}</p>{/if}
      {#if decodeError}<p class="bds-config-sync-error">{decodeError}</p>{/if}
    </div>
  {/if}

  {#if showPanel}
    <div class="bds-config-sync-panel">
      <p class="bds-config-sync-hint">{t("configSync.sectionsHint")}</p>

      <div class="bds-config-sync-sections">
        {#each available as key}
          <label class="bds-config-sync-section">
            <input
              type="checkbox"
              checked={selected.has(key)}
              onchange={() => toggleSection(key)}
            />
            <span>{t(SECTION_LABELS[key] || key)}</span>
          </label>
        {/each}
      </div>

      <label class="bds-config-sync-section bds-config-sync-backup">
        <input type="checkbox" bind:checked={backupFirst} />
        <span>{t("configSync.backupFirst")}</span>
      </label>

      <p class="bds-config-sync-warning">{t("configSync.applyWarning")}</p>

      <div class="bds-config-sync-row bds-config-sync-row-end">
        <button type="button" class="bds-cfg-btn" onclick={() => (showPanel = false)}>
          {t("configSync.cancel")}
        </button>
        <button
          type="button"
          class="bds-cfg-btn bds-cfg-btn-primary"
          onclick={apply}
          disabled={busy || selected.size === 0}
        >
          {t("configSync.confirmApply")}
        </button>
      </div>
    </div>
  {/if}
</article>

<style>
  .bds-config-sync-card {
    --cfg-bg: #ffffff;
    --cfg-border: #e5e7eb;
    --cfg-icon-bg: #f3f4f6;
    --cfg-icon-color: #6b7280;
    --cfg-title: #111827;
    --cfg-desc: #6b7280;
    --cfg-btn-border: #d1d5db;
    --cfg-btn-text: #374151;
    --cfg-btn-hover: #f9fafb;
    --cfg-panel-bg: #fafafa;
    --cfg-input-border: #d1d5db;
    --cfg-error: #dc2626;

    margin: 10px 0;
    border: 1px solid var(--cfg-border);
    border-radius: 10px;
    background-color: var(--cfg-bg);
    overflow: hidden;
  }

  :global(.dark) .bds-config-sync-card {
    --cfg-bg: #18181b;
    --cfg-border: #27272a;
    --cfg-icon-bg: #27272a;
    --cfg-icon-color: #a1a1aa;
    --cfg-title: #ffffff;
    --cfg-desc: #a1a1aa;
    --cfg-btn-border: #3f3f46;
    --cfg-btn-text: #ffffff;
    --cfg-btn-hover: #27272a;
    --cfg-panel-bg: #131316;
    --cfg-input-border: #3f3f46;
    --cfg-error: #f87171;
  }

  .bds-config-sync-main {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 16px;
  }

  .bds-config-sync-left {
    display: flex;
    align-items: center;
    gap: 14px;
    min-width: 0;
  }

  .bds-config-sync-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 42px;
    height: 48px;
    background-color: var(--cfg-icon-bg);
    border: 1px solid var(--cfg-border);
    border-radius: 8px;
    color: var(--cfg-icon-color);
    flex-shrink: 0;
  }

  .bds-config-sync-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .bds-config-sync-text h4 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--cfg-title);
  }

  .bds-config-sync-text p {
    margin: 0;
    font-size: 12px;
    color: var(--cfg-desc);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .bds-config-sync-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .bds-config-sync-note {
    font-size: 12px;
    color: var(--cfg-desc);
  }

  .bds-cfg-btn {
    background-color: transparent;
    color: var(--cfg-btn-text);
    border: 1px solid var(--cfg-btn-border);
    border-radius: 8px;
    padding: 7px 14px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .bds-cfg-btn:hover:not(:disabled) {
    background-color: var(--cfg-btn-hover);
  }

  .bds-cfg-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .bds-cfg-btn-primary {
    border-color: #3b82f6;
    color: #3b82f6;
  }

  .bds-config-sync-panel {
    border-top: 1px solid var(--cfg-border);
    background-color: var(--cfg-panel-bg);
    padding: 12px 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .bds-config-sync-hint {
    margin: 0;
    font-size: 12.5px;
    color: var(--cfg-desc);
  }

  .bds-config-sync-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .bds-config-sync-row-end {
    justify-content: flex-end;
  }

  .bds-cfg-input {
    flex: 1;
    min-width: 0;
    padding: 7px 10px;
    border: 1px solid var(--cfg-input-border);
    border-radius: 8px;
    background: transparent;
    color: var(--cfg-title);
    font-size: 13px;
  }

  .bds-config-sync-sections {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 6px 12px;
  }

  .bds-config-sync-section {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12.5px;
    color: var(--cfg-title);
    cursor: pointer;
  }

  .bds-config-sync-backup {
    color: var(--cfg-desc);
  }

  .bds-config-sync-warning {
    margin: 0;
    font-size: 12px;
    color: var(--cfg-desc);
    line-height: 1.45;
  }

  .bds-config-sync-error {
    margin: 0;
    font-size: 12px;
    color: var(--cfg-error);
  }
</style>
