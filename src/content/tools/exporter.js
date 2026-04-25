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
    exportToPdf(messages, title);
  }
}

/**
 * Export to PDF by creating a temporary window and printing.
 */
function exportToPdf(messages, title) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    alert("Please allow popups to export to PDF.");
    return;
  }

  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>${title}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 800px;
      margin: 40px auto;
      padding: 0 20px;
    }
    h1 {
      border-bottom: 2px solid #eee;
      padding-bottom: 10px;
      margin-bottom: 30px;
      font-size: 24px;
    }
    .message {
      margin-bottom: 30px;
      padding: 15px;
      border-radius: 8px;
    }
    .role {
      font-weight: bold;
      margin-bottom: 8px;
      text-transform: uppercase;
      font-size: 12px;
      letter-spacing: 1px;
      color: #666;
    }
    .user {
      background-color: #f9f9f9;
      border-left: 4px solid #007bff;
    }
    .assistant {
      background-color: #fff;
      border-left: 4px solid #10a37f;
    }
    pre {
      background-color: #f6f8fa;
      padding: 16px;
      border-radius: 6px;
      overflow-x: auto;
      font-family: ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace;
      font-size: 13px;
      line-height: 1.45;
      position: relative;
      border: 1px solid #dfe1e4;
    }
    pre .lang {
      position: absolute;
      top: 0;
      right: 0;
      padding: 4px 8px;
      font-size: 10px;
      text-transform: uppercase;
      color: #6a737d;
      background: #eee;
      border-bottom-left-radius: 4px;
    }
    code {
      font-family: ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace;
      font-size: 0.9em;
      background-color: rgba(175, 184, 193, 0.2);
      padding: 0.2em 0.4em;
      border-radius: 6px;
    }
    pre code {
      background-color: transparent;
      padding: 0;
      border-radius: 0;
    }
    hr {
      border: 0;
      border-top: 1px solid #eee;
      margin: 40px 0;
    }
    @media print {
      body { margin: 20px; }
      .message { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <h1>${title}</h1>
  ${messages.map(msg => `
    <div class="message ${msg.role}">
      <div class="role">${msg.role === "user" ? "User" : "Assistant"}</div>
      <div class="content">
        ${formatContentForHtml(msg.role === "assistant" ? formatAssistantContent(msg.content) : msg.content)}
      </div>
    </div>
  `).join("")}
  <script>
    window.onload = () => {
      setTimeout(() => {
        window.print();
      }, 500);
    };
  </script>
</body>
</html>
  `;

  printWindow.document.write(html);
  printWindow.document.close();
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
    // Lists
    .replace(/^\s*-\s+(.*$)/gm, "<li>$1</li>")
    // Horizontal Rule
    .replace(/^---$/gm, "<hr>")
    // Paragraphs / Newlines
    .replace(/\n/g, "<br>");
}
