// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const autoMocks = vi.hoisted(() => ({
  clearRunSearchHistory: vi.fn(),
  injectPureTextAndSend: vi.fn(),
}));

vi.mock("../../src/content/auto.js", () => autoMocks);

describe("Deep Research runtime events", () => {
  beforeEach(() => {
    vi.resetModules();
    autoMocks.clearRunSearchHistory.mockReset();
    autoMocks.injectPureTextAndSend.mockReset();
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
});
