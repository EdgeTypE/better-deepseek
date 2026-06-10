// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import DeepResearchPlanCard from "../../../src/content/ui/DeepResearchPlanCard.svelte";
import DeepResearchStatusCard from "../../../src/content/ui/DeepResearchStatusCard.svelte";
import DeepResearchReportCard from "../../../src/content/ui/DeepResearchReportCard.svelte";
import DeepResearchToggle from "../../../src/content/ui/DeepResearchToggle.svelte";
import { renderSvelte, flushUi } from "../../helpers/svelte.js";

describe("Deep Research UI components", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  describe("DeepResearchPlanCard", () => {
    it("renders plan steps", async () => {
      const plan = {
        title: "Laptop Research",
        steps: [
          { id: 1, action: "search", query: "best laptops 2025", purpose: "overview" },
          { id: 2, action: "fetch", query: "https://example.com/review", purpose: "detailed review" },
        ],
      };
      const { target, cleanup } = renderSvelte(DeepResearchPlanCard, {
        runId: "test123",
        plan,
      });
      await flushUi();

      expect(target.textContent).toContain("Laptop Research");
      expect(target.textContent).toContain("best laptops 2025");
      expect(target.textContent).toContain("search");
      expect(target.textContent).toContain("fetch");
      expect(target.querySelector('[data-testid="dr-approve-btn"]')).toBeTruthy();
      expect(target.querySelector('[data-testid="dr-revise-btn"]')).toBeTruthy();
      expect(target.querySelector('[data-testid="dr-cancel-btn"]')).toBeTruthy();
      cleanup();
    });

    it("renders error state for malformed JSON", async () => {
      const { target, cleanup } = renderSvelte(DeepResearchPlanCard, {
        runId: "err1",
        plan: null,
        raw: "broken json",
        error: "Unexpected token",
      });
      await flushUi();

      expect(target.textContent).toContain("Failed to parse");
      expect(target.textContent).toContain("Unexpected token");
      expect(target.textContent).toContain("broken json");
      cleanup();
    });

    it("calls onApprove callback", async () => {
      const onApprove = vi.fn();
      const plan = { title: "Test", steps: [] };
      const { target, cleanup } = renderSvelte(DeepResearchPlanCard, {
        runId: "a1",
        plan,
        onApprove,
      });
      await flushUi();

      target.querySelector('[data-testid="dr-approve-btn"]').click();
      expect(onApprove).toHaveBeenCalledWith("a1");
      cleanup();
    });

    it("calls onCancel callback", async () => {
      const onCancel = vi.fn();
      const plan = { title: "Test", steps: [] };
      const { target, cleanup } = renderSvelte(DeepResearchPlanCard, {
        runId: "c1",
        plan,
        onCancel,
      });
      await flushUi();

      target.querySelector('[data-testid="dr-cancel-btn"]').click();
      expect(onCancel).toHaveBeenCalledWith("c1");
      cleanup();
    });

    it("shows feedback textarea on request changes click", async () => {
      const plan = { title: "Test", steps: [] };
      const { target, cleanup } = renderSvelte(DeepResearchPlanCard, {
        runId: "r1",
        plan,
        onRequestChanges: vi.fn(),
      });
      await flushUi();

      // First click shows feedback input
      target.querySelector('[data-testid="dr-revise-btn"]').click();
      await flushUi();

      expect(target.querySelector('[data-testid="dr-feedback-input"]')).toBeTruthy();
      cleanup();
    });
  });

  describe("DeepResearchStatusCard", () => {
    it("renders progress bar and status", async () => {
      const { target, cleanup } = renderSvelte(DeepResearchStatusCard, {
        runId: "s1",
        status: { completedSteps: 3, totalSteps: 5, currentAction: "Fetching reviews" },
      });
      await flushUi();

      expect(target.textContent).toContain("Deep Research in Progress");
      expect(target.textContent).toContain("3/5");
      expect(target.textContent).toContain("60%");
      expect(target.textContent).toContain("Fetching reviews");
      expect(target.querySelector('[data-testid="deep-research-status-card"]')).toBeTruthy();
      cleanup();
    });

    it("renders raw text when status is null", async () => {
      const { target, cleanup } = renderSvelte(DeepResearchStatusCard, {
        runId: "s2",
        status: null,
        raw: "some raw status text",
      });
      await flushUi();

      expect(target.textContent).toContain("some raw status text");
      cleanup();
    });
  });

  describe("DeepResearchReportCard", () => {
    it("renders markdown as HTML", async () => {
      const { target, cleanup } = renderSvelte(DeepResearchReportCard, {
        runId: "rpt1",
        markdown: "# My Report\n\nHello **world**",
      });
      await flushUi();

      expect(target.querySelector("h1")).toBeTruthy();
      expect(target.querySelector("strong")).toBeTruthy();
      expect(target.textContent).toContain("My Report");
      expect(target.textContent).toContain("world");
      cleanup();
    });

    it("shows run ID", async () => {
      const { target, cleanup } = renderSvelte(DeepResearchReportCard, {
        runId: "abcdefgh12345",
        markdown: "# Test",
      });
      await flushUi();

      expect(target.textContent).toContain("abcdefgh");
      cleanup();
    });
  });

  describe("DeepResearchToggle", () => {
    it("renders inactive state", async () => {
      const { target, cleanup } = renderSvelte(DeepResearchToggle, {
        enabled: false,
      });
      await flushUi();

      const btn = target.querySelector('[data-testid="deep-research-toggle"]');
      expect(btn).toBeTruthy();
      expect(btn.textContent).toContain("Research");
      expect(btn.querySelector("svg")).toBeTruthy();
      expect(btn.getAttribute("aria-pressed")).toBe("false");
      expect(btn.classList.contains("active")).toBe(false);
      cleanup();
    });

    it("renders active state", async () => {
      const { target, cleanup } = renderSvelte(DeepResearchToggle, {
        enabled: true,
      });
      await flushUi();

      const btn = target.querySelector('[data-testid="deep-research-toggle"]');
      expect(btn.textContent).toContain("Research ON");
      expect(btn.getAttribute("aria-pressed")).toBe("true");
      expect(btn.classList.contains("active")).toBe(true);
      cleanup();
    });

    it("calls onToggle with new value", async () => {
      const onToggle = vi.fn();
      const { target, cleanup } = renderSvelte(DeepResearchToggle, {
        enabled: false,
        onToggle,
      });
      await flushUi();

      target.querySelector('[data-testid="deep-research-toggle"]').click();
      expect(onToggle).toHaveBeenCalledWith(true);
      cleanup();
    });
  });
});
