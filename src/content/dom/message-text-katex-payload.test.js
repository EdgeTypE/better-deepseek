// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { extractMessageMarkdown } from "./message-text.js";

/**
 * A BDS tag attribute that merely contains two dollar characters is rendered
 * by the page as inline math, so the DOM path sees a KaTeX subtree instead of
 * the payload. The extractor used to return an empty string for a KaTeX
 * subtree with no LaTeX annotation, which deleted the payload from the
 * extracted text.
 */

function messageNode(build) {
    const node = document.createElement("div");
    const md = document.createElement("div");
    md.className = "ds-markdown";
    build(md);
    node.appendChild(md);
    return node;
}

function katexSubtree(tex) {
    const span = document.createElement("span");
    span.className = "katex";
    const math = document.createElement("math");
    const annotation = document.createElement("annotation");
    annotation.setAttribute("encoding", "application/x-tex");
    annotation.textContent = tex;
    math.appendChild(annotation);
    span.appendChild(math);
    return span;
}

describe("KaTeX extraction never deletes payload content", () => {
    it("recovers the tex source from the annotation", () => {
        const text = extractMessageMarkdown(
            messageNode((md) => {
                md.appendChild(document.createTextNode("X"));
                md.appendChild(katexSubtree("Y"));
                md.appendChild(document.createTextNode("Z"));
            }),
        );

        expect(text).toContain("Y");
        expect(text).toContain("X");
        expect(text).toContain("Z");
    });

    it("never collapses a bare KaTeX span to nothing", () => {
        const text = extractMessageMarkdown(
            messageNode(function (md) {
                const span = document.createElement("span");
                span.className = "katex";
                span.textContent = "survives";
                md.appendChild(span);
            }),
        );

        expect(text.trim()).not.toBe("");
        expect(text).toContain("survives");
    });
});