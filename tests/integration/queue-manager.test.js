/**
 * Integration tests for queue-manager module.
 */
import { describe, expect, it, beforeEach } from "vitest";
import {
  queueState,
  addToQueue,
  removeFromQueue,
  clearQueue,
  reorderQueue,
} from "../../src/content/queue-manager.svelte.js";

describe("QueueManager", () => {
  beforeEach(() => {
    clearQueue();
  });

  it("should add item to queue", () => {
    const item = addToQueue("First test prompt");
    expect(item).not.toBeNull();
    expect(item.text).toBe("First test prompt");
    expect(queueState.items.length).toBe(1);
    expect(queueState.items[0].id).toBe(item.id);
  });

  it("should ignore empty text", () => {
    const item = addToQueue("   ");
    expect(item).toBeNull();
    expect(queueState.items.length).toBe(0);
  });

  it("should remove item by ID", () => {
    const item1 = addToQueue("Prompt 1");
    const item2 = addToQueue("Prompt 2");
    expect(queueState.items.length).toBe(2);

    removeFromQueue(item1.id);
    expect(queueState.items.length).toBe(1);
    expect(queueState.items[0].id).toBe(item2.id);
  });

  it("should clear all items", () => {
    addToQueue("Prompt 1");
    addToQueue("Prompt 2");
    expect(queueState.items.length).toBe(2);

    clearQueue();
    expect(queueState.items.length).toBe(0);
  });

  it("should reorder items in queue", () => {
    const item1 = addToQueue("Prompt 1");
    const item2 = addToQueue("Prompt 2");
    const item3 = addToQueue("Prompt 3");

    reorderQueue(0, 2);
    expect(queueState.items[0].id).toBe(item2.id);
    expect(queueState.items[1].id).toBe(item3.id);
    expect(queueState.items[2].id).toBe(item1.id);
  });
});
