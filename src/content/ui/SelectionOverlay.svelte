<script>
  import appState from "../state.js";
  import { exportSession, collectMessages } from "../tools/exporter.js";
  import { scheduleScan } from "../scanner.js";

  let selectionMode = $state(appState.selectionMode);
  let selectedCount = $state(0);

  $effect(() => {
    const handleUrlChange = () => {
      // Exit selection mode on navigation
      cancelSelection();
    };

    const handleSelectionChange = () => {
      selectedCount = appState.selectedMessageIds.size;
    };

    window.addEventListener("bds:urlChanged", handleUrlChange);
    window.addEventListener("bds:selectionChanged", handleSelectionChange);
    
    // Check initial state periodically because appState is not reactive
    const timer = setInterval(() => {
      if (selectionMode !== appState.selectionMode) {
        selectionMode = appState.selectionMode;
        if (selectionMode) {
           document.body.classList.add("bds-selection-mode-active");
           // Sync count when opening
           selectedCount = appState.selectedMessageIds.size;
           // Ensure checkboxes are injected
           scheduleScan();
        } else {
           document.body.classList.remove("bds-selection-mode-active");
        }
      }
    }, 200);

    return () => {
      window.removeEventListener("bds:urlChanged", handleUrlChange);
      window.removeEventListener("bds:selectionChanged", handleSelectionChange);
      clearInterval(timer);
    };
  });

  function cancelSelection() {
    appState.selectionMode = false;
    appState.selectedMessageIds.clear();
    selectionMode = false;
    selectedCount = 0; // Reset count
    document.body.classList.remove("bds-selection-mode-active");
    
    // Uncheck all checkboxes
    document.querySelectorAll(".bds-selection-checkbox").forEach(cb => {
      if (cb instanceof HTMLInputElement) cb.checked = false;
    });

    window.dispatchEvent(new CustomEvent("bds:selectionChanged"));
  }

  function selectAll() {
    const checkboxes = document.querySelectorAll(".bds-selection-checkbox");
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    
    checkboxes.forEach(cb => {
      cb.checked = !allChecked;
      const id = cb.getAttribute("data-bds-message-id");
      if (!allChecked) {
        appState.selectedMessageIds.add(id);
      } else {
        appState.selectedMessageIds.delete(id);
      }
    });
    
    selectedCount = appState.selectedMessageIds.size;
    window.dispatchEvent(new CustomEvent("bds:selectionChanged"));
  }

  async function handleExport(format) {
    if (selectedCount === 0) {
      alert("Please select the messages you want to export first.");
      return;
    }
    
    await exportSession(format, Array.from(appState.selectedMessageIds));
    cancelSelection();
  }
</script>

{#if selectionMode}
  <div class="bds-selection-overlay">
    <div class="bds-selection-bar">
      <div class="bds-selection-info">
        <span class="bds-selection-count">{selectedCount}</span>
        <span class="bds-selection-label">messages selected</span>
      </div>
      
      <div class="bds-selection-center">
        <button class="bds-btn-ghost" onclick={selectAll}>
          {document.querySelectorAll(".bds-selection-checkbox").length === selectedCount ? "Deselect All" : "Select All"}
        </button>
      </div>

      <div class="bds-selection-actions">
        <div class="bds-export-group">
          <button class="bds-export-btn" onclick={() => handleExport('markdown')} title="Markdown (.md)">
            MD
          </button>
          <button class="bds-export-btn" onclick={() => handleExport('pdf')} title="PDF Document">
            PDF
          </button>
          <button class="bds-export-btn" onclick={() => handleExport('html')} title="Interactive HTML">
            HTML
          </button>
          <button class="bds-export-btn" onclick={() => handleExport('image')} title="Long Screenshot">
            IMG
          </button>
        </div>

        <div class="bds-divider-v"></div>

        <button class="bds-btn-cancel" onclick={cancelSelection}>Cancel</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .bds-selection-overlay {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 10000;
    display: flex;
    justify-content: center;
    padding: 20px;
    pointer-events: none;
    animation: slideUp 0.3s ease-out;
  }

  @keyframes slideUp {
    from { transform: translateY(100%); }
    to { transform: translateY(0); }
  }

  .bds-selection-bar {
    background: #111111;
    border: 1px solid #333333;
    border-radius: 100px; /* Pill shape */
    padding: 8px 12px 8px 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 32px;
    box-shadow: 0 20px 50px rgba(0,0,0,0.6);
    pointer-events: auto;
    color: white;
    min-width: 600px;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .bds-selection-info {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 600;
  }

  .bds-selection-count {
    background: #4d66ff;
    color: white;
    padding: 2px 10px;
    border-radius: 20px;
    font-size: 14px;
    min-width: 28px;
    text-align: center;
  }

  .bds-selection-label {
    font-size: 13px;
    color: #999;
  }

  .bds-selection-center {
    flex-grow: 1;
    display: flex;
    justify-content: center;
  }

  .bds-selection-actions {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .bds-export-group {
    display: flex;
    background: #1a1a1a;
    border-radius: 12px;
    padding: 3px;
    gap: 2px;
    border: 1px solid #333;
  }

  .bds-export-btn {
    background: transparent;
    border: none;
    color: #aaa;
    padding: 6px 12px;
    border-radius: 9px;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s;
  }

  .bds-export-btn:hover {
    background: #333;
    color: white;
  }

  .bds-btn-ghost {
    background: transparent;
    border: 1px solid #333;
    color: #ccc;
    padding: 6px 16px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .bds-btn-ghost:hover {
    border-color: #555;
    background: rgba(255, 255, 255, 0.05);
    color: white;
  }

  .bds-btn-cancel {
    background: transparent;
    border: none;
    color: #ff5f56;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    padding: 6px 12px;
    border-radius: 20px;
    transition: background 0.2s;
  }

  .bds-btn-cancel:hover {
    background: rgba(255, 95, 86, 0.1);
  }

  .bds-divider-v {
    width: 1px;
    height: 20px;
    background: #333;
  }
</style>
