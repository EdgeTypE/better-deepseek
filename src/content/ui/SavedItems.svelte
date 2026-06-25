<script>
  import appState from "../state.js";
  import { STORAGE_KEYS } from "../../lib/constants.js";
  import { makeId } from "../../lib/utils/helpers.js";
  import { injectPureTextAndSend } from "../auto.js";
  import { t } from "../../lib/i18n.svelte.js";
  import SnippetDialog from "./SnippetDialog.svelte";

  let activeTab = $state("bookmarks");
  let searchQuery = $state("");
  let items = $state([...appState.savedItems]);
  let showSnippetDialog = $state(false);
  let editingItem = $state(null);

  export function refresh() {
    items = [...appState.savedItems];
  }

  let filteredItems = $derived.by(() => {
    let list = items;
    if (activeTab === "bookmarks") {
      list = list.filter(i => i.type === "bookmark");
    } else {
      list = list.filter(i => i.type === "snippet");
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(i =>
        i.title.toLowerCase().includes(q) ||
        i.content.toLowerCase().includes(q)
      );
    }
    return list.sort((a, b) => b.createdAt - a.createdAt);
  });

  function formatDate(ts) {
    const d = new Date(ts);
    const now = new Date();
    const diff = now - d;
    if (diff < 60000) return t('savedItems.dateJustNow');
    if (diff < 3600000) return t('savedItems.dateMinAgo', { count: Math.floor(diff / 60000) });
    if (diff < 86400000) return t('savedItems.dateHourAgo', { count: Math.floor(diff / 3600000) });
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  function getCommandForSnippet(id) {
    const mappings = appState.commands?.customMappings || {}
    return Object.entries(mappings).find(([, v]) => v === id)?.[0] || null
  }

  async function deleteItem(id) {
    if (!appState.settings?.skipDeletionConfirmation) {
      if (!(await appState.ui.showConfirm(`Delete saved item?`))) return;
    }
    appState.savedItems = appState.savedItems.filter(i => i.id !== id);
    await chrome.storage.local.set({ [STORAGE_KEYS.savedItems]: appState.savedItems });
    items = [...appState.savedItems];

    const mappings = { ...(appState.commands?.customMappings || {}) }
    const oldKey = Object.entries(mappings).find(([, v]) => v === id)?.[0]
    if (oldKey) {
      delete mappings[oldKey]
      appState.commands.customMappings = mappings
      await chrome.storage.local.set({ [STORAGE_KEYS.commandMappings]: mappings })
    }

    if (appState.ui) appState.ui.showToast(t('savedItems.deleted'));
  }

  function editItem(item) {
    editingItem = item;
    showSnippetDialog = true;
  }

  function newSnippet() {
    editingItem = null;
    showSnippetDialog = true;
  }

  async function saveSnippet(item) {
    let snippetId = editingItem ? editingItem.id : null
    if (editingItem) {
      const existing = appState.savedItems.find(i => i.id === editingItem.id);
      if (existing) {
        existing.title = item.title;
        existing.content = item.content;
        existing.updatedAt = Date.now();
      }
    } else {
      snippetId = makeId()
      appState.savedItems.push({
        id: snippetId,
        type: "snippet",
        title: item.title,
        content: item.content,
        messageType: null,
        messageNodeId: "",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        conversationTitle: "",
        conversationUrl: "",
      });
    }
    await chrome.storage.local.set({ [STORAGE_KEYS.savedItems]: appState.savedItems });
    items = [...appState.savedItems];

    const mappings = { ...(appState.commands?.customMappings || {}) }
    const oldKey = Object.entries(mappings).find(([, v]) => v === snippetId)?.[0]
    if (oldKey) delete mappings[oldKey]

    if (item.command) {
      mappings[item.command] = snippetId
    }

    appState.commands.customMappings = mappings
    await chrome.storage.local.set({ [STORAGE_KEYS.commandMappings]: mappings })

    showSnippetDialog = false;
    editingItem = null;
  }

  function sendSnippet(content) {
    injectPureTextAndSend(content);
    if (appState.ui) appState.ui.showToast(t('savedItems.snippetSent'));
  }

  function goToConversation(url) {
    if (url) window.open(url, "_blank");
  }

  function exportAll() {
    const data = JSON.stringify(appState.savedItems, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "bds_saved_items.json";
    a.click();
    URL.revokeObjectURL(blob);
  }

  function triggerImport() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (Array.isArray(data)) {
          const merged = [...appState.savedItems];
          for (const item of data) {
            if (item && item.id && item.content) {
              if (!merged.some(m => m.id === item.id)) {
                merged.push(item);
              }
            }
          }
          appState.savedItems = merged;
          await chrome.storage.local.set({ [STORAGE_KEYS.savedItems]: appState.savedItems });
          items = [...appState.savedItems];
          if (appState.ui) appState.ui.showToast(t('savedItems.importSuccess', { count: data.length }));
        }
      } catch (err) {
        if (appState.ui) appState.ui.showToast(t('savedItems.importFailed', { msg: err.message }));
      }
    };
    input.click();
  }

  function truncate(text, len) {
    if (!text) return "";
    if (text.length <= len) return text;
    return text.slice(0, len) + "...";
  }
</script>

<div class="bds-section-title">
  <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
    <div style="display: flex; align-items: center;">
      <span class="bds-icon-inline">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
        </svg>
      </span>
      {t('savedItems.title')}
    </div>
    <div style="display: flex; gap: 6px;">
      <button type="button" class="bds-btn-outlined" style="font-size:11px;padding:4px 8px;" onclick={exportAll}>{t('savedItems.export')}</button>
      <button type="button" class="bds-btn-outlined" style="font-size:11px;padding:4px 8px;" onclick={triggerImport}>{t('savedItems.import')}</button>
    </div>
  </div>
</div>

<div class="bds-saved-tabs">
  <button type="button" class="bds-saved-tab" class:bds-saved-tab--active={activeTab === "bookmarks"} onclick={() => activeTab = "bookmarks"}>
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
    {t('savedItems.bookmarks')}
    <span class="bds-saved-count">{items.filter(i => i.type === "bookmark").length}</span>
  </button>
  <button type="button" class="bds-saved-tab" class:bds-saved-tab--active={activeTab === "snippets"} onclick={() => activeTab = "snippets"}>
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
    {t('savedItems.snippets')}
    <span class="bds-saved-count">{items.filter(i => i.type === "snippet").length}</span>
  </button>
</div>

{#if activeTab === "snippets"}
  <button type="button" class="bds-btn bds-snippet-new-btn" onclick={newSnippet}>
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
    {t('savedItems.newSnippet')}
  </button>
{/if}

<input
  class="bds-saved-search"
  type="text"
  placeholder={t('savedItems.search')}
  bind:value={searchQuery}
/>

<div class="bds-list" id="bds-saved-list">
  {#if filteredItems.length === 0}
    <p class="bds-empty">
      {activeTab === "bookmarks" ? t('savedItems.emptyBookmarks') : t('savedItems.emptySnippets')}
    </p>
  {:else}
    {#each filteredItems as item (item.id)}
      <div class="bds-saved-item">
        <div class="bds-saved-item-main">
          {#if item.type === "bookmark"}
            <div class="bds-saved-item-type-icon bds-saved-type-{item.messageType}">
              {#if item.messageType === "assistant"}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
              {:else}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
              {/if}
            </div>
          {:else}
            <div class="bds-saved-item-type-icon bds-saved-type-snippet">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </div>
          {/if}
          <div class="bds-saved-item-body">
            <div class="bds-saved-item-title" title={item.title}>
              {truncate(item.title, 60)}
              {#if item.type === "snippet" && getCommandForSnippet(item.id)}
                <span class="bds-saved-cmd-badge">/{getCommandForSnippet(item.id)}</span>
              {/if}
            </div>
            <div class="bds-saved-item-preview">{truncate(item.content.replace(/\n/g, " "), 80)}</div>
            <div class="bds-saved-item-meta">
              {#if item.type === "bookmark" && item.conversationTitle}
                <span class="bds-saved-item-conv" onclick={() => goToConversation(item.conversationUrl)} title={t('savedItems.openConversation')}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                  {truncate(item.conversationTitle, 30)}
                </span>
              {/if}
              <span class="bds-saved-item-date">{formatDate(item.createdAt)}</span>
            </div>
          </div>
        </div>
        <div class="bds-saved-item-actions">
          {#if item.type === "snippet"}
            <button type="button" class="bds-saved-btn bds-saved-send-btn" onclick={() => sendSnippet(item.content)} title={t('savedItems.send')}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
            </button>
          {/if}
          {#if item.type === "snippet"}
            <button type="button" class="bds-saved-btn" onclick={() => editItem(item)} title={t('savedItems.edit')}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </button>
          {/if}
          <button type="button" class="bds-saved-btn bds-saved-del-btn" onclick={() => deleteItem(item.id)} title={t('savedItems.delete')}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </div>
      </div>
    {/each}
  {/if}
</div>

{#if showSnippetDialog}
  <SnippetDialog
    item={editingItem}
    onsave={saveSnippet}
    oncancel={() => { showSnippetDialog = false; editingItem = null; }}
  />
{/if}
