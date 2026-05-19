<script>
  import { t } from "../../lib/i18n.svelte.js";
  import { triggerBlobDownload } from "../../lib/utils/download.js";

  /** @type {{ title: string, description: string, fileName: string, blob: Blob }} */
  let { title, description, fileName, blob } = $props();

  function handleDownload() {
    triggerBlobDownload(blob, fileName);
  }
</script>

<article class="bds-download-card">
  <div class="card-left">
    <div class="icon-wrapper">
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
        <polyline points="14 2 14 8 20 8"></polyline>
      </svg>
    </div>
    
    <div class="text-content">
      <h4>{title}</h4>
      <p>{description}</p>
    </div>
  </div>

  <button type="button" class="bds-btn" onclick={handleDownload}>
    {t('downloadCard.download')}
  </button>
</article>

<style>
  /* Basic Variables (Light Mode) */
  .bds-download-card {
    --bg-color: #ffffff;
    --border-color: #e5e7eb;
    --icon-bg: #f3f4f6;
    --icon-color: #6b7280;
    --title-color: #111827;
    --desc-color: #6b7280;
    --btn-border: #d1d5db;
    --btn-text: #374151;
    --btn-hover-bg: #f9fafb;

    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    margin: 10px 0;
    border: 1px solid var(--border-color);
    border-radius: 10px;
    background-color: var(--bg-color);
    transition: all 0.2s ease;
  }

  /* Dark Mode Settings */
  :global(.dark) .bds-download-card {
    --bg-color: #18181b;
    --border-color: #27272a;
    --icon-bg: #27272a;
    --icon-color: #a1a1aa;
    --title-color: #ffffff;
    --desc-color: #a1a1aa;
    --btn-border: #3f3f46;
    --btn-text: #ffffff;
    --btn-hover-bg: #27272a;
  }

  .card-left {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .icon-wrapper {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 42px;
    height: 48px;
    background-color: var(--icon-bg);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    color: var(--icon-color);
  }

  .text-content {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  h4 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--title-color);
  }

  p {
    margin: 0;
    font-size: 12px;
    font-weight: 500;
    text-transform: uppercase; /* Makes ZIP text uppercase as in common UI patterns */
    color: var(--desc-color);
  }

  .bds-btn {
    background-color: transparent;
    color: var(--btn-text);
    border: 1px solid var(--btn-border);
    border-radius: 8px;
    padding: 8px 16px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .bds-btn:hover {
    background-color: var(--btn-hover-bg);
  }
</style>