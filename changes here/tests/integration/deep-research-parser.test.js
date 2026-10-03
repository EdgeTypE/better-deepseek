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

  describe("DEEP_RESEARCH_STEP_DONE", () => {
    it("parses step-done tag with valid JSON", () => {
      const text = `<BDS:DEEP_RESEARCH_STEP_DONE runId="run1" stepId="1">{"stepId":"1","analysis":"found good results","newInsights":["insight A","insight B"]}</BDS:DEEP_RESEARCH_STEP_DONE>`;
      const result = parseBdsMessage(text);

      expect(result.deepResearch.stepDone).toHaveLength(1);
      expect(result.deepResearch.stepDone[0].runId).toBe("run1");
      expect(result.deepResearch.stepDone[0].stepId).toBe("1");
      expect(result.deepResearch.stepDone[0].analysis.stepId).toBe("1");
      expect(result.deepResearch.stepDone[0].analysis.analysis).toBe("found good results");
      expect(result.deepResearch.stepDone[0].analysis.newInsights).toEqual(["insight A", "insight B"]);
    });

    it("handles malformed step-done JSON", () => {
      const text = `<BDS:DEEP_RESEARCH_STEP_DONE runId="run1" stepId="2">{broken json</BDS:DEEP_RESEARCH_STEP_DONE>`;
      const result = parseBdsMessage(text);

      expect(result.deepResearch.stepDone).toHaveLength(1);
      expect(result.deepResearch.stepDone[0].runId).toBe("run1");
      expect(result.deepResearch.stepDone[0].stepId).toBe("2");
      expect(result.deepResearch.stepDone[0].analysis).toBeNull();
      expect(result.deepResearch.stepDone[0].raw).toBe("{broken json");
      expect(result.deepResearch.stepDone[0].error).toBeTruthy();
    });

    it("handles empty step-done", () => {
      const text = `<BDS:DEEP_RESEARCH_STEP_DONE runId="run1" stepId="3"></BDS:DEEP_RESEARCH_STEP_DONE>`;
      const result = parseBdsMessage(text);

      expect(result.deepResearch.stepDone).toHaveLength(1);
    });

    it("parses stepDone with runid (case-insensitive)", () => {
      const text = `<BDS:DEEP_RESEARCH_STEP_DONE runid="runX" stepId="1">{"stepId":"1","analysis":"ok","newInsights":[]}</BDS:DEEP_RESEARCH_STEP_DONE>`;
      const result = parseBdsMessage(text);

      expect(result.deepResearch.stepDone).toHaveLength(1);
      expect(result.deepResearch.stepDone[0].runId).toBe("runX");
    });

    it("parses nextSteps in step-done JSON for adaptive expansion", () => {
      const text = `<BDS:DEEP_RESEARCH_STEP_DONE runId="run1" stepId="1">{"stepId":"1","analysis":"found gaps","newInsights":["need more data"],"nextSteps":[{"action":"search","query":"follow-up specific query","purpose":"fill gap","sourceType":"academic","deepFetch":3}]}</BDS:DEEP_RESEARCH_STEP_DONE>`;
      const result = parseBdsMessage(text);

      expect(result.deepResearch.stepDone).toHaveLength(1);
      expect(result.deepResearch.stepDone[0].analysis.nextSteps).toHaveLength(1);
      expect(result.deepResearch.stepDone[0].analysis.nextSteps[0].action).toBe("search");
      expect(result.deepResearch.stepDone[0].analysis.nextSteps[0].query).toBe("follow-up specific query");
      expect(result.deepResearch.stepDone[0].analysis.nextSteps[0].purpose).toBe("fill gap");
      expect(result.deepResearch.stepDone[0].analysis.nextSteps[0].sourceType).toBe("academic");
      expect(result.deepResearch.stepDone[0].analysis.nextSteps[0].deepFetch).toBe(3);
    });

    it("malformed nextSteps does not break step-done parsing", () => {
      // nextSteps contains invalid entries but the JSON itself is valid
      const text = `<BDS:DEEP_RESEARCH_STEP_DONE runId="run1" stepId="1">{"stepId":"1","analysis":"ok","newInsights":[],"nextSteps":[{"action":"invalid","query":""}]}</BDS:DEEP_RESEARCH_STEP_DONE>`;
      const result = parseBdsMessage(text);

      expect(result.deepResearch.stepDone).toHaveLength(1);
      expect(result.deepResearch.stepDone[0].analysis).toBeTruthy();
      expect(result.deepResearch.stepDone[0].analysis.nextSteps).toHaveLength(1);
      expect(result.deepResearch.stepDone[0].analysis.analysis).toBe("ok");
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

    it("parses plan + step-done + report in same message", () => {
      const text = [
        `<BDS:DEEP_RESEARCH_STATUS runId="m2">{"completedSteps":1,"totalSteps":2}</BDS:DEEP_RESEARCH_STATUS>`,
        `<BDS:DEEP_RESEARCH_STEP_DONE runId="m2" stepId="2">{"stepId":"2","analysis":"done"}</BDS:DEEP_RESEARCH_STEP_DONE>`,
        `<BDS:DEEP_RESEARCH_REPORT runId="m2"># Final</BDS:DEEP_RESEARCH_REPORT>`,
      ].join("\n");
      const result = parseBdsMessage(text);

      expect(result.deepResearch.statuses).toHaveLength(1);
      expect(result.deepResearch.stepDone).toHaveLength(1);
      expect(result.deepResearch.reports).toHaveLength(1);
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
        { query: "gaming laptop reviews", deepFetch: 2, runId: "run42", purpose: "", sourceType: "" },
      ]);
    });

    it("parses purpose and sourceType from search tags", () => {
      const text = '<BDS:AUTO:SEARCH runId="run42" deepFetch="2" purpose="compare thermals" sourceType="reviews">gaming laptop reviews 2025</BDS:AUTO:SEARCH>';
      const result = parseBdsMessage(text);

      expect(result.autoRequests.searchQueries).toEqual([
        {
          query: "gaming laptop reviews 2025",
          deepFetch: 2,
          runId: "run42",
          purpose: "compare thermals",
          sourceType: "reviews",
        },
      ]);
    });
  });

  describe("AUTO:SEARCH markdown link stripping", () => {
    it("site: operator with markdown-link mangled domain", () => {
      const text = '<BDS:AUTO:SEARCH>site:[nasa.gov](http://nasa.gov) exoplanets</BDS:AUTO:SEARCH>';
      const result = parseBdsMessage(text);

      expect(result.autoRequests.searchQueries).toHaveLength(1);
      expect(result.autoRequests.searchQueries[0].query).toBe("site:nasa.gov exoplanets");
    });

    it("multiple markdown links in one query", () => {
      const text = '<BDS:AUTO:SEARCH>site:[a.com](http://a.com) OR site:[b.org](http://b.org)</BDS:AUTO:SEARCH>';
      const result = parseBdsMessage(text);

      expect(result.autoRequests.searchQueries).toHaveLength(1);
      expect(result.autoRequests.searchQueries[0].query).toBe("site:a.com OR site:b.org");
    });

    it("markdown link without site: operator", () => {
      const text = '<BDS:AUTO:SEARCH>best laptops [reddit.com](http://reddit.com)</BDS:AUTO:SEARCH>';
      const result = parseBdsMessage(text);

      expect(result.autoRequests.searchQueries).toHaveLength(1);
      expect(result.autoRequests.searchQueries[0].query).toBe("best laptops reddit.com");
    });

    it("plain query without markdown links", () => {
      const text = '<BDS:AUTO:SEARCH>gaming laptop reviews</BDS:AUTO:SEARCH>';
      const result = parseBdsMessage(text);

      expect(result.autoRequests.searchQueries).toHaveLength(1);
      expect(result.autoRequests.searchQueries[0].query).toBe("gaming laptop reviews");
    });

    it("empty query", () => {
      const text = '<BDS:AUTO:SEARCH></BDS:AUTO:SEARCH>';
      const result = parseBdsMessage(text);

      expect(result.autoRequests.searchQueries).toHaveLength(0);
    });

    it("link text matches URL hostname", () => {
      const text = '<BDS:AUTO:SEARCH>[example.com](https://example.com/page)</BDS:AUTO:SEARCH>';
      const result = parseBdsMessage(text);

      expect(result.autoRequests.searchQueries).toHaveLength(1);
      expect(result.autoRequests.searchQueries[0].query).toBe("example.com");
    });

    it("www-prefixed domain auto-link", () => {
      const text = '<BDS:AUTO:SEARCH>site:[www.nasa.gov](http://www.nasa.gov) mars</BDS:AUTO:SEARCH>';
      const result = parseBdsMessage(text);

      expect(result.autoRequests.searchQueries).toHaveLength(1);
      expect(result.autoRequests.searchQueries[0].query).toBe("site:www.nasa.gov mars");
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
