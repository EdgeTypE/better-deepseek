<script>
  import { onMount } from "svelte";

  let { enabled = false, onToggle = null } = $props();
  let localEnabled = $state(false);
  let toggleElement = $state(null);
  let tooltipElement = null;
  let tooltipVisible = $state(false);
  const tooltipId = `bds-deep-research-tooltip-${Math.random().toString(36).slice(2)}`;
  const tooltipText = $derived(localEnabled ? "Deep Research enabled" : "Deep Research disabled");

  $effect(() => {
    localEnabled = Boolean(enabled);
  });

  $effect(() => {
    if (!tooltipElement) return;
    syncTooltipText();
    positionTooltip();
  });

  onMount(() => {
    const handler = (event) => {
      const nextEnabled = Boolean(event.detail?.enabled);
      localEnabled = nextEnabled;
      syncTooltipText(nextEnabled);
    };
    window.addEventListener("bds:deep-research-toggle-state", handler);
    return () => {
      window.removeEventListener("bds:deep-research-toggle-state", handler);
      hideTooltip();
    };
  });

  function handleToggle(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    const nextEnabled = !localEnabled;
    localEnabled = nextEnabled;
    syncTooltipText(nextEnabled);
    if (onToggle) onToggle(nextEnabled);
  }

  function handleKeydown(event) {
    if (event.key !== "Enter" && event.key !== " ") return;
    handleToggle(event);
  }

  function ensureTooltip() {
    if (tooltipElement && document.body.contains(tooltipElement)) return tooltipElement;

    tooltipElement = document.createElement("div");
    tooltipElement.id = tooltipId;
    tooltipElement.className = "bds-deep-research-tooltip";
    tooltipElement.setAttribute("role", "tooltip");
    tooltipElement.textContent = tooltipText;
    document.body.appendChild(tooltipElement);
    return tooltipElement;
  }

  function syncTooltipText(enabledState = localEnabled) {
    if (!tooltipElement) return;
    tooltipElement.textContent = enabledState ? "Deep Research enabled" : "Deep Research disabled";
  }

  function positionTooltip() {
    if (!toggleElement || !tooltipElement) return;

    const toggleRect = toggleElement.getBoundingClientRect();
    const tooltipRect = tooltipElement.getBoundingClientRect();
    const gap = 8;
    const viewportMargin = 8;
    const tooltipHalfWidth = tooltipRect.width / 2;
    const minLeft = viewportMargin + tooltipHalfWidth;
    const maxLeft = window.innerWidth - viewportMargin - tooltipHalfWidth;
    const preferredLeft = toggleRect.left + toggleRect.width / 2;
    const left = Math.min(Math.max(preferredLeft, minLeft), maxLeft);
    const hasRoomAbove = toggleRect.top - tooltipRect.height - gap > viewportMargin;

    tooltipElement.dataset.placement = hasRoomAbove ? "top" : "bottom";
    tooltipElement.style.left = `${Math.round(left)}px`;
    tooltipElement.style.top = hasRoomAbove
      ? `${Math.round(toggleRect.top - gap)}px`
      : `${Math.round(toggleRect.bottom + gap)}px`;
  }

  function showTooltip() {
    tooltipVisible = true;
    ensureTooltip();
    positionTooltip();
    window.addEventListener("scroll", positionTooltip, true);
    window.addEventListener("resize", positionTooltip);
  }

  function hideTooltip() {
    tooltipVisible = false;
    window.removeEventListener("scroll", positionTooltip, true);
    window.removeEventListener("resize", positionTooltip);
    tooltipElement?.remove();
    tooltipElement = null;
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  bind:this={toggleElement}
  tabindex="0"
  aria-pressed={localEnabled}
  aria-label={tooltipText}
  aria-describedby={tooltipVisible ? tooltipId : undefined}
  data-tooltip={tooltipText}
  class="bds-deep-research-toggle f79352dc ds-toggle-button ds-toggle-button--m"
  class:ds-toggle-button--selected={localEnabled}
  class:bds-deep-research-toggle--selected={localEnabled}
  style="transform: translateZ(0px);"
  onclick={handleToggle}
  onkeydown={handleKeydown}
  onmouseenter={showTooltip}
  onmouseleave={hideTooltip}
  onfocus={showTooltip}
  onblur={hideTooltip}
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
    cursor: pointer;
    user-select: none;
  }

  :global(.bds-deep-research-tooltip) {
    position: fixed;
    transform: translate(-50%, -100%);
    z-index: 100000;
    pointer-events: none;
    white-space: nowrap;
    padding: 6px 10px;
    border-radius: 8px;
    background: rgba(54, 55, 61, 0.96);
    color: #f3f4f6;
    font-size: 13px;
    font-weight: 500;
    line-height: 1.2;
    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.28);
  }

  :global(.bds-deep-research-tooltip[data-placement="bottom"]) {
    transform: translateX(-50%);
  }

  .bds-deep-research-toggle:focus,
  .bds-deep-research-toggle:focus-visible {
    outline: none !important;
  }

  .bds-deep-research-toggle :global(svg) {
    display: block;
  }
</style>
