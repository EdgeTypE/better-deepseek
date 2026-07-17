// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
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
