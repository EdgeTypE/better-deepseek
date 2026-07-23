/**
 * BDS:AUTO Systems
 * Handles automatic requests from DeepSeek.
 */

import { devLog } from "../lib/dev-log.js";
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
const processedMcpCalls = new Set();
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

function releaseSearchDedupeOnSendFailure(sendPromise, releaseDedupe, label) {
  Promise.resolve(sendPromise)
    .then((sent) => {
      if (sent === false) releaseDedupe();
    })
    .catch((err) => {
      console.error(`[BDS:AUTO] ${label} injection failed:`, err);
      releaseDedupe();
    });
}

function releaseRunSearchDedupe(runId, dedupeKey) {
  const runSet = processedRunSearchQueries.get(runId);
  if (!runSet) return;
  runSet.delete(dedupeKey);
  if (runSet.size === 0) {
    processedRunSearchQueries.delete(runId);
  }
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

  devLog("Auto", `Starting automatic web fetch for: ${targetUrl}`);

  try {
    const file = await fetchAndConvertWebPage(targetUrl, (status) => {
      devLog("Auto", `Web Fetch Status: ${status}`);
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

  devLog("Auto", `Starting automatic GitHub fetch for: ${targetRepoUrl}`);

  try {
    const token = String(appState.settings.githubToken || "").trim();
    const file = await fetchGitHubRepo(
      targetRepoUrl,
      (status) => {
        devLog("Auto", `GitHub Fetch Status: ${status}`);
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

  devLog("Auto", `Starting automatic Twitter fetch for: ${targetUrl}`);

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

  devLog("Auto", `Starting automatic YouTube fetch for: ${targetUrl}`);

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

  devLog("Auto", `Starting automatic search for: ${q}${deepFetch > 0 ? ` (deepFetch=${deepFetch})` : ""}`);

  try {
    const result = await searchWeb(q, deepFetch, (status) => {
      devLog("Auto", `Search Status: ${status}`);
    }, options);

    if (!result?.file) {
      throw new Error("Search returned no file.");
    }

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
    releaseSearchDedupeOnSendFailure(
      injectFileAndSend(result.file, autoMessage),
      () => processedSearchQueries.delete(dedupeKey),
      "Search result",
    );
  } catch (err) {
    console.error("[BDS:AUTO] Search Failed:", err);
    processedSearchQueries.delete(dedupeKey);
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

  devLog("Auto", `Starting run-scoped search for: ${q} (runId=${runId}, deepFetch=${deepFetch})`);

  try {
    const result = await searchWeb(q, deepFetch, (status) => {
      devLog("Auto", `Search Status: ${status}`);
    }, options);

    if (!result?.file) {
      throw new Error("Search returned no file.");
    }

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
    releaseSearchDedupeOnSendFailure(
      injectFileAndSend(result.file, autoMessage),
      () => releaseRunSearchDedupe(runId, dedupeKey),
      "Run-scoped search result",
    );
  } catch (err) {
    console.error("[BDS:AUTO] Run-scoped Search Failed:", err);
    releaseRunSearchDedupe(runId, dedupeKey);
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

  devLog("Auto", `Sending code runner result (${status})...`);
  await injectPureTextAndSend(autoMessage);
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

  devLog("Auto", `Sending error report for ${toolName}...`);

  // We use injectFileAndSend without a file for pure text injection
  await injectPureTextAndSend(autoMessage);
}

export async function handleAutoMcpCall(serverUrl, toolName, args = {}) {
  const dedupeKey = `${serverUrl}|${toolName}|${JSON.stringify(args)}`;
  if (processedMcpCalls.has(dedupeKey)) return;
  processedMcpCalls.add(dedupeKey);
  if (processedMcpCalls.size > 500) {
    const iter = processedMcpCalls.values();
    for (let i = 0; i < 100; i++) processedMcpCalls.delete(iter.next().value);
  }

  devLog("Auto", `Starting MCP call: ${toolName} @ ${serverUrl}`);

  const server = appState.mcpServers.find(s => s.serverUrl === serverUrl || s.name === serverUrl);
  const apiKey = server?.apiKey || "";
  const actualUrl = server?.serverUrl || serverUrl;

  try {
    const result = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { type: "bds-mcp-call", serverUrl: actualUrl, apiKey, toolName, args },
        (response) => {
          if (response?.ok) resolve(response.result);
          else reject(new Error(response?.error || "MCP call failed"));
        }
      );
    });

    const textContent = Array.isArray(result?.content)
      ? result.content.map(c => c.text || "").filter(Boolean).join("\n")
      : JSON.stringify(result);

    const MAX_INLINE = 8000;
    const inlineContent = textContent.length > MAX_INLINE
      ? textContent.slice(0, MAX_INLINE) + "\n\n...[truncated, full content in attached file]..."
      : textContent;

    const payload = JSON.stringify({
      serverName: serverUrl,
      toolName: toolName,
      args: args,
      content: inlineContent,
    });

    const mcpBlob = new Blob([textContent], { type: "text/plain" });
    const mcpFile = new File([mcpBlob], `mcp_result_${toolName}.txt`, { type: "text/plain" });

    const autoMessage = [
      `<BetterDeepSeek>`,
      `[BDS:AUTO] MCP Result for ${toolName} @ ${serverUrl}`,
      `[BDS:AUTO_MCP_RESULT]`,
      payload,
      `[/BDS:AUTO_MCP_RESULT]`,
      `</BetterDeepSeek>`
    ].join("\n");

    await injectFileAndSend(mcpFile, autoMessage);
  } catch (err) {
    console.error("[BDS:AUTO] MCP Call Failed:", err);
    processedMcpCalls.delete(dedupeKey);
    const errorMessage = [
      `<BetterDeepSeek>`,
      `[BDS:AUTO] MCP call failed for ${toolName} @ ${serverUrl}`,
      `Error: ${err.message}`,
      `</BetterDeepSeek>`
    ].join("\n");
    await injectPureTextAndSend(errorMessage, `MCP error ${toolName}`);
  }
}

export async function injectPureTextAndSend(autoMessage, logLabel = "Text prompt") {
  if (!setChatInputText(autoMessage)) {
    console.error(`[BDS:AUTO] Failed to send ${logLabel}: chat input was not found or could not be updated.`);
    return false;
  }

  return sendCurrentChatInput(logLabel);
}

export async function readFileText(file) {
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

export function findChatEditor() {
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

const SEND_INITIAL_DELAY_MS = 500;
const SEND_RETRY_DELAY_MS = 200;
const SEND_MAX_WAIT_MS = 120_000;
const SEND_ENTER_FALLBACK_AFTER_MS = 1_200;
const SEND_POST_CLICK_LIMIT_CHECK_MS = 50;
const OVER_LIMIT_RE = /over\s+limit\s+by|content\s+is\s+too\s+long|please\s+shorten\s+it/i;

function getButtonLabel(button) {
  return `${button.title || ""} ${button.ariaLabel || ""} ${button.getAttribute("aria-label") || ""} ${button.textContent || ""}`
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function hasKnownSendIconPath(button) {
  const d = getSvgPathData(button);
  const compact = d.replace(/[,\s]/g, "");

  return (
    d.includes("M8.3125") ||
    d.includes("M8.312") ||
    d.includes("M13.12 19.98") ||
    compact.includes("M1219V5") ||
    compact.includes("M1219V6") ||
    compact.includes("M1018V6") ||
    (compact.includes("M222") && compact.includes("L1113")) ||
    (compact.includes("M2.0121") && compact.includes("L2312"))
  );
}

function hasHighConfidenceSendIconPath(button) {
  const d = getSvgPathData(button);
  const compact = d.replace(/[,\s]/g, "");

  return (
    d.includes("M8.3125") ||
    d.includes("M8.312") ||
    d.includes("M13.12 19.98") ||
    compact.includes("M1219V5") ||
    compact.includes("M1219V6") ||
    compact.includes("M1018V6")
  );
}

function hasExplicitSendLabel(button, label) {
  return (
    button.title === "Send message" ||
    button.ariaLabel === "Send Message" ||
    button.getAttribute("aria-label") === "Send Message" ||
    label.includes("send message") ||
    label.includes("submit message") ||
    label.includes("\u53d1\u9001") ||
    label === "send" ||
    label === "submit"
  );
}

function getSvgPathData(button) {
  return Array.from(button.querySelectorAll("svg path"))
    .map((path) => path.getAttribute("d") || "")
    .join(" ");
}

function hasSendLikeIcon(button) {
  const className = String(button.className || "").toLowerCase();
  return (
    button.querySelector(".ds-icon-send") ||
    className.includes("send") ||
    hasKnownSendIconPath(button)
  );
}

function isBdsControlButton(button) {
  return (
    button.classList.contains("bds-plus-btn") ||
    button.classList.contains("bds-deep-research-toggle") ||
    isBdsOwnedElement(button) ||
    button.closest("#bds-root, .bds-deep-research-mount, .bds-attach-menu-mount")
  );
}

function isNonSendComposerControl(button, label) {
  return (
    isBdsControlButton(button) ||
    label.includes("attach") ||
    label.includes("upload") ||
    label.includes("file") ||
    label.includes("folder") ||
    label.includes("voice") ||
    label.includes("microphone") ||
    label.includes("search") ||
    label.includes("deepthink") ||
    label.includes("deep think") ||
    label.includes("deepresearch") ||
    label.includes("deep research") ||
    label.includes("expand") ||
    label.includes("open") ||
    label.includes("preview") ||
    label.includes("fullscreen") ||
    label.includes("enlarge")
  );
}

function getComposerRootCandidates(editor) {
  if (!editor) return [];

  const roots = [];
  const seen = new Set();
  const addRoot = (root) => {
    if (!root || root === document.body || root === document.documentElement || seen.has(root)) return;
    seen.add(root);
    roots.push(root);
  };

  const form = editor.closest?.("form");
  addRoot(form);

  let candidate = editor.parentElement;
  for (let depth = 0; candidate && depth < 10; depth++) {
    if (candidate === document.body || candidate === document.documentElement) break;
    addRoot(candidate);
    candidate = candidate.parentElement;
  }

  return roots;
}

function findNativeFileInput() {
  return Array.from(document.querySelectorAll('input[type="file"][multiple]'))
    .find((input) => !isBdsOwnedElement(input) && !input.disabled) || null;
}

function isAfterNode(reference, candidate) {
  if (!reference || !candidate || reference === candidate) {
    return true;
  }

  const following = globalThis.Node?.DOCUMENT_POSITION_FOLLOWING || 4;
  return Boolean(reference.compareDocumentPosition(candidate) & following);
}

function getEligibleComposerIconButtons(root, editor) {
  return Array.from(root.querySelectorAll('button, div[role="button"]'))
    .filter((candidate) =>
      (!editor || isAfterNode(editor, candidate)) &&
      candidate.querySelector("svg") &&
      !isNonSendComposerControl(candidate, getButtonLabel(candidate)),
    );
}

function findIconOnlySendButtonInRoot(root, editor, { allowGenericLastIcon = false } = {}) {
  const iconButtons = getEligibleComposerIconButtons(root, editor);
  const sendLikeButton = iconButtons.find(hasSendLikeIcon);
  if (sendLikeButton) return sendLikeButton;

  return allowGenericLastIcon ? iconButtons[iconButtons.length - 1] || null : null;
}

function isComposerSendRegion(button, editor, roots) {
  if (!editor) return true;
  if (!roots.length) return isAfterNode(editor, button);
  return roots.some((root) => root.contains(button)) && isAfterNode(editor, button);
}

function hasOverLimitText(element) {
  return OVER_LIMIT_RE.test(element?.textContent || "");
}

function hasOverLimitIndicator(editor = findChatEditor()) {
  const roots = getComposerRootCandidates(editor);
  for (const root of roots) {
    if (hasOverLimitText(root)) return true;
  }

  const indicatorCandidates = Array.from(document.querySelectorAll(
    'span, div[role="alert"], div[role="status"], [class*="toast"], [class*="tooltip"], [class*="limit"]',
  ));
  return indicatorCandidates.some((candidate) =>
    !isBdsOwnedElement(candidate) &&
    !candidate.closest(".ds-message") &&
    hasOverLimitText(candidate)
  );
}

function findSendButton() {
  const editor = findChatEditor();
  const roots = getComposerRootCandidates(editor);
  const buttons = Array.from(document.querySelectorAll('div[role="button"], button'));
  const explicitSend = buttons.find((button) => {
    const label = getButtonLabel(button);
    if (isBdsControlButton(button)) return false;
    if (hasExplicitSendLabel(button, label)) {
      return !editor || isAfterNode(editor, button);
    }
    if (hasHighConfidenceSendIconPath(button)) {
      return !editor || isAfterNode(editor, button);
    }
    if (!isComposerSendRegion(button, editor, roots)) return false;
    return button.querySelector(".ds-icon-send") || hasKnownSendIconPath(button);
  });
  if (explicitSend) return explicitSend;

  for (const root of roots) {
    const candidate = findIconOnlySendButtonInRoot(root, editor);
    if (candidate) return candidate;
  }

  for (const root of roots.slice().reverse()) {
    const candidate = findIconOnlySendButtonInRoot(root, editor, { allowGenericLastIcon: true });
    if (candidate) return candidate;
  }

  return null;
}

function isSendButtonDisabled(sendBtn) {
  return (
    sendBtn.getAttribute("aria-disabled") === "true" ||
    sendBtn.hasAttribute("disabled") ||
    sendBtn.classList.contains("ds-button--disabled") ||
    sendBtn.classList.contains("ds-icon-button--disabled") ||
    Array.from(sendBtn.classList).some((className) => className.endsWith("--disabled")) ||
    sendBtn.disabled === true
  );
}

function sendCurrentChatInputResult(logLabel = "Auto message") {
  return new Promise((resolve) => {
    let attempts = 0;
    const startedAt = Date.now();
    let enterFallbackSent = false;
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const attemptSend = () => {
      attempts++;
      const elapsed = Date.now() - startedAt;
      const editor = findChatEditor();

      if (hasOverLimitIndicator(editor)) {
        console.error(`[BDS:AUTO] Failed to send ${logLabel}: message is over the composer limit.`);
        finish({ ok: false, reason: "over_limit", attempts });
        return;
      }

      const sendBtn = findSendButton();

      if (sendBtn) {
        if (!isSendButtonDisabled(sendBtn)) {
          sendBtn.click();
          setTimeout(() => {
            if (hasOverLimitIndicator(editor)) {
              console.error(`[BDS:AUTO] Failed to send ${logLabel}: message is over the composer limit.`);
              finish({ ok: false, reason: "over_limit", attempts });
              return;
            }
            devLog("Auto", `${logLabel} sent successfully after ${attempts} attempts.`);
            finish({ ok: true, reason: "", attempts });
          }, SEND_POST_CLICK_LIMIT_CHECK_MS);
          return;
        }
      }

      if (!enterFallbackSent && elapsed >= SEND_ENTER_FALLBACK_AFTER_MS) {
        enterFallbackSent = true;
        const editor = findChatEditor();
        if (editor) {
          editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
          editor.dispatchEvent(new KeyboardEvent("keypress", { key: "Enter", bubbles: true }));
          editor.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", bubbles: true }));
        }
      }

      if (elapsed < SEND_MAX_WAIT_MS) {
        setTimeout(attemptSend, SEND_RETRY_DELAY_MS);
      } else {
        console.error(`[BDS:AUTO] Failed to send ${logLabel}: button stayed disabled or was not found.`);
        if (editor) {
          editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        }
        finish({ ok: false, reason: "not_found_or_disabled", attempts });
      }
    };

    setTimeout(attemptSend, SEND_INITIAL_DELAY_MS);
  });
}

function sendCurrentChatInput(logLabel = "Auto message") {
  return sendCurrentChatInputResult(logLabel).then((result) => result.ok);
}

async function sendTextWithOverLimitFallbacks(textAttempts, logLabel) {
  const attempts = textAttempts
    .map((text) => String(text || ""))
    .filter((text, index, arr) => text && arr.indexOf(text) === index);

  if (attempts.length === 0) {
    return sendCurrentChatInput(logLabel);
  }

  for (let i = 0; i < attempts.length; i++) {
    if (!setChatInputText(attempts[i])) {
      console.error(`[BDS:AUTO] Failed to send ${logLabel}: chat input was not found or could not be updated.`);
      return false;
    }

    const result = await sendCurrentChatInputResult(
      i === 0 ? logLabel : `${logLabel} retry ${i}`,
    );
    if (result.ok) return true;
    if (result.reason !== "over_limit") return false;
  }

  return false;
}

export async function sendFileWithMessage(file, autoMessage = "", logLabel = "Auto file message", options = {}) {
  const nativeInput = findNativeFileInput();
  const fallbackTexts = [
    options.overLimitFallbackText,
    options.overLimitEmergencyText,
  ];

  // // FALLBACK: inject file and send message directly if no file input is found
  if (!nativeInput) {
    if (options.inlineText) {
      return sendTextWithOverLimitFallbacks([
        options.inlineText,
        ...fallbackTexts,
      ], logLabel);
    }

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
    return sendTextWithOverLimitFallbacks([
      fullMessage,
      ...fallbackTexts,
    ], logLabel);
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
  return sendTextWithOverLimitFallbacks([
    autoMessage,
    ...fallbackTexts,
  ], logLabel);
}

async function injectFileAndSend(file, autoMessage = "") {
  return sendFileWithMessage(file, autoMessage);
}
