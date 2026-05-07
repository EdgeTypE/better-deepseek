/**
 * Tag Editor — popup UI for managing tags on a chat session.
 *
 * Shown when the user clicks "Tags (BDS)" in the sidebar context menu.
 * Uses vanilla DOM (no Svelte) for simplicity and instant rendering.
 */

import {
  getTags,
  setTags,
  getUniqueTags,
  extractSessionId,
} from "./tag-manager.js";

let currentEditor = null;

/**
 * Open the tag editor popup for the given chat URL.
 * @param {string} chatUrl — e.g. "https://chat.deepseek.com/a/chat/s/abc-123"
 */
export function openTagEditor(chatUrl) {
  closeTagEditor();

  const sessionId = extractSessionId(chatUrl);
  if (!sessionId) {
    console.warn("[BDS Tags] Cannot extract session ID from URL:", chatUrl);
    return;
  }

  const tags = [...getTags(sessionId)];
  const allKnownTags = getUniqueTags();

  // ── Build DOM ──
  const backdrop = document.createElement("div");
  backdrop.className = "bds-tag-editor-backdrop";

  const panel = document.createElement("div");
  panel.className = "bds-tag-editor";
  panel.addEventListener("click", (e) => e.stopPropagation());

  // Header
  const header = document.createElement("div");
  header.className = "bds-tag-editor-header";
  header.innerHTML = `
    <div class="bds-tag-editor-title">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
        <line x1="7" y1="7" x2="7.01" y2="7"/>
      </svg>
      <span>Manage Tags</span>
    </div>
    <button class="bds-tag-editor-close" type="button">&times;</button>
  `;

  // Tag pills container
  const pillsContainer = document.createElement("div");
  pillsContainer.className = "bds-tag-pills";

  // Input row
  const inputRow = document.createElement("div");
  inputRow.className = "bds-tag-input-row";

  const input = document.createElement("input");
  input.className = "bds-tag-input";
  input.type = "text";
  input.placeholder = "Add a tag...";
  input.autocomplete = "off";

  const addBtn = document.createElement("button");
  addBtn.className = "bds-tag-add-btn";
  addBtn.type = "button";
  addBtn.textContent = "Add";

  inputRow.appendChild(input);
  inputRow.appendChild(addBtn);

  // Suggestions dropdown
  const suggestions = document.createElement("div");
  suggestions.className = "bds-tag-suggestions";
  suggestions.style.display = "none";

  // Suggested Tags section (Memory)
  const memorySection = document.createElement("div");
  memorySection.className = "bds-tag-memory-section";
  
  const memoryTitle = document.createElement("div");
  memoryTitle.className = "bds-tag-memory-title";
  memoryTitle.textContent = "Memory (Quick Add)";
  
  const memoryTagsContainer = document.createElement("div");
  memoryTagsContainer.className = "bds-tag-memory-list";
  
  memorySection.appendChild(memoryTitle);
  memorySection.appendChild(memoryTagsContainer);

  // Assemble
  panel.appendChild(header);
  panel.appendChild(pillsContainer);
  panel.appendChild(inputRow);
  panel.appendChild(suggestions);
  panel.appendChild(memorySection);
  backdrop.appendChild(panel);
  document.body.appendChild(backdrop);

  // ── State & rendering ──
  let currentTags = tags;
  let dirty = false;

  function renderPills() {
    pillsContainer.innerHTML = "";

    if (currentTags.length === 0) {
      const empty = document.createElement("div");
      empty.className = "bds-tag-empty";
      empty.textContent = "No tags yet";
      pillsContainer.appendChild(empty);
      return;
    }

    for (const tag of currentTags) {
      const pill = document.createElement("span");
      pill.className = "bds-tag-pill";
      pill.setAttribute("data-tag", tag);

      const label = document.createElement("span");
      label.className = "bds-tag-pill-label";
      label.textContent = tag;

      const removeBtn = document.createElement("button");
      removeBtn.className = "bds-tag-pill-remove";
      removeBtn.type = "button";
      removeBtn.innerHTML = "&times;";
      removeBtn.addEventListener("click", () => {
        currentTags = currentTags.filter((t) => t !== tag);
        dirty = true;
        renderPills();
      });

      pill.appendChild(label);
      pill.appendChild(removeBtn);
      pillsContainer.appendChild(pill);
    }

    renderMemoryTags();
  }

  function renderMemoryTags() {
    memoryTagsContainer.innerHTML = "";
    
    // Filter out tags already assigned to this chat
    const available = allKnownTags.filter(t => !currentTags.includes(t));
    
    if (available.length === 0) {
      memorySection.style.display = "none";
      return;
    }
    
    memorySection.style.display = "block";
    
    for (const tag of available) {
      const pill = document.createElement("span");
      pill.className = "bds-tag-pill bds-tag-pill-suggested";
      pill.textContent = tag;
      pill.addEventListener("click", () => {
        currentTags.push(tag);
        dirty = true;
        renderPills();
      });
      memoryTagsContainer.appendChild(pill);
    }
  }

  function addTagFromInput() {
    const value = input.value.trim();
    if (!value) return;
    if (currentTags.includes(value)) {
      input.value = "";
      hideSuggestions();
      return;
    }
    currentTags.push(value);
    dirty = true;
    input.value = "";
    hideSuggestions();
    renderPills();
    input.focus();
  }

  function showSuggestions(filter) {
    const filtered = allKnownTags.filter(
      (t) =>
        t.toLowerCase().includes(filter.toLowerCase()) &&
        !currentTags.includes(t)
    );

    if (filtered.length === 0) {
      hideSuggestions();
      return;
    }

    suggestions.innerHTML = "";
    suggestions.style.display = "block";

    for (const tag of filtered.slice(0, 8)) {
      const item = document.createElement("div");
      item.className = "bds-tag-suggestion-item";
      item.textContent = tag;
      item.addEventListener("mousedown", (e) => {
        e.preventDefault(); // prevent blur
        input.value = tag;
        addTagFromInput();
      });
      suggestions.appendChild(item);
    }
  }

  function hideSuggestions() {
    suggestions.style.display = "none";
    suggestions.innerHTML = "";
  }

  async function save() {
    if (dirty) {
      await setTags(sessionId, currentTags);
    }
  }

  async function close() {
    await save();
    backdrop.remove();
    currentEditor = null;
  }

  // ── Events ──

  header.querySelector(".bds-tag-editor-close").addEventListener("click", close);
  backdrop.addEventListener("click", close);

  addBtn.addEventListener("click", addTagFromInput);

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addTagFromInput();
    } else if (e.key === "Escape") {
      close();
    } else if (e.key === "Backspace" && input.value === "" && currentTags.length > 0) {
      // Remove last tag on Backspace in empty input
      currentTags.pop();
      dirty = true;
      renderPills();
    }
  });

  input.addEventListener("input", () => {
    const val = input.value.trim();
    if (val.length > 0) {
      showSuggestions(val);
    } else {
      hideSuggestions();
    }
  });

  input.addEventListener("blur", () => {
    // Small delay to allow suggestion click
    setTimeout(hideSuggestions, 150);
  });

  // Stop event propagation to prevent DeepSeek's handlers
  panel.addEventListener("keydown", (e) => e.stopPropagation());
  panel.addEventListener("keyup", (e) => e.stopPropagation());

  // ── Initial render ──
  renderPills();
  currentEditor = { close };

  // Focus input after a tick (let DOM settle)
  requestAnimationFrame(() => input.focus());
}

export function closeTagEditor() {
  if (currentEditor) {
    currentEditor.close();
    currentEditor = null;
  }
}
