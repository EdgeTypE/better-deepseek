<script>
  import { exportSession } from "../tools/exporter.js";

  let exporting = $state(false);

  async function handleExport(format) {
    if (exporting) return;
    exporting = true;
    try {
      await exportSession(format);
    } catch (err) {
      console.error("[BDS] Export failed:", err);
    } finally {
      exporting = false;
    }
  }
</script>

<div class="bds-section-title">
  <span class="bds-icon-inline">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
      <polyline points="7 10 12 15 17 10"></polyline>
      <line x1="12" y1="15" x2="12" y2="3"></line>
    </svg>
  </span>
  Export Session
</div>

<div class="bds-export-container">
  <button 
    class="bds-export-btn" 
    type="button" 
    disabled={exporting}
    onclick={() => handleExport('markdown')}
  >
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
      <polyline points="14 2 14 8 20 8"></polyline>
      <line x1="16" y1="13" x2="8" y2="13"></line>
      <line x1="16" y1="17" x2="8" y2="17"></line>
      <polyline points="10 9 9 9 8 9"></polyline>
    </svg>
    Markdown (.md)
  </button>

  <button 
    class="bds-export-btn" 
    type="button" 
    disabled={exporting}
    onclick={() => handleExport('pdf')}
  >
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
      <polyline points="14 2 14 8 20 8"></polyline>
      <path d="M9 15h3a1.5 1.5 0 0 0 0-3H9v4"></path>
      <path d="M17 15h-3v-4"></path>
      <path d="M14 13h2"></path>
    </svg>
    PDF Document
  </button>
</div>

<style>
  .bds-export-container {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 0;
    margin-top: 4px;
  }

  .bds-export-btn {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 10px 14px;
    background: var(--bds-bg-elevated);
    border: 1px solid var(--bds-border);
    border-radius: 10px;
    color: var(--bds-text-primary);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all var(--bds-transition);
    text-align: left;
  }

  .bds-export-btn:hover:not(:disabled) {
    background: var(--bds-bg-hover);
    border-color: var(--bds-border-hover);
    transform: translateY(-1px);
  }

  .bds-export-btn:active:not(:disabled) {
    transform: translateY(0);
  }

  .bds-export-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .bds-export-btn svg {
    opacity: 0.8;
    color: var(--bds-accent);
  }
</style>
