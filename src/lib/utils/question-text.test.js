// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { normalizeQuestionText, normalizeQuestions } from "./question-text.js";

/**
 * KaTeX's real output shape, taken from the payload in issue #209: MathML
 * tokens + LaTeX annotation, then a visual layer that repeats every glyph.
 */
const KATEX = [
  '<span class="katex">',
  '<span class="katex-mathml">',
  '<math xmlns="http://www.w3.org/1998/Math/MathML"><semantics><mrow>',
  "<mi>a</mi><mi>b</mi><mi>c</mi><mi>d</mi>",
  "</mrow><annotation encoding=\"application/x-tex\">abcd</annotation></semantics></math>",
  "</span>",
  '<span class="katex-html" aria-hidden="true"><span class="base">',
  '<span class="strut" style="height:0.6944em;"></span>',
  '<span class="mord mathnormal">a</span><span class="mord mathnormal">b</span>',
  '<span class="mord mathnormal">c</span><span class="mord mathnormal">d</span>',
  "</span></span>",
  "</span>",
].join("");

/** Same root, but the model dropped the TeX annotation. */
const KATEX_WITHOUT_ANNOTATION = [
  '<span class="katex"><span class="katex-mathml">',
  '<math><semantics><mrow><mi>x</mi><mo>+</mo><mn>1</mn></mrow></semantics></math>',
  '</span><span class="katex-html" aria-hidden="true"><span class="base">x+1</span></span></span>',
].join("");

describe("normalizeQuestionText", () => {
  it("reduces a KaTeX dump to the formula source", () => {
    const text = `A DFA has 3 states. It reads the 4-symbol string ${KATEX}. What follows?`;

    expect(normalizeQuestionText(text)).toBe(
      "A DFA has 3 states. It reads the 4-symbol string abcd. What follows?",
    );
  });

  it("does not print the formula twice", () => {
    const out = normalizeQuestionText(`String ${KATEX}`);

    expect(out).toBe("String abcd");
    expect(out.match(/abcd/g)).toHaveLength(1);
    expect(out).not.toContain("<");
  });

  it("falls back to the MathML tokens when there is no annotation", () => {
    expect(normalizeQuestionText(`Value ${KATEX_WITHOUT_ANNOTATION}`)).toBe("Value x+1");
  });

  it("keeps inline markup text and turns <br> into a newline", () => {
    expect(normalizeQuestionText("Pick <b>one</b>:<br>yes")).toBe("Pick one:\nyes");
  });

  it("decodes entities", () => {
    expect(normalizeQuestionText("<span>a &amp; b</span>")).toBe("a & b");
  });

  it("leaves plain prose untouched", () => {
    expect(normalizeQuestionText("What follows from x < 5?")).toBe("What follows from x < 5?");
    expect(normalizeQuestionText("a<b>c")).toBe("a<b>c");
  });

  it("keeps $…$ delimiters so prices survive", () => {
    expect(normalizeQuestionText("Cost is $5 and $10")).toBe("Cost is $5 and $10");
    expect(normalizeQuestionText("Solve $x^2 = 4$")).toBe("Solve $x^2 = 4$");
  });

  it("unwraps the unambiguous \\(…\\) and \\[…\\] delimiters", () => {
    expect(normalizeQuestionText("Solve \\(x^2 = 4\\)")).toBe("Solve x^2 = 4");
    expect(normalizeQuestionText("\\[a^2 + b^2\\]")).toBe("a^2 + b^2");
  });

  it("handles empty and non-string input", () => {
    expect(normalizeQuestionText("")).toBe("");
    expect(normalizeQuestionText(null)).toBe("");
    expect(normalizeQuestionText(undefined)).toBe("");
    expect(normalizeQuestionText(42)).toBe("42");
  });

  it("still strips markup when DOMParser is unavailable", () => {
    const original = globalThis.DOMParser;
    try {
      // @ts-expect-error — simulate a non-browser caller
      delete globalThis.DOMParser;
      expect(normalizeQuestionText(`String ${KATEX}. What?`)).toBe("String abcd. What?");
    } finally {
      globalThis.DOMParser = original;
    }
  });
});

describe("normalizeQuestions", () => {
  it("cleans question text and options but keeps the rest of the shape", () => {
    const out = normalizeQuestions([
      {
        id: "q1",
        question: `String ${KATEX}?`,
        type: "test",
        options: ["The string is accepted", `<span>4</span> symbols`],
        allowCustom: true,
      },
    ]);

    expect(out).toEqual([
      {
        id: "q1",
        question: "String abcd?",
        type: "test",
        options: ["The string is accepted", "4 symbols"],
        allowCustom: true,
      },
    ]);
  });

  it("drops entries that are not objects", () => {
    expect(normalizeQuestions([null, "nope", { question: "ok" }])).toEqual([{ question: "ok" }]);
  });

  it("returns an empty list for a failed parse", () => {
    expect(normalizeQuestions(null)).toEqual([]);
    expect(normalizeQuestions({ question: "x" })).toEqual([]);
  });
});
