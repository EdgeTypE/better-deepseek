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

  it("handles escaped quotes (\\\") in attribute values", () => {
    const input = 'fileName="test.js" content="he said \\"hi\\""';
    expect(parseTagAttributes(input)).toEqual({
      fileName: "test.js",
      content: 'he said "hi"',
    });
  });

  it("handles mixed content with normal and escaped quotes", () => {
    const input = 'name="demo" code="console.log(\\"hello\\", world)"';
    expect(parseTagAttributes(input)).toEqual({
      name: "demo",
      code: 'console.log("hello", world)',
    });
  });

  it("preserves unescaped backslashes as-is (not treated as escape)", () => {
    const input = 'fileName="test.py" content="path = C:\\path"';
    expect(parseTagAttributes(input)).toEqual({
      fileName: "test.py",
      content: "path = C:\\path",
    });
  });

  it("handles multiple attributes with escaped quotes", () => {
    const input = 'a="x" b="say \\"yes\\"" c="z"';
    expect(parseTagAttributes(input)).toEqual({
      a: "x",
      b: 'say "yes"',
      c: "z",
    });
  });

  it("strips autolink artifacts from fileName values", () => {
    expect(
      parseTagAttributes('fileName="src/[main.rs](https_main.rs)"'),
    ).toEqual({
      fileName: "src/main.rs",
    });
  });

  it("strips autolink artifacts from path-like values", () => {
    expect(
      parseTagAttributes('path="src/[evaluator.rs](https://evaluator.rs)"'),
    ).toEqual({ path: "src/evaluator.rs" });
  });

  it("strips autolink artifacts from query values", () => {
    expect(
      parseTagAttributes('queries="[parser.rs](https_parser.rs)"'),
    ).toEqual({ queries: "parser.rs" });
  });

  it("strips bare-domain autolinks that start the value", () => {
    expect(
      parseTagAttributes('queries="[main.rs](https://main.rs)"'),
    ).toEqual({ queries: "main.rs" });
  });

  it("strips bare-domain autolinks with a trailing slash", () => {
    expect(
      parseTagAttributes('path="[evaluator.rs](https://evaluator.rs/)"'),
    ).toEqual({ path: "evaluator.rs" });
  });

  it("does not strip artifacts from content/code values", () => {
    const input =
      'fileName="test.py" content="const link = \'[foo](https://bar.com)\';"';
    expect(parseTagAttributes(input)).toEqual({
      fileName: "test.py",
      content: "const link = '[foo](https://bar.com)';",
    });
  });

  it("keeps real markdown links in non-path values intact", () => {
    expect(parseTagAttributes('desc="see [docs](https://docs.example.com)"')).toEqual({
      desc: "see [docs](https://docs.example.com)",
    });
  });
});

describe("unwrapMarkdownCodeFence", () => {
  it("unwraps fenced code blocks", () => {
    expect(unwrapMarkdownCodeFence("```js\nconsole.log(1);\n```")).toBe(
      "console.log(1);\n",
    );
  });

  it("unwraps unclosed fences", () => {
    expect(unwrapMarkdownCodeFence("```python\nprint('hi')")).toBe("print('hi')");
  });

  it("keeps nested inner fences intact", () => {
    expect(
      unwrapMarkdownCodeFence("```markdown\n```js\nconsole.log(1)\n```\n```"),
    ).toBe("```js\nconsole.log(1)\n```\n");
  });

  it("strips stray leading and trailing fence markers", () => {
    expect(unwrapMarkdownCodeFence("```\nhello\n```")).toBe("hello\n");
  });
});

describe("normalizeTaggedCodeContent", () => {
  it("unwraps create_file content", () => {
    expect(
      normalizeTaggedCodeContent("```python\nprint('x')\n```", "create_file"),
    ).toBe("print('x')\n");
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
