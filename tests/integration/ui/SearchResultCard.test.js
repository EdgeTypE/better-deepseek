// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import SearchResultCard from "../../../src/content/ui/SearchResultCard.svelte";
import { renderSvelte, flushUi } from "../../helpers/svelte.js";

describe("SearchResultCard", () => {
  it("constrains narrow viewport layout and truncates long entries", async () => {
    const longText = "Philippines Popular Dog Breed ".repeat(12);
    const longUrl = "https://example.com/" + "very-long-path-segment/".repeat(16);
    const { target, cleanup } = renderSvelte(SearchResultCard, {
      query: longText,
      count: "1",
      results: JSON.stringify([
        {
          title: longText,
          snippet: "A long snippet ".repeat(40),
          url: longUrl,
        },
      ]),
    });
    await flushUi();

    const card = target.querySelector(".bds-search-card");
    const header = target.querySelector(".bds-search-entry-header");
    const title = target.querySelector(".bds-search-title");

    expect(getComputedStyle(card).width).toBe("100%");
    expect(getComputedStyle(card).maxWidth).toBe("100%");
    expect(getComputedStyle(card).minWidth).toBe("0");
    expect(getComputedStyle(header).minWidth).toBe("0");
    expect(getComputedStyle(title).overflow).toBe("hidden");
    expect(getComputedStyle(title).textOverflow).toBe("ellipsis");
    expect(getComputedStyle(title).whiteSpace).toBe("nowrap");

    header.click();
    await flushUi();

    const url = target.querySelector(".bds-search-url");
    const snippet = target.querySelector(".bds-search-snippet");

    expect(getComputedStyle(url).maxWidth).toBe("100%");
    expect(getComputedStyle(url).overflow).toBe("hidden");
    expect(getComputedStyle(url).textOverflow).toBe("ellipsis");
    expect(getComputedStyle(url).whiteSpace).toBe("nowrap");
    expect(getComputedStyle(snippet).overflow).toBe("hidden");

    cleanup();
  });
});
