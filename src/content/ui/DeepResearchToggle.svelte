<script>
  import { onMount } from "svelte";

  let { enabled = false, onToggle = null } = $props();
  let localEnabled = $state(false);
  let buttonRef = $state(null);

  $effect(() => {
    localEnabled = Boolean(enabled);
  });

  onMount(() => {
    const handler = (event) => {
      localEnabled = Boolean(event.detail?.enabled);
    };
    window.addEventListener("bds:deep-research-toggle-state", handler);

    const cleanupNativeSync = syncNativePillMetrics();
    return () => {
      window.removeEventListener("bds:deep-research-toggle-state", handler);
      cleanupNativeSync?.();
    };
  });

  function handleToggle() {
    localEnabled = !localEnabled;
    if (onToggle) onToggle(localEnabled);
  }

  function syncNativePillMetrics() {
    if (!buttonRef || typeof getComputedStyle !== "function") {
      return null;
    }

    let resizeObserver = null;
    let mutationObserver = null;
    let rafId = 0;
    const requestFrame = typeof requestAnimationFrame === "function"
      ? requestAnimationFrame
      : (callback) => window.setTimeout(callback, 16);
    const cancelFrame = typeof cancelAnimationFrame === "function"
      ? cancelAnimationFrame
      : window.clearTimeout;
    const mount = buttonRef.closest(".bds-deep-research-mount");
    const row = mount?.parentElement || null;

    const schedule = () => {
      if (rafId) return;
      rafId = requestFrame(() => {
        rafId = 0;
        applyNativePillMetrics();
      });
    };

    const nativePill = findNativeDeepThinkPill();
    if (nativePill && typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(schedule);
      resizeObserver.observe(nativePill);
    }

    if (row && typeof MutationObserver !== "undefined") {
      mutationObserver = new MutationObserver((mutations) => {
        const onlyOwnChanges = mutations.every((mutation) =>
          mutation.target?.closest?.(".bds-deep-research-mount") === mount
        );
        if (!onlyOwnChanges) schedule();
      });
      mutationObserver.observe(row, {
        attributes: true,
        childList: true,
        subtree: true,
        attributeFilter: ["class", "style"],
      });
    }

    schedule();
    window.setTimeout(schedule, 250);

    return () => {
      if (rafId) cancelFrame(rafId);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
    };
  }

  function applyNativePillMetrics() {
    const nativePill = findNativeDeepThinkPill();
    if (!buttonRef || !nativePill) return;

    const styles = getComputedStyle(nativePill);
    const rect = nativePill.getBoundingClientRect();
    const height = rect.height > 0 ? `${rect.height}px` : styles.height;
    const mount = buttonRef.closest(".bds-deep-research-mount");

    setMetric(buttonRef, "--bds-drt-height", height);
    setMetric(buttonRef, "--bds-drt-padding", [
      styles.paddingTop,
      styles.paddingRight,
      styles.paddingBottom,
      styles.paddingLeft,
    ].join(" "));
    setMetric(buttonRef, "--bds-drt-border-radius", styles.borderRadius);
    setMetric(buttonRef, "--bds-drt-font-size", styles.fontSize);
    setMetric(buttonRef, "--bds-drt-font-weight", styles.fontWeight);
    setMetric(buttonRef, "--bds-drt-font-family", styles.fontFamily);
    setMetric(buttonRef, "--bds-drt-line-height", styles.lineHeight);
    setMetric(buttonRef, "--bds-drt-gap", styles.columnGap || styles.gap);

    const nativeIcon = nativePill.querySelector?.("svg");
    if (nativeIcon) {
      const iconStyles = getComputedStyle(nativeIcon);
      const iconRect = nativeIcon.getBoundingClientRect();
      const iconWidth = iconRect.width > 0 ? `${iconRect.width}px` : iconStyles.width;
      const iconHeight = iconRect.height > 0 ? `${iconRect.height}px` : iconStyles.height;
      setMetric(buttonRef, "--bds-drt-icon-width", iconWidth);
      setMetric(buttonRef, "--bds-drt-icon-height", iconHeight);
    }

    if (mount) {
      setMetric(mount, "--bds-drt-height", height);
    }
  }

  function setMetric(element, name, value) {
    const safeValue = String(value || "").trim();
    if (!safeValue || safeValue === "auto" || safeValue === "normal") return;
    element.style.setProperty(name, safeValue);
  }

  function findNativeDeepThinkPill() {
    const mount = buttonRef?.closest(".bds-deep-research-mount");
    const row = mount?.parentElement;
    if (!mount || !row) return null;

    const nearby = [
      mount.nextElementSibling,
      mount.previousElementSibling,
      ...Array.from(row.querySelectorAll('button, [role="button"], [tabindex], [aria-label], [title]')),
    ];

    for (const candidate of nearby) {
      const match = findDeepThinkCandidate(candidate, mount);
      if (match) return match;
    }

    return null;
  }

  function findDeepThinkCandidate(candidate, mount) {
    if (!candidate || candidate.closest?.(".bds-deep-research-mount") === mount) {
      return null;
    }

    if (isDeepThinkControl(candidate)) {
      return candidate;
    }

    return Array.from(candidate.querySelectorAll?.('button, [role="button"], [tabindex], [aria-label], [title]') || [])
      .find((control) => isDeepThinkControl(control)) || null;
  }

  function isDeepThinkControl(control) {
    if (!control || control.closest?.("#bds-root")) return false;
    const label = `${control.textContent || ""} ${control.getAttribute?.("aria-label") || ""} ${control.getAttribute?.("title") || ""}`
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    return label.includes("deepthink") || label.includes("deep think");
  }
</script>

<button
  bind:this={buttonRef}
  type="button"
  class="bds-deep-research-toggle"
  class:active={localEnabled}
  onclick={handleToggle}
  aria-label={localEnabled ? "Disable Deep Research Mode" : "Enable Deep Research Mode"}
  aria-pressed={localEnabled}
  title={localEnabled ? "Deep Research Mode ON" : "Enable Deep Research Mode"}
  data-testid="deep-research-toggle"
>
  <svg
    class="bds-drt-icon"
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <circle cx="10.5" cy="10.5" r="5.5"></circle>
    <path d="m15 15 4.5 4.5"></path>
    <path d="M18 3v4"></path>
    <path d="M20 5h-4"></path>
    <path d="M5 19v2"></path>
    <path d="M6 20H4"></path>
  </svg>
  <span class="bds-drt-label">DeepResearch</span>
</button>

<style>
  :global(.bds-deep-research-mount) {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    flex: 0 0 auto !important;
    width: auto !important;
    height: var(--bds-drt-height, 36px) !important;
    margin: 0 !important;
  }

  .bds-deep-research-toggle {
    -webkit-appearance: none !important;
    appearance: none !important;
    box-sizing: border-box !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: var(--bds-drt-gap, 6px) !important;
    flex: 0 0 auto !important;
    width: auto !important;
    min-width: 0 !important;
    max-width: none !important;
    height: var(--bds-drt-height, 36px) !important;
    min-height: var(--bds-drt-height, 36px) !important;
    max-height: var(--bds-drt-height, 36px) !important;
    margin: 0 !important;
    padding: var(--bds-drt-padding, 0 15px) !important;
    border: 1px solid rgba(255, 255, 255, 0.12) !important;
    border-radius: var(--bds-drt-border-radius, 999px) !important;
    background: rgba(255, 255, 255, 0.035) !important;
    color: var(--bds-text-primary, #f2f2f2) !important;
    box-shadow: none !important;
    cursor: pointer !important;
    line-height: var(--bds-drt-line-height, 1) !important;
    font-family: var(--bds-drt-font-family, inherit) !important;
    font-size: var(--bds-drt-font-size, 14px) !important;
    font-weight: var(--bds-drt-font-weight, 600) !important;
    letter-spacing: 0 !important;
    text-align: center !important;
    white-space: nowrap !important;
    overflow: hidden !important;
    transition:
      background-color var(--bds-transition, 0.18s ease),
      border-color var(--bds-transition, 0.18s ease),
      color var(--bds-transition, 0.18s ease),
      transform 0.1s ease;
  }

  .bds-deep-research-toggle:hover {
    background-color: rgba(255, 255, 255, 0.055) !important;
    border-color: rgba(255, 255, 255, 0.18) !important;
  }

  .bds-deep-research-toggle.active {
    background-color: var(--bds-accent-glow, rgba(79, 140, 255, 0.14)) !important;
    border-color: var(--bds-accent, #4f8cff) !important;
    color: var(--bds-accent, #4f8cff) !important;
  }

  .bds-deep-research-toggle.active:hover {
    background-color: var(--bds-accent-glow, rgba(79, 140, 255, 0.22)) !important;
    border-color: var(--bds-accent, #4f8cff) !important;
  }

  .bds-deep-research-toggle:active {
    transform: scale(0.95);
  }

  .bds-drt-icon {
    width: var(--bds-drt-icon-width, 18px);
    height: var(--bds-drt-icon-height, 18px);
    flex: 0 0 auto;
    pointer-events: none;
  }

  .bds-drt-label {
    display: inline-block;
    min-width: 0;
    line-height: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
