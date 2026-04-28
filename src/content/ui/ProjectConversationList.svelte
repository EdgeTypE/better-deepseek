<script>
  import appState from "../state.js";
  import {
    getConversationsForProject,
    deassociateConversation,
    getCurrentConversationId,
  } from "../project-manager.js";

  let conversations = $state([]);

  export function refresh() {
    if (!appState.activeProjectId) {
      conversations = [];
      return;
    }
    conversations = getConversationsForProject(appState.activeProjectId);
  }

  $effect(() => {
    refresh();
  });

  function formatDate(ts) {
    return new Date(ts).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  async function remove(conversationId) {
    await deassociateConversation(conversationId);
    refresh();
  }

  function navigate(conversationId) {
    window.location.href = `/a/chat/${conversationId}`;
  }

  let currentId = $derived(getCurrentConversationId());
</script>

<div class="bds-subsection-title">Linked Conversations</div>

{#if conversations.length === 0}
  <p class="bds-empty" style="font-size: 11px;">
    No conversations yet. Start a new chat with this project active.
  </p>
{:else}
  <div class="bds-list">
    {#each conversations as conv (conv.conversationId)}
      <div
        class="bds-conv-item"
        class:bds-conv-current={conv.conversationId === currentId}
      >
        <button
          type="button"
          class="bds-conv-link"
          onclick={() => navigate(conv.conversationId)}
        >
          <span class="bds-conv-title">{conv.title}</span>
          <span class="bds-conv-date">{formatDate(conv.createdAt)}</span>
        </button>
        <button
          type="button"
          class="bds-btn-danger"
          style="font-size: 10px; padding: 2px 6px;"
          onclick={() => remove(conv.conversationId)}
          aria-label="Remove conversation"
        >
          ✕
        </button>
      </div>
    {/each}
  </div>
{/if}

<style>
  .bds-subsection-title {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    opacity: 0.5;
    margin: 10px 0 4px;
  }
  .bds-conv-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 0;
    border-bottom: 1px solid var(--bds-border, rgba(0,0,0,0.07));
  }
  .bds-conv-item:last-child {
    border-bottom: none;
  }
  .bds-conv-item.bds-conv-current .bds-conv-title {
    font-weight: 600;
    color: var(--bds-accent, #4f6ef7);
  }
  .bds-conv-link {
    flex: 1;
    min-width: 0;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    text-align: left;
    color: inherit;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .bds-conv-link:hover .bds-conv-title {
    text-decoration: underline;
  }
  .bds-conv-title {
    font-size: 12px;
    text-overflow: ellipsis;
    overflow: hidden;
    white-space: nowrap;
    display: block;
  }
  .bds-conv-date {
    font-size: 10px;
    opacity: 0.5;
  }
</style>
