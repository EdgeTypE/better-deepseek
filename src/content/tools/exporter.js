/**
 * Session Exporter Utility
 * Handles collecting messages and formatting them for export (MD, PDF).
 */

import { collectMessageNodes, detectMessageRole } from "../scanner.js";
import { extractMessageMarkdown, extractMessageRawText } from "../dom/message-text.js";
import { triggerTextDownload } from "../../lib/utils/download.js";
import { simpleHash } from "../../lib/utils/hash.js";
import html2canvas from "html2canvas";

/**
 * Collect all messages from the current chat session.
 * @param {string[]} [filterIds] Optional list of message IDs to include
 * @returns {Array<{role: string, content: string, id: string}>}
 */
export function collectMessages(filterIds = null) {
  const nodes = collectMessageNodes();
  const messages = [];

  for (const node of nodes) {
    const role = detectMessageRole(node);
    if (role === "unknown") continue;

    const content = extractMessageMarkdown(node);
    const bdsCards = extractBdsCards(node);
    
    if (!content.trim() && !bdsCards.length) continue;

    // Use stable ID from node attribute
    const id = node.getAttribute("data-bds-msg-id");
    
    if (filterIds && (!id || !filterIds.includes(id))) continue;

    messages.push({ role, content, id, node, bdsCards });
  }

  return messages;
}

/**
 * Extract data from BDS-specific UI components in the message.
 */
export function extractBdsCards(node) {
  const cards = [];
  
  // ── Visualizer Card ──
  const visualizer = node.querySelector(".bds-visualizer-card");
  if (visualizer) {
    cards.push({
      type: "visualizer",
      title: visualizer.querySelector(".bds-visualizer-header h4")?.textContent?.trim() || "Visualizer",
      details: visualizer.querySelector(".bds-visualizer-header p")?.textContent?.trim() || "Interactive Simulation"
    });
  }

  // ── PowerPoint Card ──
  const pptx = node.querySelector(".bds-pptx-card");
  if (pptx) {
    cards.push({
      type: "tool",
      title: pptx.querySelector(".bds-pptx-details h4")?.textContent?.trim() || "PowerPoint",
      details: pptx.querySelector(".bds-pptx-details p")?.textContent?.trim() || "Presentation"
    });
  }

  // ── Generic Tool Card (Safety Fallback) ──
  const toolCard = node.querySelector(".bds-tool-card");
  if (toolCard && !pptx) {
    cards.push({
      type: "tool",
      title: toolCard.querySelector("h4")?.textContent?.trim() || "BDS Tool",
      details: toolCard.querySelector("p")?.textContent?.trim() || ""
    });
  }

  return cards;
}

/**
 * Get the session title from the document.
 */
export function getSessionTitle() {
  const title = document.title || "DeepSeek Session";
  // Remove " - DeepSeek" suffix if present
  return title.replace(/ - DeepSeek$/i, "").trim();
}

/**
 * Format messages as Markdown.
 */
export function formatMarkdown(messages) {
  const title = getSessionTitle();
  let md = `# ${title}\n\n`;

  for (const msg of messages) {
    const roleName = msg.role === "user" ? "User" : "Assistant";
    md += `### ${roleName}\n\n${msg.role === "assistant" ? formatAssistantContent(msg.content) : msg.content}\n\n---\n\n`;
  }

  return md;
}

/**
 * Assistant content might contain BDS tags, although extractMessageRawText should strip them.
 * This is an extra safety layer.
 */
function formatAssistantContent(content) {
  // Replace internal BDS tags if they somehow leaked through
  let text = content.replace(/<(BDS|BetterDeepSeek):[\s\S]*?<\/(BDS|BetterDeepSeek):[\s\S]*?>/gi, "").trim();
  
  // Extra layer: remove DeepSeek UI artifacts that might have survived extraction
  const noisePatterns = [
    /Thought for \d+ seconds/gi,
    /Found \d+ web pages/gi,
    /Read \d+ pages/gi,
    /View All/gi,
    /Searching for .*/gi,
    /Search results for .*/gi
  ];

  for (const pattern of noisePatterns) {
    text = text.replace(pattern, "");
  }
  
  // Clean up redundant newlines (max 2 consecutive)
  text = text.replace(/\n{3,}/g, "\n\n");
  
  return text.trim();
}

function isDarkMode() {
  return document.documentElement.classList.contains("dark") || 
         document.body.classList.contains("dark") ||
         window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/**
 * Export the current session.
 * @param {'markdown' | 'pdf' | 'html' | 'image'} format 
 * @param {string[]} [filterIds] Optional list of message IDs to include
 */
export async function exportSession(format, filterIds = null) {
  const messages = collectMessages(filterIds);
  if (!messages.length) {
    console.warn("[BDS] No messages found to export.");
    return;
  }

  const title = getSessionTitle();
  const timestamp = new Date().toISOString().split("T")[0];
  const fileName = `${title}_${timestamp}`;

  if (format === "markdown") {
    const md = formatMarkdown(messages);
    triggerTextDownload(md, `${fileName}.md`);
  } else if (format === "pdf") {
    exportToPdf(messages, title, isDarkMode());
  } else if (format === "html") {
    exportToHtml(messages, title, isDarkMode(), fileName);
  } else if (format === "image") {
    exportToImage(messages, title, isDarkMode(), fileName);
  }
}

/**
 * Export to PDF by creating a temporary window and printing.
 */
function exportToPdf(messages, title, dark = false) {
  // Use a hidden iframe to trigger the print dialog without a new tab
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "none";
  iframe.id = "bds-print-iframe";
  
  document.body.appendChild(iframe);

  const html = `
<!DOCTYPE html>
<html lang="en" class="${dark ? "dark" : ""}">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary: #10a37f;
      --bg: #ffffff;
      --text: #111827;
      --text-muted: #6b7280;
      --border: #e5e7eb;
      --user-bg: #f9fafb;
      --code-bg: #111827;
      --title-color: #000000;
    }

    html.dark {
      --bg: #171717;
      --text: #e5e7eb;
      --text-muted: #9ca3af;
      --border: #262626;
      --user-bg: #212121;
      --code-bg: #000000;
      --title-color: #ffffff;
    }

    * { box-sizing: border-box; }

    html, body {
      margin: 0;
      padding: 0;
      background: var(--bg);
      color: var(--text);
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    body {
      font-family: 'Inter', -apple-system, system-ui, sans-serif;
      line-height: 1.6;
      padding: 50px;
    }

    .container {
      max-width: 800px;
      margin: 0 auto;
    }

    header {
      margin-bottom: 60px;
      padding-bottom: 24px;
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .logo-text {
      font-weight: 800;
      font-size: 22px;
      background: linear-gradient(135deg, var(--primary), #0d8a6b);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      letter-spacing: -0.03em;
    }

    .session-title {
      font-size: 38px;
      font-weight: 800;
      margin: 0 0 16px 0;
      line-height: 1.1;
      letter-spacing: -0.04em;
      color: var(--title-color);
    }

    .metadata {
      font-size: 14px;
      color: var(--text-muted);
      margin-bottom: 60px;
      font-weight: 500;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .metadata::before {
      content: "";
      display: block;
      width: 4px;
      height: 4px;
      border-radius: 50%;
      background: var(--primary);
    }

    .message {
      margin-bottom: 60px;
      width: 100%;
    }

    .user {
      text-align: right;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
    }

    .assistant {
      text-align: left;
      border-left: 3px solid var(--primary);
      padding-left: 24px;
      margin-left: -3px;
    }

    .role-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 16px;
    }

    .role-badge {
      display: inline-block;
      padding: 6px 14px;
      border-radius: 8px;
      font-size: 10px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.1em;
    }

    .user .role-badge {
      background: var(--user-bg);
      color: var(--text);
      border: 1px solid var(--border);
    }

    .assistant .role-badge {
      background: var(--primary);
      color: #ffffff;
    }

    .content {
      font-size: 16px;
      line-height: 1.85;
      text-align: justify;
      text-justify: inter-word;
    }

    .user .content {
      display: inline-block;
      text-align: left;
      max-width: 85%;
      background: var(--user-bg);
      padding: 20px 24px;
      border-radius: 20px 4px 20px 20px;
      border: 1px solid var(--border);
    }
    
    .user .content p { text-align: left; margin: 0; }

    pre {
      background: var(--code-bg) !important;
      color: #e5e7eb !important;
      padding: 40px 24px 24px 24px;
      border-radius: 12px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 13.5px;
      line-height: 1.6;
      overflow-x: auto;
      margin: 24px 0;
      position: relative;
      border: 1px solid var(--border);
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    }

    pre::before {
      content: "";
      position: absolute;
      top: 14px;
      left: 14px;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #ff5f56;
      box-shadow: 20px 0 0 #ffbd2e, 40px 0 0 #27c93f;
    }

    .lang-label {
      position: absolute;
      top: 10px;
      right: 14px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      color: #9ca3af;
      letter-spacing: 0.05em;
    }

    code {
      font-family: 'JetBrains Mono', monospace;
      background: var(--user-bg);
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 0.875em;
      color: #ef4444;
    }

    pre code {
      background: none;
      padding: 0;
      color: inherit;
      font-size: inherit;
    }

    footer {
      margin-top: 100px;
      padding-top: 32px;
      border-top: 1px solid var(--border);
      text-align: center;
      font-size: 12px;
      color: var(--text-muted);
      font-weight: 500;
    }

    @media print {
      html, body {
        background: var(--bg) !important;
        color: var(--text) !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      
      body { padding: 40px; }
      
      .message { 
        page-break-inside: auto; 
        margin-bottom: 40px;
      }
      
      .role-header {
        page-break-after: avoid;
      }
      
      pre { 
        page-break-inside: avoid; 
      }
      
      footer {
        page-break-before: auto;
      }

      * {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <span class="logo-text">Better DeepSeek</span>
      <span style="font-size: 12px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.1em;">Archive Report</span>
    </header>

    <h1 class="session-title">${title}</h1>
    <div class="metadata">
      Generated on ${new Date().toLocaleDateString(undefined, { dateStyle: 'long' })}
    </div>

    ${messages.map(msg => `
      <div class="message ${msg.role}">
        <div class="role-header">
          <span class="role-badge">${msg.role === "user" ? "User Query" : "AI Response"}</span>
        </div>
        <div class="content">
          ${formatContentForHtml(msg.role === "assistant" ? formatAssistantContent(msg.content) : msg.content)}
        </div>
        ${msg.bdsCards && msg.bdsCards.length ? `
          <div style="margin-top: 20px; display: grid; gap: 10px;">
            ${msg.bdsCards.map(card => `
              <div style="background: ${dark ? '#212121' : '#f9fafb'}; border: 1px solid ${dark ? '#333' : '#e5e7eb'}; border-radius: 12px; padding: 14px; display: flex; align-items: center; gap: 14px;">
                <div style="font-size: 20px;">${card.type === 'visualizer' ? '👁️' : '🛠️'}</div>
                <div>
                  <div style="font-size: 13px; font-weight: 700;">${card.title}</div>
                  <div style="font-size: 11px; color: #9ca3af;">${card.details || card.status || ""}</div>
                </div>
              </div>
            `).join("")}
          </div>
        ` : ""}
      </div>
    `).join("")}

    <footer>
      Document generated via Better DeepSeek Browser Extension
    </footer>
  </div>
</body>
</html>
  `;

  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();

  // Wait for resources (fonts) and then print
  iframe.contentWindow.focus();
  setTimeout(() => {
    iframe.contentWindow.print();
    // Cleanup after print
    setTimeout(() => {
      document.body.removeChild(iframe);
    }, 1000);
  }, 1500);
}

/**
 * Very basic Markdown to HTML converter for PDF export.
 */
export function formatContentForHtml(content) {
  return content
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    // Fenced Code Blocks
    .replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
      return `<pre>${lang ? `<div class="lang">${lang}</div>` : ""}<code>${code.trim()}</code></pre>`;
    })
    // Inline Code
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    // Headers
    .replace(/^# (.*$)/gm, "<h1>$1</h1>")
    .replace(/^## (.*$)/gm, "<h2>$1</h2>")
    .replace(/^### (.*$)/gm, "<h3>$1</h3>")
    .replace(/^#### (.*$)/gm, "<h4>$1</h4>")
    // Bold & Italic
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    // Links [text](url)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
    // Lists
    .replace(/^\s*-\s+(.*$)/gm, "<li>$1</li>")
    // Horizontal Rule
    .replace(/^---$/gm, "<hr>")
    // Paragraphs / Newlines
    .replace(/\n/g, "<br>");
}

/**
 * Export to Standalone HTML.
 */
function exportToHtml(messages, title, dark, fileName) {
  const html = generateStandaloneHtml(messages, title, dark);
  triggerTextDownload(html, `${fileName}.html`);
}

/**
 * Export to Long Image using html2canvas.
 */
export async function exportToImage(messages, title, dark, fileName) {
  const container = document.createElement("div");
  container.className = `bds-export-container ${dark ? "dark" : ""}`;
  container.style.position = "fixed";
  container.style.left = "-9999px";
  container.style.top = "0";
  container.style.width = "800px";
  container.style.background = dark ? "#171717" : "#ffffff";
  container.style.padding = "40px";
  
  // Reuse the same HTML structure as PDF/HTML export but for rendering
  container.innerHTML = `
    <div style="font-family: 'Inter', sans-serif; line-height: 1.6; color: ${dark ? "#e5e7eb" : "#111827"};">
      <header style="margin-bottom: 40px; padding-bottom: 20px; border-bottom: 1px solid ${dark ? "#262626" : "#e5e7eb"}; display: flex; justify-content: space-between; align-items: center;">
        <span style="font-weight: 800; font-size: 18px; color: #10a37f;">Better DeepSeek</span>
        <span style="font-size: 10px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.1em;">Long Capture</span>
      </header>
      <h1 style="font-size: 28px; font-weight: 800; margin: 0 0 12px 0;">${title}</h1>
      <div style="font-size: 12px; color: #9ca3af; margin-bottom: 40px;">Captured on ${new Date().toLocaleDateString()}</div>
      
      <div class="bds-messages-list">
        ${messages.map(msg => `
          <div class="message ${msg.role}" style="margin-bottom: 40px;">
            <div style="margin-bottom: 12px;">
              <span style="padding: 4px 10px; border-radius: 6px; font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; background: ${msg.role === 'user' ? (dark ? '#212121' : '#f3f4f6') : '#10a37f'}; color: ${msg.role === 'user' ? (dark ? '#e5e7eb' : '#111827') : '#ffffff'}; border: ${msg.role === 'user' ? (dark ? '1px solid #333' : '1px solid #e5e7eb') : 'none'};">
                ${msg.role === "user" ? "User" : "Assistant"}
              </span>
            </div>
            <div style="font-size: 15px; line-height: 1.7; text-align: left;">
              ${formatContentForHtml(msg.role === "assistant" ? formatAssistantContent(msg.content) : msg.content)}
            </div>
            ${msg.bdsCards && msg.bdsCards.length ? `
              <div style="margin-top: 15px; display: grid; gap: 10px;">
                ${msg.bdsCards.map(card => `
                  <div style="background: ${dark ? '#212121' : '#f9fafb'}; border: 1px solid ${dark ? '#333' : '#e5e7eb'}; border-radius: 12px; padding: 12px; display: flex; align-items: center; gap: 12px;">
                    <div style="font-size: 20px;">${card.type === 'visualizer' ? '👁️' : '🛠️'}</div>
                    <div>
                      <div style="font-size: 13px; font-weight: 700; color: ${dark ? '#fff' : '#111827'};">${card.title}</div>
                      <div style="font-size: 11px; color: #9ca3af;">${card.details || card.status || ""}</div>
                    </div>
                  </div>
                `).join("")}
              </div>
            ` : ""}
          </div>
        `).join("")}
      </div>
      
      <footer style="margin-top: 60px; padding-top: 20px; border-top: 1px solid ${dark ? "#262626" : "#e5e7eb"}; text-align: center; font-size: 11px; color: #9ca3af;">
        Generated via Better DeepSeek
      </footer>
    </div>
  `;

  // Pre-inject some essential styles into the container for html2canvas
  const style = document.createElement("style");
  style.textContent = `
    pre { background: ${dark ? "#000" : "#111827"} !important; color: #fff !important; padding: 20px; border-radius: 8px; font-family: monospace; overflow: hidden; margin: 15px 0; }
    code { font-family: monospace; color: #ef4444; background: ${dark ? "#212121" : "#f3f4f6"}; padding: 2px 4px; border-radius: 4px; }
    pre code { background: none; color: inherit; padding: 0; }
    li { margin-bottom: 8px; }
    a { color: #10a37f; text-decoration: none; }
  `;
  container.appendChild(style);
  document.body.appendChild(container);

  try {
    // Give images and fonts a moment to settle
    await new Promise(r => setTimeout(r, 500));
    
    const canvas = await html2canvas(container, {
      backgroundColor: dark ? "#171717" : "#ffffff",
      scale: 2, // High DPI
      logging: false,
      useCORS: true,
      allowTaint: true
    });

    const link = document.createElement("a");
    link.download = `${fileName}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  } catch (err) {
    console.error("[BDS] Image export failed:", err);
    alert("Failed to generate image. Please try selecting fewer messages.");
  } finally {
    document.body.removeChild(container);
  }
}

/**
 * Generate Standalone HTML content.
 */
export function generateStandaloneHtml(messages, title, dark) {
  return `
<!DOCTYPE html>
<html lang="en" class="${dark ? "dark" : ""}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} | Better DeepSeek Export</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary: #4d66ff;
      --bg: #ffffff;
      --text: #111827;
      --text-muted: #6b7280;
      --border: #e5e7eb;
      --user-bg: #f9fafb;
      --code-bg: #0d0d0d;
      --card-bg: #ffffff;
      --nav-bg: rgba(255, 255, 255, 0.8);
    }

    html.dark {
      --bg: #0d0d0d;
      --text: #e5e7eb;
      --text-muted: #9ca3af;
      --border: #262626;
      --user-bg: #1a1a1a;
      --code-bg: #000000;
      --card-bg: #171717;
      --nav-bg: rgba(13, 13, 13, 0.8);
    }

    * { box-sizing: border-box; transition: background-color 0.3s, color 0.3s; }

    body {
      font-family: 'Inter', -apple-system, sans-serif;
      line-height: 1.6;
      background: var(--bg);
      color: var(--text);
      margin: 0;
      padding: 0;
    }

    .nav {
      position: sticky;
      top: 0;
      background: var(--nav-bg);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--border);
      padding: 12px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      z-index: 100;
    }

    .logo {
      font-weight: 800;
      font-size: 16px;
      color: var(--primary);
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .theme-toggle {
      background: var(--user-bg);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 6px 12px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    }

    .container {
      max-width: 850px;
      margin: 60px auto;
      padding: 0 24px;
    }

    .header {
      margin-bottom: 60px;
    }

    .session-title {
      font-size: 42px;
      font-weight: 800;
      letter-spacing: -0.04em;
      margin: 0 0 16px 0;
      line-height: 1.1;
    }

    .metadata {
      font-size: 14px;
      color: var(--text-muted);
      font-weight: 500;
    }

    .message {
      margin-bottom: 80px;
      animation: fadeIn 0.5s ease-out;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .role-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 6px;
      font-size: 10px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      margin-bottom: 20px;
    }

    .user .role-badge {
      background: var(--user-bg);
      color: var(--text-muted);
      border: 1px solid var(--border);
    }

    .assistant .role-badge {
      background: var(--primary);
      color: white;
    }

    .content {
      font-size: 16px;
      line-height: 1.8;
    }

    pre {
      background: var(--code-bg);
      color: #e5e7eb;
      padding: 45px 20px 20px 20px;
      border-radius: 12px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 14px;
      overflow-x: auto;
      margin: 24px 0;
      position: relative;
      border: 1px solid var(--border);
    }

    pre::before {
      content: "";
      position: absolute;
      top: 15px;
      left: 15px;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #ff5f56;
      box-shadow: 20px 0 0 #ffbd2e, 40px 0 0 #27c93f;
    }

    .copy-btn {
      position: absolute;
      top: 10px;
      right: 10px;
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.2);
      color: #9ca3af;
      padding: 4px 8px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }

    .copy-btn:hover {
      background: rgba(255, 255, 255, 0.2);
      color: white;
    }

    code {
      font-family: 'JetBrains Mono', monospace;
      background: var(--user-bg);
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 0.9em;
      color: #ef4444;
    }

    pre code {
      background: none;
      padding: 0;
      color: inherit;
    }

    h1, h2, h3, h4 { letter-spacing: -0.02em; margin-top: 2em; }
    p { margin-bottom: 1.5em; }
    li { margin-bottom: 0.8em; }

    footer {
      margin: 100px 0 60px 0;
      padding-top: 40px;
      border-top: 1px solid var(--border);
      text-align: center;
      font-size: 12px;
      color: var(--text-muted);
    }

    @media (max-width: 640px) {
      .session-title { font-size: 32px; }
      body { line-height: 1.5; }
    }

    /* BDS Cards Style */
    .bds-cards {
      margin-top: 24px;
      display: grid;
      gap: 12px;
    }

    .bds-card {
      background: var(--user-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 16px;
      display: flex;
      align-items: center;
      gap: 16px;
      animation: fadeIn 0.4s ease-out;
    }

    .bds-card-icon {
      width: 40px;
      height: 40px;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
    }

    .bds-card.visualizer .bds-card-icon {
      color: var(--primary);
      border-color: var(--primary);
    }

    .bds-card-title {
      font-size: 14px;
      font-weight: 700;
      color: var(--text);
    }

    .bds-card-details {
      font-size: 12px;
      color: var(--text-muted);
    }
  </style>
</head>
<body>
  <nav class="nav">
    <div class="logo">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="7 10 12 15 17 10"></polyline>
        <line x1="12" y1="15" x2="12" y2="3"></line>
      </svg>
      Better DeepSeek Export
    </div>
    <button class="theme-toggle" onclick="document.documentElement.classList.toggle('dark')">Toggle Theme</button>
  </nav>

  <div class="container">
    <div class="header">
      <h1 class="session-title">${title}</h1>
      <div class="metadata">Generated on ${new Date().toLocaleDateString(undefined, { dateStyle: 'long' })}</div>
    </div>

    ${messages.map(msg => `
      <div class="message ${msg.role}">
        <div class="role-badge">${msg.role === "user" ? "User" : "Assistant"}</div>
        <div class="content">
          ${formatContentForHtml(msg.role === "assistant" ? formatAssistantContent(msg.content) : msg.content)}
        </div>
        ${msg.bdsCards && msg.bdsCards.length ? `
          <div class="bds-cards">
            ${msg.bdsCards.map(card => `
              <div class="bds-card ${card.type}">
                <div class="bds-card-icon">
                  ${card.type === 'visualizer' ? '👁️' : '🛠️'}
                </div>
                <div class="bds-card-info">
                  <div class="bds-card-title">${card.title}</div>
                  <div class="bds-card-details">${card.details || card.status || ""}</div>
                </div>
              </div>
            `).join("")}
          </div>
        ` : ""}
      </div>
    `).join("")}

    <footer>
      Exported via Better DeepSeek Browser Extension
    </footer>
  </div>

  <script>
    document.querySelectorAll('pre').forEach(block => {
      const btn = document.createElement('button');
      btn.className = 'copy-btn';
      btn.innerText = 'Copy';
      btn.onclick = () => {
        const code = block.querySelector('code').innerText;
        navigator.clipboard.writeText(code);
        btn.innerText = 'Copied!';
        setTimeout(() => btn.innerText = 'Copy', 2000);
      };
      block.appendChild(btn);
    });
  </script>
</body>
</html>
  `;
}
