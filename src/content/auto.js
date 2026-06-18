/**
 * BDS:AUTO Systems
 * Handles automatic requests from DeepSeek.
 */

import { fetchAndConvertWebPage } from "./files/web-reader.js";
import { searchWeb } from "./files/search-reader.js";
import { fetchGitHubRepo } from "./files/github-reader.js";
import { fetchTwitterTweet } from "./files/twitter-reader.js";
import { fetchYouTubeData } from "./files/youtube-reader.js";
import appState from "./state.js";
import { XLSX_SKILL } from "../lib/office-skills/xlsx.js";
import { PPTX_SKILL } from "../lib/office-skills/pptx.js";
import { DOCX_SKILL } from "../lib/office-skills/docx.js";
import { extractHttpUrl, normalizeHttpUrl } from "../lib/utils/url-normalizer.js";

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
const processedSearchQueries = new Set();
// Per-run search deduplication for deep research
const processedRunSearchQueries = new Map();

function normalizeSearchKeyPart(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function getSearchDedupeKey(query, options = {}) {
  const baseKey = normalizeSearchKeyPart(query);
  const purpose = normalizeSearchKeyPart(options.purpose);
  const sourceType = normalizeSearchKeyPart(options.sourceType);
  if (!purpose && !sourceType) {
    return baseKey;
  }
  return [baseKey, purpose, sourceType].join("\n");
}

export async function handleAutoWebFetch(url) {
  let targetUrl;
  try {
    targetUrl = normalizeHttpUrl(url);
  } catch (err) {
    console.error("[BDS:AUTO] Invalid Web Fetch URL:", err);
    return;
  }

  if (processedWebFetches.has(targetUrl)) return;
  processedWebFetches.add(targetUrl);

  console.log(`[BDS:AUTO] Starting automatic web fetch for: ${targetUrl}`);

  try {
    const file = await fetchAndConvertWebPage(targetUrl, (status) => {
      console.log(`[BDS:AUTO] Web Fetch Status: ${status}`);
    });

    if (file) {
      injectFileAndSend(file, `<BetterDeepSeek>\n[BDS:AUTO] Web Fetch Result for: ${targetUrl}\n</BetterDeepSeek>`);
    }
  } catch (err) {
    console.error("[BDS:AUTO] Web Fetch Failed:", err);
    // Optionally create a text file with the error so DeepSeek knows it failed
    const errorBlob = new Blob([`Failed to fetch ${targetUrl}:\n\n${err.message}`], { type: "text/plain" });
    const errorFile = new File([errorBlob], `error_${targetUrl.replace(/[^a-zA-Z0-9]/g, "_")}.txt`, { type: "text/plain" });
    injectFileAndSend(errorFile, `<BetterDeepSeek>\n[BDS:AUTO] Web fetch failed for ${targetUrl}\n</BetterDeepSeek>`);
  }
}

export async function handleAutoGitHubFetch(repoUrl) {
  const targetRepoUrl = extractHttpUrl(repoUrl) || String(repoUrl || "").trim();
  if (!targetRepoUrl) return;

  if (processedGitHubFetches.has(targetRepoUrl)) return;
  processedGitHubFetches.add(targetRepoUrl);

  console.log(`[BDS:AUTO] Starting automatic GitHub fetch for: ${targetRepoUrl}`);

  try {
    const token = String(appState.settings.githubToken || "").trim();
    const file = await fetchGitHubRepo(
      targetRepoUrl,
      (status) => {
        console.log(`[BDS:AUTO] GitHub Fetch Status: ${status}`);
      },
      { token }
    );

    if (file) {
      injectFileAndSend(file, `<BetterDeepSeek>\n[BDS:AUTO] GitHub Fetch Result for: ${targetRepoUrl}\n</BetterDeepSeek>`);
    }
  } catch (err) {
    console.error("[BDS:AUTO] GitHub Fetch Failed:", err);
    const errorBlob = new Blob([`Failed to fetch GitHub repo ${targetRepoUrl}:\n\n${err.message}`], { type: "text/plain" });
    const errorFile = new File([errorBlob], `github_error_${targetRepoUrl.replace(/[^a-zA-Z0-9]/g, "_")}.txt`, { type: "text/plain" });
    injectFileAndSend(errorFile, `<BetterDeepSeek>\n[BDS:AUTO] GitHub fetch failed for ${targetRepoUrl}\n</BetterDeepSeek>`);
  }
}

export async function handleAutoTwitterFetch(url) {
  let targetUrl;
  try {
    targetUrl = normalizeHttpUrl(url);
  } catch (err) {
    console.error("[BDS:AUTO] Invalid Twitter URL:", err);
    return;
  }

  if (processedTwitterFetches.has(targetUrl)) return;
  processedTwitterFetches.add(targetUrl);

  console.log(`[BDS:AUTO] Starting automatic Twitter fetch for: ${targetUrl}`);

  try {
    const file = await fetchTwitterTweet(targetUrl);
    if (file) {
      injectFileAndSend(file, `<BetterDeepSeek>\n[BDS:AUTO] Twitter Fetch Result for: ${targetUrl}\n</BetterDeepSeek>`);
    }
  } catch (err) {
    console.error("[BDS:AUTO] Twitter Fetch Failed:", err);
    const errorBlob = new Blob([`Failed to fetch tweet ${targetUrl}:\n\n${err.message}`], { type: "text/plain" });
    const errorFile = new File([errorBlob], `twitter_error_${targetUrl.replace(/[^a-zA-Z0-9]/g, "_")}.md`, { type: "text/plain" });
    injectFileAndSend(errorFile, `<BetterDeepSeek>\n[BDS:AUTO] Twitter fetch failed for ${targetUrl}\n</BetterDeepSeek>`);
  }
}

export async function handleAutoYouTubeFetch(url) {
  let targetUrl;
  try {
    targetUrl = normalizeHttpUrl(url);
  } catch (err) {
    console.error("[BDS:AUTO] Invalid YouTube URL:", err);
    return;
  }

  if (processedYouTubeFetches.has(targetUrl)) return;
  processedYouTubeFetches.add(targetUrl);

  console.log(`[BDS:AUTO] Starting automatic YouTube fetch for: ${targetUrl}`);

  try {
    const file = await fetchYouTubeData(targetUrl);
    if (file) {
      injectFileAndSend(file, `<BetterDeepSeek>\n[BDS:AUTO] YouTube Fetch Result for: ${targetUrl}\n</BetterDeepSeek>`);
    }
  } catch (err) {
    console.error("[BDS:AUTO] YouTube Fetch Failed:", err);
    const errorBlob = new Blob([`Failed to fetch YouTube video ${targetUrl}:\n\n${err.message}`], { type: "text/plain" });
    const errorFile = new File([errorBlob], `youtube_error_${targetUrl.replace(/[^a-zA-Z0-9]/g, "_")}.txt`, { type: "text/plain" });
    injectFileAndSend(errorFile, `<BetterDeepSeek>\n[BDS:AUTO] YouTube fetch failed for ${targetUrl}\n</BetterDeepSeek>`);
  }
}

/**
 * Handles automatic web search requests via DuckDuckGo Lite.
 * @param {string} query - Search query
 * @param {number} [deepFetch=0] - Number of top results to also fetch full content for
 * @param {{ purpose?: string, sourceType?: "general"|"docs"|"news"|"reviews"|"academic"|"commerce" }} [options]
 */
export async function handleAutoSearch(query, deepFetch = 0, options = {}) {
  const q = normalizeSearchKeyPart(query);
  const dedupeKey = getSearchDedupeKey(q, options);
  if (processedSearchQueries.has(dedupeKey)) return;
  processedSearchQueries.add(dedupeKey);

  console.log(`[BDS:AUTO] Starting automatic search for: ${q}${deepFetch > 0 ? ` (deepFetch=${deepFetch})` : ""}`);

  try {
    const result = await searchWeb(q, deepFetch, (status) => {
      console.log(`[BDS:AUTO] Search Status: ${status}`);
    }, options);

    if (result.file) {
      const payload = JSON.stringify({
        query: result.query,
        deepFetch: result.deepFetch,
        count: result.results.length,
        results: result.results,
        provider: result.provider,
        effectiveQuery: result.effectiveQuery,
        rawResultCount: result.rawResultCount,
        purpose: options.purpose,
        sourceType: options.sourceType,
      });
      const autoMessage = [
        `<BetterDeepSeek>`,
        `[BDS:AUTO] Search Result for: ${result.query}`,
        `[BDS:AUTO_SEARCH_RESULT]`,
        payload,
        `[/BDS:AUTO_SEARCH_RESULT]`,
        `</BetterDeepSeek>`
      ].join("\n");
      injectFileAndSend(result.file, autoMessage);
    }
  } catch (err) {
    console.error("[BDS:AUTO] Search Failed:", err);
    const errorBlob = new Blob([`Failed to search "${q}":\n\n${err.message}`], { type: "text/plain" });
    const errorFile = new File([errorBlob], `search_error_${q.replace(/[^a-zA-Z0-9]/g, "_")}.txt`, { type: "text/plain" });
    injectFileAndSend(errorFile, `<BetterDeepSeek>\n[BDS:AUTO] Search failed for: ${q}\n</BetterDeepSeek>`);
  }
}

/**
 * Handles automatic web search requests scoped to a deep research run.
 * Uses per-run deduplication so repeated research runs are not blocked by the global query set.
 * @param {string} query - Search query
 * @param {number} [deepFetch=0] - Number of top results to also fetch full content for
 * @param {string} runId - Deep research run ID
 * @param {{ purpose?: string, sourceType?: "general"|"docs"|"news"|"reviews"|"academic"|"commerce" }} [options]
 */
export async function handleAutoSearchForRun(query, deepFetch = 0, runId = "", options = {}) {
  const q = normalizeSearchKeyPart(query);
  const dedupeKey = getSearchDedupeKey(q, options);
  if (!runId) {
    // Fallback to global dedupe
    return handleAutoSearch(q, deepFetch, options);
  }

  if (!processedRunSearchQueries.has(runId)) {
    processedRunSearchQueries.set(runId, new Set());
  }
  const runSet = processedRunSearchQueries.get(runId);
  if (runSet.has(dedupeKey)) return;
  runSet.add(dedupeKey);

  console.log(`[BDS:AUTO] Starting run-scoped search for: ${q} (runId=${runId}, deepFetch=${deepFetch})`);

  try {
    const result = await searchWeb(q, deepFetch, (status) => {
      console.log(`[BDS:AUTO] Search Status: ${status}`);
    }, options);

    if (result.file) {
      const payload = JSON.stringify({
        query: result.query,
        deepFetch: result.deepFetch,
        count: result.results.length,
        results: result.results,
        provider: result.provider,
        effectiveQuery: result.effectiveQuery,
        rawResultCount: result.rawResultCount,
        purpose: options.purpose,
        sourceType: options.sourceType,
        runId,
      });
      const autoMessage = [
        `<BetterDeepSeek>`,
        `[BDS:AUTO] Search Result for: ${result.query} (runId=${runId})`,
        `[BDS:AUTO_SEARCH_RESULT]`,
        payload,
        `[/BDS:AUTO_SEARCH_RESULT]`,
        `</BetterDeepSeek>`
      ].join("\n");
      injectFileAndSend(result.file, autoMessage);
    }
  } catch (err) {
    console.error("[BDS:AUTO] Run-scoped Search Failed:", err);
    const errorBlob = new Blob([`Failed to search "${q}":\n\n${err.message}`], { type: "text/plain" });
    const errorFile = new File([errorBlob], `search_error_${q.replace(/[^a-zA-Z0-9]/g, "_")}.txt`, { type: "text/plain" });
    injectFileAndSend(errorFile, `<BetterDeepSeek>\n[BDS:AUTO] Search failed for: ${q} (runId=${runId})\n</BetterDeepSeek>`);
  }
}

/**
 * Clear run-scoped search history for a specific run.
 * @param {string} runId
 */
export function clearRunSearchHistory(runId) {
  processedRunSearchQueries.delete(runId);
}

/**
 * Get the set of processed queries for a run (for testing).
 * @param {string} runId
 * @returns {Set<string>|undefined}
 */
export function getRunSearchQueries(runId) {
  return processedRunSearchQueries.get(runId);
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

export function injectPureTextAndSend(autoMessage, logLabel = "Text prompt") {
  if (!setChatInputText(autoMessage)) {
    console.error(`[BDS:AUTO] Failed to send ${logLabel}: chat input was not found or could not be updated.`);
    return false;
  }

  sendCurrentChatInput(logLabel);
  return true;
}

async function readFileText(file) {
  if (!file) return "";

  if (typeof file.text === "function") {
    return await file.text();
  }

  if (typeof file.arrayBuffer === "function") {
    const buffer = await file.arrayBuffer();
    return new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  }

  if (typeof FileReader !== "undefined") {
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }

  return "";
}

function findChatEditor() {
  const selectors = [
    "textarea#chat-input",
    ".ds-textarea textarea",
    '[role="textbox"][contenteditable]',
    '[role="textbox"]',
    ".ProseMirror[contenteditable]",
    "textarea[placeholder]",
    "input[placeholder]",
    "[contenteditable]",
  ];

  for (const selector of selectors) {
    const editor = Array.from(document.querySelectorAll(selector))
      .find((candidate) => !isBdsOwnedElement(candidate));
    if (editor) return editor;
  }

  return null;
}

function isBdsOwnedElement(element) {
  return Boolean(element?.closest?.(
    "#bds-root, .bds-question-panel, .bds-dr-revision-panel, .bds-attach-wrapper, .bds-rag-preview",
  ));
}

function makeInputEvent(inputType = "insertText", data = "") {
  if (typeof InputEvent === "function") {
    return new InputEvent("input", {
      bubbles: true,
      cancelable: true,
      inputType,
      data,
    });
  }
  return new Event("input", { bubbles: true });
}

function dispatchEditorEvents(editor, inputType = "insertText", data = "") {
  editor.dispatchEvent(makeInputEvent(inputType, data));
  editor.dispatchEvent(new Event("change", { bubbles: true }));
  editor.dispatchEvent(new KeyboardEvent("keyup", { key: "Process", bubbles: true }));
}

function dispatchBeforeInput(editor, inputType = "insertText", data = "") {
  if (typeof InputEvent === "function") {
    editor.dispatchEvent(new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      inputType,
      data,
    }));
    return;
  }
  editor.dispatchEvent(new Event("beforeinput", { bubbles: true, cancelable: true }));
}

function setContentEditableDom(editor, value) {
  const shouldUseParagraphs =
    editor.classList?.contains("ProseMirror") ||
    editor.querySelector?.("p");

  if (!shouldUseParagraphs) {
    editor.textContent = value;
    return;
  }

  const lines = String(value || "").split("\n");
  const nodes = lines.map((line) => {
    const paragraph = document.createElement("p");
    paragraph.textContent = line || "\u200b";
    return paragraph;
  });
  editor.replaceChildren(...nodes);
}

function moveCaretToEnd(editor) {
  const selection = window.getSelection?.();
  if (!selection || !document.createRange) return;
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

export function setChatInputText(text) {
  const editor = findChatEditor();
  if (!editor) return false;

  const value = String(text || "");
  editor.focus();

  const tagName = String(editor.tagName || "").toLowerCase();
  if (tagName === "textarea" || tagName === "input") {
    const prototype = tagName === "textarea"
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(
      prototype,
      "value",
    )?.set;
    if (setter) {
      setter.call(editor, value);
    } else {
      editor.value = value;
    }
    dispatchEditorEvents(editor, "insertText", value);
    return true;
  }

  const isContentEditable =
    editor.isContentEditable ||
    editor.contentEditable === "true" ||
    editor.contentEditable === "plaintext-only" ||
    editor.hasAttribute("contenteditable");

  if (isContentEditable) {
    const selection = window.getSelection?.();
    if (selection && document.createRange) {
      const range = document.createRange();
      range.selectNodeContents(editor);
      selection.removeAllRanges();
      selection.addRange(range);
    }

    let inserted = false;
    if (typeof document.execCommand === "function") {
      inserted = document.execCommand("insertText", false, value);
    }

    if (!inserted) {
      setContentEditableDom(editor, value);
    } else if ((editor.textContent || "").trim() !== value.trim()) {
      setContentEditableDom(editor, value);
    }
    moveCaretToEnd(editor);
    dispatchBeforeInput(editor, "insertText", value);
    dispatchEditorEvents(editor, "insertText", value);
    return true;
  }

  return false;
}

function findSendButton() {
  const buttons = Array.from(document.querySelectorAll('div[role="button"], button'));
  return buttons.find((button) => {
    const label = `${button.title || ""} ${button.ariaLabel || ""} ${button.getAttribute("aria-label") || ""}`
      .toLowerCase()
      .trim();
    const isSend =
      button.querySelector('svg path[d*="M8.3125"], .ds-icon-send') ||
      button.querySelector('svg path[d*="M13.12 19.98"]') ||
      button.querySelector('svg path[d*="M12 19"]') ||
      button.title === "Send message" ||
      button.ariaLabel === "Send Message" ||
      button.getAttribute("aria-label") === "Send Message" ||
      label.includes("send message") ||
      label === "send";
    const isBdsControl =
      button.classList.contains("bds-plus-btn") ||
      button.classList.contains("bds-deep-research-toggle") ||
      isBdsOwnedElement(button) ||
      button.closest("#bds-root");
    return isSend && !isBdsControl;
  });
}

function isSendButtonDisabled(sendBtn) {
  return (
    sendBtn.getAttribute("aria-disabled") === "true" ||
    sendBtn.classList.contains("ds-icon-button--disabled") ||
    sendBtn.disabled === true
  );
}

function sendCurrentChatInput(logLabel = "Auto message") {
  let attempts = 0;
  const maxAttempts = 50;
  let enterFallbackSent = false;

  const attemptSend = () => {
    attempts++;
    const sendBtn = findSendButton();

    if (sendBtn) {
      if (!isSendButtonDisabled(sendBtn)) {
        sendBtn.click();
        console.log(`[BDS:AUTO] ${logLabel} sent successfully after ${attempts} attempts.`);
        return;
      }
    }

    if (!enterFallbackSent && attempts === 6) {
      enterFallbackSent = true;
      const editor = findChatEditor();
      if (editor) {
        editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        editor.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", bubbles: true }));
      }
    }

    if (attempts < maxAttempts) {
      setTimeout(attemptSend, 200);
    } else {
      console.error(`[BDS:AUTO] Failed to send ${logLabel}: button stayed disabled or was not found.`);
      const editor = findChatEditor();
      if (editor) {
        editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      }
    }
  };

  setTimeout(attemptSend, 500);
}


export async function sendFileWithMessage(file, autoMessage = "", logLabel = "Auto file message") {
  const nativeInput = document.querySelector('input[type="file"][multiple]');

  // // FALLBACK: inject file and send message directly if no file input is found
  if (!nativeInput) {
    let fileContent;
    try {
      fileContent = await readFileText(file);
    } catch (err) {
      fileContent = `(Error reading file content: ${err.message})`;
    }

    const ext = String(file.name || "").split('.').pop() || '';
    const LANG_HINTS = { md: 'markdown', json: 'json', html: 'html', xml: 'xml', yaml: 'yaml', yml: 'yaml', csv: 'csv', txt: 'text', js: 'javascript', ts: 'typescript', py: 'python', css: 'css' };
    const langHint = LANG_HINTS[ext] || 'text';

    const fullMessage = `${autoMessage}\n\`\`\`${langHint}\n${fileContent}\n\`\`\``;
    return injectPureTextAndSend(fullMessage, logLabel);
  }

  // normal path: file input exists, load the file

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
    setChatInputText(autoMessage);
  }

  sendCurrentChatInput(logLabel);
  return true;
}

async function injectFileAndSend(file, autoMessage = "") {
  return sendFileWithMessage(file, autoMessage);
}
