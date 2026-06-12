import { describe, expect, it } from "vitest";
import { parseBdsMessage } from "../../src/content/parser/index.js";

describe("Deep Research tag parsing", () => {
  describe("DEEP_RESEARCH_PLAN", () => {
    it("parses valid plan JSON with runId", () => {
      const text = `<BDS:DEEP_RESEARCH_PLAN runId="abc123">{"title":"Laptop Research","steps":[{"id":1,"action":"search","query":"best laptops 2025","purpose":"overview"}]}</BDS:DEEP_RESEARCH_PLAN>`;
      const result = parseBdsMessage(text);

      expect(result.deepResearch.plans).toHaveLength(1);
      expect(result.deepResearch.plans[0].runId).toBe("abc123");
      expect(result.deepResearch.plans[0].plan.title).toBe("Laptop Research");
      expect(result.deepResearch.plans[0].plan.steps).toHaveLength(1);
      expect(result.deepResearch.plans[0].plan.steps[0].action).toBe("search");
    });

    it("handles malformed JSON gracefully", () => {
      const text = `<BDS:DEEP_RESEARCH_PLAN runId="bad1">not valid json{</BDS:DEEP_RESEARCH_PLAN>`;
      const result = parseBdsMessage(text);

      expect(result.deepResearch.plans).toHaveLength(1);
      expect(result.deepResearch.plans[0].runId).toBe("bad1");
      expect(result.deepResearch.plans[0].plan).toBeNull();
      expect(result.deepResearch.plans[0].raw).toBe("not valid json{");
      expect(result.deepResearch.plans[0].error).toBeTruthy();
    });

    it("repairs common plan JSON mistakes from model output", () => {
      const text = `<BDS:DEEP_RESEARCH_PLAN runId="repair1">{
        "title": "Rooting Tecno POVA Pro 5G",
        "steps": [
          {
            "id": 1,
            "action": "search",
            "query": ""Tecno POVA Pro 5G" root magisk 2025 2026",
            "purpose": "Catch recent guides",
          },
        ],
      }</BDS:DEEP_RESEARCH_PLAN>`;
      const result = parseBdsMessage(text);

      expect(result.deepResearch.plans).toHaveLength(1);
      expect(result.deepResearch.plans[0].runId).toBe("repair1");
      expect(result.deepResearch.plans[0].plan.title).toBe("Rooting Tecno POVA Pro 5G");
      expect(result.deepResearch.plans[0].plan.steps[0].query).toContain("Tecno POVA Pro 5G");
    });

    it("parses plan without runId attribute", () => {
      const text = `<BDS:DEEP_RESEARCH_PLAN>{"title":"Test","steps":[]}</BDS:DEEP_RESEARCH_PLAN>`;
      const result = parseBdsMessage(text);

      expect(result.deepResearch.plans).toHaveLength(1);
      expect(result.deepResearch.plans[0].runId).toBe("");
      expect(result.deepResearch.plans[0].plan.title).toBe("Test");
    });

    it("marks plan card as renderable block", () => {
      const text = `<BDS:DEEP_RESEARCH_PLAN runId="r1">{"title":"T","steps":[]}</BDS:DEEP_RESEARCH_PLAN>`;
      const result = parseBdsMessage(text);

      const block = result.renderableBlocks.find(b => b.name === "deep_research_plan");
      expect(block).toBeTruthy();
    });
  });

  describe("DEEP_RESEARCH_STATUS", () => {
    it("parses valid status JSON", () => {
      const text = `<BDS:DEEP_RESEARCH_STATUS runId="run1">{"completedSteps":2,"totalSteps":5,"currentAction":"Searching for laptop reviews"}</BDS:DEEP_RESEARCH_STATUS>`;
      const result = parseBdsMessage(text);

      expect(result.deepResearch.statuses).toHaveLength(1);
      expect(result.deepResearch.statuses[0].runId).toBe("run1");
      expect(result.deepResearch.statuses[0].status.completedSteps).toBe(2);
      expect(result.deepResearch.statuses[0].status.totalSteps).toBe(5);
      expect(result.deepResearch.statuses[0].status.currentAction).toBe("Searching for laptop reviews");
    });

    it("handles malformed status JSON", () => {
      const text = `<BDS:DEEP_RESEARCH_STATUS runId="x">{broken</BDS:DEEP_RESEARCH_STATUS>`;
      const result = parseBdsMessage(text);

      expect(result.deepResearch.statuses).toHaveLength(1);
      expect(result.deepResearch.statuses[0].status).toBeNull();
      expect(result.deepResearch.statuses[0].raw).toBe("{broken");
    });

    it("marks status card as renderable block", () => {
      const text = `<BDS:DEEP_RESEARCH_STATUS runId="r2">{"completedSteps":1,"totalSteps":3}</BDS:DEEP_RESEARCH_STATUS>`;
      const result = parseBdsMessage(text);

      const block = result.renderableBlocks.find(b => b.name === "deep_research_status");
      expect(block).toBeTruthy();
    });
  });

  describe("DEEP_RESEARCH_REPORT", () => {
    it("preserves markdown content verbatim", () => {
      const markdown = `# Research Report\n\n## Summary\nHere are the findings.\n\n| Feature | Rating |\n|---------|--------|\n| Speed | 9/10 |\n\n## Sources\n- [Source 1](https://example.com)`;
      const text = `<BDS:DEEP_RESEARCH_REPORT runId="rpt1">${markdown}</BDS:DEEP_RESEARCH_REPORT>`;
      const result = parseBdsMessage(text);

      expect(result.deepResearch.reports).toHaveLength(1);
      expect(result.deepResearch.reports[0].runId).toBe("rpt1");
      expect(result.deepResearch.reports[0].markdown).toBe(markdown);
    });

    it("strips leading blank lines from report markdown", () => {
      const text = `<BDS:DEEP_RESEARCH_REPORT runId="rpt-trim">

# Research Report

## Summary
Findings.</BDS:DEEP_RESEARCH_REPORT>`;
      const result = parseBdsMessage(text);

      expect(result.deepResearch.reports).toHaveLength(1);
      expect(result.deepResearch.reports[0].markdown).toBe("# Research Report\n\n## Summary\nFindings.");
    });

    it("handles empty report", () => {
      const text = `<BDS:DEEP_RESEARCH_REPORT runId="e1"></BDS:DEEP_RESEARCH_REPORT>`;
      const result = parseBdsMessage(text);

      expect(result.deepResearch.reports).toHaveLength(1);
      expect(result.deepResearch.reports[0].markdown).toBe("");
    });

    it("preserves code blocks within report markdown", () => {
      const markdown = "## Code Example\n```python\nprint('hello')\n```\n\nDone.";
      const text = `<BDS:DEEP_RESEARCH_REPORT runId="c1">${markdown}</BDS:DEEP_RESEARCH_REPORT>`;
      const result = parseBdsMessage(text);

      expect(result.deepResearch.reports[0].markdown).toContain("```python");
      expect(result.deepResearch.reports[0].markdown).toContain("print('hello')");
    });

    it("marks report as renderable block", () => {
      const text = `<BDS:DEEP_RESEARCH_REPORT runId="r3"># Report</BDS:DEEP_RESEARCH_REPORT>`;
      const result = parseBdsMessage(text);

      const block = result.renderableBlocks.find(b => b.name === "deep_research_report");
      expect(block).toBeTruthy();
    });
  });

  describe("Multiple deep research tags in one message", () => {
    it("parses plan + status in same message", () => {
      const text = [
        `<BDS:DEEP_RESEARCH_PLAN runId="m1">{"title":"Multi","steps":[{"id":1,"action":"search","query":"test","purpose":"test"}]}</BDS:DEEP_RESEARCH_PLAN>`,
        `<BDS:DEEP_RESEARCH_STATUS runId="m1">{"completedSteps":0,"totalSteps":1}</BDS:DEEP_RESEARCH_STATUS>`
      ].join("\n");
      const result = parseBdsMessage(text);

      expect(result.deepResearch.plans).toHaveLength(1);
      expect(result.deepResearch.statuses).toHaveLength(1);
    });
  });

  describe("containsControlTags", () => {
    it("deep research tags are control tags (hidden from raw view)", () => {
      const text = `<BDS:DEEP_RESEARCH_PLAN runId="x">{"title":"T","steps":[]}</BDS:DEEP_RESEARCH_PLAN>`;
      const result = parseBdsMessage(text);

      expect(result.containsControlTags).toBe(true);
    });
  });

  describe("AUTO:SEARCH run scoping", () => {
    it("parses runId from search tags", () => {
      const text = `<BDS:AUTO:SEARCH runId="run42" deepFetch="2">gaming laptop reviews</BDS:AUTO:SEARCH>`;
      const result = parseBdsMessage(text);

      expect(result.autoRequests.searchQueries).toEqual([
        { query: "gaming laptop reviews", deepFetch: 2, runId: "run42" },
      ]);
    });
  });

  describe("AUTO URL normalization", () => {
    it("extracts the URL from markdown web fetch tags", () => {
      const text = `<BDS:AUTO:REQUEST_WEB_FETCH>[https://www.reddit.com/r/GamingLaptops/comments/16w0x23/ptm7950_for_laptop_gpu_cpu_how_much_do_i_need/](https://www.reddit.com/r/GamingLaptops/comments/16w0x23/ptm7950_for_laptop_gpu_cpu_how_much_do_i_need/)</BDS:AUTO:REQUEST_WEB_FETCH>`;
      const result = parseBdsMessage(text);

      expect(result.autoRequests.webFetch).toEqual([
        "https://www.reddit.com/r/GamingLaptops/comments/16w0x23/ptm7950_for_laptop_gpu_cpu_how_much_do_i_need/",
      ]);
    });

    it("does not schedule malformed web fetch targets", () => {
      const text = `<BDS:AUTO:REQUEST_WEB_FETCH>[not a url](not-a-url)</BDS:AUTO:REQUEST_WEB_FETCH>`;
      const result = parseBdsMessage(text);

      expect(result.autoRequests.webFetch).toEqual([]);
    });
  });
});
