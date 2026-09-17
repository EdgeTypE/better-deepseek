// @vitest-environment jsdom

/**
 * Regression coverage for issue #120.
 *
 * A LONG_WORK file body may itself contain fenced blocks — a README with shell
 * examples is the common case. The model wraps such a body in its own fence
 * (` ```markdown `), which markdown cannot express: there are no nested fences.
 * The page renderer re-pairs them, the outermost fence is left open, and
 * everything after it — `</BDS:create_file>`, `</BDS:LONG_WORK>` and the closing
 * prose — ends up inside the last code block.
 *
 * `replaceCodeBlocksWithFences` used to wrap every code block unconditionally, so
 * one fence of that block sat *inside* the `create_file` pair and the other
 * *outside* it. Removing the pair then ate the opening fence and orphaned the
 * closing one, which reached `visibleText` as a stray ``` and was rendered by
 * MessageOverlay as an empty code block at the end of the message. The Markdown
 * export carried the same imbalance, which is how the issue was reported
 * (half a file loses its highlighting in an editor).
 *
 * The DOM below mirrors what the page actually yields: BDS tags arrive as
 * literal text (DeepSeek escapes unknown tags), and the renderer's mis-paired
 * fences leave the closing tags inside the final block.
 */

import { describe, expect, it } from "vitest";
import { extractMessageTexts } from "../../src/content/dom/message-text.js";
import { parseBdsMessage } from "../../src/content/parser/index.js";

const lines = (...parts) => parts.join("\n");

const HELLO_PY = lines(
  '"""Hi."""',
  "",
  "def sayhi(ad: str) -> str:",
  '    """Hi."""',
  '    return f"Hi, {ad}!"'
);

const TRAILING_PROSE =
  "Iki dosyali minimal Python projesi hazir; ZIP'i indirip `python hello.py` ile calistirabilirsin.";

/** README chunk the renderer produced for the opening fence pair. */
const README_HEAD = lines(
  "# Hi Project",
  "",
  "`sayhi(ad)` hi hi hi hi function.",
  "",
  "## setup",
  "",
  "```bash",
  "git clone https://github.com/example/hi.git && cd hi"
);

/** README chunk that also swallowed the closing control tags and the prose. */
const SWALLOWED_TAIL = lines(
  "## License",
  "",
  "This project is licensed under the MIT License.",
  "",
  "&lt;/BDS:create_file&gt;",
  "&lt;/BDS:LONG_WORK&gt;",
  "",
  TRAILING_PROSE
);

function renderedMessageDom() {
  const host = document.createElement("div");
  host.innerHTML = lines(
    '<div class="ds-markdown">',
    "<p>&lt;BDS:LONG_WORK&gt;</p>",
    '<p>&lt;BDS:create_file fileName="hello.py"&gt;</p>',
    `<pre><code class="language-python">${HELLO_PY}</code></pre>`,
    "<p>&lt;/BDS:create_file&gt;</p>",
    '<p>&lt;BDS:create_file fileName="README.md"&gt;</p>',
    `<pre><code class="language-markdown">${README_HEAD}</code></pre>`,
    "<pre><code>python hello.py</code></pre>",
    `<pre><code>${SWALLOWED_TAIL}</code></pre>`,
    "</div>"
  );
  document.body.appendChild(host);
  return host;
}

function extractFrom(node) {
  const { plain, rich } = extractMessageTexts(node);
  return { plain, rich, parsed: parseBdsMessage(rich, true) };
}

function codeBlockDom(codeText) {
  const host = document.createElement("div");
  host.innerHTML = `<div class="ds-markdown"><p>before</p><pre><code>${codeText}</code></pre><p>after</p></div>`;
  document.body.appendChild(host);
  return host;
}

/**
 * A documentation example whose tag pair straddles the fence boundary: the
 * opening sits inside the block, the closing outside it. That is the opposite
 * of the renderer's signature, so the block must stay fenced and the example
 * must never execute.
 */
function straddlingExampleDom() {
  const host = document.createElement("div");
  host.innerHTML = lines(
    '<div class="ds-markdown">',
    "<p>Etiket soyle acilir:</p>",
    '<pre><code>&lt;BDS:create_file fileName="ornek.txt"&gt;</code></pre>',
    "<p>Soyle de kapatilir:</p>",
    "<p>&lt;/BDS:create_file&gt;</p>",
    "</div>"
  );
  document.body.appendChild(host);
  return host;
}

describe("issue #120 — a code block holding half a BDS tag pair", () => {
  it("does not orphan a fence into the visible text", () => {
    const { parsed } = extractFrom(renderedMessageDom());

    expect(parsed.visibleText).not.toContain("```");
    expect(parsed.visibleText).toContain("calistirabilirsin");
  });

  it("keeps both files through the DOM path", () => {
    const { parsed } = extractFrom(renderedMessageDom());

    expect(parsed.createFiles.map((file) => file.fileName)).toEqual([
      "hello.py",
      "README.md",
    ]);
  });

  it("emits the straddling block as plain text, not as a fence", () => {
    const { rich } = extractFrom(renderedMessageDom());
    const tailHeading = SWALLOWED_TAIL.split("\n")[0];

    // The swallowed tail is present, but no fence opens in front of it.
    expect(rich).toContain(tailHeading);
    expect(rich).not.toContain(`\`\`\`\n${tailHeading}`);
  });

  it("keeps the export's plain-text input free of the orphan fence", () => {
    const { plain } = extractFrom(renderedMessageDom());
    const tailHeading = SWALLOWED_TAIL.split("\n")[0];

    // tools/exporter.js reads the `plain` flavour via extractMessageRawText, so
    // the same reconstruction feeds the Markdown export. An unpaired fence here
    // is what left half the exported file inside a code block.
    expect(plain).toContain(tailHeading);
    expect(plain).not.toContain(`\`\`\`\n${tailHeading}`);
  });

  it("still fences a plain code block", () => {
    const { rich } = extractFrom(codeBlockDom("print(1)"));

    expect(rich).toContain("```\nprint(1)\n```");
  });

  it("still fences a balanced documentation example", () => {
    const { rich, parsed } = extractFrom(
      codeBlockDom("&lt;BDS:memory_write&gt;key: value&lt;/BDS:memory_write&gt;")
    );

    // Balanced tags are a genuine example: fenced, and so never executed.
    expect(rich).toContain("```\n<BDS:memory_write>key: value</BDS:memory_write>\n```");
    expect(parsed.memoryWrites).toHaveLength(0);
  });

  it("still fences an example whose closing sits outside the block", () => {
    const { rich } = extractFrom(straddlingExampleDom());

    expect(rich).toContain("```\n<BDS:create_file");
  });

  it("never turns a documentation example into a real file", () => {
    const { parsed } = extractFrom(straddlingExampleDom());

    // Unfencing this block made the example live: `ornek.txt` was created with
    // the surrounding prose as its content, and that prose vanished from the
    // message. Only a dangling *close* may unfence a block.
    expect(parsed.createFiles).toHaveLength(0);
    expect(parsed.visibleText).toContain("Soyle de kapatilir:");
    expect(parsed.visibleText).toContain("Etiket soyle acilir:");
  });
});
