// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import {
  RTL_BLOCK_CLASS,
  applyAutoDirection,
  firstStrongDirection,
} from "./bidi-direction.js";

const FA = "این یک متن فارسی است";
const EN = "Here is the summary of the configuration";

function container(html) {
  const root = document.createElement("div");
  root.className = "ds-markdown";
  root.innerHTML = html;
  return root;
}

describe("firstStrongDirection", () => {
  it("reads the direction of the first strong character", () => {
    expect(firstStrongDirection(EN)).toBe("ltr");
    expect(firstStrongDirection(FA)).toBe("rtl");
    expect(firstStrongDirection(`${FA} ${EN}`)).toBe("rtl");
    expect(firstStrongDirection(`${EN} ${FA}`)).toBe("ltr");
  });

  it("skips leading bullets, numbering and punctuation (issue #181)", () => {
    expect(firstStrongDirection("1. npm install --save-dev typescript")).toBe("ltr");
    expect(firstStrongDirection("- سلام، حال شما چطور است؟")).toBe("rtl");
    expect(firstStrongDirection("«نقل قول فارسی»")).toBe("rtl");
    expect(firstStrongDirection("   \t\n " + FA)).toBe("rtl");
  });

  it("treats digit-only and empty strings as neutral", () => {
    expect(firstStrongDirection("8080")).toBe("ltr");
    expect(firstStrongDirection("")).toBe("ltr");
    expect(firstStrongDirection(null)).toBe("ltr");
  });

  it("honours the invisible direction marks", () => {
    expect(firstStrongDirection("\u200f" + EN)).toBe("rtl");
    expect(firstStrongDirection("\u200e" + FA)).toBe("ltr");
  });

  it("keeps long Latin tokens from outvoting Persian words", () => {
    // Character counting used to flip this message; first-strong does not.
    expect(firstStrongDirection(`authentication ${FA}`)).toBe("ltr");
  });
});

describe("applyAutoDirection", () => {
  it("gives every block its own direction instead of one per message", () => {
    const root = container(`<p>${EN}</p><p>${FA}</p><ul><li>${FA}</li></ul>`);
    applyAutoDirection(root);

    const [english, persian] = root.querySelectorAll("p");
    expect(english.getAttribute("dir")).toBe("ltr");
    expect(persian.getAttribute("dir")).toBe("rtl");

    // Only the RTL blocks are tagged, so LTR messages keep DeepSeek's spacing.
    expect(english.classList.contains(RTL_BLOCK_CLASS)).toBe(false);
    expect(persian.classList.contains(RTL_BLOCK_CLASS)).toBe(true);
    expect(root.querySelector("ul").classList.contains(RTL_BLOCK_CLASS)).toBe(true);
    expect(root.querySelector("li").getAttribute("dir")).toBe("rtl");
  });

  it("resolves containers from their descendants, not from their own text", () => {
    // The bug that ruled out `dir="auto"`: a browser stops at the first
    // descendant carrying a `dir`, so a list or table silently fell back to LTR.
    const root = container(`<ul><li>${FA}</li><li>1. npm install</li></ul>`);
    applyAutoDirection(root);

    const ul = root.querySelector("ul");
    expect(ul.getAttribute("dir")).toBe("rtl");
    expect(ul.classList.contains(RTL_BLOCK_CLASS)).toBe(true);
    expect(root.querySelector("li").getAttribute("dir")).toBe("rtl");
  });

  it("resolves a table from its first cell", () => {
    const root = container(`<table><tbody><tr><td>${FA}</td><td>Value</td></tr></tbody></table>`);
    applyAutoDirection(root);

    expect(root.querySelector("table").getAttribute("dir")).toBe("rtl");
    expect(root.querySelector("td").getAttribute("dir")).toBe("rtl");
  });

  it("keeps mixed lines inside one container independent", () => {
    const root = container(`<ul><li>1. npm install</li><li>${FA}</li></ul>`);
    applyAutoDirection(root);

    const [english, persian] = root.querySelectorAll("li");
    expect(english.getAttribute("dir")).toBe("ltr");
    expect(persian.getAttribute("dir")).toBe("rtl");
    // The list itself follows its first item.
    expect(root.querySelector("ul").getAttribute("dir")).toBe("ltr");
  });

  it("leaves the container alone while blocks exist", () => {
    const root = container(`<p>${FA}</p><p>${EN}</p>`);
    applyAutoDirection(root);

    // A container-level direction is what flipped English lines before.
    expect(root.hasAttribute("dir")).toBe(false);
  });

  it("resolves the container itself when it holds no block", () => {
    const root = container(FA);
    applyAutoDirection(root);
    expect(root.getAttribute("dir")).toBe("rtl");
    expect(root.classList.contains(RTL_BLOCK_CLASS)).toBe(true);
  });

  it("never reorders code, formulas or diagrams", () => {
    const root = container(`<p>${FA}</p><pre><code>const x = 1;</code></pre>`);
    applyAutoDirection(root);

    expect(root.querySelector("pre").hasAttribute("dir")).toBe(false);
    expect(root.querySelector("code").hasAttribute("dir")).toBe(false);
  });

  it("does not overwrite a direction someone else already set", () => {
    const root = container(`<p dir="ltr">${FA}</p>`);
    applyAutoDirection(root);

    expect(root.querySelector("p").getAttribute("dir")).toBe("ltr");
    expect(root.querySelector("p").classList.contains(RTL_BLOCK_CLASS)).toBe(false);
  });

  it("skips extension-rendered subtrees nested inside the content", () => {
    const root = container(`<p>${FA}</p><div class="bds-host-wrapper"><p>${EN}</p></div>`);
    applyAutoDirection(root);

    expect(root.querySelector("p").getAttribute("dir")).toBe("rtl");
    expect(root.querySelector(".bds-host-wrapper p").hasAttribute("dir")).toBe(false);
  });

  it("still processes blocks when the content itself sits inside a host", () => {
    // The overlay applies the pass from inside its own host wrapper.
    const host = document.createElement("div");
    host.className = "bds-host-wrapper";
    const root = container(`<p>${FA}</p>`);
    host.appendChild(root);
    document.body.appendChild(host);

    applyAutoDirection(root);
    expect(root.querySelector("p").getAttribute("dir")).toBe("rtl");
  });

  it("is idempotent and tolerant of missing roots", () => {
    const root = container(`<p>${FA}</p>`);
    applyAutoDirection(root);
    applyAutoDirection(root);
    expect(root.querySelector("p").getAttribute("dir")).toBe("rtl");

    expect(() => applyAutoDirection(null)).not.toThrow();
    expect(() => applyAutoDirection(undefined)).not.toThrow();
  });
});
