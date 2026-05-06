import { describe, expect, it } from "vitest";
import {
  normalizeTaggedCodeContent,
  parseTagAttributes,
  unwrapMarkdownCodeFence,
} from "./tag-parser.js";

describe("parseTagAttributes", () => {
  it("parses quoted attributes and preserves fileName casing", () => {
    expect(parseTagAttributes('fileName="src/app.js" usage="demo"')).toEqual({
      fileName: "src/app.js",
      usage: "demo",
    });
  });

  it("ignores malformed attributes", () => {
    expect(parseTagAttributes("bad=demo")).toEqual({});
  });
});

describe("unwrapMarkdownCodeFence", () => {
  it("unwraps fenced code blocks", () => {
    expect(unwrapMarkdownCodeFence("```js\nconsole.log(1);\n```")).toBe(
      "console.log(1);",
    );
  });

  it("unwraps unclosed fences", () => {
    expect(unwrapMarkdownCodeFence("```python\nprint('hi')")).toBe("print('hi')");
  });

  it("keeps nested inner fences intact", () => {
    expect(
      unwrapMarkdownCodeFence("```markdown\n```js\nconsole.log(1)\n```\n```"),
    ).toBe("```js\nconsole.log(1)\n```");
  });

  it("strips stray leading and trailing fence markers", () => {
    expect(unwrapMarkdownCodeFence("```\nhello\n```")).toBe("hello");
  });
});

describe("normalizeTaggedCodeContent", () => {
  it("unwraps create_file content", () => {
    expect(
      normalizeTaggedCodeContent("```python\nprint('x')\n```", "create_file"),
    ).toBe("print('x')");
  });

  it("strips leading chatter for tool code blocks", () => {
    expect(
      normalizeTaggedCodeContent("Here is the code:\nconst doc = 1;", "docx"),
    ).toBe("const doc = 1;");
  });

  it("preserves non-code content for other tags", () => {
    expect(normalizeTaggedCodeContent("Hello", "memory_write")).toBe("Hello");
  });
});
