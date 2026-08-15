// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { extractMessageMarkdown } from "./message-text.js";

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