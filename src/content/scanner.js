/**
 * DOM observation and page scanning.
 */

import state, { withObserverPaused } from "./state.js";
import { LONG_WORK_STALE_MS } from "../lib/constants.js";
import { processMessageNode } from "./message-processor.svelte.js";
import { mount, unmount } from "svelte";
import AttachMenu from "./ui/AttachMenu.svelte";
import ExpandToggle from "./ui/ExpandToggle.svelte";
import RagPreview from "./ui/RagPreview.svelte";
import DeepResearchToggle from "./ui/DeepResearchToggle.svelte";
import { injectSearchInput } from "./ui/SidebarSearch.js";
import { checkPendingExport } from "./tools/pending-export.js";
import { hideTagsInSidebar, hideTagsInHeader } from "./tags/tag-hider.js";
import { setDeepResearchEnabled } from "./deep-research.js";
import { tryExecuteRawInput } from "./commands/executor.js";
import { checkPendingHandoff } from "./commands/context-handoff.js";
import Autocomplete from "./commands/Autocomplete.svelte";
import CommandsHelp from "./commands/CommandsHelp.svelte";

/**
 * Collect all message nodes from the chat DOM.
 */
export function collectMessageNodes() {
  const set = new Set();

  for (const node of document.querySelectorAll("div.ds-message._63c77b1")) {
    set.add(node);
  }

  if (!set.size) {
    for (const node of document.querySelectorAll("div.ds-message")) {
      set.add(node);
    }
  }

  return Array.from(set);
}

/**
 * Find the latest assistant message node.
 */
export function findLatestAssistantMessageNode() {
  const nodes = collectMessageNodes();
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const candidate = nodes[index];
    if (!candidate || candidate.closest("#bds-root")) {
      continue;
    }

    if (detectMessageRole(candidate) === "assistant") {
      return candidate;
    }
  }

  return null;
}

/**
 * Detect the role of a message DOM node.
 */
export function detectMessageRole(node) {
  if (node.classList && node.classList.contains("d29f3d7d")) {
    return "user";
  }

  if (node.closest("div._4f9bf79._43c05b5")) {
    return "assistant";
  }

  if (node.closest("div._9663006")) {
    return "user";
  }

  if (node.classList && node.classList.contains("ds-message")) {
    return "assistant";
  }

  const roleAttr = node.getAttribute("data-message-author-role");
  if (roleAttr) {
    return String(roleAttr).toLowerCase();
  }

  return "unknown";
}

/**
 * Check if a node is the absolute last message in the entire chat.
 */
export function isAbsoluteLastMessage(node) {
  const nodes = collectMessageNodes();
  return nodes[nodes.length - 1] === node;
}

/**
 * Check if a node is the latest assistant message.
 */
export function isLatestAssistantMessage(node) {
  return findLatestAssistantMessageNode() === node;
}

/**
 * Set up a MutationObserver on the document body.
 */
export function observeChatDom() {
  if (state.observer || !document.body) {
    return;
  }

  state.observer = new MutationObserver((records) => {
    for (const r of records) {
      if (r.addedNodes.length || r.removedNodes.length) {
        scheduleScan();
        return;
      }
    }
  });

  state.observer.observe(document.body, {
    subtree: true,
    childList: true,
  });
}

/**
 * Debounced page scan scheduler. Trailing-edge: coalesces bursts into one
 * scan ~140ms after the LAST mutation.
 */
export function scheduleScan() {
  if (state.scanTimer) {
    clearTimeout(state.scanTimer);
  }

  state.scanTimer = window.setTimeout(() => {
    state.scanTimer = 0;
    scanPage();
  }, 140);
}

/**
 * Full page scan — process all message nodes.
 */
function scanPage() {
  withObserverPaused(() => {
    if (
      state.longWork.active &&
      Date.now() - state.longWork.lastActivityAt > LONG_WORK_STALE_MS
    ) {
      state.longWork.active = false;
      state.longWork.files.clear();
      if (state.ui) {
        state.ui.showLongWorkOverlay(false);
        state.ui.showToast("LONG_WORK timeout cleared.");
      }
    }

    const nodes = collectMessageNodes();
    for (const node of nodes) {
      try {
        processMessageNode(node);
      } catch (err) {
        console.error("[BDS] Error processing message node:", err, node);
      }
    }

    linkifyLogo();
    linkifyNewChatButton();
    injectSearchInput();
    scanInputArea();
    hideTagsInSidebar();
    hideTagsInHeader();
  });
}

/**
 * Scan for the chat text input area to inject custom attachment menu
 */
export function scanInputArea() {
  const fileInput = findActiveFileInput();
  const wrapper = findComposerControlsWrapper(fileInput);
  const deepResearchWrapper = findDeepResearchControlsWrapper(fileInput, wrapper);
  if (!deepResearchWrapper) {
    return;
  }

  const insertBeforeNode = findDeepResearchInsertAnchor(
    deepResearchWrapper,
    fileInput,
    wrapper,
  );
  const nativeButton = fileInput ? findNativeFileInputTrigger(fileInput) : null;

  if (nativeButton) {
    nativeButton.style.setProperty("display", "none", "important");
  }

  const deepResearchMountPoint = ensureComposerMount(
    deepResearchWrapper,
    "bds-deep-research-mount",
    ".bds-deep-research-toggle",
    insertBeforeNode,
  );
  if (!deepResearchMountPoint.dataset.bdsMounted) {
    mount(DeepResearchToggle, {
      target: deepResearchMountPoint,
      props: {
        enabled: state.deepResearch.enabled,
        onToggle: (enabled) => setDeepResearchEnabled(enabled),
      },
    });
    deepResearchMountPoint.dataset.bdsMounted = "1";
  }

  if (!fileInput || !wrapper) {
    markComposerControlsMounted(deepResearchWrapper, wrapper);
    return;
  }

  if (wrapper !== deepResearchWrapper) {
    markComposerControlsMounted(deepResearchWrapper);
  }

  const mountPoint = ensureComposerMount(
    wrapper,
    "bds-attach-menu-mount",
    ".bds-attach-wrapper",
    fileInput,
  );
  if (!mountPoint.dataset.bdsMounted) {
    mount(AttachMenu, {
      target: mountPoint,
      props: {
        nativeInput: fileInput
      }
    });
    mountPoint.dataset.bdsMounted = "1";
  }

  const toggleMountPoint = ensureComposerMount(
    wrapper,
    "bds-expand-toggle-mount",
    ".bds-expand-toggle",
    fileInput,
  );
  if (!toggleMountPoint.dataset.bdsMounted) {
    mount(ExpandToggle, { target: toggleMountPoint });
    toggleMountPoint.dataset.bdsMounted = "1";
  }

  const ragMountPoint = ensureComposerMount(
    wrapper,
    "bds-rag-preview-mount",
    ".bds-rag-preview",
    fileInput,
  );
  if (!ragMountPoint.dataset.bdsMounted) {
    mount(RagPreview, { target: ragMountPoint });
    ragMountPoint.dataset.bdsMounted = "1";
  }

  markComposerControlsMounted(wrapper);
}

function findActiveFileInput() {
  const inputs = Array.from(document.querySelectorAll('input[type="file"][multiple]'))
    .filter((input) => !input.closest("#bds-root"));

  return inputs.find((input) =>
    isUsableComposerElement(input.parentElement || input)
  ) || inputs[0] || null;
}

function isUsableComposerElement(element) {
  if (!element || element.closest("#bds-root")) {
    return false;
  }

  for (let node = element; node && node !== document.body; node = node.parentElement) {
    const style = window.getComputedStyle?.(node);
    if (
      node.hidden ||
      node.getAttribute("aria-hidden") === "true" ||
      style?.display === "none" ||
      style?.visibility === "hidden"
    ) {
      return false;
    }
  }

  const rect = element.getBoundingClientRect?.();
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
  if (
    rect &&
    viewportWidth > 0 &&
    viewportHeight > 0 &&
    (rect.width > 0 || rect.height > 0)
  ) {
    return (
      rect.right >= 0 &&
      rect.bottom >= 0 &&
      rect.left <= viewportWidth &&
      rect.top <= viewportHeight
    );
  }

  return true;
}

function markComposerControlsMounted(...wrappers) {
  for (const wrapper of wrappers) {
    if (wrapper) {
      wrapper.setAttribute("data-bds-attach-menu-mounted", "true");
    }
  }
}

function findComposerControlsWrapper(fileInput) {
  if (fileInput?.parentElement) {
    return fileInput.parentElement;
  }

  const sendButton = findDeepSeekSendButton();
  if (sendButton?.parentElement) {
    return sendButton.parentElement;
  }

  const editor = document.querySelector("textarea#chat-input, textarea[placeholder], [contenteditable='true']");
  return editor?.parentElement || null;
}

function findDeepResearchControlsWrapper(fileInput, fallbackWrapper) {
  const actionRow = findNativePromptActionRow();
  if (actionRow) {
    return actionRow;
  }

  return fallbackWrapper || findComposerControlsWrapper(fileInput);
}

function findNativePromptActionRow() {
  const editor = findComposerEditor();
  const controls = Array.from(
    document.querySelectorAll(
      'button, [role="button"], [tabindex], [aria-label], [title]',
    ),
  );

  for (const control of controls) {
    if (control.closest("#bds-root")) {
      continue;
    }

    if (editor && !isAfterNode(editor, control)) {
      continue;
    }

    if (!isDeepThinkControl(control)) {
      continue;
    }

    const row = findControlsRowFor(control, editor);
    if (row) {
      return row;
    }
  }

  return null;
}

function findComposerEditor() {
  return document.querySelector(
    "textarea#chat-input, .ds-textarea textarea, textarea[placeholder], [role='textbox'], [contenteditable='true']",
  );
}

function isAfterNode(reference, candidate) {
  if (!reference || !candidate || reference === candidate) {
    return true;
  }

  const following = globalThis.Node?.DOCUMENT_POSITION_FOLLOWING || 4;
  return Boolean(reference.compareDocumentPosition(candidate) & following);
}

function isDeepThinkControl(control) {
  // Match by class and SVG path (preferred, language-independent)
  const hasToggleClass = control.classList?.contains("ds-toggle-button") || 
                         control.querySelector?.(".ds-toggle-button");
  if (hasToggleClass && control.querySelector?.('svg path[d*="M7.0643"]')) {
    return true;
  }

  // Fallback to direct SVG path match
  if (control.querySelector?.('svg path[d*="M7.0643"]')) {
    return true;
  }

  // Fallback for test environments (English label text)
  const text = normalizePromptControlText(control.textContent);
  const label = normalizePromptControlText(
    `${control.getAttribute("aria-label") || ""} ${control.getAttribute("title") || ""}`,
  );

  return (
    text.includes("deepthink") ||
    text.includes("deep think") ||
    label.includes("deepthink") ||
    label.includes("deep think")
  );
}

function normalizePromptControlText(value) {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function findControlsRowFor(control, editor) {
  let fallback = null;
  let node = control.parentElement;
  let depth = 0;

  while (node && node !== document.body && depth < 6) {
    if (node.closest("#bds-root")) {
      return null;
    }

    if (editor && node.contains(editor)) {
      return fallback;
    }

    fallback ||= node;

    if (countPromptControls(node) > 1) {
      return node;
    }

    node = node.parentElement;
    depth += 1;
  }

  return fallback;
}

function countPromptControls(container) {
  return Array.from(
    container.querySelectorAll('button, [role="button"], [tabindex]'),
  ).filter((control) => !control.closest("#bds-root")).length;
}

function findDeepSeekSendButton() {
  const buttons = Array.from(document.querySelectorAll('div[role="button"], button'));
  return buttons.find((button) => {
    if (button.closest("#bds-root")) {
      return false;
    }
    return (
      button.querySelector?.('svg path[d*="M8.3125"], .ds-icon-send') ||
      button.querySelector?.('svg path[d*="M13.12 19.98"]') ||
      button.title === "Send message" ||
      button.ariaLabel === "Send Message" ||
      button.getAttribute("aria-label") === "Send Message"
    );
  }) || null;
}

function findDeepResearchInsertAnchor(wrapper, fileInput, fileInputWrapper) {
  if (fileInput && wrapper === fileInputWrapper) {
    return fileInput;
  }

  return findComposerInsertAnchor(wrapper);
}

function findComposerInsertAnchor(wrapper) {
  return Array.from(wrapper.children).find((child) =>
    !child.classList?.contains("bds-deep-research-mount") &&
    !child.closest?.("#bds-root")
  ) || null;
}

function findNativeFileInputTrigger(fileInput) {
  const candidate = fileInput.previousElementSibling;
  if (!candidate || candidate.closest("#bds-root")) {
    return null;
  }

  if (
    candidate.classList?.contains("bds-deep-research-mount") ||
    candidate.classList?.contains("bds-attach-menu-mount") ||
    candidate.classList?.contains("bds-expand-toggle-mount") ||
    candidate.classList?.contains("bds-rag-preview-mount")
  ) {
    return null;
  }

  const tag = String(candidate.tagName || "").toLowerCase();
  const isButtonLike =
    tag === "button" ||
    tag === "label" ||
    candidate.getAttribute("role") === "button";

  return isButtonLike ? candidate : null;
}

function ensureComposerMount(wrapper, className, descendantSelector, beforeNode) {
  let mountPoint = Array.from(wrapper.children).find((child) =>
    child.classList && child.classList.contains(className)
  );

  if (!mountPoint && className === "bds-deep-research-mount") {
    mountPoint = document.querySelector(`.${className}`);
  }

  if (!mountPoint) {
    mountPoint = Array.from(wrapper.children).find((child) =>
      child.querySelector && child.querySelector(descendantSelector)
    );
  }

  if (!mountPoint) {
    mountPoint = document.createElement("div");
  }

  mountPoint.classList.add(className);
  if (mountPoint.querySelector && mountPoint.querySelector(descendantSelector)) {
    mountPoint.dataset.bdsMounted = "1";
  }
  if (mountPoint.parentElement !== wrapper || mountPoint.nextSibling !== beforeNode) {
    wrapper.insertBefore(mountPoint, beforeNode);
  }
  return mountPoint;
}

/**
 * Transforms the logo div into a real <a> tag to support "Open in new tab".
 */
function linkifyLogo() {
  // Look for the DeepSeek logo SVG
  const logoSvg = document.querySelector('svg[viewBox="0 0 143 23"]');
  if (!logoSvg) return;

  // The clickable container is usually a few levels up
  // Based on user snippet: svg -> div (logo container) -> div (outer container)
  const container = logoSvg.closest('div');
  if (!container || container.tagName === 'A' || container.parentElement?.tagName === 'A') {
    return;
  }

  // Find the highest div that is still part of the "logo" area before hitting the nav/header
  // In the snippet, _262baab seems like the main clickable block.
  let target = container;
  if (target.parentElement && target.parentElement.classList.contains('_262baab')) {
    target = target.parentElement;
  }

  if (target.tagName === 'A') return;

  // Wrap it in an anchor
  const link = document.createElement('a');
  link.href = '/';
  link.className = 'bds-logo-link';

  link.addEventListener('click', (e) => {
    if (e.button === 0 && !e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
    }
  });

  // Copy some essential layout classes if needed, but mostly we want to wrap it
  target.parentNode.insertBefore(link, target);
  link.appendChild(target);

  // Prevent the link from being processed multiple times
  link.setAttribute('data-bds-linkified', 'true');
}

/**
 * Transforms the "New Chat" div button into a real <a> tag.
 */
function linkifyNewChatButton() {
  // Look for the "Yeni sohbet" or "New chat" text
  // Since text might change with language, we use the SVG path or class if observed.
  // The SVG path provided by the user is quite unique: starts with M8 0.599609
  const allSvgs = document.querySelectorAll('svg');
  let newChatSvg = null;
  for (const svg of allSvgs) {
    if (svg.querySelector('path[d*="M8 0.599609"]')) {
      newChatSvg = svg;
      break;
    }
  }

  if (!newChatSvg) return;

  const container = newChatSvg.closest('div[tabindex="0"]');
  if (!container || container.tagName === 'A' || container.parentElement?.tagName === 'A') {
    return;
  }

  if (container.hasAttribute('data-bds-linkified')) return;

  // Wrap it in an anchor
  const link = document.createElement('a');
  link.href = '/';
  link.className = 'bds-logo-link'; // Reuse the same CSS for pass-through styling
  link.setAttribute('data-bds-linkified', 'true');

  link.addEventListener('click', (e) => {
    if (e.button === 0 && !e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
    }
  });

  container.parentNode.insertBefore(link, container);
  link.appendChild(container);
}

/**
 * Watch for URL changes (SPA navigation).
 */
export function startUrlWatcher() {
  if (state.urlWatchTimer) {
    return;
  }

  state.urlWatchTimer = window.setInterval(() => {
    if (location.href === state.lastUrl) {
      if (autocompleteInstance && currentEditor && !document.contains(currentEditor)) {
        console.log("[BDS:Cmd] Editor detached — re-initializing")
        if (currentKeydownHandler) {
          currentEditor.removeEventListener("keydown", currentKeydownHandler)
          currentKeydownHandler = null
        }
        currentEditor = null
        unmount(autocompleteInstance)
        autocompleteInstance = null
        document.querySelector(".bds-cmd-autocomplete")?.remove()
        document.querySelector(".bds-cmd-help-mount")?.remove()
        if (cmdSetupTimer) { clearInterval(cmdSetupTimer); cmdSetupTimer = 0 }
        scheduleScan()
        setupCommandListener()
        checkPendingExport()
      }
      return;
    }
    const oldUrl = state.lastUrl;
    state.lastUrl = location.href;
    window.dispatchEvent(new CustomEvent("bds:urlChanged"));

    const isNewSessionTransition = (oldUrl === "https://chat.deepseek.com/" || oldUrl === "https://chat.deepseek.com") && state.lastUrl.includes("/chat/s/");

    state.longWork.active = false;
    state.longWork.files.clear();
    state.longWork.lastActivityAt = 0;
    
    // Only reset session pricing if it's NOT the first message transition
    if (!isNewSessionTransition) {
      state.pricing.sessionTotals = { inputCost: 0, outputCost: 0, totalCost: 0 };
      state.pricing.sessionInputTokens = 0;
      state.pricing.sessionOutputTokens = 0;
      state.pricing.pendingInjections.clear();
    } else {
      // Migrate "default" pending injection to the new real ID
      const defaultPending = state.pricing.pendingInjections.get("default");
      if (defaultPending) {
        const newId = location.href.match(/\/chat\/s\/([^\/]+)/)?.[1];
        if (newId) {
          state.pricing.pendingInjections.set(newId, defaultPending);
          state.pricing.pendingInjections.delete("default");
        }
      }
    }
    
    if (state.ui) {
      state.ui.showLongWorkOverlay(false);
    }
    const oldTotal = document.querySelector(".bds-session-total");
    if (oldTotal) oldTotal.remove();
    if (autocompleteInstance || commandsHelpInstance || document.querySelector(".bds-cmd-autocomplete")) console.log("[BDS:Cmd] URL change cleanup")
    if (currentEditor && currentKeydownHandler) {
      currentEditor.removeEventListener("keydown", currentKeydownHandler)
      currentKeydownHandler = null
      currentEditor = null
    }
    if (autocompleteInstance) { unmount(autocompleteInstance); autocompleteInstance = null }
    if (commandsHelpInstance) { unmount(commandsHelpInstance); commandsHelpInstance = null }
    document.querySelector(".bds-cmd-autocomplete")?.remove()
    document.querySelector(".bds-cmd-help-mount")?.remove()
    if (cmdSetupTimer) { clearInterval(cmdSetupTimer); cmdSetupTimer = 0 }
    scheduleScan();
    setupCommandListener();
    checkPendingExport();
  }, 1000);

  // Focus/Visibility triggers to handle background-to-foreground transitions
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      scheduleScan();
    }
  });

  window.addEventListener("focus", () => {
    scheduleScan();
  });

  window.addEventListener("bds:settingsChanged", () => {
    scheduleScan();
  });

  setupCommandListener();
  checkPendingHandoff();
}

let autocompleteInstance = null
let commandsHelpInstance = null
let cmdSetupTimer = 0
let currentEditor = null
let currentKeydownHandler = null

function retrySetupCommandListener() {
  console.log("[BDS:Cmd] retrySetupCommandListener start, autoInst=", !!autocompleteInstance, "timer=", !!cmdSetupTimer)
  if (autocompleteInstance || cmdSetupTimer) {
    console.log("[BDS:Cmd] retrySetupCommandListener skipped")
    return
  }
  let pollCount = 0
  cmdSetupTimer = window.setInterval(() => {
    pollCount++
    if (autocompleteInstance) { clearInterval(cmdSetupTimer); cmdSetupTimer = 0; console.log("[BDS:Cmd] poll#" + pollCount + " cancelled (autoInst set)"); return }
    const ed = findComposerEditor()
    console.log("[BDS:Cmd] poll#" + pollCount + " editor=", !!ed, "tag=", ed?.tagName, "id=", ed?.id)
    if (ed) { clearInterval(cmdSetupTimer); cmdSetupTimer = 0; setupCommandListener(ed) }
  }, 500)
  setTimeout(() => { if (cmdSetupTimer) { clearInterval(cmdSetupTimer); cmdSetupTimer = 0; console.log("[BDS:Cmd] poll TIMEOUT after 15s") } }, 15000)
}

function setupCommandListener(editor) {
  console.log("[BDS:Cmd] setupCommandListener called, editor=", !!editor, "autoInst=", !!autocompleteInstance, "tag=", editor?.tagName, "id=", editor?.id)
  if (autocompleteInstance) {
    console.log("[BDS:Cmd] setupCommandListener skipped (already mounted)")
    return
  }
  if (!editor) { retrySetupCommandListener(); return }

  if (currentEditor && currentKeydownHandler) {
    currentEditor.removeEventListener("keydown", currentKeydownHandler)
  }

  const handler = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      if (!document.contains(editor)) { console.log("[BDS:Cmd] Enter ignored — editor detached"); return }
      const dropdown = document.querySelector(".bds-cmd-dropdown")
      if (dropdown) { console.log("[BDS:Cmd] Enter ignored — dropdown open"); return }
      const text = (() => { const t = (editor.tagName || "").toLowerCase(); return t === "textarea" || t === "input" ? editor.value : (editor.textContent || "") })()
      console.log("[BDS:Cmd] Enter pressed, text=" + text.substring(0, 80).replace(/\n/g, "\\n"))
      if (text.startsWith("/")) {
        const hasSpaceAfterCmd = /^\/[a-z0-9_]+\s/.test(text)
        if (hasSpaceAfterCmd || /^\/[a-z0-9_]+$/.test(text)) {
          e.preventDefault()
          const ok = tryExecuteRawInput(text)
          console.log("[BDS:Cmd] Enter execute cmd result=", ok)
          if (ok) {
            const t = (editor.tagName || "").toLowerCase()
            if (t === "textarea" || t === "input") editor.value = ""
            else editor.textContent = ""
            editor.dispatchEvent(new Event("input", { bubbles: true }))
          }
        }
      }
    }
  }
  editor.addEventListener("keydown", handler)
  currentEditor = editor
  currentKeydownHandler = handler

  document.querySelector(".bds-cmd-autocomplete")?.remove()
  const mountPoint = document.createElement("div")
  mountPoint.className = "bds-cmd-autocomplete"
  document.body.appendChild(mountPoint)

  console.log("[BDS:Cmd] Mounting Autocomplete component, editor=", editor?.tagName, "#" + (editor?.id || ""))
  autocompleteInstance = mount(Autocomplete, {
    target: mountPoint,
    props: { editor },
  })

  editor.dispatchEvent(new Event("input", { bubbles: true }))

  document.querySelector(".bds-cmd-help-mount")?.remove()
  const helpMountPoint = document.createElement("div")
  helpMountPoint.className = "bds-cmd-help-mount"
  document.body.appendChild(helpMountPoint)

  commandsHelpInstance = mount(CommandsHelp, { target: helpMountPoint })
}

