// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import DeepResearchPlanCard from "../../../src/content/ui/DeepResearchPlanCard.svelte";
import DeepResearchStatusCard from "../../../src/content/ui/DeepResearchStatusCard.svelte";
import DeepResearchReportCard from "../../../src/content/ui/DeepResearchReportCard.svelte";
import DeepResearchToggle from "../../../src/content/ui/DeepResearchToggle.svelte";
import DeepResearchRevisionPanel from "../../../src/content/ui/DeepResearchRevisionPanel.svelte";
import { renderSvelte, flushUi } from "../../helpers/svelte.js";

describe("Deep Research UI components", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
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
      const firstStep = target.querySelector(".bds-dr-step");
      expect(firstStep.querySelector(".bds-dr-step-primary .bds-dr-step-action")).toBeTruthy();
      expect(firstStep.querySelector(".bds-dr-step-primary .bds-dr-step-query")).toBeTruthy();
      expect(firstStep.querySelector(".bds-dr-step-body .bds-dr-step-purpose")?.textContent).toBe("overview");
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

    it("calls onRequestChanges on request changes click", async () => {
      const onRequestChanges = vi.fn();
      const plan = { title: "Test", steps: [] };
      const { target, cleanup } = renderSvelte(DeepResearchPlanCard, {
        runId: "r1",
        plan,
        onRequestChanges,
      });
      await flushUi();

      target.querySelector('[data-testid="dr-revise-btn"]').click();

      expect(onRequestChanges).toHaveBeenCalledWith("r1");
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

  describe("DeepResearchRevisionPanel", () => {
    it("attaches to the composer and dispatches revision feedback", async () => {
      vi.useFakeTimers();
      try {
        document.body.innerHTML = '<div class="ds-textarea"><textarea id="chat-input"></textarea></div>';
        const listener = vi.fn(() => {
          expect(document.querySelector('[data-testid="deep-research-revision-panel"]')).toBeNull();
        });
        window.addEventListener("bds:deep-research-revise", listener, { once: true });
        const plan = { title: "Test Plan", steps: [] };
        const { cleanup } = renderSvelte(DeepResearchRevisionPanel);
        await flushUi();

        window.dispatchEvent(new CustomEvent("bds:deep-research-open-revision", {
          detail: { runId: "run-feedback", plan },
        }));
        await vi.advanceTimersByTimeAsync(150);
        await flushUi();

        const panel = document.querySelector('[data-testid="deep-research-revision-panel"]');
        expect(panel?.parentElement?.classList.contains("ds-textarea")).toBe(true);
        expect(panel.classList.contains("bds-dr-revision-panel--hidden")).toBe(false);
        expect(panel.getAttribute("aria-hidden")).toBe("false");
        const input = document.querySelector('[data-testid="deep-research-revision-input"]');
        input.value = "Add seller warranty checks";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        await flushUi();
        document.querySelector('[data-testid="deep-research-revision-submit"]').click();
        await flushUi();

        expect(listener).toHaveBeenCalledOnce();
        expect(listener.mock.calls[0][0].detail).toMatchObject({
          runId: "run-feedback",
          plan,
          feedback: "Add seller warranty checks",
        });
        cleanup();
      } finally {
        vi.useRealTimers();
      }
    });

    it("reveals a usable fallback panel when no composer target is available", async () => {
      const { cleanup } = renderSvelte(DeepResearchRevisionPanel);
      await flushUi();

      window.dispatchEvent(new CustomEvent("bds:deep-research-open-revision", {
        detail: { runId: "run-hidden", plan: { title: "Plan", steps: [] } },
      }));
      await flushUi();

      const panel = document.querySelector('[data-testid="deep-research-revision-panel"]');
      const input = document.querySelector('[data-testid="deep-research-revision-input"]');
      expect(panel).toBeTruthy();
      expect(panel.classList.contains("bds-dr-revision-panel--hidden")).toBe(false);
      expect(panel.getAttribute("aria-hidden")).toBe("false");
      input.value = "Keep this typable";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await flushUi();
      expect(input.value).toBe("Keep this typable");
      cleanup();
    });

    it("attaches to a contenteditable composer and focuses the feedback input", async () => {
      vi.useFakeTimers();
      try {
        document.body.innerHTML = '<div class="composer-shell"><div role="textbox" contenteditable="plaintext-only"></div></div>';
        const { cleanup } = renderSvelte(DeepResearchRevisionPanel);
        await flushUi();

        window.dispatchEvent(new CustomEvent("bds:deep-research-open-revision", {
          detail: { runId: "run-contenteditable", plan: { title: "Plan", steps: [] } },
        }));
        await vi.advanceTimersByTimeAsync(150);
        await flushUi();

        const panel = document.querySelector('[data-testid="deep-research-revision-panel"]');
        const input = document.querySelector('[data-testid="deep-research-revision-input"]');
        expect(panel?.parentElement?.classList.contains("composer-shell")).toBe(true);
        expect(panel.classList.contains("bds-dr-revision-panel--hidden")).toBe(false);
        expect(document.activeElement).toBe(input);
        cleanup();
      } finally {
        vi.useRealTimers();
      }
    });

    it("can refocus the feedback input after the main composer receives focus", async () => {
      vi.useFakeTimers();
      try {
        document.body.innerHTML = '<div class="composer-shell"><div role="textbox" contenteditable="plaintext-only"></div></div>';
        const { cleanup } = renderSvelte(DeepResearchRevisionPanel);
        await flushUi();

        window.dispatchEvent(new CustomEvent("bds:deep-research-open-revision", {
          detail: { runId: "run-refocus", plan: { title: "Plan", steps: [] } },
        }));
        await flushUi();

        const editor = document.querySelector('[role="textbox"]');
        const input = document.querySelector('[data-testid="deep-research-revision-input"]');
        editor.focus();
        expect(document.activeElement).toBe(editor);

        input.dispatchEvent(new Event("pointerdown", { bubbles: true }));
        await vi.advanceTimersByTimeAsync(1);
        await flushUi();

        expect(document.activeElement).toBe(input);
        cleanup();
      } finally {
        vi.useRealTimers();
      }
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

    it("downloads the report as markdown", async () => {
      URL.createObjectURL = vi.fn(() => "blob:deep-research");
      URL.revokeObjectURL = vi.fn();
      const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
      const { target, cleanup } = renderSvelte(DeepResearchReportCard, {
        runId: "run-download",
        markdown: "\n\n# Downloadable Report",
      });
      await flushUi();

      target.querySelector('[data-testid="deep-research-download-btn"]').click();

      const blob = URL.createObjectURL.mock.calls[0][0];
      expect(URL.createObjectURL).toHaveBeenCalledOnce();
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe("text/markdown");
      await expect(readBlobText(blob)).resolves.toBe("# Downloadable Report");
      expect(click).toHaveBeenCalledOnce();
      expect(click.mock.contexts[0].download).toBe("deep-research-run-download.md");
      cleanup();
    });

    it("renders a Download PDF button", async () => {
      const { target, cleanup } = renderSvelte(DeepResearchReportCard, {
        runId: "rpt-pdf",
        markdown: "# PDF Report\n\nContent",
      });
      await flushUi();

      const pdfBtn = target.querySelector('[data-testid="deep-research-pdf-btn"]');
      expect(pdfBtn).toBeTruthy();
      expect(pdfBtn.textContent).toContain("PDF");
      cleanup();
    });

    it("downloads the report as PDF via print", async () => {
      const printFn = vi.fn();
      const writeSpy = vi.fn();
      const fakeIframe = {
        contentWindow: {
          document: { open: vi.fn(), write: writeSpy, close: vi.fn() },
          focus: vi.fn(),
          print: printFn,
        },
        style: {},
      };
      const origCreateElement = document.createElement.bind(document);
      const createElementSpy = vi.spyOn(document, "createElement").mockImplementation((tag) => {
        if (tag === "iframe") return fakeIframe;
        return origCreateElement(tag);
      });
      const appendChildSpy = vi.spyOn(document.body, "appendChild").mockImplementation(() => {});
      const containsSpy = vi.spyOn(document.body, "contains").mockReturnValue(false);

      const { target, cleanup } = renderSvelte(DeepResearchReportCard, {
        runId: "pdf-test",
        markdown: "\n\n# PDF Report\n\nTest **bold**",
      });
      await flushUi();

      target.querySelector('[data-testid="deep-research-pdf-btn"]').click();

      expect(createElementSpy).toHaveBeenCalledWith("iframe");
      expect(appendChildSpy).toHaveBeenCalled();
      expect(fakeIframe.contentWindow.document.open).toHaveBeenCalled();
      expect(fakeIframe.contentWindow.document.close).toHaveBeenCalled();

      const writtenHtml = writeSpy.mock.calls[0][0];
      expect(writtenHtml).toContain("Deep Research Report");
      expect(writtenHtml).toContain("PDF Report");
      expect(writtenHtml).toContain("<strong>bold</strong>");
        expect(writtenHtml).toContain("pdf-test");
      expect(writtenHtml).toContain("print-color-adjust: exact");

      // print should be scheduled via setTimeout; not called synchronously
      expect(printFn).not.toHaveBeenCalled();
      // contentWindow.focus should have been called
      expect(fakeIframe.contentWindow.focus).toHaveBeenCalled();

      createElementSpy.mockRestore();
      appendChildSpy.mockRestore();
      containsSpy.mockRestore();
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
      expect(btn.getAttribute("aria-label")).toBe("Research online sources and consolidate findings");
      expect(btn.hasAttribute("aria-describedby")).toBe(false);
      expect(btn.classList.contains("ds-toggle-button")).toBe(true);
      expect(btn.classList.contains("ds-toggle-button--m")).toBe(true);
      expect(btn.classList.contains("ds-toggle-button--selected")).toBe(false);
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
      expect(btn.getAttribute("aria-label")).toBe("Research online sources and consolidate findings");
      expect(btn.hasAttribute("aria-describedby")).toBe(false);
      expect(btn.classList.contains("ds-toggle-button--selected")).toBe(true);
      cleanup();
    });

    it("does not create a hover tooltip", async () => {
      const { target, cleanup } = renderSvelte(DeepResearchToggle, {
        enabled: false,
      });
      await flushUi();

      const btn = target.querySelector('[data-testid="deep-research-toggle"]');
      btn.dispatchEvent(new MouseEvent("mouseenter"));
      await flushUi();

      expect(btn.hasAttribute("aria-describedby")).toBe(false);
      expect(document.querySelector(".bds-deep-research-tooltip")).toBeNull();

      btn.click();
      await flushUi();
      expect(document.querySelector(".bds-deep-research-tooltip")).toBeNull();

      btn.dispatchEvent(new MouseEvent("mouseleave"));
      await flushUi();
      expect(btn.hasAttribute("aria-describedby")).toBe(false);
      expect(document.querySelector(".bds-deep-research-tooltip")).toBeNull();
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

    it("uses DeepSeek native toggle-button structure", async () => {
      const { target, cleanup } = renderSvelte(DeepResearchToggle, {
        enabled: true,
      });
      await flushUi();

      const btn = target.querySelector('[data-testid="deep-research-toggle"]');
      expect(btn.tagName.toLowerCase()).toBe("div");
      expect(btn.hasAttribute("role")).toBe(false);
      expect(btn.hasAttribute("title")).toBe(false);
      expect(btn.hasAttribute("aria-label")).toBe(true);
      expect(btn.querySelector(".ds-toggle-button__icon .ds-icon svg")).toBeTruthy();
      expect(btn.querySelector(".ds-focus-ring")).toBeTruthy();
      expect(btn.querySelector("span._6dbc175")?.textContent).toBe("DeepResearch");
      cleanup();
    });
  });
});

function readBlobText(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}
