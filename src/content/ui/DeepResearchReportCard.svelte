<script>
  import { marked } from "marked";
  import { triggerBlobDownload } from "../../lib/utils/download.js";

  let { runId = "", markdown = "" } = $props();
  let normalizedMarkdown = $derived(stripLeadingBlankLines(markdown));

  let renderedHtml = $derived.by(() => {
    try {
      return marked(normalizedMarkdown || "");
    } catch {
      return normalizedMarkdown || "";
    }
  });

  let collapsed = $state(false);

  function toggleCollapse() {
    collapsed = !collapsed;
  }

  let reportSlug = $derived.by(() => {
    const suffix = String(runId || Date.now())
      .slice(0, 36)
      .replace(/[^a-zA-Z0-9_-]/g, "_");
    return suffix || "report";
  });

  function buildReportFileName() {
    return `deep-research-${reportSlug}.md`;
  }

  function downloadMarkdown(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    const blob = new Blob([normalizedMarkdown], { type: "text/markdown" });
    triggerBlobDownload(blob, buildReportFileName());
  }

  function buildReportPdfFileName() {
    return `deep-research-${reportSlug}.pdf`;
  }

  let printingPdf = false;

  function downloadPdf(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();

    if (printingPdf) return;
    if (!normalizedMarkdown.trim()) return;
    printingPdf = true;

    const dateStr = new Date().toLocaleDateString(undefined, {
      year: "numeric", month: "long", day: "numeric",
    });

    const printDoc = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Deep Research Report${runId ? ` (${runId.slice(0, 8)})` : ""}</title>
  <style>
    :root {
      --bg: #ffffff; --text: #111827; --text-muted: #6b7280;
      --border: #e5e7eb; --code-bg: #f3f4f6; --primary: #4f8cff;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: 12pt; line-height: 1.6; color: var(--text); background: var(--bg);
      padding: 60px 80px;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    .report-header { margin-bottom: 40px; padding-bottom: 20px; border-bottom: 2px solid var(--primary); }
    .report-header h1 { font-size: 24pt; font-weight: 700; margin-bottom: 8px; }
    .report-header .meta { font-size: 10pt; color: var(--text-muted); }
    .report-content h1 { font-size: 20pt; margin: 24px 0 12px; }
    .report-content h2 { font-size: 16pt; margin: 20px 0 10px; }
    .report-content h3 { font-size: 14pt; margin: 16px 0 8px; }
    .report-content h4 { font-size: 12pt; margin: 14px 0 6px; }
    .report-content p { margin: 0 0 12px; }
    .report-content ul, .report-content ol { margin: 0 0 12px; padding-left: 24px; }
    .report-content li { margin-bottom: 4px; }
    .report-content pre {
      background: var(--code-bg); border: 1px solid var(--border); border-radius: 6px;
      padding: 16px; font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
      font-size: 10pt; line-height: 1.5; overflow-x: auto; margin: 16px 0;
      page-break-inside: avoid;
    }
    .report-content code {
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
      font-size: 0.9em; background: var(--code-bg); padding: 2px 4px; border-radius: 3px;
    }
    .report-content pre code { background: none; padding: 0; font-size: inherit; }
    .report-content blockquote {
      border-left: 3px solid var(--primary); padding: 8px 16px; margin: 16px 0;
      background: var(--code-bg); border-radius: 0 6px 6px 0;
    }
    .report-content table { border-collapse: collapse; width: 100%; margin: 16px 0; page-break-inside: auto; }
    .report-content th, .report-content td {
      border: 1px solid var(--border); padding: 8px 12px; text-align: left; font-size: 11pt;
    }
    .report-content th { background: var(--code-bg); font-weight: 600; }
    .report-content a { color: var(--primary); text-decoration: underline; }
    .report-content hr { border: none; border-top: 1px solid var(--border); margin: 24px 0; }
    .report-content img { max-width: 100%; height: auto; }
    @media print {
      body { padding: 40px; }
      h1, h2, h3, h4 { page-break-after: avoid; }
      pre, table { page-break-inside: avoid; }
      * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="report-header">
    <h1>Deep Research Report</h1>
    ${runId ? `<div class="meta">Run: ${runId.slice(0, 8)}</div>` : ""}
    <div class="meta">${dateStr} &middot; Better DeepSeek</div>
  </div>
  <div class="report-content">${renderedHtml}</div>
</body>
</html>`;

    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "none";
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(printDoc);
    doc.close();

    iframe.contentWindow.focus();

    let printed = false;

    function cleanupPrintFrame() {
      if (document.body.contains(iframe)) document.body.removeChild(iframe);
    }

    iframe.contentWindow.onafterprint = () => {
      printed = true;
      printingPdf = false;
      cleanupPrintFrame();
    };

    // Fallback cleanup if afterprint never fires
    setTimeout(() => {
      if (!printed) {
        printingPdf = false;
        cleanupPrintFrame();
      }
    }, 15000);

    // Wait for resources (fonts, images) to settle before printing
    setTimeout(() => {
      if (!printed) iframe.contentWindow.print();
    }, 1500);
  }

  function stripLeadingBlankLines(content) {
    return String(content || "").replace(/^(?:[ \t]*\r?\n)+/, "");
  }
</script>

<div class="bds-deep-research-report-card" data-testid="deep-research-report-card">
  <div class="bds-drr-header">
    <span class="bds-drr-icon">DR</span>
    <span class="bds-drr-title">Deep Research Report</span>
    {#if runId}
      <span class="bds-drr-run-id">Run: {runId.slice(0, 8)}</span>
    {/if}
    <button type="button" class="bds-drr-toggle" onclick={downloadMarkdown} data-testid="deep-research-download-btn">
      Download .md
    </button>
    <button type="button" class="bds-drr-toggle" onclick={downloadPdf} data-testid="deep-research-pdf-btn">
      Download PDF
    </button>
    <button type="button" class="bds-drr-toggle" onclick={toggleCollapse}>
      {collapsed ? "Show" : "Hide"}
    </button>
  </div>

  {#if !collapsed}
    <div class="bds-drr-content">
      {@html renderedHtml}
    </div>
  {/if}
</div>

<style>
  .bds-deep-research-report-card {
    margin: 8px 0;
    border: 1px solid var(--bds-border, #3a3b3f);
    border-radius: 12px;
    background: var(--bds-bg-panel, #1e1f23);
    color: var(--bds-text-primary, #ececec);
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  .bds-drr-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
  }
  .bds-drr-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border-radius: 8px;
    color: var(--bds-accent, #4f8cff);
    background: var(--bds-bg-elevated, #25262b);
    border: 1px solid var(--bds-border, #3a3b3f);
    font-size: 10px;
    font-weight: 700;
    flex-shrink: 0;
  }
  .bds-drr-title {
    font-size: 13px;
    font-weight: 600;
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .bds-drr-run-id {
    font-size: 10.5px;
    color: var(--bds-text-tertiary, rgba(255, 255, 255, 0.5));
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    flex-shrink: 0;
  }
  .bds-drr-toggle {
    font-size: 12px;
    background: var(--bds-bg-elevated, #25262b);
    border: 1px solid var(--bds-border, #3a3b3f);
    border-radius: 8px;
    padding: 4px 9px;
    cursor: pointer;
    color: var(--bds-text-primary, #ececec);
    flex-shrink: 0;
  }
  .bds-drr-toggle:hover {
    background: var(--bds-bg-hover, rgba(255, 255, 255, 0.08));
  }
  .bds-drr-content {
    padding: 12px 14px;
    border-top: 1px solid var(--bds-border, #3a3b3f);
    line-height: 1.6;
    color: var(--bds-text-secondary, rgba(255, 255, 255, 0.7));
  }
  .bds-drr-content :global(h1),
  .bds-drr-content :global(h2),
  .bds-drr-content :global(h3) {
    margin-top: 16px;
    margin-bottom: 8px;
  }
  .bds-drr-content :global(table) {
    border-collapse: collapse;
    width: 100%;
    margin: 8px 0;
  }
  .bds-drr-content :global(th),
  .bds-drr-content :global(td) {
    border: 1px solid var(--bds-border, #3a3b3f);
    padding: 6px 10px;
    text-align: left;
  }
  .bds-drr-content :global(a) {
    color: #1976d2;
    text-decoration: underline;
  }
  @media (max-width: 560px) {
    .bds-drr-title {
      display: none;
    }
  }
</style>
