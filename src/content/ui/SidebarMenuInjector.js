import { exportSession } from "../tools/exporter.js";
import { setPendingExport, checkPendingExport } from "../tools/pending-export.js";
import { openTagEditor } from "../tags/tag-editor.js";

// Keep track of which chat item's menu was opened
let lastClickedChatUrl = null;

// Selection Icon
const SELECTION_ICON = `
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M9 11l3 3L22 4"></path>
  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
</svg>`;

// Tag Icon
const TAG_ICON = `
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
  <line x1="7" y1="7" x2="7.01" y2="7"/>
</svg>`;

export function initSidebarMenuInjector() {
  // Capture the chat URL when the menu button is clicked
  const captureUrl = (e) => {
    const btn = e.target.closest("div._2090548") || e.target.closest('button[aria-label*="menu" i]');
    if (btn) {
      const chatItem = btn.closest("a._546d736") || btn.closest('a[href*="/chat/s/"]');
      if (chatItem) {
        lastClickedChatUrl = chatItem.href;
      }
    }
  };

  document.addEventListener("mousedown", captureUrl, true);
  document.addEventListener("click", captureUrl, true);

  // Secondary backup for menu injection on any click
  document.addEventListener("click", () => {
    setTimeout(() => {
      document.querySelectorAll(".ds-dropdown-menu").forEach(injectOptions);
    }, 100);
  }, true);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === 1) {
          if (node.classList.contains("ds-dropdown-menu")) {
            injectOptions(node);
          } else {
            const menu = node.querySelector(".ds-dropdown-menu");
            if (menu) injectOptions(menu);
          }
        }
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Initial check for pending exports
  checkPendingExport();
}

async function handleExportAction(format) {
  const targetUrl = lastClickedChatUrl;
  if (!targetUrl) return;

  // For selection mode
  if (format === "selection") {
    if (window.location.href === targetUrl) {
      window.dispatchEvent(new CustomEvent("bds:toggleSelectionMode"));
    } else {
      await setPendingExport(targetUrl, format);
      window.location.href = targetUrl;
    }
    return;
  }

  if (window.location.href === targetUrl) {
    exportSession(format);
  } else {
    await setPendingExport(targetUrl, format);
    window.location.href = targetUrl;
  }
}

function injectOptions(menu) {
  if (menu.querySelector(".bds-export-option")) return;

  const deleteOption = Array.from(
    menu.querySelectorAll(".ds-dropdown-menu-option")
  ).find((opt) =>
    opt.querySelector(".ds-dropdown-menu-option__label")?.textContent.toLowerCase().includes("delete")
  );

  const insertBefore = deleteOption || null;

  // Tags option
  const tagsOption = createMenuOption("Tags (BDS)", TAG_ICON, "bds-tags-option", () => {
    if (lastClickedChatUrl) {
      // Dismiss the dropdown by clicking the body — lets React close it naturally
      // (force-removing DOM nodes crashes React's reconciliation)
      document.body.click();
      // Open the tag editor after a small delay to let React clean up
      const url = lastClickedChatUrl;
      setTimeout(() => openTagEditor(url), 50);
    }
  });

  const exportOption = createMenuOption("Export Chat (BDS)", SELECTION_ICON, "bds-export-option", () => {
    handleExportAction("selection");
  });

  // Insert: Tags first, then Export, both before Delete
  tagsOption.style.borderTop = "1px solid rgba(0,0,0,0.05)";
  tagsOption.style.marginTop = "4px";
  tagsOption.style.paddingTop = "8px";

  menu.insertBefore(tagsOption, insertBefore);
  menu.insertBefore(exportOption, insertBefore);
}

function createMenuOption(label, iconHtml, className, onClick) {
  const opt = document.createElement("div");
  opt.className = `ds-dropdown-menu-option ds-dropdown-menu-option--none ${className}`;
  
  opt.innerHTML = `
    <div class="ds-dropdown-menu-option__icon">${iconHtml}</div>
    <div class="ds-dropdown-menu-option__label">${label}</div>
  `;

  opt.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick();
  });

  return opt;
}
