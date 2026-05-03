/**
 * Sidebar Search functionality.
 * Injects a search bar that filters the native chat list.
 */

import state from "../state.js";

let searchInput = null;

export function initSidebarSearch() {
  if (document.getElementById('bds-sidebar-search-container')) return;
  injectSearchInput();
}

export function injectSearchInput() {
  if (document.getElementById('bds-sidebar-search-container')) return;

  // Find the sidebar container that holds the chat list
  // Usually this is the one containing the "New Chat" button
  const allSvgs = document.querySelectorAll('svg');
  let newChatSvg = null;
  for (const svg of allSvgs) {
    if (svg.querySelector('path[d*="M8 0.599609"]')) {
      newChatSvg = svg;
      break;
    }
  }

  if (!newChatSvg) return;

  const newChatLink = newChatSvg.closest('a.bds-logo-link') || newChatSvg.closest('div[tabindex="0"]');
  if (!newChatLink) return;

  const container = document.createElement('div');
  container.id = 'bds-sidebar-search-container';
  container.className = 'bds-sidebar-search-wrapper';
  
  container.innerHTML = `
    <div class="bds-sidebar-search-inner">
      <div class="bds-search-icon">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
      </div>
      <input 
        type="text" 
        id="bds-sidebar-search-input" 
        placeholder="Search history..." 
        autocomplete="off"
      />
    </div>
  `;

  // Insert it after the "New Chat" button
  newChatLink.parentNode.insertBefore(container, newChatLink.nextSibling);

  searchInput = container.querySelector('#bds-sidebar-search-input');
  searchInput.addEventListener('input', (e) => {
    handleSearch(e.target.value);
  });

  watchSidebarVisibility(container);
}

/**
 * Use rAF to track the sidebar panel width and hide the search container
 * when the sidebar is collapsed (width collapses to 0 via CSS transition).
 * @param {HTMLElement} container
 */
function watchSidebarVisibility(container) {
  const sidebarPanel = container.closest('.dc04ec1d');
  if (!sidebarPanel) return;

  const isHidden = () => sidebarPanel.getBoundingClientRect().width === 0;
  let lastHidden = isHidden();
  container.style.display = lastHidden ? 'none' : '';

  function tick() {
    const hidden = isHidden();
    if (hidden !== lastHidden) {
      container.style.display = hidden ? 'none' : '';
      lastHidden = hidden;
    }
    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
}

let searchDebounceTimer = 0;

function handleSearch(query) {
  clearTimeout(searchDebounceTimer);
  const q = query.toLowerCase().trim();
  
  searchDebounceTimer = setTimeout(() => {
    performFiltering(q);
  }, 100);
}

function performFiltering(query) {
  const chatItems = document.querySelectorAll('a._546d736');
  
  chatItems.forEach(item => {
    const titleEl = item.querySelector('.c08e6e93');
    const title = titleEl ? titleEl.textContent.toLowerCase() : '';
    
    if (!query || title.includes(query)) {
      item.style.display = '';
    } else {
      item.style.display = 'none';
    }
  });

  // Filter history group headers
  const groups = document.querySelectorAll('div._3098d02');
  groups.forEach(group => {
    const items = group.querySelectorAll('a._546d736');
    const hasVisibleItems = Array.from(items).some(item => item.style.display !== 'none');
    
    if (hasVisibleItems || !query) {
      group.style.display = '';
    } else {
      group.style.display = 'none';
    }
  });
}
