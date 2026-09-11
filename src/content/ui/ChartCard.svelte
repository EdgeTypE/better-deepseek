<script>
  import { onMount, onDestroy, untrack } from "svelte";
  import vegaEmbed from "vega-embed";
  import { expressionInterpreter } from "vega-interpreter";
  import { parseLooseJson } from "../parser/json-repair.js";
  import { triggerBlobDownload, triggerTextDownload } from "../../lib/utils/download.js";
  import { t } from "../../lib/i18n.svelte.js";

  /**
   * @type {{
   *   content: string,
   *   attrs?: Record<string, string>
   * }}
   */
  let { content = "", attrs = {} } = $props();

  let containerEl = $state(null);
  let renderError = $state("");
  let showCode = $state(false);
  let showDownloadMenu = $state(false);
  let copyFeedback = $state(false);
  let isExpanded = $state(true);
  let isDarkTheme = $state(false);

  // Internal non-reactive references (never $state to avoid reactive loops)
  let view = null;
  let resizeObserver = null;
  let themeObserver = null;
  let lastRenderedContent = "";
  let renderSeq = 0;
  let isDestroyed = false;

  // Extract parsed specification and metadata
  let parsedResult = $derived(parseLooseJson(content));
  let specObject = $derived(
    parsedResult?.value && typeof parsedResult.value === "object"
      ? parsedResult.value
      : null
  );

  let chartTitle = $derived.by(() => {
    if (attrs.title) return attrs.title;
    if (specObject?.title) {
      if (typeof specObject.title === "string") return specObject.title;
      if (typeof specObject.title.text === "string") return specObject.title.text;
    }
    return t("chartCard.defaultTitle") || "Interactive Chart";
  });

  let chartSubtitle = $derived.by(() => {
    if (attrs.subtitle) return attrs.subtitle;
    if (specObject?.title && typeof specObject.title === "object" && specObject.title.subtitle) {
      return String(specObject.title.subtitle);
    }
    return "";
  });

  let formattedCode = $derived.by(() => {
    if (specObject) {
      try {
        const displayObj = JSON.parse(JSON.stringify(specObject));
        if (typeof displayObj.$schema === "string") {
          const mdMatch = displayObj.$schema.match(/\((https?:\/\/[^\s)]+)\)/);
          if (mdMatch) {
            displayObj.$schema = mdMatch[1].trim();
          }
        }
        return JSON.stringify(displayObj, null, 2);
      } catch {
        return content;
      }
    }
    return content;
  });

  function detectTheme() {
    if (typeof document === "undefined") return false;
    return (
      document.documentElement?.classList.contains("dark") ||
      document.body?.classList.contains("dark") ||
      (typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches)
    );
  }

  function getVegaConfig(isDark) {
    if (isDark) {
      return {
        background: "transparent",
        axis: {
          domainColor: "#3f3f46",
          gridColor: "#27272a",
          gridDash: [3, 3],
          tickColor: "#3f3f46",
          labelColor: "#a1a1aa",
          titleColor: "#e4e4e7",
          labelFont: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          titleFont: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          labelFontSize: 11,
          titleFontSize: 12,
          titleFontWeight: 500,
        },
        legend: {
          labelColor: "#e4e4e7",
          titleColor: "#f4f4f5",
          labelFont: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          titleFont: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          labelFontSize: 11,
          titleFontSize: 12,
          titleFontWeight: 600,
          orient: "top",
          direction: "horizontal",
          padding: 8,
        },
        range: {
          category: [
            "#8b5cf6",
            "#10b981",
            "#3b82f6",
            "#f97316",
            "#ec4899",
            "#06b6d4",
            "#eab308",
            "#a855f7",
          ],
        },
        view: {
          stroke: "transparent",
        },
      };
    }

    return {
      background: "transparent",
      axis: {
        domainColor: "#e4e4e7",
        gridColor: "#f4f4f5",
        gridDash: [3, 3],
        tickColor: "#e4e4e7",
        labelColor: "#71717a",
        titleColor: "#18181b",
        labelFont: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        titleFont: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        labelFontSize: 11,
        titleFontSize: 12,
        titleFontWeight: 500,
      },
      legend: {
        labelColor: "#27272a",
        titleColor: "#09090b",
        labelFont: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        titleFont: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        labelFontSize: 11,
        titleFontSize: 12,
        titleFontWeight: 600,
        orient: "top",
        direction: "horizontal",
        padding: 8,
      },
      range: {
        category: [
          "#7c3aed",
          "#10b981",
          "#2563eb",
          "#ea580c",
          "#db2777",
          "#0891b2",
          "#ca8a04",
          "#9333ea",
        ],
      },
      view: {
        stroke: "transparent",
      },
    };
  }

  async function renderChart() {
    if (!containerEl || !specObject || isDestroyed) return;
    const seq = ++renderSeq;

    try {
      renderError = "";
      if (view) {
        try {
          view.finalize();
        } catch {
          // ignore
        }
        view = null;
      }

      containerEl.innerHTML = "";

      // Clone spec and adapt for seamless card display
      const specCopy = JSON.parse(JSON.stringify(specObject));

      // Remove internal title so the card header handles it cleanly
      delete specCopy.title;

      // Sanitize $schema to prevent vega-schema-url-parser crashes
      // (vega-schema-url-parser does regex.exec(url)!.slice(1,3) which throws TypeError if url format deviates)
      if (specCopy.$schema) {
        if (typeof specCopy.$schema === "string") {
          // If it was mangled as markdown link [url](url), extract pure URL
          const mdMatch = specCopy.$schema.match(/\((https?:\/\/[^\s)]+)\)/);
          if (mdMatch) {
            specCopy.$schema = mdMatch[1].trim();
          } else {
            specCopy.$schema = specCopy.$schema.trim();
          }

          // If it does not strictly match the expected Vega / Vega-Lite schema regex,
          // remove it so vegaEmbed reliably falls back to mode: "vega-lite"
          if (!/schema\/([\w-]+)\/([\w\.\-]+)\.json$/i.test(specCopy.$schema)) {
            delete specCopy.$schema;
          }
        } else {
          delete specCopy.$schema;
        }
      }

      // Ensure responsive width
      if (!specCopy.width || specCopy.width === "container") {
        specCopy.width = "container";
      }

      isDarkTheme = detectTheme();
      const themeConfig = getVegaConfig(isDarkTheme);

      // Embed chart with CSP-compliant AST interpreter (no unsafe-eval)
      const embedResult = await vegaEmbed(containerEl, specCopy, {
        mode: "vega-lite",
        renderer: "svg",
        actions: false,
        ast: true,
        expr: expressionInterpreter,
        config: themeConfig,
        tooltip: {
          theme: isDarkTheme ? "dark" : "light",
        },
        patch: (vgSpec) => {
          // Guard against vgSpec.$schema causing slice error in vega-embed
          if (vgSpec.$schema && !/schema\/([\w-]+)\/([\w\.\-]+)\.json$/i.test(vgSpec.$schema)) {
            delete vgSpec.$schema;
          }
          return vgSpec;
        },
      });

      if (seq !== renderSeq || isDestroyed) {
        try {
          embedResult.view?.finalize();
        } catch {
          // ignore
        }
        return;
      }

      view = embedResult.view;
      lastRenderedContent = content;
    } catch (err) {
      if (seq === renderSeq && !isDestroyed) {
        console.warn("[BDS:chart] Render warning:", err);
        renderError = err?.message || String(err);
      }
    }
  }

  $effect(() => {
    // Track strictly content and containerEl - untrack renderChart to prevent reactive loop
    const currentContent = content;
    const targetEl = containerEl;

    if (currentContent && targetEl && specObject) {
      untrack(() => {
        if (currentContent !== lastRenderedContent) {
          renderChart();
        }
      });
    }
  });

  onMount(() => {
    isDarkTheme = detectTheme();

    // Observe theme class changes with debounce
    let themeTimer = null;
    themeObserver = new MutationObserver(() => {
      clearTimeout(themeTimer);
      themeTimer = setTimeout(() => {
        if (isDestroyed) return;
        const currentDark = detectTheme();
        if (currentDark !== isDarkTheme) {
          isDarkTheme = currentDark;
          lastRenderedContent = ""; // force re-render for new theme
          renderChart();
        }
      }, 200);
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    });

    // Observe size on parent card wrapper with debounce and threshold to prevent feedback loops
    let lastWidth = 0;
    let resizeTimer = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;
        const width = Math.round(entry.contentRect.width);
        if (width > 50 && Math.abs(width - lastWidth) > 10) {
          lastWidth = width;
          clearTimeout(resizeTimer);
          resizeTimer = setTimeout(() => {
            if (!isDestroyed && view && typeof view.resize === "function") {
              view.resize().runAsync().catch(() => {});
            }
          }, 150);
        }
      });

      const observeTarget = containerEl?.parentElement || containerEl;
      if (observeTarget) {
        resizeObserver.observe(observeTarget);
      }
    }
  });

  onDestroy(() => {
    isDestroyed = true;
    renderSeq++;
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    if (themeObserver) {
      themeObserver.disconnect();
      themeObserver = null;
    }
    if (view) {
      try {
        view.finalize();
      } catch {
        // ignore
      }
      view = null;
    }
  });

  function getSafeFileName(ext) {
    const base = chartTitle.replace(/[^a-zA-Z0-9_\u0080-\uffff-]/g, "_").trim() || "chart";
    return `${base}.${ext}`;
  }

  async function downloadPng() {
    showDownloadMenu = false;
    if (!view) return;
    try {
      const dataUrl = await view.toImageURL("png", 2);
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      triggerBlobDownload(blob, getSafeFileName("png"));
    } catch (err) {
      console.error("[BDS:chart] PNG export error:", err);
    }
  }

  async function downloadSvg() {
    showDownloadMenu = false;
    if (!view) return;
    try {
      const svgString = await view.toSVG();
      const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
      triggerBlobDownload(blob, getSafeFileName("svg"));
    } catch (err) {
      console.error("[BDS:chart] SVG export error:", err);
    }
  }

  function downloadJson() {
    showDownloadMenu = false;
    triggerTextDownload(formattedCode, getSafeFileName("json"));
  }

  function toggleCode() {
    showCode = !showCode;
  }

  async function copySpec() {
    try {
      await navigator.clipboard.writeText(formattedCode);
      copyFeedback = true;
      setTimeout(() => {
        copyFeedback = false;
      }, 2000);
    } catch {
      // fallback
    }
  }

  function toggleExpand() {
    isExpanded = !isExpanded;
    // Re-adjust Vega viewport when expanding/collapsing
    setTimeout(() => {
      if (view && typeof view.resize === "function") {
        view.resize().runAsync().catch(() => {});
      }
    }, 50);
  }
</script>

<div class="bds-chart-card" class:bds-chart-collapsed={!isExpanded} class:dark={isDarkTheme}>
  <!-- HEADER: Title, Subtitle, Action Buttons -->
  <div class="bds-chart-header">
    <div class="bds-chart-title-group">
      <h3 class="bds-chart-title">{chartTitle}</h3>
      {#if chartSubtitle}
        <p class="bds-chart-subtitle">{chartSubtitle}</p>
      {/if}
    </div>

    <div class="bds-chart-actions">
      <!-- Download Button with Dropdown -->
      <div class="bds-chart-dropdown-wrapper">
        <button
          type="button"
          class="bds-chart-btn"
          title={t("chartCard.downloadPng") || "Download Chart"}
          onclick={() => (showDownloadMenu = !showDownloadMenu)}
          aria-label="Download chart"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
        </button>

        {#if showDownloadMenu}
          <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
          <div class="bds-chart-menu-backdrop" onclick={() => (showDownloadMenu = false)} role="presentation"></div>
          <div class="bds-chart-menu">
            <button type="button" class="bds-chart-menu-item" onclick={downloadPng}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
              <span>{t("chartCard.downloadPng") || "Download PNG Image"}</span>
            </button>
            <button type="button" class="bds-chart-menu-item" onclick={downloadSvg}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
              <span>{t("chartCard.downloadSvg") || "Download Vector SVG"}</span>
            </button>
            <button type="button" class="bds-chart-menu-item" onclick={downloadJson}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              <span>{t("chartCard.downloadJson") || "Download Vega-Lite Spec (JSON)"}</span>
            </button>
          </div>
        {/if}
      </div>

      <!-- Code View Toggle -->
      <button
        type="button"
        class="bds-chart-btn"
        class:active={showCode}
        title={showCode ? (t("chartCard.hideCode") || "Hide Spec") : (t("chartCard.viewCode") || "View Spec")}
        onclick={toggleCode}
        aria-label="Toggle code specification"
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="16 18 22 12 16 6"/>
          <polyline points="8 6 2 12 8 18"/>
        </svg>
      </button>
    </div>
  </div>

  <!-- CODE SPECIFICATION DRAWER -->
  {#if showCode}
    <div class="bds-chart-code-drawer">
      <div class="bds-chart-code-header">
        <span class="bds-chart-code-label">Vega-Lite JSON Specification</span>
        <button type="button" class="bds-chart-copy-btn" onclick={copySpec}>
          {#if copyFeedback}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            <span style="color: #10b981;">{t("chartCard.copied") || "Copied!"}</span>
          {:else}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            <span>{t("chartCard.copySpec") || "Copy JSON"}</span>
          {/if}
        </button>
      </div>
      <pre class="bds-chart-code-content"><code>{formattedCode}</code></pre>
    </div>
  {/if}

  <!-- CHART BODY -->
  <div class="bds-chart-body" class:collapsed={!isExpanded}>
    {#if renderError}
      <div class="bds-chart-error">
        <div class="bds-chart-error-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        </div>
        <div class="bds-chart-error-text">
          <strong>{t("chartCard.renderError") || "Could not render chart"}:</strong>
          <span>{renderError}</span>
        </div>
      </div>
    {/if}

    <div
      bind:this={containerEl}
      class="bds-vega-container"
      class:hidden={Boolean(renderError)}
    ></div>
  </div>

  <!-- BOTTOM EXPAND/COLLAPSE CHEVRON -->
  <div class="bds-chart-footer">
    <button
      type="button"
      class="bds-chart-expand-btn"
      title={isExpanded ? (t("chartCard.collapse") || "Collapse chart") : (t("chartCard.expand") || "Expand chart")}
      onclick={toggleExpand}
      aria-label="Toggle chart expansion"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        style="transform: rotate({isExpanded ? '180deg' : '0deg'}); transition: transform 0.2s ease;"
      >
        <polyline points="6 9 12 15 18 9"/>
      </svg>
    </button>
  </div>
</div>

<style>
  .bds-chart-card {
    position: relative;
    margin: 16px 0;
    padding: 20px 24px 14px 24px;
    background: var(--bds-bg-panel, #ffffff);
    border: 1px solid var(--bds-border, #e5e7eb);
    border-radius: 16px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.04), 0 1px 3px rgba(0, 0, 0, 0.02);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    color: var(--bds-text-primary, #111827);
    transition: box-shadow 0.2s ease, border-color 0.2s ease;
    overflow: hidden;
  }

  /* Dark Theme Card Matching Reference Screenshots */
  :global(html.dark) .bds-chart-card,
  :global(body.dark) .bds-chart-card,
  .bds-chart-card.dark {
    background: #111113;
    border: 1px solid #27272a;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.45);
    color: #f4f4f5;
  }

  /* Header */
  .bds-chart-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 16px;
  }

  .bds-chart-title-group {
    flex: 1;
    min-width: 0;
  }

  .bds-chart-title {
    margin: 0;
    font-size: 1.15rem;
    font-weight: 600;
    line-height: 1.35;
    letter-spacing: -0.01em;
    color: inherit;
  }

  .bds-chart-subtitle {
    margin: 4px 0 0 0;
    font-size: 0.85rem;
    line-height: 1.45;
    color: var(--bds-text-secondary, #6b7280);
  }

  :global(html.dark) .bds-chart-subtitle,
  :global(body.dark) .bds-chart-subtitle,
  .bds-chart-card.dark .bds-chart-subtitle {
    color: #a1a1aa;
  }

  /* Header Actions */
  .bds-chart-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .bds-chart-dropdown-wrapper {
    position: relative;
  }

  .bds-chart-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 8px;
    color: var(--bds-text-secondary, #6b7280);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .bds-chart-btn:hover {
    background: var(--bds-bg-hover, rgba(0, 0, 0, 0.05));
    color: var(--bds-text-primary, #111827);
  }

  .bds-chart-btn.active {
    background: var(--bds-accent-glow, rgba(77, 107, 254, 0.12));
    color: var(--bds-accent, #4d6bfe);
  }

  :global(html.dark) .bds-chart-btn,
  :global(body.dark) .bds-chart-btn,
  .bds-chart-card.dark .bds-chart-btn {
    color: #a1a1aa;
  }

  :global(html.dark) .bds-chart-btn:hover,
  :global(body.dark) .bds-chart-btn:hover,
  .bds-chart-card.dark .bds-chart-btn:hover {
    background: #27272a;
    color: #f4f4f5;
  }

  /* Download Dropdown Menu */
  .bds-chart-menu-backdrop {
    position: fixed;
    inset: 0;
    z-index: 99;
  }

  .bds-chart-menu {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    z-index: 100;
    min-width: 210px;
    background: var(--bds-bg-panel, #ffffff);
    border: 1px solid var(--bds-border, #e5e7eb);
    border-radius: 10px;
    padding: 6px;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
    display: flex;
    flex-direction: column;
    gap: 2px;
    animation: bdsMenuIn 0.15s ease-out;
  }

  :global(html.dark) .bds-chart-menu,
  :global(body.dark) .bds-chart-menu,
  .bds-chart-card.dark .bds-chart-menu {
    background: #1e1f23;
    border-color: #3f3f46;
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.5);
  }

  @keyframes bdsMenuIn {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .bds-chart-menu-item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 8px 12px;
    background: transparent;
    border: none;
    border-radius: 6px;
    font-size: 13px;
    color: inherit;
    text-align: left;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .bds-chart-menu-item:hover {
    background: var(--bds-bg-hover, rgba(0, 0, 0, 0.05));
  }

  :global(html.dark) .bds-chart-menu-item:hover,
  :global(body.dark) .bds-chart-menu-item:hover,
  .bds-chart-card.dark .bds-chart-menu-item:hover {
    background: rgba(255, 255, 255, 0.08);
  }

  /* Code Specification Drawer */
  .bds-chart-code-drawer {
    margin-bottom: 16px;
    background: #09090b;
    border: 1px solid #27272a;
    border-radius: 10px;
    overflow: hidden;
  }

  .bds-chart-code-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    background: #141416;
    border-bottom: 1px solid #27272a;
  }

  .bds-chart-code-label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #71717a;
  }

  .bds-chart-copy-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    background: transparent;
    border: 1px solid #27272a;
    border-radius: 6px;
    font-size: 11px;
    color: #a1a1aa;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .bds-chart-copy-btn:hover {
    background: #27272a;
    color: #f4f4f5;
  }

  .bds-chart-code-content {
    margin: 0;
    padding: 12px 16px;
    max-height: 240px;
    overflow-y: auto;
    font-family: "JetBrains Mono", Consolas, Monaco, "Courier New", monospace;
    font-size: 12px;
    line-height: 1.5;
    color: #e4e4e7;
    background: transparent;
  }

  /* Chart Body */
  .bds-chart-body {
    position: relative;
    width: 100%;
    min-height: 280px;
    max-height: 520px;
    transition: max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease;
    overflow: hidden;
  }

  .bds-chart-body.collapsed {
    max-height: 180px;
  }

  .bds-vega-container {
    width: 100%;
    min-height: 280px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .bds-vega-container.hidden {
    display: none;
  }

  /* Vega SVG Responsive Wrapper */
  .bds-vega-container :global(.vega-embed) {
    width: 100%;
    display: flex;
    justify-content: center;
    box-sizing: border-box;
  }

  .bds-vega-container :global(.vega-embed summary) {
    display: none !important;
  }

  .bds-vega-container :global(svg) {
    max-width: 100%;
    height: auto;
    overflow: visible;
  }

  /* Error State */
  .bds-chart-error {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 14px 16px;
    background: rgba(239, 68, 68, 0.08);
    border: 1px solid rgba(239, 68, 68, 0.25);
    border-radius: 10px;
    font-size: 13px;
    color: #ef4444;
  }

  .bds-chart-error-icon {
    flex-shrink: 0;
    margin-top: 1px;
  }

  .bds-chart-error-text {
    display: flex;
    flex-direction: column;
    gap: 4px;
    word-break: break-word;
  }

  /* Bottom Expand/Collapse Chevron */
  .bds-chart-footer {
    display: flex;
    justify-content: center;
    margin-top: 8px;
    padding-top: 4px;
  }

  .bds-chart-expand-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    background: var(--bds-bg-elevated, rgba(0, 0, 0, 0.03));
    border: 1px solid var(--bds-border, #e5e7eb);
    border-radius: 50%;
    color: var(--bds-text-secondary, #6b7280);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .bds-chart-expand-btn:hover {
    background: var(--bds-bg-hover, rgba(0, 0, 0, 0.08));
    color: var(--bds-text-primary, #111827);
    border-color: var(--bds-border-hover, #d1d5db);
  }

  :global(html.dark) .bds-chart-expand-btn,
  :global(body.dark) .bds-chart-expand-btn,
  .bds-chart-card.dark .bds-chart-expand-btn {
    background: #18181b;
    border-color: #27272a;
    color: #a1a1aa;
  }

  :global(html.dark) .bds-chart-expand-btn:hover,
  :global(body.dark) .bds-chart-expand-btn:hover,
  .bds-chart-card.dark .bds-chart-expand-btn:hover {
    background: #27272a;
    color: #f4f4f5;
    border-color: #3f3f46;
  }

  /* ── Sleek Vega Tooltip Customization Matching Image 4 ── */
  :global(#vg-tooltip-element.vg-tooltip) {
    padding: 8px 12px !important;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
    font-size: 12px !important;
    border-radius: 8px !important;
    border: 1px solid #3f3f46 !important;
    background-color: #18181b !important;
    color: #f4f4f5 !important;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5) !important;
    z-index: 100000 !important;
  }

  :global(#vg-tooltip-element.vg-tooltip table) {
    border-spacing: 0 !important;
  }

  :global(#vg-tooltip-element.vg-tooltip td.key) {
    color: #a1a1aa !important;
    font-weight: 500 !important;
    padding-right: 10px !important;
    padding-bottom: 2px !important;
  }

  :global(#vg-tooltip-element.vg-tooltip td.value) {
    color: #f4f4f5 !important;
    font-weight: 600 !important;
    padding-bottom: 2px !important;
  }
</style>
