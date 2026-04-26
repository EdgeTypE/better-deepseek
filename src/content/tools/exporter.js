/**
 * Session Exporter Utility
 * Handles collecting messages and formatting them for export (MD, PDF).
 */

import { collectMessageNodes, detectMessageRole } from "../scanner.js";
import { extractMessageMarkdown } from "../dom/message-text.js";
import { triggerTextDownload } from "../../lib/utils/download.js";

/**
 * Collect all messages from the current chat session.
 * @returns {Array<{role: string, content: string}>}
 */
export function collectMessages() {
  const nodes = collectMessageNodes();
  const messages = [];

  for (const node of nodes) {
    const role = detectMessageRole(node);
    if (role === "unknown") continue;

    const content = extractMessageMarkdown(node);
    if (!content.trim()) continue;

    messages.push({ role, content });
  }

  return messages;
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
 * @param {'markdown' | 'pdf'} format 
 */
export async function exportSession(format) {
  const messages = collectMessages();
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
function formatContentForHtml(content) {
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
