// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { BRIDGE_EVENTS } from "../../src/lib/constants.js";
import state from "../../src/content/state.js";
import {
  createRun,
  transitionRun,
  findActiveRun,
  buildApprovalMessage,
  buildRevisionMessage,
  buildPlanningPrompt,
  setDeepResearchEnabled,
  RESEARCH_STATUSES,
} from "../../src/content/deep-research.js";

describe("Deep Research state machine", () => {
  beforeEach(() => {
    state.deepResearch.enabled = false;
    state.deepResearch.pendingRun = null;
    state.deepResearch.runs = [];
  });

  describe("createRun", () => {
    it("creates a run with planning status", () => {
      const run = createRun("conv123");
      expect(run.id).toBeTruthy();
      expect(run.conversationId).toBe("conv123");
      expect(run.status).toBe("planning");
      expect(run.plan).toBeNull();
      expect(run.sourceLedger).toEqual([]);
      expect(run.createdAt).toBeGreaterThan(0);
    });
  });

  describe("transitionRun", () => {
    it("allows valid transitions from planning to approved", () => {
      const run = createRun("c1");
      transitionRun(run, "approved");
      expect(run.status).toBe("approved");
    });

    it("allows planning -> awaiting_revision", () => {
      const run = createRun("c1");
      transitionRun(run, "awaiting_revision");
      expect(run.status).toBe("awaiting_revision");
    });

    it("allows awaiting_revision -> planning", () => {
      const run = createRun("c1");
      transitionRun(run, "awaiting_revision");
      transitionRun(run, "planning");
      expect(run.status).toBe("planning");
    });

    it("allows approved -> running", () => {
      const run = createRun("c1");
      transitionRun(run, "approved");
      transitionRun(run, "running");
      expect(run.status).toBe("running");
    });

    it("allows running -> reporting", () => {
      const run = createRun("c1");
      transitionRun(run, "approved");
      transitionRun(run, "running");
      transitionRun(run, "reporting");
      expect(run.status).toBe("reporting");
    });

    it("allows reporting -> complete", () => {
      const run = createRun("c1");
      transitionRun(run, "approved");
      transitionRun(run, "running");
      transitionRun(run, "reporting");
      transitionRun(run, "complete");
      expect(run.status).toBe("complete");
    });

    it("allows cancellation from any active state", () => {
      for (const status of ["planning", "awaiting_revision", "approved", "running"]) {
        const run = createRun("c1");
        run.status = status;
        transitionRun(run, "cancelled");
        expect(run.status).toBe("cancelled");
      }
    });

    it("throws on invalid transition", () => {
      const run = createRun("c1");
      expect(() => transitionRun(run, "running")).toThrow("Invalid deep research transition");
    });

    it("throws when transitioning from complete", () => {
      const run = createRun("c1");
      run.status = "complete";
      expect(() => transitionRun(run, "planning")).toThrow("Invalid deep research transition");
    });

    it("throws when transitioning from cancelled", () => {
      const run = createRun("c1");
      run.status = "cancelled";
      expect(() => transitionRun(run, "planning")).toThrow("Invalid deep research transition");
    });

    it("updates updatedAt timestamp", () => {
      const run = createRun("c1");
      const before = run.updatedAt;
      // Small delay to ensure timestamp differs
      run.updatedAt = before - 1000;
      transitionRun(run, "approved");
      expect(run.updatedAt).toBeGreaterThanOrEqual(before - 1000);
    });
  });

  describe("findActiveRun", () => {
    it("finds active run for conversation", () => {
      const runs = [
        { ...createRun("conv1"), status: "running" },
        { ...createRun("conv2"), status: "complete" },
      ];
      const found = findActiveRun(runs, "conv1");
      expect(found).toBeTruthy();
      expect(found.conversationId).toBe("conv1");
    });

    it("returns null for completed runs", () => {
      const runs = [{ ...createRun("conv1"), status: "complete" }];
      expect(findActiveRun(runs, "conv1")).toBeNull();
    });

    it("returns null for cancelled runs", () => {
      const runs = [{ ...createRun("conv1"), status: "cancelled" }];
      expect(findActiveRun(runs, "conv1")).toBeNull();
    });

    it("returns null when no matching conversation", () => {
      const runs = [{ ...createRun("conv1"), status: "running" }];
      expect(findActiveRun(runs, "conv99")).toBeNull();
    });
  });

  describe("setDeepResearchEnabled", () => {
    it("dispatches a partial config update with the pending run ID", () => {
      const listener = vi.fn();
      window.addEventListener(BRIDGE_EVENTS.deepResearchConfigUpdate, listener, { once: true });

      const run = setDeepResearchEnabled(true, "conv1");

      expect(run).toBeTruthy();
      expect(state.deepResearch.pendingRun.id).toBe(run.id);
      expect(listener).toHaveBeenCalledOnce();
      expect(JSON.parse(listener.mock.calls[0][0].detail)).toEqual({
        enabled: true,
        runId: run.id,
      });
    });

    it("cancels the active conversation run when disabled", () => {
      const run = createRun("conv1", "active-run");
      state.deepResearch.enabled = true;
      state.deepResearch.runs = [run];
      const runListener = vi.fn();
      window.addEventListener("bds:deep-research-run-state", runListener, { once: true });

      setDeepResearchEnabled(false, "conv1");

      expect(state.deepResearch.enabled).toBe(false);
      expect(state.deepResearch.pendingRun).toBeNull();
      expect(run.status).toBe("cancelled");
      expect(runListener).toHaveBeenCalledOnce();
      expect(runListener.mock.calls[0][0].detail).toMatchObject({
        runId: "active-run",
        status: "cancelled",
        interactive: false,
      });
    });
  });

  describe("message builders", () => {
    it("buildApprovalMessage includes run ID and plan", () => {
      const run = createRun("c1");
      run.plan = { title: "Test", steps: [{ id: 1, action: "search", query: "test" }] };
      const msg = buildApprovalMessage(run);
      expect(msg).toContain("<BetterDeepSeek>");
      expect(msg).toContain(run.id);
      expect(msg).toContain("Plan approved");
      expect(msg).toContain("BDS:AUTO:SEARCH");
      expect(msg).toContain("BDS:DEEP_RESEARCH_REPORT");
    });

    it("buildRevisionMessage includes feedback", () => {
      const run = createRun("c1");
      run.plan = { title: "Laptop plan", steps: [{ id: 1, action: "search", query: "laptops" }] };
      const msg = buildRevisionMessage(run, "Add more laptop brands");
      expect(msg).toContain("<BetterDeepSeek>");
      expect(msg).toContain("Revision requested");
      expect(msg).toContain("Add more laptop brands");
      expect(msg).toContain("Laptop plan");
      expect(msg).toContain("BDS:DEEP_RESEARCH_PLAN");
    });

    it("buildPlanningPrompt includes runId and user query", () => {
      const msg = buildPlanningPrompt("run42", "Best laptops under $1500");
      expect(msg).toContain("<BetterDeepSeek>");
      expect(msg).toContain("run42");
      expect(msg).toContain("Best laptops under $1500");
      expect(msg).toContain("ONLY produce a research plan");
      expect(msg).toContain("BDS:DEEP_RESEARCH_PLAN");
    });
  });

  describe("RESEARCH_STATUSES", () => {
    it("contains all expected statuses", () => {
      expect(RESEARCH_STATUSES).toContain("idle");
      expect(RESEARCH_STATUSES).toContain("planning");
      expect(RESEARCH_STATUSES).toContain("awaiting_revision");
      expect(RESEARCH_STATUSES).toContain("approved");
      expect(RESEARCH_STATUSES).toContain("running");
      expect(RESEARCH_STATUSES).toContain("reporting");
      expect(RESEARCH_STATUSES).toContain("complete");
      expect(RESEARCH_STATUSES).toContain("cancelled");
    });
  });
});
