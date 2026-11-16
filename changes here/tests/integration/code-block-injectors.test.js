// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { injectPythonRunButtons } from "../../src/content/dom/python-injector.js";
import { injectJavaScriptRunButtons } from "../../src/content/dom/javascript-injector.js";

function mkBlock(lang, code) {
  const div = document.createElement("div");
  div.className = "md-code-block";
  div.innerHTML = `
    <div class="md-code-block-banner">
      <span>${lang}</span>
      <div>
        <button type="button" class="ds-atom-button">
          <span class="code-info-button-text">Copy</span>
        </button>
      </div>
    </div>
    <pre><code class="language-${lang}">${code}</code></pre>
  `;
  return div;
}

beforeEach(() => {
  document.body.innerHTML = "";
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("injectPythonRunButtons dedup", () => {
  it("injects exactly one Run Python button per code block", () => {
    const block = mkBlock("python", 'print("hello")');
    document.body.appendChild(block);

    injectPythonRunButtons(document.body);
    expect(block.querySelectorAll(".bds-run-btn").length).toBe(1);

    // Second scan — must not inject a duplicate
    injectPythonRunButtons(document.body);
    expect(block.querySelectorAll(".bds-run-btn").length).toBe(1);
  });

  it("injects into multiple Python blocks without overlap", () => {
    for (let i = 0; i < 3; i++) {
      const b = mkBlock("python", `print(${i})`);
      document.body.appendChild(b);
    }

    injectPythonRunButtons(document.body);
    expect(document.querySelectorAll(".bds-run-btn").length).toBe(3);
  });

  it("skips non-Python blocks", () => {
    const jsBlock = mkBlock("javascript", "console.log(1)");
    document.body.appendChild(jsBlock);

    injectPythonRunButtons(document.body);
    expect(jsBlock.querySelector(".bds-run-btn")).toBeNull();
  });
});

describe("injectJavaScriptRunButtons dedup", () => {
  it("injects exactly one Run JS button per code block", () => {
    const block = mkBlock("javascript", "console.log(1)");
    document.body.appendChild(block);

    injectJavaScriptRunButtons(document.body);
    expect(block.querySelectorAll(".bds-run-btn").length).toBe(1);

    // Second scan — must not inject a duplicate
    injectJavaScriptRunButtons(document.body);
    expect(block.querySelectorAll(".bds-run-btn").length).toBe(1);
  });

  it("skips Python blocks", () => {
    const pyBlock = mkBlock("python", 'print("x")');
    document.body.appendChild(pyBlock);

    injectJavaScriptRunButtons(document.body);
    expect(pyBlock.querySelector(".bds-run-btn")).toBeNull();
  });

  it("both injectors can coexist on separate blocks", () => {
    const pyBlock = mkBlock("python", "import os");
    const jsBlock = mkBlock("javascript", "const x = 1");
    document.body.appendChild(pyBlock);
    document.body.appendChild(jsBlock);

    injectPythonRunButtons(document.body);
    injectJavaScriptRunButtons(document.body);

    expect(pyBlock.querySelectorAll(".bds-run-btn").length).toBe(1);
    expect(jsBlock.querySelectorAll(".bds-run-btn").length).toBe(1);
  });
});
