<script>
  import { onMount } from "svelte";

  let { enabled = false, onToggle = null, onOpenModal = null } = $props();
  let localEnabled = $state(false);
  const labelText = "DeepCode: Select local codebase and execute tools";

  $effect(() => {
    localEnabled = Boolean(enabled);
  });

  onMount(() => {
    const handler = (event) => {
      const nextEnabled = Boolean(event.detail?.enabled);
      localEnabled = nextEnabled;
    };
    window.addEventListener("bds:deep-code-toggle-state", handler);
    return () => {
      window.removeEventListener("bds:deep-code-toggle-state", handler);
    };
  });

  function handleToggle(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    const nextEnabled = !localEnabled;
    localEnabled = nextEnabled;
    if (onToggle) onToggle(nextEnabled);
    if (nextEnabled && onOpenModal) {
      onOpenModal();
    }
  }

  function handleKeydown(event) {
    if (event.key !== "Enter" && event.key !== " ") return;
    handleToggle(event);
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  tabindex="0"
  aria-pressed={localEnabled}
  aria-label={labelText}
  class="bds-deep-code-toggle f79352dc ds-toggle-button ds-toggle-button--m"
  class:ds-toggle-button--selected={localEnabled}
  class:bds-deep-code-toggle--selected={localEnabled}
  style="transform: translateZ(0px); margin-left: 4px;"
  onclick={handleToggle}
  onkeydown={handleKeydown}
  data-testid="deep-code-toggle"
>
  <div class="ds-toggle-button__icon">
    <div class="ds-icon" style="font-size: inherit;">
      <svg
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          d="M5.75 4.75L2.5 8L5.75 11.25M10.25 4.75L13.5 8L10.25 11.25M8.5 3.5L7.5 12.5"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </div>
  </div>
  <span class="_6dbc175">DeepCode</span>
  <div class="ds-focus-ring" style="--dsl-focus-ring-offset: -1px;"></div>
</div>

<style>
  :global(.bds-deep-code-mount) {
    display: contents !important;
  }

  .bds-deep-code-toggle {
    position: relative;
    display: inline-flex;
    align-items: center;
    flex: 0 0 auto;
    cursor: pointer;
    user-select: none;
  }

  .bds-deep-code-toggle:focus,
  .bds-deep-code-toggle:focus-visible {
    outline: none !important;
  }

  .bds-deep-code-toggle :global(svg) {
    display: block;
  }

  @media (max-width: 560px) {
    .bds-deep-code-toggle span._6dbc175 {
      display: none !important;
    }
  }
</style>
