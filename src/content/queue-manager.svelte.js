/**
 * Queue Manager Module for Better DeepSeek
 * 
 * Manages queued prompt messages and automatically sends them sequentially
 * as soon as AI response generation completes.
 */

import { isSystemGenerating } from "./message-processor.svelte.js";
import { injectPureTextAndSend } from "./auto.js";
import { makeId } from "../lib/utils/helpers.js";
import { devLog } from "../lib/dev-log.js";

// Svelte 5 state for reactive UI consumption (in .svelte.js file so $state rune is compiled)
export const queueState = $state({
  items: [],
  isAutoSending: false,
  autoSendError: null,
});

let isProcessing = false;
let checkInterval = null;
let lastGeneratingState = false;

/**
 * Add a prompt message to the queue.
 * @param {string} text 
 * @returns {object} queued item
 */
export function addToQueue(text) {
  const cleanText = String(text || "").trim();
  if (!cleanText) return null;

  const item = {
    id: makeId(),
    text: cleanText,
    timestamp: Date.now(),
  };

  queueState.items = [...queueState.items, item];
  devLog("QueueManager", "Added prompt to queue:", item.id);
  ensureMonitoring();
  return item;
}

/**
 * Remove an item from the queue by ID.
 * @param {string} id 
 */
export function removeFromQueue(id) {
  queueState.items = queueState.items.filter((item) => item.id !== id);
  devLog("QueueManager", "Removed item from queue:", id);
}

/**
 * Clear all items from the queue.
 */
export function clearQueue() {
  queueState.items = [];
  devLog("QueueManager", "Queue cleared.");
}

/**
 * Reorder an item from one index to another.
 * @param {number} fromIndex 
 * @param {number} toIndex 
 */
export function reorderQueue(fromIndex, toIndex) {
  if (
    fromIndex < 0 ||
    fromIndex >= queueState.items.length ||
    toIndex < 0 ||
    toIndex >= queueState.items.length
  ) {
    return;
  }

  const items = [...queueState.items];
  const [moved] = items.splice(fromIndex, 1);
  items.splice(toIndex, 0, moved);
  queueState.items = items;
}

/**
 * Process the next queued item if AI is idle.
 */
export async function processQueue() {
  if (isProcessing) return;
  if (queueState.items.length === 0) return;

  const generating = isSystemGenerating();
  if (generating) {
    return;
  }

  isProcessing = true;
  queueState.isAutoSending = true;

  try {
    const nextItem = queueState.items[0];
    devLog("QueueManager", "Popping next queued prompt to send:", nextItem.text);

    // Remove from queue before sending
    queueState.items = queueState.items.slice(1);

    const success = await injectPureTextAndSend(nextItem.text, "Queued Message");
    if (!success) {
      console.error("[BDS:QueueManager] Failed to inject and send queued message");
      queueState.autoSendError = "Failed to send queued prompt.";
    } else {
      queueState.autoSendError = null;
    }
  } catch (error) {
    console.error("[BDS:QueueManager] Error sending queued message:", error);
    queueState.autoSendError = error?.message || "Error sending queued prompt.";
  } finally {
    // Small delay to allow generation to start before next check
    setTimeout(() => {
      isProcessing = false;
      queueState.isAutoSending = false;
    }, 1200);
  }
}

/**
 * Ensure monitoring interval is running to process queue when AI finishes generating.
 */
export function ensureMonitoring() {
  if (checkInterval) return;

  checkInterval = setInterval(() => {
    const currentGenerating = isSystemGenerating();

    // Trigger process when transitioning from generating -> not generating
    if (lastGeneratingState && !currentGenerating && queueState.items.length > 0) {
      devLog("QueueManager", "AI finished response generation. Flushing next queue item.");
      processQueue();
    } else if (!currentGenerating && queueState.items.length > 0 && !isProcessing && !queueState.isAutoSending) {
      processQueue();
    }

    lastGeneratingState = currentGenerating;
  }, 500);
}

// Start monitoring automatically on import
ensureMonitoring();
