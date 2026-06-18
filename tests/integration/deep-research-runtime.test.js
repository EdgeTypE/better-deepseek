// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const autoMocks = vi.hoisted(() => ({
  clearRunSearchHistory: vi.fn(),
  injectPureTextAndSend: vi.fn(),
  sendFileWithMessage: vi.fn(),
}));

vi.mock("../../src/content/auto.js", () => autoMocks);

const readerMocks = vi.hoisted(() => ({
  searchWeb: vi.fn(),
  fetchAndConvertWebPage: vi.fn(),
}));

vi.mock("../../src/content/files/search-reader.js", () => ({
  searchWeb: readerMocks.searchWeb,
}));

vi.mock("../../src/content/files/web-reader.js", () => ({
  fetchAndConvertWebPage: readerMocks.fetchAndConvertWebPage,
}));

describe("Deep Research runtime events", () => {
  beforeEach(() => {
    vi.resetModules();
    autoMocks.clearRunSearchHistory.mockReset();
    autoMocks.injectPureTextAndSend.mockReset();
    autoMocks.sendFileWithMessage.mockReset();
    readerMocks.searchWeb.mockReset();
    readerMocks.fetchAndConvertWebPage.mockReset();
    autoMocks.injectPureTextAndSend.mockReturnValue(true);
    autoMocks.sendFileWithMessage.mockResolvedValue(true);
    document.body.innerHTML = "";
  });

  it("posts revision feedback back into the chat", async () => {
    const state = (await import("../../src/content/state.js")).default;
    const {
      createRun,
      initDeepResearchRuntime,
    } = await import("../../src/content/deep-research.js");

    const plan = {
      title: "Gaming Laptop Research",
      steps: [{ id: 1, action: "search", query: "best gaming laptop", purpose: "overview" }],
    };
    const run = createRun("conv1", "run-revise");
    run.plan = plan;
    state.deepResearch.enabled = true;
    state.deepResearch.pendingRun = null;
    state.deepResearch.runs = [run];

    initDeepResearchRuntime();

    window.dispatchEvent(new CustomEvent("bds:deep-research-revise", {
      detail: {
        runId: "run-revise",
        plan,
        feedback: "Add warranty and seller reputation checks.",
      },
    }));

    expect(run.status).toBe("awaiting_revision");
    expect(autoMocks.injectPureTextAndSend).toHaveBeenCalledOnce();
    expect(autoMocks.injectPureTextAndSend).toHaveBeenCalledWith(
      expect.stringContaining("Revision requested for run run-revise"),
      "Deep Research revision request",
    );
    const prompt = autoMocks.injectPureTextAndSend.mock.calls[0][0];
    expect(prompt).toContain("Add warranty and seller reputation checks.");
    expect(prompt).toContain("Gaming Laptop Research");
    expect(prompt).toContain('<BDS:DEEP_RESEARCH_PLAN runId="run-revise">');
  });

  it("runs the approved first step and sends the evidence file for analysis", async () => {
    const evidenceFile = new File(["# Search evidence\n\nFull result body."], "search.md", { type: "text/markdown" });
    Object.defineProperty(evidenceFile, "text", {
      value: vi.fn(() => Promise.resolve("# Search evidence\n\nFull result body.")),
    });
    readerMocks.searchWeb.mockResolvedValue({
      query: "gaming laptop reviews",
      deepFetch: 3,
      results: [{ title: "Review", url: "https://example.com/review", snippet: "Good evidence" }],
      provider: "mock",
      rawResultCount: 1,
      effectiveQuery: "gaming laptop reviews review",
      file: evidenceFile,
    });

    const state = (await import("../../src/content/state.js")).default;
    const {
      createRun,
      initDeepResearchRuntime,
    } = await import("../../src/content/deep-research.js");

    const plan = {
      title: "Gaming Laptop Research",
      steps: [{
        id: 1,
        action: "search",
        query: "gaming laptop reviews",
        purpose: "collect review evidence",
        sourceType: "reviews",
      }],
    };
    const run = createRun("conv1", "run-approve");
    run.plan = plan;
    state.deepResearch.enabled = true;
    state.deepResearch.runs = [run];

    initDeepResearchRuntime();

    window.dispatchEvent(new CustomEvent("bds:deep-research-approve", {
      detail: { runId: "run-approve", plan },
    }));

    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(readerMocks.searchWeb).toHaveBeenCalledWith(
      "gaming laptop reviews",
      3,
      expect.any(Function),
      { purpose: "collect review evidence", sourceType: "reviews" },
    );
    const evidenceCall = autoMocks.sendFileWithMessage.mock.calls.find((call) => call[0] === evidenceFile);
    expect(evidenceCall).toBeTruthy();
    expect(evidenceCall[1]).toContain("Read the attached evidence file before analyzing: search.md");
    expect(evidenceCall[1]).toContain('<BDS:DEEP_RESEARCH_STEP_DONE runId="run-approve" stepId="1">');
    expect(run.execution.steps[0].status).toBe("awaiting_analysis");
  });
});
