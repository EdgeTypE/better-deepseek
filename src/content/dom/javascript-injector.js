/**
 * JavaScript Code Block Run-Button Injector
 *
 * Scans the page for DeepSeek-rendered JavaScript code blocks (`.md-code-block`)
 * and injects a "▶ Run JS" button into each one's banner.
 */

import { buildJsRunnerDocument } from "../../lib/utils/html-utils.js";
import { triggerTextDownload } from "../../lib/utils/download.js";

const processedBlocks = new WeakSet();

/**
 * Scan a DOM subtree for JS code blocks and inject Run buttons.
 */
export function injectJavaScriptRunButtons(rootNode) {
  if (!rootNode) return;

  const codeBlocks = rootNode.querySelectorAll(".md-code-block");

  for (const block of codeBlocks) {
    if (processedBlocks.has(block)) continue;

    if (!isJavaScriptCodeBlock(block)) continue;

    const preEl = block.querySelector("pre");
    if (!preEl) continue;

    processedBlocks.add(block);
    injectButton(block, preEl);
  }
}

// ── Detection ────────────────────────────────────────────────────────────────

function getCodeBlockLanguage(block) {
  // Strategy 1: look for "javascript", "js", "typescript", "ts" in any span inside the banner
  const banner =
    block.querySelector(".md-code-block-banner") ||
    block.querySelector('[class*="code-block-banner"]');
  if (banner) {
    const spans = banner.querySelectorAll("span");
    for (const span of spans) {
      const t = span.textContent.trim().toLowerCase();
      if (t === "javascript" || t === "js") return "javascript";
      if (t === "typescript" || t === "ts") return "typescript";
    }
  }

  // Strategy 2: look for a <code class="language-js"> inside <pre>
  const codeEl = block.querySelector('pre code[class*="language-"]');
  if (codeEl) {
    const cls = Array.from(codeEl.classList).find(c => c.startsWith('language-'));
    if (cls) {
      const lang = cls.replace('language-', '').toLowerCase();
      if (lang === 'javascript' || lang === 'js') return 'javascript';
      if (lang === 'typescript' || lang === 'ts') return 'typescript';
    }
  }

  return "javascript";
}

function isJavaScriptCodeBlock(block) {
  const lang = getCodeBlockLanguage(block);
  return lang === "javascript" || lang === "typescript";
}

// ── Injection ────────────────────────────────────────────────────────────────

function injectButton(block, preEl) {
  const btnContainer = findButtonContainer(block);

  const runBtn = document.createElement("button");
  runBtn.type = "button";
  runBtn.setAttribute("role", "button");
  runBtn.className = "bds-run-js-btn";
  runBtn.innerHTML =
    '<span style="margin-right:4px">▶</span><span>Run JS</span>';
  applyButtonStyle(runBtn);

  let panelEl = null;

  runBtn.addEventListener("click", () => {
    if (panelEl) {
      panelEl.remove();
      panelEl = null;
      runBtn.innerHTML =
        '<span style="margin-right:4px">▶</span><span>Run JS</span>';
      applyButtonStyle(runBtn);
      return;
    }

    const code = preEl.textContent || "";
    const lang = getCodeBlockLanguage(block);
    panelEl = createRunnerPanel(code, lang);
    // Insert after the code block
    block.parentNode.insertBefore(panelEl, block.nextSibling);

    runBtn.innerHTML =
      '<span style="margin-right:4px">✕</span><span>Close</span>';
    runBtn.style.background = "#ef4444";
  });

  if (btnContainer) {
    btnContainer.insertBefore(runBtn, btnContainer.firstChild);
  } else {
    const banner =
      block.querySelector(".md-code-block-banner") ||
      block.querySelector('[class*="code-block-banner"]');
    if (banner) {
      banner.appendChild(runBtn);
    }
  }
}

function findButtonContainer(block) {
  const btnText = block.querySelector(".code-info-button-text");
  if (btnText) {
    const btn = btnText.closest("button");
    if (btn && btn.parentElement) return btn.parentElement;
  }

  const dsBtn = block.querySelector(".ds-atom-button");
  if (dsBtn && dsBtn.parentElement) return dsBtn.parentElement;

  return null;
}

function applyButtonStyle(el) {
  Object.assign(el.style, {
    display: "inline-flex",
    alignItems: "center",
    background: "#f59e0b",
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    padding: "4px 12px",
    fontSize: "13px",
    fontWeight: "600",
    cursor: "pointer",
    marginRight: "6px",
    transition: "background 0.15s ease",
    lineHeight: "1.4",
    verticalAlign: "middle",
  });
}

// ── Runner Panel ─────────────────────────────────────────────────────────────

function createRunnerPanel(code, lang = "javascript") {
  const panel = document.createElement("div");
  panel.className = "bds-js-runner-panel";
  Object.assign(panel.style, {
    margin: "6px 0 14px 0",
    borderRadius: "0 0 12px 12px",
    overflow: "hidden",
    border: "1px solid #334155",
    boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
  });

  // Header bar
  const header = document.createElement("div");
  Object.assign(header.style, {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 14px",
    background: "#111827",
    borderBottom: "1px solid #334155",
    fontFamily: "sans-serif",
  });

  const title = document.createElement("span");
  title.textContent = lang === "typescript" ? "TypeScript Runner — Sandbox" : "JavaScript Runner — Sandbox";
  Object.assign(title.style, {
    fontSize: "12px",
    fontWeight: "600",
    color: "#9ca3af",
  });

  const downloadBtn = document.createElement("button");
  const ext = lang === "typescript" ? "ts" : "js";
  downloadBtn.type = "button";
  downloadBtn.textContent = `↓ Download .${ext}`;
  Object.assign(downloadBtn.style, {
    fontSize: "11px",
    fontWeight: "600",
    padding: "3px 10px",
    border: "1px solid #374151",
    borderRadius: "4px",
    background: "#1f2937",
    color: "#d1d5db",
    cursor: "pointer",
  });
  downloadBtn.addEventListener("click", () => {
    triggerTextDownload(code, `script-${Date.now()}.${ext}`);
  });

  header.appendChild(title);
  header.appendChild(downloadBtn);

  // Iframe
  const iframe = document.createElement("iframe");
  iframe.title = "JavaScript Runner";
  iframe.sandbox = "allow-scripts";
  iframe.srcdoc = buildJsRunnerDocument(code, lang);
  Object.assign(iframe.style, {
    width: "100%",
    height: "420px",
    border: "none",
    display: "block",
  });

  panel.appendChild(header);
  panel.appendChild(iframe);
  return panel;
}
