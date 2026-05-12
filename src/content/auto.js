/**
 * BDS:AUTO Systems
 * Handles automatic requests from DeepSeek.
 */

import { fetchAndConvertWebPage } from "./files/web-reader.js";
import { fetchGitHubRepo } from "./files/github-reader.js";
import { fetchTwitterTweet } from "./files/twitter-reader.js";
import { fetchYouTubeData } from "./files/youtube-reader.js";
import appState from "./state.js";
import { XLSX_SKILL } from "../lib/office-skills/xlsx.js";
import { PPTX_SKILL } from "../lib/office-skills/pptx.js";
import { DOCX_SKILL } from "../lib/office-skills/docx.js";

const TOOL_TO_SKILL = {
  PPTX: { tag: "pptx", skill: PPTX_SKILL },
  Excel: { tag: "excel", skill: XLSX_SKILL },
  Word: { tag: "docx", skill: DOCX_SKILL },
};

// Keep track of already processing/processed URLs globally so we don't spam
const processedWebFetches = new Set();
const processedGitHubFetches = new Set();
const processedTwitterFetches = new Set();
const processedYouTubeFetches = new Set();

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

export async function handleAutoGitHubFetch(repoUrl) {
  if (processedGitHubFetches.has(repoUrl)) return;
  processedGitHubFetches.add(repoUrl);

  console.log(`[BDS:AUTO] Starting automatic GitHub fetch for: ${repoUrl}`);

  try {
    const token = String(appState.settings.githubToken || "").trim();
    const file = await fetchGitHubRepo(
      repoUrl,
      (status) => {
        console.log(`[BDS:AUTO] GitHub Fetch Status: ${status}`);
      },
      { token }
    );

    if (file) {
      injectFileAndSend(file, `<BetterDeepSeek>\n[BDS:AUTO] GitHub Fetch Result for: ${repoUrl}\n</BetterDeepSeek>`);
    }
  } catch (err) {
    console.error("[BDS:AUTO] GitHub Fetch Failed:", err);
    const errorBlob = new Blob([`Failed to fetch GitHub repo ${repoUrl}:\n\n${err.message}`], { type: "text/plain" });
    const errorFile = new File([errorBlob], `github_error_${repoUrl.replace(/[^a-zA-Z0-9]/g, "_")}.txt`, { type: "text/plain" });
    injectFileAndSend(errorFile, `<BetterDeepSeek>\n[BDS:AUTO] GitHub fetch failed for ${repoUrl}\n</BetterDeepSeek>`);
  }
}

export async function handleAutoTwitterFetch(url) {
  if (processedTwitterFetches.has(url)) return;
  processedTwitterFetches.add(url);

  console.log(`[BDS:AUTO] Starting automatic Twitter fetch for: ${url}`);

  try {
    const file = await fetchTwitterTweet(url);
    if (file) {
      injectFileAndSend(file, `<BetterDeepSeek>\n[BDS:AUTO] Twitter Fetch Result for: ${url}\n</BetterDeepSeek>`);
    }
  } catch (err) {
    console.error("[BDS:AUTO] Twitter Fetch Failed:", err);
    const errorBlob = new Blob([`Failed to fetch tweet ${url}:\n\n${err.message}`], { type: "text/plain" });
    const errorFile = new File([errorBlob], `twitter_error_${url.replace(/[^a-zA-Z0-9]/g, "_")}.md`, { type: "text/plain" });
    injectFileAndSend(errorFile, `<BetterDeepSeek>\n[BDS:AUTO] Twitter fetch failed for ${url}\n</BetterDeepSeek>`);
  }
}

export async function handleAutoYouTubeFetch(url) {
  if (processedYouTubeFetches.has(url)) return;
  processedYouTubeFetches.add(url);

  console.log(`[BDS:AUTO] Starting automatic YouTube fetch for: ${url}`);

  try {
    const file = await fetchYouTubeData(url);
    if (file) {
      injectFileAndSend(file, `<BetterDeepSeek>\n[BDS:AUTO] YouTube Fetch Result for: ${url}\n</BetterDeepSeek>`);
    }
  } catch (err) {
    console.error("[BDS:AUTO] YouTube Fetch Failed:", err);
    const errorBlob = new Blob([`Failed to fetch YouTube video ${url}:\n\n${err.message}`], { type: "text/plain" });
    const errorFile = new File([errorBlob], `youtube_error_${url.replace(/[^a-zA-Z0-9]/g, "_")}.txt`, { type: "text/plain" });
    injectFileAndSend(errorFile, `<BetterDeepSeek>\n[BDS:AUTO] YouTube fetch failed for ${url}\n</BetterDeepSeek>`);
  }
}

/**
 * Handles automatic reporting of code runner results back to the AI.
 */
export async function handleAutoCodeRunnerResult(language, status, output) {
  const statusLabels = {
    success: "SUCCESS",
    error: "ERROR",
    rejected: "REJECTED"
  };

  const autoMessage = [
    `<BetterDeepSeek>`,
    `[BDS:AUTO] Code Runner Result (${language.toUpperCase()})`,
    `Status: ${statusLabels[status] || status.toUpperCase()}`,
    `Output:`,
    "```text",
    output.map(o => (typeof o === 'string' ? o : o.text)).join("\n") || "(No output)",
    "```",
    `</BetterDeepSeek>`
  ].join("\n");

  console.log(`[BDS:AUTO] Sending code runner result (${status})...`);
  injectPureTextAndSend(autoMessage);
}

/**
 * Handles automatic error reporting when a tool fails in the sandbox.
 * Constructs a correction prompt and sends it to the chat.
 * @param {string} toolName - Name of the tool (e.g., 'PPTX', 'Excel', 'Word')
 * @param {string} error - The error message received from the sandbox
 * @param {string} originalCode - The code that caused the error
 */
export async function handleAutoErrorReport(toolName, error, originalCode) {
  const entry = TOOL_TO_SKILL[toolName];
  const tagName = entry ? entry.tag : toolName.toLowerCase();
  const skillRef = entry ? entry.skill : "";

  const autoMessage = [
    `<BetterDeepSeek>`,
    `[BDS:AUTO] ERROR during ${toolName} generation.`,
    `Error Message: ${error}`,
    `Original Code Snippet:`,
    "```javascript",
    originalCode.trim(),
    "```",
    skillRef ? `\nLibrary API Reference (use this to fix the code):\n${skillRef}\n` : "",
    `Please analyze the error above, study the Library API Reference, then fix the code and provide the corrected version within the appropriate <BDS:${tagName}> tag.`,
    `Pay close attention to: correct API method names, proper arguments, and the required save/output call at the end.`,
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
