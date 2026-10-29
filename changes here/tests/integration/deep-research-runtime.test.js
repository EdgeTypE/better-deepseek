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
  beforeEach(async () => {
    vi.resetModules();
    autoMocks.clearRunSearchHistory.mockReset();
    autoMocks.injectPureTextAndSend.mockReset();
    autoMocks.sendFileWithMessage.mockReset();
    readerMocks.searchWeb.mockReset();
    readerMocks.fetchAndConvertWebPage.mockReset();
    autoMocks.injectPureTextAndSend.mockReturnValue(true);
    autoMocks.sendFileWithMessage.mockResolvedValue(true);
    document.body.innerHTML = "";
    // Default for existing tests that expect deepFetch=3 behavior
    const st = await import("../../src/content/state.js").then(m => m.default);
    st.settings.deepResearchDeepFetch = 3;
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
    expect(evidenceCall[1]).toContain("Provider: mock");
    expect(evidenceCall[1]).toContain("https://example.com/review");
    expect(evidenceCall[1]).not.toContain("```json");
    expect(evidenceCall[1]).not.toContain('"results"');
    expect(evidenceCall[3]).toMatchObject({
      inlineText: expect.any(String),
      overLimitFallbackText: expect.any(String),
      overLimitEmergencyText: expect.any(String),
    });
    expect(evidenceCall[3].inlineText).toContain("Evidence digest:");
    expect(evidenceCall[3].inlineText).toContain("Good evidence");
    expect(evidenceCall[3].inlineText).toContain('<BDS:DEEP_RESEARCH_STEP_DONE runId="run-approve" stepId="1">');
    expect(run.execution.steps[0].status).toBe("awaiting_analysis");
  });

  it("builds bounded text-only evidence digests for expert-mode step sends", async () => {
    const longSnippet = "independent evaluation ".repeat(400);
    const longBody = "deep fetched evidence ".repeat(900);
    const evidenceText = [
      "# Search Results",
      "",
      "## Page Content: Long Independent Evaluation",
      "**Source:** https://example.com/long-review",
      longBody,
    ].join("\n");
    const evidenceFile = new File([evidenceText], "long-search.md", { type: "text/markdown" });
    Object.defineProperty(evidenceFile, "text", {
      value: vi.fn(() => Promise.resolve(evidenceText)),
    });
    readerMocks.searchWeb.mockResolvedValue({
      query: "AI detector false positives independent evaluation",
      deepFetch: 5,
      results: Array.from({ length: 10 }, (_, index) => ({
        title: `Source ${index + 1}`,
        url: `https://example.com/source-${index + 1}`,
        snippet: `${longSnippet} ${index + 1}`,
      })),
      provider: "duckduckgo",
      rawResultCount: 18,
      effectiveQuery: "AI detector false positives independent evaluation 2026",
      file: evidenceFile,
    });

    const state = (await import("../../src/content/state.js")).default;
    const {
      createRun,
      initDeepResearchRuntime,
    } = await import("../../src/content/deep-research.js");

    const plan = {
      title: "AI Detector Reliability",
      steps: [{
        id: 2,
        action: "search",
        query: "AI detector false positives independent evaluation",
        purpose: "find independent accuracy and false-positive evidence",
        sourceType: "academic",
        deepFetch: 5,
      }],
    };
    const run = createRun("conv1", "run-long-digest");
    run.plan = plan;
    state.deepResearch.enabled = true;
    state.deepResearch.runs = [run];

    initDeepResearchRuntime();

    window.dispatchEvent(new CustomEvent("bds:deep-research-approve", {
      detail: { runId: "run-long-digest", plan },
    }));

    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const evidenceCall = autoMocks.sendFileWithMessage.mock.calls.find((call) => call[0] === evidenceFile);
    expect(evidenceCall).toBeTruthy();
    const [file, attachmentPrompt, label, options] = evidenceCall;

    expect(file).toBe(evidenceFile);
    expect(label).toBe("Deep Research step 2 result");
    expect(attachmentPrompt).toContain("Provider: duckduckgo");
    expect(attachmentPrompt).toContain("Results: 10 of 18 raw");
    expect(attachmentPrompt).toContain("Deep fetch: 5");
    expect(attachmentPrompt).toContain("https://example.com/source-1");
    expect(attachmentPrompt).not.toContain(longSnippet.slice(0, 500));
    expect(attachmentPrompt).not.toContain("```json");
    expect(attachmentPrompt).not.toContain('"results"');

    expect(options.inlineText.length).toBeLessThanOrEqual(9_000);
    expect(options.overLimitFallbackText.length).toBeLessThanOrEqual(4_500);
    expect(options.overLimitEmergencyText.length).toBeLessThanOrEqual(2_000);

    for (const text of [
      options.inlineText,
      options.overLimitFallbackText,
      options.overLimitEmergencyText,
    ]) {
      expect(text).toContain("Evidence digest:");
      expect(text).toContain("Provider: duckduckgo");
      expect(text).toContain("https://example.com/source-1");
      expect(text).toContain('<BDS:DEEP_RESEARCH_STEP_DONE runId="run-long-digest" stepId="2">');
      expect(text).toContain("Do NOT produce the final report yet");
      expect(text).not.toContain(longBody.slice(0, 2_000));
      expect(text).not.toContain('"results"');
    }
  });

  it("does not mark a managed step as awaiting analysis when sending the evidence prompt fails", async () => {
    autoMocks.sendFileWithMessage.mockResolvedValue(false);
    const evidenceFile = new File(["# Search evidence"], "search.md", { type: "text/markdown" });
    Object.defineProperty(evidenceFile, "text", {
      value: vi.fn(() => Promise.resolve("# Search evidence")),
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
    const run = createRun("conv1", "run-send-fails");
    run.plan = plan;
    state.deepResearch.enabled = true;
    state.deepResearch.runs = [run];

    initDeepResearchRuntime();

    window.dispatchEvent(new CustomEvent("bds:deep-research-approve", {
      detail: { runId: "run-send-fails", plan },
    }));

    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(autoMocks.sendFileWithMessage).toHaveBeenCalled();
    expect(run.execution.steps[0].status).toBe("send_failed");
    expect(run.execution.awaitingAnalysisStepId).toBeNull();
  });

  it("executes adaptive steps before requesting final report", async () => {
    // Mock search to return evidence
    const evidenceText = "# Search evidence\n\nGood results.";
    const evidenceFile = new File([evidenceText], "search.md", { type: "text/markdown" });
    Object.defineProperty(evidenceFile, "text", {
      value: vi.fn(() => Promise.resolve(evidenceText)),
    });

    readerMocks.searchWeb.mockResolvedValue({
      query: "follow-up query",
      deepFetch: 2,
      results: [{ title: "Adaptive result", url: "https://example.com/adaptive", snippet: "adaptive finding" }],
      provider: "mock",
      rawResultCount: 1,
      file: evidenceFile,
    });

    autoMocks.sendFileWithMessage.mockResolvedValue(true);

    const state = (await import("../../src/content/state.js")).default;
    const {
      createRun,
      initDeepResearchRuntime,
      handleStepDone,
    } = await import("../../src/content/deep-research.js");

    const plan = {
      title: "Adaptive Research",
      steps: [{
        id: 1,
        action: "search",
        query: "initial query",
        purpose: "overview",
        sourceType: "general",
      }],
    };
    const run = createRun("conv1", "run-adaptive-exec");
    run.plan = plan;
    state.deepResearch.enabled = true;
    state.deepResearch.runs = [run];

    initDeepResearchRuntime();

    // Approve to start managed execution
    window.dispatchEvent(new CustomEvent("bds:deep-research-approve", {
      detail: { runId: "run-adaptive-exec", plan },
    }));

    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Step 1 should be awaiting analysis
    expect(run.execution.steps[0].status).toBe("awaiting_analysis");
    expect(run.execution.steps).toHaveLength(1);

    // Reset mock for the adaptive step
    readerMocks.searchWeb.mockClear();
    autoMocks.sendFileWithMessage.mockClear();

    const adaptiveEvidenceFile = new File(["# Adaptive evidence"], "adaptive-search.md", { type: "text/markdown" });
    Object.defineProperty(adaptiveEvidenceFile, "text", {
      value: vi.fn(() => Promise.resolve("# Adaptive evidence")),
    });
    readerMocks.searchWeb.mockResolvedValue({
      query: "adaptive follow-up",
      deepFetch: 3,
      results: [{ title: "Follow-up", url: "https://example.com/followup", snippet: "follow-up data" }],
      provider: "mock",
      rawResultCount: 1,
      file: adaptiveEvidenceFile,
    });

    // Ensure run is still in the array (loadRuns may have cleared it)
    if (!state.deepResearch.runs.find((r) => r.id === run.id)) {
      state.deepResearch.runs.push(run);
    }

    // Send step-done with adaptive nextSteps
    window.dispatchEvent(new CustomEvent("bds:deep-research-step-done", {
      detail: {
        conversationId: "conv1",
        runId: "run-adaptive-exec",
        stepId: "1",
        analysis: {
          stepId: "1",
          analysis: "found gap",
          newInsights: ["need follow-up"],
          nextSteps: [
            { action: "search", query: "adaptive follow-up", purpose: "fill gap", sourceType: "academic", deepFetch: 3 },
          ],
        },
      },
    }));

    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Adaptive step should have been inserted and executed
    expect(run.execution.steps).toHaveLength(2);
    expect(run.execution.steps[0].status).toBe("complete");
    expect(run.execution.steps[1].id).toBe("a1");
    expect(run.execution.steps[1].adaptive).toBe(true);
    expect(run.execution.steps[1].parentStepId).toBe("1");
    // The adaptive step should have been run and sent for analysis
    expect(run.execution.steps[1].status).toBe("awaiting_analysis");
    // Final report should NOT be requested yet (adaptive step pending)
    expect(run.execution.reportRequested).toBe(false);
  });

  it("requests final report after adaptive steps complete when at last original step", async () => {
    const evidenceText = "# Search evidence";
    const evidenceFile = new File([evidenceText], "search.md", { type: "text/markdown" });
    Object.defineProperty(evidenceFile, "text", {
      value: vi.fn(() => Promise.resolve(evidenceText)),
    });

    readerMocks.searchWeb.mockResolvedValue({
      query: "test",
      deepFetch: 3,
      results: [{ title: "Test", url: "https://example.com/test", snippet: "test" }],
      provider: "mock",
      rawResultCount: 1,
      file: evidenceFile,
    });

    autoMocks.sendFileWithMessage.mockResolvedValue(true);
    autoMocks.injectPureTextAndSend.mockReturnValue(true);

    const state = (await import("../../src/content/state.js")).default;
    const {
      createRun,
      initDeepResearchRuntime,
    } = await import("../../src/content/deep-research.js");

    const plan = {
      title: "Single Step Research",
      steps: [{
        id: 1,
        action: "search",
        query: "only step",
        purpose: "overview",
        sourceType: "general",
      }],
    };
    const run = createRun("conv1", "run-last-step-adaptive");
    run.plan = plan;
    state.deepResearch.enabled = true;
    state.deepResearch.runs = [run];

    initDeepResearchRuntime();

    window.dispatchEvent(new CustomEvent("bds:deep-research-approve", {
      detail: { runId: "run-last-step-adaptive", plan },
    }));

    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Step 1 is the last and only step, awaiting analysis
    expect(run.execution.steps[0].status).toBe("awaiting_analysis");

    // Ensure run is still in the array (loadRuns may have cleared it)
    if (!state.deepResearch.runs.find((r) => r.id === run.id)) {
      state.deepResearch.runs.push(run);
    }

    // Send step-done WITHOUT adaptive nextSteps (normal completion)
    window.dispatchEvent(new CustomEvent("bds:deep-research-step-done", {
      detail: {
        conversationId: "conv1",
        runId: "run-last-step-adaptive",
        stepId: "1",
        analysis: {
          stepId: "1",
          analysis: "done",
          newInsights: [],
        },
      },
    }));

    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    // With no adaptive steps and last step complete, final report should be requested
    expect(run.execution.reportRequested).toBe(true);
    expect(run.status).toBe("reporting");
  });

  it("existing no-adaptive runs still behave as before (regression)", async () => {
    const evidenceText = "# Search evidence\n\nResults here.";
    const evidenceFile = new File([evidenceText], "search.md", { type: "text/markdown" });
    Object.defineProperty(evidenceFile, "text", {
      value: vi.fn(() => Promise.resolve(evidenceText)),
    });
    readerMocks.searchWeb.mockResolvedValue({
      query: "gaming laptop reviews",
      deepFetch: 3,
      results: [{ title: "Review", url: "https://example.com/review", snippet: "Good evidence" }],
      provider: "mock",
      rawResultCount: 1,
      file: evidenceFile,
    });

    autoMocks.sendFileWithMessage.mockResolvedValue(true);

    const state = (await import("../../src/content/state.js")).default;
    const {
      createRun,
      initDeepResearchRuntime,
    } = await import("../../src/content/deep-research.js");

    const plan = {
      title: "Standard Research",
      steps: [{
        id: 1,
        action: "search",
        query: "gaming laptop reviews",
        purpose: "collect review evidence",
        sourceType: "reviews",
      }],
    };
    const run = createRun("conv1", "run-no-adaptive-regression");
    run.plan = plan;
    state.deepResearch.enabled = true;
    state.deepResearch.runs = [run];

    initDeepResearchRuntime();

    window.dispatchEvent(new CustomEvent("bds:deep-research-approve", {
      detail: { runId: "run-no-adaptive-regression", plan },
    }));

    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(readerMocks.searchWeb).toHaveBeenCalled();
    expect(run.execution.steps[0].status).toBe("awaiting_analysis");
    expect(run.execution.steps).toHaveLength(1);
    expect(run.execution.adaptiveStepCounter).toBe(0);

    // Ensure run is still in the array (loadRuns may have cleared it)
    if (!state.deepResearch.runs.find((r) => r.id === run.id)) {
      state.deepResearch.runs.push(run);
    }

    // Step-done without nextSteps
    window.dispatchEvent(new CustomEvent("bds:deep-research-step-done", {
      detail: {
        conversationId: "conv1",
        runId: "run-no-adaptive-regression",
        stepId: "1",
        analysis: { stepId: "1", analysis: "done", newInsights: [] },
      },
    }));

    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    // No adaptive steps, last step complete, report should be requested
    expect(run.execution.reportRequested).toBe(true);
    expect(run.execution.steps).toHaveLength(1);
    expect(run.execution.steps[0].status).toBe("complete");
  });

  it("caps model-emitted deepFetch=5 to deepResearchDeepFetch setting", async () => {
    const state = (await import("../../src/content/state.js")).default;
    // Set a low deepFetch cap
    state.settings.deepResearchDeepFetch = 2;

    const evidenceFile = new File(["# Search"], "s.md", { type: "text/markdown" });
    Object.defineProperty(evidenceFile, "text", {
      value: vi.fn(() => Promise.resolve("# Search")),
    });
    readerMocks.searchWeb.mockResolvedValue({
      query: "test",
      deepFetch: 2,
      results: [{ title: "R", url: "https://ex.com", snippet: "s" }],
      provider: "mock",
      rawResultCount: 1,
      file: evidenceFile,
    });
    autoMocks.sendFileWithMessage.mockResolvedValue(true);

    const { createRun, initDeepResearchRuntime } = await import("../../src/content/deep-research.js");

    const plan = {
      title: "Test",
      steps: [{ id: 1, action: "search", query: "test query", purpose: "overview", sourceType: "general", deepFetch: 5 }],
    };
    const run = createRun("conv1", "run-cap");
    run.plan = plan;
    state.deepResearch.enabled = true;
    state.deepResearch.runs = [run];

    initDeepResearchRuntime();

    window.dispatchEvent(new CustomEvent("bds:deep-research-approve", {
      detail: { runId: "run-cap", plan },
    }));

    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    // deepFetch=5 should be clamped to the setting value (2)
    expect(run.execution.steps[0].deepFetch).toBe(2);
  });

  it("deepResearchDeepFetch=0 produces search-result-only steps", async () => {
    const state = (await import("../../src/content/state.js")).default;
    state.settings.deepResearchDeepFetch = 0;

    const evidenceFile = new File(["# Results"], "r.md", { type: "text/markdown" });
    Object.defineProperty(evidenceFile, "text", {
      value: vi.fn(() => Promise.resolve("# Results")),
    });
    readerMocks.searchWeb.mockResolvedValue({
      query: "test",
      deepFetch: 0,
      results: [{ title: "R", url: "https://ex.com", snippet: "s" }],
      provider: "mock",
      rawResultCount: 1,
      file: evidenceFile,
    });
    autoMocks.sendFileWithMessage.mockResolvedValue(true);

    const { createRun, initDeepResearchRuntime } = await import("../../src/content/deep-research.js");

    const plan = {
      title: "Test Zero",
      steps: [{ id: 1, action: "search", query: "test query", purpose: "overview", sourceType: "general" }],
    };
    const run = createRun("conv1", "run-zero");
    run.plan = plan;
    state.deepResearch.enabled = true;
    state.deepResearch.runs = [run];

    initDeepResearchRuntime();

    window.dispatchEvent(new CustomEvent("bds:deep-research-approve", {
      detail: { runId: "run-zero", plan },
    }));

    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    // With setting=0, default deepFetch should be 0
    expect(run.execution.steps[0].deepFetch).toBe(0);
  });
});
