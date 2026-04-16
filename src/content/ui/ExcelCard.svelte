<script>
  import { triggerBlobDownload } from "../../lib/utils/download.js";
  import { handleAutoErrorReport } from "../auto.js";

  /** @type {{content: string}} */
  let { content } = $props();

  let showScript = $state(false);
  let status = $state("");
  let statusColor = $state("var(--bds-text-tertiary)");
  let isProcessing = $state(false);
  let iframe = $state();

  const sandboxUrl = chrome.runtime.getURL("sandbox.html");

  // Extract filename from code
  let fileName = $derived.by(() => {
    // Look for XLSX.writeFile(wb, "filename.xlsx")
    const match = content.match(/XLSX\.writeFile\(.*,\s*[`"'](.*?)["'`]/);
    let name = match ? match[1].trim() : "Data";

    if (!name.toLowerCase().endsWith(".xlsx")) {
      name += ".xlsx";
    }
    return name;
  });

  async function handleDownload() {
    if (isProcessing) return;
    
    try {
      isProcessing = true;
      status = "Preparing sandbox...";
      statusColor = "var(--bds-text-tertiary)";
      
      const requestId = Math.random().toString(36).substring(7);
      
      const messageHandler = (event) => {
        if (event.data.id !== requestId) return;
        
        if (event.data.type === "EXCEL_RESULT") {
          status = "Downloading...";
          statusColor = "var(--bds-text-tertiary)";
          
          const base64 = event.data.base64;
          const blob = base64ToBlob(base64, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
          
          triggerBlobDownload(blob, fileName);
          
          status = "Success!";
          statusColor = "#10b981";
          finish();
        } else if (event.data.type === "EXCEL_ERROR") {
          status = "Error: " + event.data.error;
          statusColor = "#ef4444";
          handleAutoErrorReport("Excel", event.data.error, content);
          finish();
        }
      };

      const finish = () => {
        window.removeEventListener("message", messageHandler);
        isProcessing = false;
        setTimeout(() => { if (!isProcessing) status = ""; }, 3000);
      };

      window.addEventListener("message", messageHandler);
      
      // Send to sandbox
      iframe.contentWindow.postMessage({
        type: "GEN_EXCEL",
        code: content,
        id: requestId
      }, "*");

      status = "Generating Excel...";

    } catch (err) {
      console.error("Excel Sandbox Bridge Error:", err);
      status = "Bridge Error";
      statusColor = "#ef4444";
      isProcessing = false;
    }
  }

  function base64ToBlob(base64, mimeType) {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
  }

  function toggleScript() {
    showScript = !showScript;
  }
</script>

<article class="bds-excel-card">
  <div class="bds-excel-download-wrapper">
    <div class="bds-excel-info">
      <div class="bds-excel-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
          <path d="M10 13h4"></path>
          <path d="M10 17h4"></path>
          <path d="M10 9h4"></path>
          <text x="7" y="18" font-size="6" font-weight="bold" fill="currentColor" stroke="none" style="font-family: sans-serif;">XLSX</text>
        </svg>
      </div>
      
      <div class="bds-excel-details">
        <h4>Excel Spreadsheet</h4>
        <p>{fileName}</p>
      </div>
    </div>

    <div class="bds-excel-actions">
      {#if status}
        <span class="bds-status-bubble" style="color: {statusColor}">{status}</span>
      {/if}
      <button type="button" class="bds-btn" onclick={handleDownload} disabled={isProcessing}>
        {isProcessing ? 'Working...' : 'Download'}
      </button>
    </div>
  </div>

  <div class="bds-excel-script-toggle">
    <button type="button" class="bds-excel-script-btn" onclick={toggleScript}>
      {showScript ? 'Hide generated script' : 'Show generated script'}
    </button>

    {#if showScript}
      <pre class="bds-excel-script-content">{content.trim()}</pre>
    {/if}
  </div>

  <iframe 
    bind:this={iframe} 
    src={sandboxUrl} 
    style="display: none;" 
    title="BDS Excel Sandbox"
  ></iframe>
</article>

<style>
  .bds-excel-card {
    --excel-icon-bg: #ecfdf5;
    --excel-icon-color: #059669;
    margin: 10px 0;
    border: 1px solid var(--bds-border);
    border-radius: var(--bds-radius);
    background: var(--bds-bg-panel);
    overflow: hidden;
  }

  :global(.dark) .bds-excel-card {
    --excel-icon-bg: #064e3b;
    --excel-icon-color: #34d399;
  }

  .bds-excel-download-wrapper {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
  }

  .bds-excel-info {
    display: flex;
    align-items: center;
    gap: 14px;
    min-width: 0;
  }

  .bds-excel-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 42px;
    height: 48px;
    background-color: var(--excel-icon-bg);
    border: 1px solid var(--bds-border);
    border-radius: 8px;
    color: var(--excel-icon-color);
    flex-shrink: 0;
  }

  .bds-excel-details {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .bds-excel-details h4 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--bds-text-primary);
  }

  .bds-excel-details p {
    margin: 0;
    font-size: 11px;
    font-weight: 500;
    text-transform: uppercase;
    color: var(--bds-text-tertiary);
    letter-spacing: 0.5px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .bds-excel-actions {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .bds-status-bubble {
    font-size: 11px;
    font-weight: 600;
  }

  .bds-excel-script-toggle {
    padding: 0 16px 12px;
    border-top: 1px solid var(--ds-border-1, #f0f0f0);
    padding-top: 10px;
  }

  :global(.dark) .bds-excel-script-toggle {
    border-top-color: var(--bds-border);
  }

  .bds-excel-script-btn {
    background: transparent;
    border: none;
    color: var(--bds-text-tertiary);
    font-size: 11px;
    cursor: pointer;
    padding: 0;
    text-decoration: underline;
    transition: color 0.2s;
  }

  .bds-excel-script-btn:hover {
    color: var(--bds-text-secondary);
  }

  .bds-excel-script-content {
    margin-top: 10px;
    max-height: 200px;
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

  .bds-btn {
    border: 1px solid var(--bds-border);
    border-radius: 8px;
    background: var(--bds-bg-elevated);
    color: var(--bds-text-primary);
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    padding: 8px 16px;
    transition: all 0.2s;
  }

  .bds-btn:hover:not(:disabled) {
    background: var(--bds-bg-hover);
    border-color: var(--bds-border-hover);
  }

  .bds-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
