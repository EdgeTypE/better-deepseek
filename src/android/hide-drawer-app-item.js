/**
 * Hides the "Download mobile App" item from DeepSeek's settings dropdown
 * (.ds-dropdown-menu). The menu uses the same DOM structure as per-chat context
 * menus: items are .ds-dropdown-menu-option elements with a child
 * .ds-dropdown-menu-option__label holding the text.
 *
 * Mirrors SidebarMenuInjector's observer pattern so both run on the same menu
 * instance without conflict.
 *
 * Update DRAWER_APP_ITEM_TEXT if DeepSeek renames the item.
 */

/** Exact trimmed text of the settings menu item to hide. */
export const DRAWER_APP_ITEM_TEXT = "Download mobile App";

export function hideDrawerAppItem() {
  if (window.__bdsDrawerItemObserver) return;

  function hideItem(menu) {
    const options = menu.querySelectorAll(".ds-dropdown-menu-option");
    for (const opt of options) {
      const label = opt.querySelector(".ds-dropdown-menu-option__label");
      if (label?.textContent.trim().includes(DRAWER_APP_ITEM_TEXT)) {
        opt.style.display = "none";
        console.log("[BDS] Hidden drawer app item");
      }
    }
  }

  // Handle any menus already in the DOM at injection time.
  document.querySelectorAll(".ds-dropdown-menu").forEach(hideItem);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.classList.contains("ds-dropdown-menu")) {
          hideItem(node);
        } else {
          const menu = node.querySelector?.(".ds-dropdown-menu");
          if (menu) hideItem(menu);
        }
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
  window.__bdsDrawerItemObserver = observer;
}
