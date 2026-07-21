// @vitest-environment jsdom

import { describe, expect, it, beforeEach } from "vitest";
import { cleanBdsString, hideBdsTagsInPopovers } from "./tag-hider.js";

describe("tag-hider cleanBdsString", () => {
  it("strips closed BetterDeepSeek tags (raw & encoded)", () => {
    expect(cleanBdsString("<BetterDeepSeek>system prompt</BetterDeepSeek>User question")).toBe("User question");
    expect(cleanBdsString("&lt;BetterDeepSeek&gt;system prompt&lt;/BetterDeepSeek&gt;User question")).toBe("User question");
  });

  it("strips unclosed BetterDeepSeek tags from truncated preview strings", () => {
    expect(cleanBdsString("<BetterDeepSeek> You are Better DeepSeek. You have access to specialized tools.")).toBe("");
    expect(cleanBdsString("&lt;BetterDeepSeek&gt; You are Better DeepSeek. You have access...")).toBe("");
    expect(cleanBdsString("3/3 <BetterDeepSeek> You are Better DeepSeek. You...")).toBe("3/3");
    expect(cleanBdsString("3/3 &lt;BetterDeepSeek&gt; You are Better DeepSeek. You...")).toBe("3/3");
  });

  it("strips closed & unclosed BDS: control tags", () => {
    expect(cleanBdsString("<BDS:VISUALIZER>data</BDS:VISUALIZER>Hello")).toBe("Hello");
    expect(cleanBdsString("&lt;BDS:VISUALIZER&gt;data&lt;/BDS:VISUALIZER&gt;Hello")).toBe("Hello");
    expect(cleanBdsString("<BDS:AUTO:REQUEST_WEB_FETCH>https://example.com")).toBe("");
  });
});

describe("tag-hider hideBdsTagsInPopovers", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("cleans BetterDeepSeek tags from popover preview items (issue #93)", () => {
    document.body.innerHTML = `
      <div class="ds-virtual-list-visible-items">
        <div class="_81e7b5e">
          <div class="_72b6158">&lt;BetterDeepSeek&gt; mesajıdsadasda placeholder</div>
        </div>
        <div class="_81e7b5e">
          <div class="_72b6158">3/3 &lt;BetterDeepSeek&gt; You are Better DeepSeek.</div>
        </div>
        <div class="_81e7b5e">
          <div class="_72b6158">&lt;BetterDeepSeek&gt;sys&lt;/BetterDeepSeek&gt;Actual question</div>
        </div>
      </div>
    `;

    hideBdsTagsInPopovers();

    const items = document.querySelectorAll("._72b6158");
    expect(items[0].textContent).toBe("");
    expect(items[1].textContent).toBe("3/3");
    expect(items[2].textContent).toBe("Actual question");
  });

  it("does not touch main message markdown bubbles or extension UI", () => {
    document.body.innerHTML = `
      <div id="bds-root">
        <div class="_72b6158">&lt;BetterDeepSeek&gt; internal</div>
      </div>
      <div class="ds-message">
        <div class="ds-markdown">&lt;BetterDeepSeek&gt; main message</div>
      </div>
    `;

    hideBdsTagsInPopovers();

    expect(document.querySelector("#bds-root ._72b6158").textContent).toBe("<BetterDeepSeek> internal");
    expect(document.querySelector(".ds-markdown").textContent).toBe("<BetterDeepSeek> main message");
  });
});
