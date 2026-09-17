// @vitest-environment jsdom

/**
 * Regression coverage for the export half of issue #120.
 *
 * `formatMarkdown` runs `formatAssistantContent` over each assistant message as
 * a safety net, because `extractMessageRawText` should already have stripped the
 * BDS tags. That net used
 * `/<(BDS|BetterDeepSeek):[\s\S]*?<\/(BDS|BetterDeepSeek):[\s\S]*?>/gi`, which
 * has two faults:
 *
 *  - it requires an *opening* tag, so a close whose opening was already consumed
 *    survived into the export — a LONG_WORK block exported a stray
 *    `</BDS:LONG_WORK>` between the `### Assistant` heading and the prose;
 *  - its second group is not a backreference, so the opening and closing names
 *    need not match and the lazy body runs to the first close it can find, which
 *    may belong to a different tag entirely.
 *
 * It now delegates to `sanitizeVisibleText`, the same pair-then-stray pass the
 * overlay uses.
 */

import { describe, expect, it } from "vitest";
import { formatMarkdown } from "../../src/content/tools/exporter.js";

const lines = (...parts) => parts.join("\n");

const TRAILING_PROSE =
  "Moduler yapida bir Tkinter hesap makinesi hazirladim; ZIP'i indirip `python main.py` ile calistirabilirsin.";

/** What the export sees for a plain, well-formed LONG_WORK reply. */
const WELL_FORMED = lines(
  "<BDS:LONG_WORK>",
  '<BDS:create_file fileName="main.py">',
  "",
  "```python",
  'print("hi")',
  "```",
  "",
  "</BDS:create_file>",
  '<BDS:create_file fileName="README.md">',
  "",
  "```markdown",
  "# Proje",
  "",
  "```bash",
  "python main.py",
  "```",
  "",
  "</BDS:create_file>",
  "</BDS:LONG_WORK>",
  "",
  TRAILING_PROSE
);

/**
 * The shape the renderer leaves behind: the outermost fence is left open, so the
 * closing tags and the prose end up inside the last code block and the
 * reconstruction wraps them.
 */
const SWALLOWED_TAIL = lines(
  "<BDS:LONG_WORK>",
  '<BDS:create_file fileName="main.py">',
  "",
  "```python",
  'print("hi")',
  "```",
  "",
  "```",
  "</BDS:create_file>",
  "</BDS:LONG_WORK>",
  "",
  TRAILING_PROSE,
  "```"
);

const markdownFor = (content) =>
  formatMarkdown([{ role: "assistant", content }]);

const bdsTags = (value) => value.match(/<\/?BDS:[A-Za-z0-9_:]+>/g) || [];

describe("issue #120 — export tag stripping", () => {
  it("leaves no BDS tag behind for a well-formed reply", () => {
    const md = markdownFor(WELL_FORMED);

    expect(bdsTags(md)).toEqual([]);
    expect(md).toContain("calistirabilirsin");
  });

  it("leaves no orphaned close when the renderer swallowed the tail", () => {
    const md = markdownFor(SWALLOWED_TAIL);

    expect(bdsTags(md)).toEqual([]);
    expect(md).not.toContain("create_file");
    expect(md).toContain("calistirabilirsin");
  });

  it("leaves no dangling fence when the tag removal cut one in half", () => {
    const md = markdownFor(SWALLOWED_TAIL);

    // Removing the tag span takes the opening fence with it and leaves the
    // closing one behind. That stray ``` is what broke the export.
    expect(md).not.toContain("```");
  });

  it("keeps the prose that follows the tags", () => {
    const md = markdownFor(WELL_FORMED);

    expect(md).toContain(TRAILING_PROSE);
    expect(md).toContain("### Assistant");
  });

  it("does not swallow text that sits outside the tags", () => {
    const md = markdownFor(lines("Before.", "", WELL_FORMED));

    expect(md).toContain("Before.");
  });
});
