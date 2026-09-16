// @vitest-environment jsdom

/**
 * Regression coverage for issues #169 and #170.
 *
 * Both reports share one root cause: when a message contains a BDS control tag,
 * `syncVisibilityState()` hides DeepSeek's native markdown and MessageOverlay
 * re-renders `parseBdsMessage(...).visibleText`. That text is reconstructed from
 * the live DOM, and the reconstruction used to walk straight into already
 * rendered rich output:
 *
 *  - KaTeX renders each formula three times (MathML token text + the LaTeX
 *    <annotation> + the .katex-html glyph spans), so `rg=(N−1)/2` came out as
 *    `rg=(N−1)/2 \tau_g = (N-1)/2 rg=(N−1)/2`.
 *  - Mermaid's viewer injects a <style> into its SVG, so the stylesheet was
 *    emitted as literal prose at the bottom of the message.
 *
 * Both artifacts only appeared when a control tag was present, because that is
 * what triggers the overlay re-render — which is why #169 blamed
 * `BDS:ask_question` and #170 blamed `BDS:VISUALIZER`.
 *
 * Note: DeepSeek's renderer escapes unknown tags, so BDS tags reach the content
 * script as literal text (`&lt;BDS:ask_question&gt;`), not as elements.
 */

import { describe, expect, it } from "vitest";
import { extractMessageRawText } from "../../src/content/dom/message-text.js";
import { parseBdsMessage } from "../../src/content/parser/index.js";

/** KaTeX's real output shape. */
const INLINE_KATEX = `<span class="katex"><span class="katex-mathml"><math xmlns="http://www.w3.org/1998/Math/MathML"><semantics><mrow><msup><mi>a</mi><mn>2</mn></msup><mo>+</mo><msup><mi>b</mi><mn>2</mn></msup><mo>=</mo><msup><mi>c</mi><mn>2</mn></msup></mrow><annotation encoding="application/x-tex">a^2 + b^2 = c^2</annotation></semantics></math></span><span class="katex-html" aria-hidden="true"><span class="base"><span class="mord"><span class="mord mathnormal">a</span><span class="msupsub"><span class="mord mtight">2</span></span></span><span class="mbin">+</span><span class="mord"><span class="mord mathnormal">b</span><span class="msupsub"><span class="mord mtight">2</span></span></span><span class="mrel">=</span><span class="mord"><span class="mord mathnormal">c</span><span class="msupsub"><span class="mord mtight">2</span></span></span></span></span></span>`;

const MERMAID_VIEWER = `<div class="mermaid" data-processed="true"><svg id="mermaid-svg-27" width="100%" xmlns="http://www.w3.org/2000/svg"><style>#mermaid-svg-27{font-family:"trebuchet ms",verdana,arial,sans-serif;font-size:16px;fill:#ccc;}@keyframes edge-animation-frame{from{stroke-dashoffset:0;}}</style><g class="node"><rect/><text>X</text></g></svg></div>`;

const MERMAID_CSS_MARKERS = ["trebuchet", "edge-animation-frame", "stroke-dashoffset", "font-family"];

const ASK_QUESTION = `&lt;BDS:ask_question&gt;[]&lt;/BDS:ask_question&gt;`;
const VISUALIZER = `&lt;BDS:VISUALIZER&gt;&lt;div&gt;sim&lt;/div&gt;&lt;/BDS:VISUALIZER&gt;`;

/**
 * Text a reader can actually see. A stylesheet may legitimately travel with the
 * SVG it belongs to; what must never happen is the CSS showing up as prose.
 */
function visibleTextOf(html) {
  const doc = new DOMParser().parseFromString(
    `<body>${html}</body>`,
    "text/html",
  );
  doc.querySelectorAll("style, script").forEach((el) => el.remove());
  return doc.body.textContent || "";
}

function messageNode(innerHtml) {
  const node = document.createElement("div");
  node.innerHTML = `<div class="ds-markdown">${innerHtml}</div>`;
  return node;
}

/** Reproduce the production pipeline: DOM -> overlay text -> parser. */
function runPipeline(innerHtml) {
  const node = messageNode(innerHtml);
  const raw = extractMessageRawText(node, { preserveRichHtml: true });
  return { raw, parsed: parseBdsMessage(raw, true) };
}

describe("rich render fidelity in the message overlay (#169, #170)", () => {
  describe("LaTeX", () => {
    it("shows an inline formula once, not once per rendering pass", () => {
      const { parsed } = runPipeline(
        `<p>Output ${INLINE_KATEX} once.</p>${ASK_QUESTION}`,
      );

      expect(parsed.visibleText).not.toContain("a2+b2=c2");
      expect(parsed.visibleText.match(/a\^2 \+ b\^2 = c\^2/g)).toHaveLength(1);
    });

    it("hands the overlay live KaTeX markup so the formula renders as math", () => {
      const { parsed } = runPipeline(
        `<p>Output ${INLINE_KATEX} once.</p>${ASK_QUESTION}`,
      );

      expect(parsed.visibleText.match(/class="katex"/g)).toHaveLength(1);
      expect(parsed.visibleText).toContain("annotation");
    });

    it("keeps the formula intact alongside a visualizer tag (#170 trigger)", () => {
      const { parsed } = runPipeline(
        `<p>Formula: ${INLINE_KATEX}</p>${VISUALIZER}`,
      );

      expect(parsed.visibleText).not.toContain("a2+b2=c2");
      expect(parsed.visibleText.match(/a\^2 \+ b\^2 = c\^2/g)).toHaveLength(1);
      expect(parsed.renderableBlocks.map((b) => b.name)).toContain("visualizer");
    });
  });

  describe("mermaid", () => {
    it("never renders the viewer stylesheet as message text", () => {
      const { parsed } = runPipeline(
        `<p>Diagram:</p>${MERMAID_VIEWER}${ASK_QUESTION}`,
      );

      const visible = visibleTextOf(parsed.visibleText);
      for (const marker of MERMAID_CSS_MARKERS) {
        expect(visible).not.toContain(marker);
      }
    });

    it("keeps the diagram and scopes its CSS inside the SVG", () => {
      const { parsed } = runPipeline(
        `<p>Diagram:</p>${MERMAID_VIEWER}${ASK_QUESTION}`,
      );

      expect(parsed.visibleText).toContain('id="mermaid-svg-27"');
      const svgStart = parsed.visibleText.indexOf("<svg");
      const svgEnd = parsed.visibleText.indexOf("</svg>");
      const cssAt = parsed.visibleText.indexOf("edge-animation-frame");
      expect(cssAt).toBeGreaterThan(svgStart);
      expect(cssAt).toBeLessThan(svgEnd);
    });
  });

  describe("control tags still work", () => {
    it("still parses ask_question so the widget is mounted", () => {
      const { parsed } = runPipeline(
        `<p>Output ${INLINE_KATEX} once.</p>${MERMAID_VIEWER}${ASK_QUESTION}`,
      );

      expect(parsed.renderableBlocks.map((b) => b.name)).toContain("ask_question");
      expect(parsed.containsControlTags).toBe(true);
    });

    it("leaves plain messages untouched", () => {
      const { parsed } = runPipeline(`<p>Just text, no tools.</p>`);

      expect(parsed.visibleText).toBe("Just text, no tools.");
      expect(parsed.containsControlTags).toBe(false);
    });
  });

  describe("plain-text consumers stay markup-free", () => {
    it("returns markdown without rich markup for exports and bookmarks", () => {
      const node = messageNode(
        `<p>Output ${INLINE_KATEX} once.</p>${MERMAID_VIEWER}`,
      );
      const plain = extractMessageRawText(node);

      expect(plain).not.toContain("<span");
      expect(plain).not.toContain("<svg");
      expect(plain).toContain("$a^2 + b^2 = c^2$");
      for (const marker of MERMAID_CSS_MARKERS) {
        expect(plain).not.toContain(marker);
      }
    });
  });
});
