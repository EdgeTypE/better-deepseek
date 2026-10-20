import { exportSession } from "../tools/exporter.js";
import { setPendingExport, checkPendingExport } from "../tools/pending-export.js";
import { openTagEditor } from "../tags/tag-editor.js";
import { i18n } from "../../lib/i18n.svelte.js";
import appState from "../state.js";

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

// Download Icon
const DOWNLOAD_ICON = `
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
  <polyline points="7 10 12 15 17 10"/>
  <line x1="12" y1="15" x2="12" y2="3"/>
</svg>`;

const GET_BDS_APP_URL = "https://github.com/EdgeTypE/better-deepseek/releases";

const WHATS_NEW_ICON = `
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
</svg>`;

export function initSidebarMenuInjector() {
  // Capture the chat URL from any click inside a sidebar chat link.
  // The three-dot menu button is a descendant of the <a> element, so this
  // fires reliably without depending on auto-generated class names.
  function captureLinkFromClick(e) {
    // Fast path: button is inside the chat link element (some DOM layouts)
    let link = e.target.closest('a[href*="/chat/s/"]');
    if (link) {
      lastClickedChatUrl = link.href;
      return;
    }
    // Fallback: button is a sibling of the chat link rather than a descendant.
    // Walk up until we find the nearest container that holds a chat link.
    // Stops at the first match to avoid capturing the wrong session.
    let el = e.target.parentElement;
    while (el && el !== document.body) {
      link = el.querySelector('a[href*="/chat/s/"]');
      if (link) {
        lastClickedChatUrl = link.href;
        return;
      }
      el = el.parentElement;
    }
  }

  // Secondary backup for menu injection on any click
  function handleBackupScan() {
    setTimeout(() => {
      if (typeof document === "undefined") return;
      document.querySelectorAll(".ds-dropdown-menu").forEach((menu) => {
        injectOptions(menu);
        injectSettingsDrawerOptions(menu);
      });
    }, 100);
  }

  document.addEventListener("mousedown", captureLinkFromClick, true);
  document.addEventListener("click", handleBackupScan, true);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === 1) {
          if (node.classList.contains("ds-dropdown-menu")) {
            injectOptions(node);
            injectSettingsDrawerOptions(node);
          } else {
            const menu = node.querySelector(".ds-dropdown-menu");
            if (menu) {
              injectOptions(menu);
              injectSettingsDrawerOptions(menu);
            }
          }
        }
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Initial check for pending exports
  checkPendingExport();

  return function cleanup() {
    document.removeEventListener("mousedown", captureLinkFromClick, true);
    document.removeEventListener("click", handleBackupScan, true);
    observer.disconnect();
  };
}

async function handleExportAction(format) {
  const targetUrl = lastClickedChatUrl;
  if (!targetUrl) {
    console.warn("[BDS] handleExportAction: no chat URL captured — three-dot button may be outside chat link");
    return;
  }

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
  const tagsOption = createMenuOption(i18n.t('sidebarMenu.tags'), TAG_ICON, "bds-tags-option", () => {
    if (!lastClickedChatUrl) {
      console.warn("[BDS] Tags action: no chat URL captured — three-dot button may be outside chat link");
      return;
    }
    // Dismiss the dropdown by clicking the body — lets React close it naturally
    // (force-removing DOM nodes crashes React's reconciliation)
    document.body.click();
    // Open the tag editor after a small delay to let React clean up
    const url = lastClickedChatUrl;
    setTimeout(() => openTagEditor(url), 50);
  });

  const exportOption = createMenuOption(i18n.t('sidebarMenu.exportChat'), SELECTION_ICON, "bds-export-option", () => {
    handleExportAction("selection");
  });

  // Insert: Tags first, then Export, both before Delete
  tagsOption.style.borderTop = "1px solid rgba(0,0,0,0.05)";
  tagsOption.style.marginTop = "4px";
  tagsOption.style.paddingTop = "8px";

  menu.insertBefore(tagsOption, insertBefore);
  menu.insertBefore(exportOption, insertBefore);
}

function injectSettingsDrawerOptions(menu) {
  if (menu.querySelector(".bds-whats-new-option")) return;

  const targetLabels = ["Download mobile App", "Get App"];
  let targetOption = null;
  for (const label of targetLabels) {
    targetOption = Array.from(
      menu.querySelectorAll(".ds-dropdown-menu-option")
    ).find((opt) =>
      opt.querySelector(".ds-dropdown-menu-option__label")?.textContent.trim().includes(label)
    );
    if (targetOption) break;
  }

  if (!targetOption) return;

  const bdsOption = createMenuOption(
    i18n.t('sidebarMenu.getBdsApp'),
    DOWNLOAD_ICON,
    "bds-get-app-option",
    () => {
      window.open(GET_BDS_APP_URL, "_blank");
    }
  );

  targetOption.parentNode.insertBefore(bdsOption, targetOption.nextSibling);

  const whatsNewOption = createMenuOption(
    i18n.t('sidebarMenu.whatsNew'),
    WHATS_NEW_ICON,
    "bds-whats-new-option",
    () => {
      appState.whatsNewPending = true;
      if (appState.ui) appState.ui.refreshWhatsNew();
    }
  );

  bdsOption.parentNode.insertBefore(whatsNewOption, bdsOption.nextSibling);
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
