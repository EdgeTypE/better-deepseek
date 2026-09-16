// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import {
  extractMessageMarkdown,
  extractMessageRawText,
  extractMessageTexts,
} from "./message-text.js";

/** KaTeX's real output shape: MathML tokens + LaTeX annotation + visual glyphs. */
const INLINE_KATEX = `<span class="katex"><span class="katex-mathml"><math xmlns="http://www.w3.org/1998/Math/MathML"><semantics><mrow><msup><mi>a</mi><mn>2</mn></msup><mo>+</mo><msup><mi>b</mi><mn>2</mn></msup><mo>=</mo><msup><mi>c</mi><mn>2</mn></msup></mrow><annotation encoding="application/x-tex">a^2 + b^2 = c^2</annotation></semantics></math></span><span class="katex-html" aria-hidden="true"><span class="base"><span class="mord"><span class="mord mathnormal">a</span><span class="msupsub"><span class="mord mtight">2</span></span></span><span class="mbin">+</span><span class="mord"><span class="mord mathnormal">b</span><span class="msupsub"><span class="mord mtight">2</span></span></span><span class="mrel">=</span><span class="mord"><span class="mord mathnormal">c</span><span class="msupsub"><span class="mord mtight">2</span></span></span></span></span></span>`;

const DISPLAY_KATEX = `<span class="katex-display"><span class="katex"><span class="katex-mathml"><math><semantics><mrow><mi>x</mi></mrow><annotation encoding="application/x-tex">x = \\frac{1}{2}</annotation></semantics></math></span><span class="katex-html" aria-hidden="true"><span class="base">x</span></span></span></span>`;

const MERMAID_SVG = `<div class="mermaid" data-processed="true"><svg id="mermaid-svg-27" width="100%" xmlns="http://www.w3.org/2000/svg"><style>#mermaid-svg-27{font-family:"trebuchet ms",verdana,arial,sans-serif;font-size:16px;fill:#ccc;}@keyframes edge-animation-frame{from{stroke-dashoffset:0;}}</style><g class="node"><rect/><text>X</text></g></svg></div>`;

const MERMAID_CSS_MARKERS = ["trebuchet", "edge-animation-frame", "stroke-dashoffset"];

/** Text that a reader can actually see — excludes <style>/<script> payloads. */
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

describe("message-text - rich renderer fidelity (issues #169 / #170)", () => {
  describe("KaTeX", () => {
    it("emits an inline formula exactly once instead of concatenating its three renderings", () => {
      const md = extractMessageMarkdown(
        messageNode(`<p>Output ${INLINE_KATEX} once.</p>`),
      );

      expect(md).toBe("Output $a^2 + b^2 = c^2$ once.");
      expect(md).not.toContain("a2+b2=c2");
    });

    it("emits a display formula as a $$ block", () => {
      const md = extractMessageMarkdown(messageNode(DISPLAY_KATEX));

      expect(md).toBe("$$x = \\frac{1}{2}$$");
    });

    it("preserves the rendered KaTeX markup when preserveRichHtml is set", () => {
      const md = extractMessageMarkdown(
        messageNode(`<p>Output ${INLINE_KATEX} once.</p>`),
        { preserveRichHtml: true },
      );

      expect(md).toContain('class="katex"');
      expect(md).toContain("annotation");
      expect(md.startsWith("Output <span")).toBe(true);
      // Exactly one KaTeX root, not one per rendering pass.
      expect(md.match(/class="katex"/g)).toHaveLength(1);
    });

    it("keeps text-based candidates free of duplicated formula glyphs", () => {
      const raw = extractMessageRawText(
        messageNode(`<p>Output ${INLINE_KATEX} once.</p>`),
      );

      expect(raw).not.toContain("a2+b2=c2");
      expect((raw.match(/a\^2 \+ b\^2 = c\^2/g) || [])).toHaveLength(1);
    });
  });

  describe("mermaid", () => {
    it("never surfaces the viewer stylesheet as visible text", () => {
      const md = extractMessageMarkdown(
        messageNode(`<p>Diagram:</p>${MERMAID_SVG}`),
      );

      for (const marker of MERMAID_CSS_MARKERS) {
        expect(md).not.toContain(marker);
      }
    });

    it("keeps the rendered diagram (and its scoped CSS) when preserveRichHtml is set", () => {
      const md = extractMessageMarkdown(
        messageNode(`<p>Diagram:</p>${MERMAID_SVG}`),
        { preserveRichHtml: true },
      );

      expect(md).toContain("<svg");
      expect(md).toContain('id="mermaid-svg-27"');

      // The stylesheet must stay inside the SVG, where it is applied rather
      // than displayed. Nothing may leak into the visible text.
      const visible = visibleTextOf(md);
      for (const marker of MERMAID_CSS_MARKERS) {
        expect(visible).not.toContain(marker);
      }
    });

    it("drops the rendered diagram from plain markdown without leaking CSS", () => {
      const md = extractMessageMarkdown(
        messageNode(`<p>Diagram:</p>${MERMAID_SVG}`),
      );

      expect(md).not.toContain("<svg");
      expect(md).not.toContain("mermaid-svg-27{");
    });

    it("also drops a bare mermaid SVG that has no .mermaid wrapper", () => {
      const bare = `<svg id="mermaid-svg-42" xmlns="http://www.w3.org/2000/svg"><style>#mermaid-svg-42{fill:#ccc;}</style><text>X</text></svg>`;

      const plain = extractMessageMarkdown(messageNode(`<p>D:</p>${bare}`));
      expect(plain).not.toContain("fill:#ccc");
      expect(plain).not.toContain("X");

      const raw = extractMessageRawText(messageNode(`<p>D:</p>${bare}`));
      expect(raw).not.toContain("fill:#ccc");
    });
  });

  describe("interaction with code block handling", () => {
    it("still converts a plain code block into a fence", () => {
      const md = extractMessageMarkdown(
        messageNode(
          `<div class="md-code-block"><div class="md-code-block-banner">Copy</div><pre><code class="language-js">const a = 1;</code></pre></div>`,
        ),
      );

      expect(md).toBe("```js\nconst a = 1;\n```");
    });

    it("keeps a rendered diagram inside .md-code-block instead of fencing its source", () => {
      const md = extractMessageMarkdown(
        messageNode(
          `<div class="md-code-block"><div class="md-code-block-banner">Mermaid</div>${MERMAID_SVG}<pre><code class="language-mermaid">graph LR\n  X --&gt; Y</code></pre></div>`,
        ),
        { preserveRichHtml: true },
      );

      expect(md).toContain("<svg");
      expect(md).not.toContain("graph LR");
      expect(visibleTextOf(md)).not.toContain("trebuchet");
    });

    it("falls back to the mermaid source for plain markdown exports", () => {
      const md = extractMessageMarkdown(
        messageNode(
          `<div class="md-code-block">${MERMAID_SVG}<pre><code class="language-mermaid">graph LR\n  X --&gt; Y</code></pre></div>`,
        ),
      );

      // Exactly one fence: the rich element must not also emit the source that
      // the sibling <pre> already emits.
      expect(md.match(/```mermaid/g)).toHaveLength(1);
      expect(md).toContain("graph LR");
      expect(md).not.toContain("trebuchet");
    });

    it("keeps a diagram-only message from collapsing to empty content", () => {
      const md = extractMessageMarkdown(
        messageNode(`<div class="md-code-block">${MERMAID_SVG}</div>`),
      );

      expect(md.trim()).not.toBe("");
      expect(md).toContain("mermaid");
      expect(md).not.toContain("trebuchet");
    });
  });

  describe("recursion cap", () => {
    it("does not leak a stylesheet nested deeper than the depth cap", () => {
      let deep = "";
      for (let i = 0; i < 230; i++) deep += "<div>";
      const md = extractMessageMarkdown(
        messageNode(`${deep}${MERMAID_SVG}`),
      );

      expect(md).not.toContain("fill:#ccc");
      expect(md).not.toContain("trebuchet");
    });
  });

  describe("plain vs rich extraction", () => {
    const node = () =>
      messageNode(
        `<p>Output ${INLINE_KATEX} once.</p><p>D:</p>${MERMAID_SVG}`,
      );

    it("keeps measuring/speaking consumers free of markup", () => {
      const { plain } = extractMessageTexts(node());

      // Change hashing, RTL detection, token accounting and read-aloud all use
      // this string, so it must contain no markup and no duplicated formula.
      expect(plain).not.toContain("<span");
      expect(plain).not.toContain("<svg");
      expect(plain).not.toContain("<style");
      expect(plain).not.toContain("a2+b2=c2");
      expect(plain).toContain("$a^2 + b^2 = c^2$");
    });

    it("gives the overlay live markup to re-render", () => {
      const { rich } = extractMessageTexts(node());

      expect(rich).toContain('class="katex"');
      expect(rich).toContain('id="mermaid-svg-27"');
      expect(rich).not.toContain("a2+b2=c2");
    });

    it("returns the same text in both flavours when nothing is rich", () => {
      const { plain, rich } = extractMessageTexts(
        messageNode("<p>Just text.</p>"),
      );

      expect(plain).toBe("Just text.");
      expect(rich).toBe("Just text.");
    });
  });

  describe("non-content elements", () => {
    it("never serializes stray <style> or <script> payloads", () => {
      const md = extractMessageMarkdown(
        messageNode(
          `<style>.leak{color:red}</style><p>Hello</p><script>var leak = 1;</script>`,
        ),
      );

      expect(md).toBe("Hello");
    });
  });
});

describe("extractMessageMarkdown - autolink artifacts", () => {
  it("collapses sentinel autolinks (https_...) to plain text", () => {
    const node = document.createElement("div");
    // Simulate DeepSeek's escaped-tag render: the BDS tag is literal text and
    // the renderer wraps the bare "main.rs" token in an <a href="https_...">.
    node.appendChild(document.createTextNode('<BDS:create_file fileName="src/'));
    const a = document.createElement("a");
    a.href = "https_main.rs";
    a.textContent = "main.rs";
    node.appendChild(a);
    node.appendChild(document.createTextNode('">'));
    expect(extractMessageMarkdown(node)).toBe(
      '<BDS:create_file fileName="src/main.rs">',
    );
  });

  it("collapses bare-domain autolinks (host === text) to plain text", () => {
    const node = document.createElement("div");
    node.innerHTML = "├── <a href=\"https://evaluator.rs/\">evaluator.rs</a>";
    expect(extractMessageMarkdown(node)).toBe("├── evaluator.rs");
  });

  it("preserves real markdown links with distinct text", () => {
    const node = document.createElement("div");
    node.innerHTML =
      'Read <a href="https://chat.deepseek.com">DeepSeek docs</a> now';
    expect(extractMessageMarkdown(node)).toBe(
      "Read [DeepSeek docs](https://chat.deepseek.com) now",
    );
  });

  it("preserves links whose text is not a bare domain host", () => {
    const node = document.createElement("div");
    node.innerHTML =
      '<a href="https://github.com/acme/repo/blob/src/main.rs">main.rs</a>';
    expect(extractMessageMarkdown(node)).toBe(
      "[main.rs](https://github.com/acme/repo/blob/src/main.rs)",
    );
  });

  it("preserves links pointing at a path on a matching host", () => {
    const node = document.createElement("div");
    node.innerHTML =
      '<a href="https://github.com/acme/repo/blob/main.rs">github.com</a>';
    expect(extractMessageMarkdown(node)).toBe(
      "[github.com](https://github.com/acme/repo/blob/main.rs)",
    );
  });

  it("collapses links pointing at a www-prefixed matching host", () => {
    const node = document.createElement("div");
    node.innerHTML = '<a href="https://www.main.rs">main.rs</a>';
    expect(extractMessageMarkdown(node)).toBe("main.rs");
  });
});