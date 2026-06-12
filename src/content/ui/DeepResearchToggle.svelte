<script>
  import { onMount } from "svelte";

  let { enabled = false, onToggle = null } = $props();
  let localEnabled = $state(false);
  const labelText = "Research online sources and consolidate findings";

  $effect(() => {
    localEnabled = Boolean(enabled);
  });

  onMount(() => {
    const handler = (event) => {
      const nextEnabled = Boolean(event.detail?.enabled);
      localEnabled = nextEnabled;
    };
    window.addEventListener("bds:deep-research-toggle-state", handler);
    return () => {
      window.removeEventListener("bds:deep-research-toggle-state", handler);
    };
  });

  function handleToggle(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    const nextEnabled = !localEnabled;
    localEnabled = nextEnabled;
    if (onToggle) onToggle(nextEnabled);
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
  class="bds-deep-research-toggle f79352dc ds-toggle-button ds-toggle-button--m"
  class:ds-toggle-button--selected={localEnabled}
  class:bds-deep-research-toggle--selected={localEnabled}
  style="transform: translateZ(0px);"
  onclick={handleToggle}
  onkeydown={handleKeydown}
  data-testid="deep-research-toggle"
>
  <div class="ds-toggle-button__icon">
    <div class="ds-icon" style="font-size: inherit;">
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          d="M6.05 1.55a4.5 4.5 0 1 0 2.84 7.99l2.03 2.03a.75.75 0 0 0 1.06-1.06L9.95 8.48A4.5 4.5 0 0 0 6.05 1.55Zm0 1.5a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z"
          fill="currentColor"
        ></path>
        <path
          d="M10.35.95v1.18h1.18a.55.55 0 0 1 0 1.1h-1.18v1.18a.55.55 0 0 1-1.1 0V3.23H8.07a.55.55 0 0 1 0-1.1h1.18V.95a.55.55 0 0 1 1.1 0ZM2.05 10.8v.86h.86a.45.45 0 1 1 0 .9h-.86v.86a.45.45 0 1 1-.9 0v-.86H.29a.45.45 0 1 1 0-.9h.86v-.86a.45.45 0 1 1 .9 0Z"
          fill="currentColor"
        ></path>
      </svg>
    </div>
  </div>
  <span class="_6dbc175">DeepResearch</span>
  <div class="ds-focus-ring" style="--dsl-focus-ring-offset: -1px;"></div>
</div>

<style>
  :global(.bds-deep-research-mount) {
    display: contents !important;
  }

  .bds-deep-research-toggle {
    position: relative;
    display: inline-flex;
    align-items: center;
    flex: 0 0 auto;
    cursor: pointer;
    user-select: none;
  }

  .bds-deep-research-toggle:focus,
  .bds-deep-research-toggle:focus-visible {
    outline: none !important;
  }

  .bds-deep-research-toggle :global(svg) {
    display: block;
  }

  @media (max-width: 560px) {
    .bds-deep-research-toggle span._6dbc175 {
      display: none !important;
    }
  }
</style>
