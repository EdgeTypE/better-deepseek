// @vitest-environment jsdom

/**
 * Regression coverage for issue #188.
 *
 * `computeCodeBlockRanges()` collected fenced blocks first and inline spans
 * second, so its output was not in document order. The caller that protects BDS
 * tags inside code blocks then spliced the text with
 * `substring(lastPos, start)` — and `substring` swaps its arguments when
 * `start` < `lastPos`, re-emitting everything between the two positions.
 *
 * Any message that put inline code (`` `PRAGMA` ``) before a fenced block was
 * therefore rendered with its body duplicated — up to three times, with the
 * fences unbalanced, so prose spilled out of the code blocks. It only showed up
 * on messages carrying a control tag, because that is what enables the overlay
 * re-render that runs the pass at all (the reporter saw it with
 * `BDS:VISUALIZER`).
 *
 * The pipeline below is the production one: DOM → `extractMessageTexts` →
 * `parseBdsMessage`. DeepSeek escapes unknown tags, so BDS tags arrive as
 * literal `&lt;BDS:…&gt;` in the DOM.
 */

import { describe, expect, it } from "vitest";
import { extractMessageTexts } from "../../src/content/dom/message-text.js";
import { parseBdsMessage } from "../../src/content/parser/index.js";

const VISUALIZER = `&lt;BDS:VISUALIZER&gt;&lt;div&gt;sim&lt;/div&gt;&lt;/BDS:VISUALIZER&gt;`;

const countOf = (haystack, needle) => haystack.split(needle).length - 1;
const fenceLines = (text) => (text.match(/^ {0,3}```/gm) || []).length;

/** Reproduce the production pipeline: DOM -> overlay text -> parser. */
function runPipeline(innerHtml) {
  const host = document.createElement("div");
  host.innerHTML = `<div class="ds-markdown">${innerHtml}</div>`;
  document.body.appendChild(host);

  const { rich } = extractMessageTexts(host);
  return { rich, parsed: parseBdsMessage(rich, true) };
}

describe("issue #188 — inline code before a fenced block", () => {
  it("keeps a single copy of the body", () => {
    const { parsed } = runPipeline(
      "<p>Run <code>PRAGMA</code> first.</p>" +
        "<p>Then the query:</p>" +
        "<pre><code>SELECT 1;</code></pre>" +
        VISUALIZER
    );

    expect(countOf(parsed.visibleText, "Run `PRAGMA` first.")).toBe(1);
    expect(countOf(parsed.visibleText, "Then the query:")).toBe(1);
    expect(countOf(parsed.visibleText, "SELECT 1;")).toBe(1);
    expect(fenceLines(parsed.visibleText)).toBe(2);
    expect(parsed.renderableBlocks.map((b) => b.name)).toContain("visualizer");
  });

  it("keeps a single copy with several inline spans and several fences (#188 shape)", () => {
    const { parsed } = runPipeline(
      "<p>Think of <code>CREATE TABLE</code> as metadata.</p>" +
        "<p>A reference is a <code>binary(16)</code> GUID.</p>" +
        "<p>Modes:</p><ul><li><code>dev</code></li><li><code>prod</code></li></ul>" +
        "<pre><code>CREATE TABLE _Reference1 (\n    _IDRRef binary(16)\n);</code></pre>" +
        "<p>And the query language:</p>" +
        "<pre><code>SELECT * FROM Catalog_Products</code></pre>" +
        VISUALIZER
    );

    expect(countOf(parsed.visibleText, "as metadata.")).toBe(1);
    expect(countOf(parsed.visibleText, "GUID.")).toBe(1);
    expect(countOf(parsed.visibleText, "And the query language:")).toBe(1);
    expect(countOf(parsed.visibleText, "_Reference1")).toBe(1);
    expect(fenceLines(parsed.visibleText)).toBe(4);
  });

  it("leaves a message whose fence comes first untouched", () => {
    const { parsed } = runPipeline(
      "<pre><code>SELECT 1;</code></pre>" +
        "<p>Run <code>PRAGMA</code> first.</p>" +
        VISUALIZER
    );

    expect(countOf(parsed.visibleText, "Run `PRAGMA` first.")).toBe(1);
    expect(countOf(parsed.visibleText, "SELECT 1;")).toBe(1);
    expect(fenceLines(parsed.visibleText)).toBe(2);
  });

  it("still escapes BDS tags inside a code block", () => {
    const { parsed } = runPipeline(
      "<p>Use <code>fileName</code> like this:</p>" +
        '<pre><code>&lt;BDS:create_file fileName="a.txt"&gt;</code></pre>' +
        VISUALIZER
    );

    expect(parsed.visibleText).toContain("&lt;BDS:create_file");
    expect(countOf(parsed.visibleText, "Use `fileName` like this:")).toBe(1);
    expect(fenceLines(parsed.visibleText)).toBe(2);
  });
});
