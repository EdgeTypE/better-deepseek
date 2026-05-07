/**
 * Sidebar Search functionality.
 * Injects a search bar that filters the native chat list.
 * Supports tag-based filtering with #tagname syntax.
 */

import state from "../state.js";
import { extractSessionId } from "../tags/tag-manager.js";

let searchInput = null;
let tagChipsContainer = null;
let searchWrapper = null;
let activeTags = new Set();
let searchDebounceTimer = 0;
let searchSuggestionsContainer = null;

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
  searchWrapper = container;
  
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
        placeholder="Search history... (#tag)" 
        autocomplete="off"
      />
    </div>
    <div id="bds-search-suggestions" class="bds-tag-suggestions bds-search-suggestions" style="display: none;"></div>
    <div id="bds-tag-chips-container" class="bds-tag-chips-wrapper"></div>
  `;

  // Insert it after the "New Chat" button
  newChatLink.parentNode.insertBefore(container, newChatLink.nextSibling);

  searchInput = container.querySelector('#bds-sidebar-search-input');
  tagChipsContainer = container.querySelector('#bds-tag-chips-container');
  searchSuggestionsContainer = container.querySelector('#bds-search-suggestions');

  searchInput.addEventListener('input', (e) => {
    handleSearch(e.target.value);
  });

  searchInput.addEventListener('focus', () => {
    searchWrapper.classList.add('bds-sidebar-search-wrapper--active');
  });

  searchInput.addEventListener('blur', () => {
    searchWrapper.classList.remove('bds-sidebar-search-wrapper--active');
    setTimeout(hideSuggestions, 200);
  });

  renderTagChips();
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

function handleSearch(query) {
  clearTimeout(searchDebounceTimer);
  const q = query.toLowerCase().trim();
  
  if (q.includes("#")) {
    const parts = query.split("#");
    const lastPart = parts[parts.length - 1];
    if (lastPart.length >= 0) {
      showSuggestions(lastPart);
    } else {
      hideSuggestions();
    }
  } else {
    hideSuggestions();
  }

  searchDebounceTimer = setTimeout(() => {
    performFiltering(q);
  }, 100);
}

function showSuggestions(filter) {
  if (!searchSuggestionsContainer) return;
  
  // Get unique tags
  const allKnownTags = [];
  const tagCounts = {};
  Object.values(state.chatTags).forEach(tags => {
    tags.forEach(tag => {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      if (!allKnownTags.includes(tag)) allKnownTags.push(tag);
    });
  });

  const filtered = allKnownTags.filter(
    (t) =>
      t.toLowerCase().includes(filter.toLowerCase()) &&
      !activeTags.has(t)
  );

  if (filtered.length === 0) {
    hideSuggestions();
    return;
  }

  searchSuggestionsContainer.innerHTML = "";
  searchSuggestionsContainer.style.display = "block";

  filtered.slice(0, 5).forEach(tag => {
    const item = document.createElement("div");
    item.className = "bds-tag-suggestion-item";
    item.innerHTML = `
      <span class="bds-tag-suggestion-label">#${tag}</span>
      <span class="bds-tag-suggestion-count">${tagCounts[tag]}</span>
    `;
    item.addEventListener("mousedown", (e) => {
      e.preventDefault();
      // Replace the current #tag with the selected one
      const val = searchInput.value;
      const hashIndex = val.lastIndexOf("#");
      const newVal = val.substring(0, hashIndex) + "#" + tag + " ";
      searchInput.value = newVal;
      hideSuggestions();
      handleSearch(newVal);
      searchInput.focus();
    });
    searchSuggestionsContainer.appendChild(item);
  });
}

function hideSuggestions() {
  if (searchSuggestionsContainer) {
    searchSuggestionsContainer.style.display = "none";
    searchSuggestionsContainer.innerHTML = "";
  }
}

export function renderTagChips() {
  if (!tagChipsContainer) return;
  
  // Get all unique tags and their counts
  const tagCounts = {};
  Object.values(state.chatTags).forEach(tags => {
    tags.forEach(tag => {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    });
  });

  const uniqueTags = Object.keys(tagCounts).sort((a, b) => tagCounts[b] - tagCounts[a]);
  
  if (uniqueTags.length === 0) {
    tagChipsContainer.style.display = 'none';
    return;
  }
  
  tagChipsContainer.style.display = 'flex';
  tagChipsContainer.innerHTML = '';

  uniqueTags.forEach(tag => {
    const chip = document.createElement('div');
    chip.className = `bds-tag-chip ${activeTags.has(tag) ? 'bds-tag-chip--active' : ''}`;
    chip.innerHTML = `
      <span class="bds-tag-chip-label">${tag}</span>
      <span class="bds-tag-chip-count">${tagCounts[tag]}</span>
    `;
    chip.addEventListener('click', () => toggleTagFilter(tag));
    tagChipsContainer.appendChild(chip);
  });
}

function toggleTagFilter(tag) {
  if (activeTags.has(tag)) {
    activeTags.delete(tag);
  } else {
    activeTags.add(tag);
  }
  
  if (activeTags.size > 0) {
    searchWrapper.classList.add('bds-sidebar-search-wrapper--has-filter');
  } else {
    searchWrapper.classList.remove('bds-sidebar-search-wrapper--has-filter');
  }

  renderTagChips();
  performFiltering(searchInput ? searchInput.value : "");
}

function performFiltering(query) {
  const chatItems = document.querySelectorAll('a._546d736');
  const q = query.toLowerCase().trim();
  
  // Check if this is a tag search (#tagname) from the input field
  const inputTagSearch = q.startsWith("#") ? q.slice(1).trim() : null;

  chatItems.forEach(item => {
    const titleEl = item.querySelector('.c08e6e93');
    const fullTitle = titleEl?.getAttribute("data-bds-full-title") || "";
    const visibleTitle = titleEl ? titleEl.textContent.toLowerCase() : '';
    const searchableTitle = fullTitle.toLowerCase() || visibleTitle;
    
    const sessionId = extractSessionId(item.href);
    const sessionTags = sessionId ? (state.chatTags[sessionId] || []) : [];
    const sessionTagsLower = sessionTags.map(t => t.toLowerCase());

    let matches = true;

    // 1. Filter by active tag chips (AND logic)
    if (activeTags.size > 0) {
      for (const activeTag of activeTags) {
        if (!sessionTagsLower.includes(activeTag.toLowerCase())) {
          matches = false;
          break;
        }
      }
    }

    if (!matches) {
      item.style.display = 'none';
      return;
    }

    // 2. Filter by search input
    if (q) {
      if (inputTagSearch) {
        // Tag search in input: check if any tag matches the query
        const hasTagMatch = sessionTagsLower.some(t => t.includes(inputTagSearch));
        if (!hasTagMatch) matches = false;
      } else {
        // Normal text search
        if (!searchableTitle.includes(q)) matches = false;
      }
    }

    item.style.display = matches ? '' : 'none';
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
