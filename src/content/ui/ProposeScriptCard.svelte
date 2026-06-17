<script>
  import { t } from "../../lib/i18n.svelte.js";
  import { triggerTextDownload } from "../../lib/utils/download.js";

  /** @type {{content: string, language?: string}} */
  let { content, language = "" } = $props();

  const lang = String(language || "text").toLowerCase();

  const extensionMap = {
    python: ".py",
    py: ".py",
    bash: ".sh",
    sh: ".sh",
    node: ".js",
    javascript: ".js",
    js: ".js",
    typescript: ".ts",
    ts: ".ts",
  };

  let copied = $state(false);

  function fileName() {
    const ext = extensionMap[lang] || ".txt";
    return `script${ext}`;
  }

  async function copyToClipboard() {
    try {
      await navigator.clipboard.writeText(content);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch (err) {
      console.error("[BDS] Failed to copy script:", err);
    }
  }

  function saveToFile() {
    triggerTextDownload(content, fileName());
  }
</script>

<article class="bds-script-card">
  <div class="bds-script-header">
    <div class="bds-script-icon">
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="16 18 22 12 16 6"></polyline>
        <polyline points="8 6 2 12 8 18"></polyline>
      </svg>
    </div>
    <div class="bds-script-title">
      <h4>{t('messageOverlay.proposeLocalScript')}</h4>
      <span class="bds-script-lang">{lang}</span>
    </div>
  </div>

  <div class="bds-script-body">
    <pre>{content.trim()}</pre>
  </div>

  <div class="bds-script-actions">
    <button type="button" class="bds-btn" onclick={copyToClipboard}>
      {copied ? t('messageOverlay.copied') : t('messageOverlay.copyToClipboard')}
    </button>
    <button type="button" class="bds-btn" onclick={saveToFile}>
      {t('messageOverlay.saveAsFile')}
    </button>
  </div>
</article>

<style>
  .bds-script-card {
    margin: 10px 0;
    border: 1px solid var(--bds-border, #3a3b3f);
    border-radius: var(--bds-radius, 12px);
    background: var(--bds-bg-panel, #1e1f23);
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }

  .bds-script-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--bds-border, #3a3b3f);
  }

  .bds-script-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 38px;
    height: 38px;
    border-radius: 10px;
    background: rgba(91, 123, 255, 0.12);
    color: var(--bds-accent, #5b7bff);
    flex-shrink: 0;
  }

  .bds-script-title {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .bds-script-title h4 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--bds-text-primary, #ececec);
  }

  .bds-script-lang {
    font-size: 11px;
    text-transform: uppercase;
    font-weight: 600;
    color: var(--bds-text-tertiary, #6b6b7b);
    background: var(--bds-bg-hover, rgba(255, 255, 255, 0.08));
    padding: 2px 8px;
    border-radius: 99px;
  }

  .bds-script-body {
    padding: 12px 16px;
  }

  .bds-script-body pre {
    margin: 0;
    max-height: 240px;
    overflow: auto;
    background: var(--bds-bg-elevated, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--bds-border, #3a3b3f);
    border-radius: 8px;
    padding: 10px;
    font-size: 12px;
    font-family: monospace;
    white-space: pre-wrap;
    color: var(--bds-text-primary, #ececec);
  }

  .bds-script-actions {
    display: flex;
    gap: 8px;
    padding: 0 16px 12px;
  }

  .bds-btn {
    border: 1px solid var(--bds-border, #3a3b3f);
    border-radius: 8px;
    background: var(--bds-bg-elevated, rgba(255, 255, 255, 0.06));
    color: var(--bds-text-primary, #ececec);
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    padding: 6px 12px;
    transition: opacity 0.2s;
  }

  .bds-btn:hover {
    opacity: 0.9;
  }
</style>
