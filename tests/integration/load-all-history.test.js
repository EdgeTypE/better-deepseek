// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { resetAppState } from "../helpers/app-state.js";
import { resetChromeMock, installChromeMock } from "../mocks/chrome.js";
import state from "../../src/content/state.js";

describe("load-all-history", () => {
  beforeEach(() => {
    resetAppState();
    resetChromeMock();
    installChromeMock();
  });

  it("isLoadInProgress is false when no requests are pending", async () => {
    const { isLoadInProgress } = await import("../../src/content/load-all-history.js");
    expect(isLoadInProgress()).toBe(false);
  });

  it("retainOnlyHistorySession with null clears all caches", async () => {
    const { retainOnlyHistorySession } = await import("../../src/content/load-all-history.js");

    state.chatMessagesBySession.set("s1", [{ message_id: "m1", role: "user", fragments: [] }]);
    state.chatMessagesBySession.set("s2", [{ message_id: "m2", role: "assistant", fragments: [] }]);

    retainOnlyHistorySession(null);

    expect(state.chatMessagesBySession.size).toBe(0);
  });

  it("retainOnlyHistorySession keeps only target session", async () => {
    const { retainOnlyHistorySession } = await import("../../src/content/load-all-history.js");

    state.chatMessagesBySession.set("session-A", [{ message_id: "a", role: "user", fragments: [] }]);
    state.chatMessagesBySession.set("session-B", [{ message_id: "b", role: "assistant", fragments: [] }]);

    retainOnlyHistorySession("session-A");

    expect(state.chatMessagesBySession.has("session-A")).toBe(true);
    expect(state.chatMessagesBySession.has("session-B")).toBe(false);
    expect(state.chatMessagesBySession.size).toBe(1);
  });

  it("retainOnlyHistorySession with same session preserves cached data", async () => {
    const { retainOnlyHistorySession } = await import("../../src/content/load-all-history.js");

    state.chatMessagesBySession.set("session-A", [{ message_id: "a", role: "user", fragments: [] }]);

    retainOnlyHistorySession("session-A");

    expect(state.chatMessagesBySession.has("session-A")).toBe(true);
    expect(state.chatMessagesBySession.get("session-A").length).toBe(1);
  });

  it("loadAllHistory returns null on non-session URL", async () => {
    const { loadAllHistory } = await import("../../src/content/load-all-history.js");
    const result = await loadAllHistory();
    expect(result).toBeNull();
  });
});

describe("load-all-history async flow", () => {
  beforeEach(async () => {
    resetAppState();
    resetChromeMock();
    installChromeMock();
    vi.useFakeTimers();
    // Reset module-level state in load-all-history
    state.chatMessagesBySession.clear();
    const { retainOnlyHistorySession } = await import("../../src/content/load-all-history.js");
    retainOnlyHistorySession(null);
    // Mock location.href to a session URL
    Object.defineProperty(window, "location", {
      value: { href: "https://chat.deepseek.com/chat/s/test-session-async" },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function simulateResponse(sessionId, messages) {
    // Simulate what handleHistoryMessages does: populate cache + dispatch loaded event.
    // handleHistoryMessages is triggered by bds:history-msgs (not bds:history-msgs-loaded),
    // but for these tests we simulate the outcome directly.
    if (messages !== null && messages !== undefined) {
      state.chatMessagesBySession.set(sessionId, messages);
    }
    window.dispatchEvent(new CustomEvent("bds:history-msgs-loaded", {
      detail: JSON.stringify({ sessionId, count: messages ? messages.length : 0 }),
    }));
  }

  function makeMsg(id) {
    return { message_id: id, role: "assistant", fragments: [] };
  }

  it("dispatches one bds:request-history-msgs event for a session URL", async () => {
    const { loadAllHistory } = await import("../../src/content/load-all-history.js");
    const handler = vi.fn();
    window.addEventListener("bds:request-history-msgs", handler);

    // Start load (don't await — it'll timeout)
    const promise = loadAllHistory();

    // Wait for microtasks so the event is dispatched
    await Promise.resolve();

    expect(handler).toHaveBeenCalledTimes(1);

    // Clean up — advance past timeout so promise resolves
    vi.advanceTimersByTime(11000);
    await promise;
  });

  it("sets isLoadInProgress to true while a request is pending", async () => {
    const { loadAllHistory, isLoadInProgress } = await import("../../src/content/load-all-history.js");

    const promise = loadAllHistory();
    await Promise.resolve();

    expect(isLoadInProgress()).toBe(true);

    vi.advanceTimersByTime(11000);
    await promise;
    expect(isLoadInProgress()).toBe(false);
  });

  it("valid explicit response resolves with cached messages and resets pending", async () => {
    const { loadAllHistory, isLoadInProgress } = await import("../../src/content/load-all-history.js");

    const sessionId = "test-session-async";
    const messages = [makeMsg("m1"), makeMsg("m2")];

    const promise = loadAllHistory();

    // Simulate the injected script dispatching request and response
    await Promise.resolve();
    simulateResponse(sessionId, messages);

    const result = await promise;
    expect(result).toEqual(messages);
    expect(isLoadInProgress()).toBe(false);
  });

  it("explicit empty array resolves to null and is not re-requested", async () => {
    const { loadAllHistory } = await import("../../src/content/load-all-history.js");

    const sessionId = "test-session-async";

    // First call: empty response
    const promise1 = loadAllHistory();
    await Promise.resolve();
    simulateResponse(sessionId, []);

    const result1 = await promise1;
    expect(result1).toBeNull();

    // Second call: should NOT dispatch another request (cached as completed)
    const handler = vi.fn();
    window.addEventListener("bds:request-history-msgs", handler);

    const promise2 = loadAllHistory();
    await Promise.resolve();

    expect(handler).not.toHaveBeenCalled();
    const result2 = await promise2;
    expect(result2).toBeNull();
  });

  it("10-second timeout resolves null and permits later retry", async () => {
    const { loadAllHistory } = await import("../../src/content/load-all-history.js");

    // Start load, don't simulate response → timeout
    const promise1 = loadAllHistory();
    await Promise.resolve();

    vi.advanceTimersByTime(11000);
    const result1 = await promise1;
    expect(result1).toBeNull();

    // Retry: should dispatch a new request
    const handler = vi.fn();
    window.addEventListener("bds:request-history-msgs", handler);

    const sessionId = "test-session-async";
    const promise2 = loadAllHistory();

    await Promise.resolve();
    expect(handler).toHaveBeenCalledTimes(1);

    // Clean up
    simulateResponse(sessionId, [makeMsg("retry-m1")]);
    const result2 = await promise2;
    expect(result2).toHaveLength(1);
  });

  it("retainOnlyHistorySession cancels in-flight request for evicted session", async () => {
    const { loadAllHistory, retainOnlyHistorySession, isLoadInProgress } = await import("../../src/content/load-all-history.js");

    const sessionId = "test-session-async";
    const promise = loadAllHistory();
    await Promise.resolve();

    expect(isLoadInProgress()).toBe(true);

    // Evict this session
    retainOnlyHistorySession("other-session");

    // The promise should resolve to null (cancelled)
    const result = await promise;
    expect(result).toBeNull();
    expect(isLoadInProgress()).toBe(false);
  });

  it("response arriving after cancellation is ignored by the cancelled waiter", async () => {
    const { loadAllHistory, retainOnlyHistorySession } = await import("../../src/content/load-all-history.js");

    const sessionId = "test-session-async";
    const promise = loadAllHistory();
    await Promise.resolve();

    // Cancel by evicting this session
    retainOnlyHistorySession("other-session");

    // Switch URL so handleHistoryMessages would also ignore this session
    Object.defineProperty(window, "location", {
      value: { href: "https://chat.deepseek.com/chat/s/other-session" },
      writable: true,
      configurable: true,
    });

    // Late response arrives — simulateResponse dispatches loaded event but
    // handleHistoryMessages would ignore it (wrong URL). We dispatch loaded
    // without setting cache to model the real behavior.
    window.dispatchEvent(new CustomEvent("bds:history-msgs-loaded", {
      detail: JSON.stringify({ sessionId, count: 1 }),
    }));

    // Cancelled request resolves to null even if loaded event fires
    const result = await promise;
    expect(result).toBeNull();
    // Cache was never populated (handleHistoryMessages filtered by URL)
    expect(state.chatMessagesBySession.has(sessionId)).toBe(false);
  });

  it("two concurrent calls for same session dispatch once and resolve to same data", async () => {
    const { loadAllHistory } = await import("../../src/content/load-all-history.js");

    const handler = vi.fn();
    window.addEventListener("bds:request-history-msgs", handler);

    const sessionId = "test-session-async";
    const messages = [makeMsg("shared-m1")];

    const promise1 = loadAllHistory();
    const promise2 = loadAllHistory();

    await Promise.resolve();

    // Only one request event dispatched
    expect(handler).toHaveBeenCalledTimes(1);

    simulateResponse(sessionId, messages);

    const [r1, r2] = await Promise.all([promise1, promise2]);
    expect(r1).toEqual(messages);
    expect(r2).toEqual(messages);
  });

  it("cached completed history reused without another request", async () => {
    const { loadAllHistory } = await import("../../src/content/load-all-history.js");

    const sessionId = "test-session-async";
    const messages = [makeMsg("cached-m1")];

    // First load: complete successfully
    const promise1 = loadAllHistory();
    await Promise.resolve();
    simulateResponse(sessionId, messages);
    await promise1;

    // Second load: should return cached immediately
    const handler = vi.fn();
    window.addEventListener("bds:request-history-msgs", handler);

    const result2 = await loadAllHistory();
    expect(handler).not.toHaveBeenCalled();
    expect(result2).toEqual(messages);
  });

  it("requests for different sessions do not share pending state", async () => {
    const { loadAllHistory, isLoadInProgress } = await import("../../src/content/load-all-history.js");

    // Load session A
    const sessionIdA = "test-session-async";
    const promiseA = loadAllHistory();
    await Promise.resolve();

    // Switch URL to session B and load
    Object.defineProperty(window, "location", {
      value: { href: "https://chat.deepseek.com/chat/s/test-session-b" },
      writable: true,
      configurable: true,
    });

    const promiseB = loadAllHistory();
    await Promise.resolve();

    // Both should be pending independently
    expect(isLoadInProgress()).toBe(true);

    // Resolve session A — session B still pending
    simulateResponse(sessionIdA, [makeMsg("a-m1")]);
    const resultA = await promiseA;
    expect(resultA).toHaveLength(1);

    // Session B still pending (different session)
    // Resolve it
    simulateResponse("test-session-b", [makeMsg("b-m1")]);
    const resultB = await promiseB;
    expect(resultB).toHaveLength(1);

    // Both caches independent
    expect(state.chatMessagesBySession.get(sessionIdA)).toHaveLength(1);
    expect(state.chatMessagesBySession.get("test-session-b")).toHaveLength(1);
  });
});
