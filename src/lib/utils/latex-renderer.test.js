import { describe, expect, it } from "vitest";
import { preprocessLatex } from "./latex-renderer.js";

describe("preprocessLatex", () => {
  it("wraps snippets in a complete document", () => {
    const result = preprocessLatex("\\section*{Hi}");
    expect(result).toContain("\\documentclass[11pt]{article}");
    expect(result).toContain("\\begin{document}");
    expect(result).toContain("\\section*{Hi}");
    expect(result).toContain("\\end{document}");
  });

  it("preserves existing full documents", () => {
    const source = "\\documentclass{article}\n\\begin{document}x\\end{document}";
    expect(preprocessLatex(source)).toBe(source);
  });
});
