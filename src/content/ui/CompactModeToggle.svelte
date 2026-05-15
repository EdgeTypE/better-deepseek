<script>
  import { onMount } from "svelte";

  let isExpanded = $state(false);
  let isVisible = $state(false);
  let textarea = $state(null);
  let container = $state(null);

  const THRESHOLD_CHARS = 100;
  const THRESHOLD_LINES = 3;

  function findTextarea() {
    return document.querySelector("textarea#chat-input") || 
           document.querySelector(".ds-textarea textarea") || 
           document.querySelector("textarea");
  }

  function checkContent() {
    if (!textarea) return;
    const text = textarea.value;
    const lines = text.split("\n").length;
    isVisible = text.length > THRESHOLD_CHARS || lines > THRESHOLD_LINES;
    
    // If it's expanded but content becomes short, keep it expanded? 
    // Usually, users want to minimize it manually.
  }

  function toggle() {
    isExpanded = !isExpanded;
    if (container) {
      if (isExpanded) {
        container.classList.add("bds-prompt-expanded");
      } else {
        container.classList.remove("bds-prompt-expanded");
      }
    }
  }

  onMount(() => {
    const interval = setInterval(() => {
      if (!textarea || !document.contains(textarea)) {
        textarea = findTextarea();
        if (textarea) {
          textarea.addEventListener("input", checkContent);
          
          container = textarea.closest(".ds-textarea-wrapper") || 
                      textarea.closest("._75e1990") || 
                      textarea.closest("._6f68655") ||
                      textarea.closest(".ds-textarea")?.parentElement ||
                      textarea.parentElement;
          
          if (container && !container.style.position) {
            container.style.position = "relative";
          }
          checkContent();
        }
      }
    }, 1000);

    return () => {
      clearInterval(interval);
      if (textarea) {
        textarea.removeEventListener("input", checkContent);
      }
      if (container) {
        container.classList.remove("bds-prompt-expanded");
      }
    };
  });
</script>

{#if isVisible}
  <button 
    class="bds-compact-toggle {isExpanded ? 'expanded' : ''}" 
    onclick={toggle}
    aria-label={isExpanded ? "Collapse" : "Expand"}
    title={isExpanded ? "Collapse Prompt Box" : "Expand Prompt Box"}
  >
    {#if isExpanded}
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="4 14 10 14 10 20"></polyline>
        <polyline points="20 10 14 10 14 4"></polyline>
        <line x1="14" y1="10" x2="21" y2="3"></line>
        <line x1="10" y1="14" x2="3" y2="21"></line>
      </svg>
    {:else}
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="15 3 21 3 21 9"></polyline>
        <polyline points="9 21 3 21 3 15"></polyline>
        <line x1="21" y1="3" x2="14" y2="10"></line>
        <line x1="3" y1="21" x2="10" y2="14"></line>
      </svg>
    {/if}
  </button>
{/if}

<style>
  .bds-compact-toggle {
    position: absolute;
    top: 16px;
    right: 16px;
    z-index: 10000;
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bds-bg-panel);
    border: 1px solid var(--bds-border);
    border-radius: 10px;
    color: var(--bds-text-secondary);
    cursor: pointer;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    opacity: 0;
    transform: translateY(-10px);
    animation: bds-slide-in 0.3s forwards;
  }

  @keyframes bds-slide-in {
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .bds-compact-toggle:hover {
    background: var(--bds-bg-hover);
    color: var(--bds-text-primary);
    border-color: var(--bds-accent);
    transform: scale(1.05);
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.15);
  }

  .bds-compact-toggle.expanded {
    color: #fff;
    background: var(--bds-accent);
    border-color: var(--bds-accent);
  }

  .bds-compact-toggle svg {
    transition: transform 0.3s ease;
  }

  .bds-compact-toggle:active {
    transform: scale(0.95);
  }
</style>

