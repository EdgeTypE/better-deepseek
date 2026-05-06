import { describe, expect, it } from "vitest";
import {
  buildHeadlessRunnerDocument,
  buildVisualizerDocument,
  ensureHtmlDocument,
} from "./html-utils.js";

describe("ensureHtmlDocument", () => {
  it("returns existing full documents untouched", () => {
    const html = "<html><body>ok</body></html>";
    expect(ensureHtmlDocument(html)).toBe(html);
  });

  it("wraps snippets into a full html document", () => {
    const doc = ensureHtmlDocument("<div>Hello</div>");
    expect(doc).toContain("<!DOCTYPE html>");
    expect(doc).toContain("<body><div>Hello</div></body>");
  });
});

describe("buildVisualizerDocument", () => {
  it("injects visualizer css into a snippet", () => {
    const doc = buildVisualizerDocument("<div class='v-card'>Chart</div>");
    expect(doc).toContain("--v-bg");
    expect(doc).toContain("v-card");
  });

  it("injects visualizer css into an existing document head", () => {
    const doc = buildVisualizerDocument("<html><head></head><body>ok</body></html>");
    expect(doc).toContain("<style>");
    expect(doc).toContain("</head>");
  });
});

describe("buildHeadlessRunnerDocument", () => {
  it("builds a javascript runner document", () => {
    const doc = buildHeadlessRunnerDocument("javascript");
    expect(doc).toContain("sendToParent('STATUS', 'READY')");
    expect(doc).toContain("new Function(finalCode)");
    expect(doc).not.toContain("pyodide.js");
  });

  it("builds a python runner document with pyodide", () => {
    const doc = buildHeadlessRunnerDocument("python");
    expect(doc).toContain("pyodide.js");
    expect(doc).toContain("runPythonAsync");
  });

  it("builds a typescript runner document with babel", () => {
    const doc = buildHeadlessRunnerDocument("typescript");
    expect(doc).toContain("babel.min.js");
    expect(doc).toContain("presets: ['typescript']");
  });
});
