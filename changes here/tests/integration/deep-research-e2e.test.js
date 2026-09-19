/**
 * E2E-style integration test for Deep Research flow.
 * Mocks the DeepSeek chat interaction to verify the full lifecycle:
 * enable mode -> submit query -> receive plan -> request revision -> approve -> run -> report.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  createRun,
  transitionRun,
  buildPlanningPrompt,
  buildApprovalMessage,
  buildRevisionMessage,
} from "../../src/content/deep-research.js";
import { parseBdsMessage } from "../../src/content/parser/index.js";

describe("Deep Research E2E mock flow", () => {
  let run;

  beforeEach(() => {
    run = createRun("conv_laptop_research");
  });

  it("completes full research lifecycle", () => {
    // Step 1: User enables deep research and submits a query
    expect(run.status).toBe("planning");
    const planningPrompt = buildPlanningPrompt(run.id, "Best laptops under $1500 for programming in 2025");
    expect(planningPrompt).toContain("Best laptops under $1500");
    expect(planningPrompt).toContain(run.id);
    expect(planningPrompt).toContain('"sourceType"');

    // Step 2: DeepSeek responds with a plan
    const planResponse = `<BDS:DEEP_RESEARCH_PLAN runId="${run.id}">{"title":"Best Programming Laptops Under $1500","steps":[{"id":1,"action":"search","query":"best programming laptops under 1500 2025","purpose":"Get overview of top options"},{"id":2,"action":"search","query":"ThinkPad X1 Carbon vs MacBook Air M3 programming","purpose":"Compare top contenders"},{"id":3,"action":"fetch","query":"https://notebookcheck.net/best-programming-laptops.html","purpose":"Detailed specs comparison"},{"id":4,"action":"search","query":"laptop battery life programming 2025 reviews","purpose":"Battery life data"}]}</BDS:DEEP_RESEARCH_PLAN>`;

    const parsed = parseBdsMessage(planResponse);
    expect(parsed.deepResearch.plans).toHaveLength(1);
    expect(parsed.deepResearch.plans[0].plan.steps).toHaveLength(4);

    // Store plan in run
    run.plan = parsed.deepResearch.plans[0].plan;
    expect(run.plan.title).toBe("Best Programming Laptops Under $1500");

    // Step 3: User requests revision
    transitionRun(run, "awaiting_revision");
    expect(run.status).toBe("awaiting_revision");

    const revisionMsg = buildRevisionMessage(run, "Also include Linux compatibility information");
    expect(revisionMsg).toContain("Linux compatibility");

    // Step 4: DeepSeek responds with revised plan
    transitionRun(run, "planning");
    const revisedPlanResponse = `<BDS:DEEP_RESEARCH_PLAN runId="${run.id}">{"title":"Best Programming Laptops Under $1500","steps":[{"id":1,"action":"search","query":"best programming laptops under 1500 2025","purpose":"Get overview of top options"},{"id":2,"action":"search","query":"ThinkPad X1 Carbon vs MacBook Air M3 programming","purpose":"Compare top contenders"},{"id":3,"action":"fetch","query":"https://notebookcheck.net/best-programming-laptops.html","purpose":"Detailed specs comparison"},{"id":4,"action":"search","query":"laptop battery life programming 2025 reviews","purpose":"Battery life data"},{"id":5,"action":"search","query":"best linux laptops 2025 programming compatible","purpose":"Linux compatibility"}]}</BDS:DEEP_RESEARCH_PLAN>`;

    const revisedParsed = parseBdsMessage(revisedPlanResponse);
    run.plan = revisedParsed.deepResearch.plans[0].plan;
    expect(run.plan.steps).toHaveLength(5);

    // Step 5: User approves the plan
    transitionRun(run, "approved");
    expect(run.status).toBe("approved");

    const approvalMsg = buildApprovalMessage(run);
    expect(approvalMsg).toContain("Plan approved");
    expect(approvalMsg).toContain(run.id);
    expect(approvalMsg).toContain("sourceType");

    // Step 6: Research execution begins
    transitionRun(run, "running");
    expect(run.status).toBe("running");

    // Step 7: Status updates during execution
    const statusResponse = `<BDS:DEEP_RESEARCH_STATUS runId="${run.id}">{"completedSteps":3,"totalSteps":5,"currentAction":"Searching for Linux compatibility"}</BDS:DEEP_RESEARCH_STATUS>`;
    const statusParsed = parseBdsMessage(statusResponse);
    expect(statusParsed.deepResearch.statuses[0].status.completedSteps).toBe(3);

    // Record sources in ledger
    run.sourceLedger.push(
      { url: "https://example.com/laptops", title: "Top Laptops 2025", accessed: Date.now() },
      { url: "https://notebookcheck.net/review", title: "Notebook Review", accessed: Date.now() }
    );

    // Step 8: Research complete, final report
    transitionRun(run, "reporting");
    expect(run.status).toBe("reporting");

    const reportMarkdown = `# Best Programming Laptops Under $1500 (2025)

## Summary
After researching 5 sources, here are the top programming laptops under $1500.

## Criteria Table
| Criteria | Weight |
|----------|--------|
| Performance | High |
| Battery Life | High |
| Linux Compat | Medium |
| Display | Medium |

## Top Picks
1. **ThinkPad X1 Carbon Gen 12** - $1,399
2. **MacBook Air M3** - $1,199
3. **Framework Laptop 16** - $1,399

## Tradeoffs
- MacBook excels in battery but limited Linux support
- ThinkPad best Linux compatibility

## Sources
- [Top Laptops 2025](https://example.com/laptops)
- [Notebook Review](https://notebookcheck.net/review)

## Verification Notes
- Prices verified as of 2025-01-15
- notebookcheck.net page was accessible and data confirmed

## Limitations
- Retailer-specific prices may vary by region
- Some JS-heavy review sites could not be fully parsed`;

    const reportResponse = `<BDS:DEEP_RESEARCH_REPORT runId="${run.id}">${reportMarkdown}</BDS:DEEP_RESEARCH_REPORT>`;
    const reportParsed = parseBdsMessage(reportResponse);
    expect(reportParsed.deepResearch.reports).toHaveLength(1);
    expect(reportParsed.deepResearch.reports[0].markdown).toBe(reportMarkdown);
    expect(reportParsed.deepResearch.reports[0].markdown).toContain("## Summary");
    expect(reportParsed.deepResearch.reports[0].markdown).toContain("## Sources");
    expect(reportParsed.deepResearch.reports[0].markdown).toContain("## Limitations");

    // Step 9: Complete
    transitionRun(run, "complete");
    expect(run.status).toBe("complete");
    expect(run.sourceLedger).toHaveLength(2);
  });

  it("supports cancellation at any point", () => {
    // Can cancel from planning
    transitionRun(run, "cancelled");
    expect(run.status).toBe("cancelled");
  });

  it("multiple research runs in same conversation are independent", () => {
    const run1 = createRun("conv1");
    const run2 = createRun("conv1");

    expect(run1.id).not.toBe(run2.id);
    transitionRun(run1, "approved");
    expect(run1.status).toBe("approved");
    expect(run2.status).toBe("planning");
  });
});
