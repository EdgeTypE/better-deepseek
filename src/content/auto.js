/**
 * BDS:AUTO Systems
 * Handles automatic requests from DeepSeek.
 */

import { fetchAndConvertWebPage } from "./files/web-reader.js";

// Keep track of already processing/processed URLs globally so we don't spam
const processedWebFetches = new Set();

export async function handleAutoWebFetch(url) {
  if (processedWebFetches.has(url)) return;
  processedWebFetches.add(url);

  console.log(`[BDS:AUTO] Starting automatic web fetch for: ${url}`);

  try {
    const file = await fetchAndConvertWebPage(url, (status) => {
      console.log(`[BDS:AUTO] Web Fetch Status: ${status}`);
    });

    if (file) {
      injectFileAndSend(file, `<BetterDeepSeek>\n[BDS:AUTO] Web Fetch Result for: ${url}\n</BetterDeepSeek>`);
    }
  } catch (err) {
    console.error("[BDS:AUTO] Web Fetch Failed:", err);
    // Optionally create a text file with the error so DeepSeek knows it failed
    const errorBlob = new Blob([`Failed to fetch ${url}:\n\n${err.message}`], { type: "text/plain" });
    const errorFile = new File([errorBlob], `error_${url.replace(/[^a-zA-Z0-9]/g, "_")}.txt`, { type: "text/plain" });
    injectFileAndSend(errorFile, `<BetterDeepSeek>\n[BDS:AUTO] Web fetch failed for ${url}\n</BetterDeepSeek>`);
  }
}

/**
 * Handles automatic error reporting when a tool fails in the sandbox.
 * Constructs a correction prompt and sends it to the chat.
 * @param {string} toolName - Name of the tool (e.g., 'PPTX', 'Excel', 'Word')
 * @param {string} error - The error message received from the sandbox
 * @param {string} originalCode - The code that caused the error
 */
export async function handleAutoErrorReport(toolName, error, originalCode) {
  const autoMessage = [
    `<BetterDeepSeek>`,
    `[BDS:AUTO] ERROR during ${toolName} generation.`,
    `Error Message: ${error}`,
    `Original Code Snippet:`,
    "```javascript",
    originalCode.trim(),
    "```",
    `Please analyze the error, fix the code, and provide the corrected version within the appropriate <BDS:${toolName.toLowerCase()}> tag.`,
    `</BetterDeepSeek>`
  ].join("\n");

  console.log(`[BDS:AUTO] Sending error report for ${toolName}...`);
  
  // We use injectFileAndSend without a file for pure text injection
  injectPureTextAndSend(autoMessage);
}

function injectPureTextAndSend(autoMessage) {
  // We reuse the logic from injectFileAndSend but skip the file part
  const editor = document.querySelector('#chat-input, textarea[placeholder], div[contenteditable="true"]');
  if (editor) {
    if (editor.tagName.toLowerCase() === 'textarea') {
      editor.value = autoMessage;
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    } else if (editor.isContentEditable) {
      editor.innerText = autoMessage;
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  // Phase 2: Wait for button and send
  let attempts = 0;
  const maxAttempts = 50; 

  const attemptSend = () => {
    attempts++;
    const buttons = Array.from(document.querySelectorAll('div[role="button"], button'));
    const sendBtn = buttons.find(b => {
      const isSend = b.querySelector('svg path[d*="M8.3125"], .ds-icon-send') || b.title === "Send message";
      const isAttach = b.classList.contains('bds-plus-btn') || b.querySelector('svg line');
      return isSend && !isAttach;
    });

    if (sendBtn) {
      const isDisabled = sendBtn.getAttribute('aria-disabled') === 'true' || 
                         sendBtn.classList.contains('ds-icon-button--disabled');
      
      if (!isDisabled) {
        sendBtn.click();
        console.log(`[BDS:AUTO] Error report sent successfully after ${attempts} attempts.`);
        return;
      }
    }

    if (attempts < maxAttempts) {
      setTimeout(attemptSend, 200);
    } else {
      console.error("[BDS:AUTO] Failed to send error report: button stayed disabled or was not found.");
    }
  };

  setTimeout(attemptSend, 500);
}


function injectFileAndSend(file, autoMessage = "") {
  const nativeInput = document.querySelector('input[type="file"][multiple]');
  if (!nativeInput) {
    console.error("[BDS:AUTO] Could not find native file input.");
    return;
  }

  // Inject the file
  const dt = new DataTransfer();
  if (nativeInput.files) {
    for (let i = 0; i < nativeInput.files.length; i++) {
      dt.items.add(nativeInput.files[i]);
    }
  }
  dt.items.add(file);
  nativeInput.files = dt.files;
  nativeInput.dispatchEvent(new Event("change", { bubbles: true }));

  // Phase 1: Inject text and file
  if (autoMessage) {
    const editor = document.querySelector('#chat-input, textarea[placeholder], div[contenteditable="true"]');
    if (editor) {
      if (editor.tagName.toLowerCase() === 'textarea') {
        editor.value = autoMessage;
        editor.dispatchEvent(new Event('input', { bubbles: true }));
      } else if (editor.isContentEditable) {
        editor.innerText = autoMessage;
        editor.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
  }

  // Phase 2: Wait for button and send
  let attempts = 0;
  const maxAttempts = 50; // 50 * 200ms = 10s max wait

  const attemptSend = () => {
    attempts++;
    
    // Find the send button
    // It usually has an arrow-up icon. We look for a role="button" that isn't the attach button.
    const buttons = Array.from(document.querySelectorAll('div[role="button"], button'));
    const sendBtn = buttons.find(b => {
      const isSend = b.querySelector('svg path[d*="M8.3125"], .ds-icon-send') || b.title === "Send message";
      const isAttach = b.classList.contains('bds-plus-btn') || b.querySelector('svg line');
      return isSend && !isAttach;
    });

    if (sendBtn) {
      const isDisabled = sendBtn.getAttribute('aria-disabled') === 'true' || 
                         sendBtn.classList.contains('ds-icon-button--disabled');
      
      if (!isDisabled) {
        sendBtn.click();
        console.log(`[BDS:AUTO] Sent successfully after ${attempts} attempts.`);
        return;
      }
    }

    if (attempts < maxAttempts) {
      setTimeout(attemptSend, 200);
    } else {
      console.error("[BDS:AUTO] Failed to send: button stayed disabled or was not found.");
      // Last ditch effort: Try Enter key
      const editor = document.querySelector('#chat-input, textarea[placeholder], div[contenteditable="true"]');
      if (editor) {
        editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      }
    }
  };

  // Start polling
  setTimeout(attemptSend, 500);
}
