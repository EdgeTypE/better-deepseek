// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount, unmount } from "svelte";
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

    it("submits feedback text on second request changes action", async () => {
      const onRequestChanges = vi.fn();
      const plan = { title: "Test", steps: [] };
      const { target, cleanup } = renderSvelte(DeepResearchPlanCard, {
        runId: "r2",
        plan,
        onRequestChanges,
      });
      await flushUi();

      target.querySelector('[data-testid="dr-revise-btn"]').click();
      await flushUi();
      const input = target.querySelector('[data-testid="dr-feedback-input"]');
      input.value = "Add seller warranty checks";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await flushUi();
      target.querySelector('[data-testid="dr-submit-feedback-btn"]').click();

      expect(onRequestChanges).toHaveBeenCalledWith("r2", "Add seller warranty checks");
      cleanup();
    });

    it("submits revision request even when feedback is empty", async () => {
      const onRequestChanges = vi.fn();
      const plan = { title: "Test", steps: [] };
      const { target, cleanup } = renderSvelte(DeepResearchPlanCard, {
        runId: "r-empty",
        plan,
        onRequestChanges,
      });
      await flushUi();

      target.querySelector('[data-testid="dr-revise-btn"]').click();
      await flushUi();
      target.querySelector('[data-testid="dr-submit-feedback-btn"]').click();

      expect(onRequestChanges).toHaveBeenCalledWith("r-empty", "");
      cleanup();
    });

    it("hides interaction buttons when the plan is not interactive", async () => {
      const plan = { title: "Test", steps: [] };
      const { target, cleanup } = renderSvelte(DeepResearchPlanCard, {
        runId: "inactive1",
        plan,
        interactive: false,
      });
      await flushUi();

      expect(target.querySelector('[data-testid="dr-approve-btn"]')).toBeNull();
      expect(target.querySelector('[data-testid="dr-revise-btn"]')).toBeNull();
      expect(target.querySelector('[data-testid="dr-cancel-btn"]')).toBeNull();
      cleanup();
    });

    it("hides interaction buttons when run state becomes noninteractive", async () => {
      const plan = { title: "Test", steps: [] };
      const { target, cleanup } = renderSvelte(DeepResearchPlanCard, {
        runId: "run-state-1",
        plan,
        interactive: true,
      });
      await flushUi();
      expect(target.querySelector('[data-testid="dr-approve-btn"]')).toBeTruthy();

      window.dispatchEvent(new CustomEvent("bds:deep-research-run-state", {
        detail: { runId: "run-state-1", interactive: false },
      }));
      await flushUi();

      expect(target.querySelector('[data-testid="dr-approve-btn"]')).toBeNull();
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
      expect(btn.textContent).toContain("DeepResearch");
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
      expect(btn.textContent).toContain("DeepResearch");
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

    it("copies native DeepThink pill sizing when mounted beside it", async () => {
      const wrapper = document.createElement("div");
      const mountPoint = document.createElement("div");
      const deepThink = document.createElement("button");
      mountPoint.className = "bds-deep-research-mount";
      deepThink.textContent = "DeepThink";
      deepThink.style.height = "44px";
      deepThink.style.padding = "0px 13px";
      deepThink.style.fontSize = "15px";
      deepThink.style.fontWeight = "700";
      deepThink.style.borderRadius = "22px";
      deepThink.style.display = "inline-flex";
      deepThink.style.columnGap = "8px";
      const deepThinkIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      deepThinkIcon.style.width = "20px";
      deepThinkIcon.style.height = "21px";
      deepThink.appendChild(deepThinkIcon);
      wrapper.append(mountPoint, deepThink);
      document.body.appendChild(wrapper);

      const instance = mount(DeepResearchToggle, {
        target: mountPoint,
        props: { enabled: false },
      });
      await new Promise((resolve) => setTimeout(resolve, 30));

      const btn = mountPoint.querySelector('[data-testid="deep-research-toggle"]');
      expect(btn.style.getPropertyValue("--bds-drt-height")).toBe("44px");
      expect(btn.style.getPropertyValue("--bds-drt-padding")).toBe("0px 13px 0px 13px");
      expect(btn.style.getPropertyValue("--bds-drt-font-size")).toBe("15px");
      expect(btn.style.getPropertyValue("--bds-drt-font-weight")).toBe("700");
      expect(btn.style.getPropertyValue("--bds-drt-border-radius")).toBe("22px");
      expect(btn.style.getPropertyValue("--bds-drt-gap")).toBe("8px");
      expect(btn.style.getPropertyValue("--bds-drt-icon-width")).toBe("20px");
      expect(btn.style.getPropertyValue("--bds-drt-icon-height")).toBe("21px");

      unmount(instance);
      wrapper.remove();
    });
  });
});
