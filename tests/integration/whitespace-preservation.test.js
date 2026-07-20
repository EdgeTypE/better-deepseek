import { describe, expect, it } from "vitest";
import { parseBdsMessage } from "../../src/content/parser/index.js";
import {
  normalizeTaggedCodeContent,
  unwrapMarkdownCodeFence,
  parseTagAttributes,
} from "../../src/content/parser/tag-parser.js";
import { sanitizeVisibleText } from "../../src/content/parser/text-sanitizer.js";

// ═════════════════════════════════════════════════════════════════════════════
// Unit: unwrapMarkdownCodeFence — whitespace preservation
// ═════════════════════════════════════════════════════════════════════════════
describe("unwrapMarkdownCodeFence — whitespace preservation", () => {
  it("preserves 4-space indent in Python code", () => {
    const input = "```python\nclass Foo:\n    def bar(self):\n        pass\n```";
    expect(unwrapMarkdownCodeFence(input)).toBe(
      "class Foo:\n    def bar(self):\n        pass\n",
    );
  });

  it("preserves leading spaces before code on first line", () => {
    const input = "```\n    pass\n```";
    expect(unwrapMarkdownCodeFence(input)).toBe("    pass\n");
  });

  it("preserves multiple blank lines inside code", () => {
    const input = "```python\ndef a():\n    pass\n\n\ndef b():\n    pass\n```";
    expect(unwrapMarkdownCodeFence(input)).toBe(
      "def a():\n    pass\n\n\ndef b():\n    pass\n",
    );
  });

  it("unwraps unclosed fence and preserves indent", () => {
    const input = "```python\n    pass";
    expect(unwrapMarkdownCodeFence(input)).toBe("    pass");
  });

  it("preserves trailing newline for single-fence content", () => {
    const input = "```py\nx = 1\n```";
    expect(unwrapMarkdownCodeFence(input)).toBe("x = 1\n");
  });

  it("preserves content with angle brackets in code", () => {
    const input = "```html\n<div>\n  <p>Hello</p>\n</div>\n```";
    expect(unwrapMarkdownCodeFence(input)).toBe(
      "<div>\n  <p>Hello</p>\n</div>\n",
    );
  });

  it("preserves content with backtick inside comment", () => {
    const input = "```py\n# ``` not a real fence\nx = 1\n```";
    expect(unwrapMarkdownCodeFence(input)).toBe(
      "# ``` not a real fence\nx = 1\n",
    );
  });

  it("keeps nested inner fences intact (multi-block content)", () => {
    const input = "```markdown\n# Title\n\n```js\ncode\n```\n\n## End\n```";
    expect(unwrapMarkdownCodeFence(input)).toBe(
      "# Title\n\n```js\ncode\n```\n\n## End\n",
    );
  });

  it("preserves all indent in non-fenced content (only empty lines are trimmed)", () => {
    expect(unwrapMarkdownCodeFence("class Foo:\n    pass")).toBe("class Foo:\n    pass");
    expect(unwrapMarkdownCodeFence("   def foo():\n    pass")).toBe("   def foo():\n    pass");
  });

  it("does not strip trailing whitespace before closing fence", () => {
    const input = "```py\nx = 1  \n```";
    expect(unwrapMarkdownCodeFence(input)).toBe("x = 1  \n");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Unit: unwrapMarkdownCodeFence — additional edge cases
// ═════════════════════════════════════════════════════════════════════════════
describe("unwrapMarkdownCodeFence — edge cases", () => {
  it("preserves CRLF line endings", () => {
    const input = "```py\r\nx = 1\r\ny = 2\r\n```";
    expect(unwrapMarkdownCodeFence(input)).toBe("x = 1\r\ny = 2\r\n");
  });

  it("handles fence with no language tag", () => {
    const input = "```\nplain text\n```";
    expect(unwrapMarkdownCodeFence(input)).toBe("plain text\n");
  });

  it("returns empty string for fence with nothing inside", () => {
    expect(unwrapMarkdownCodeFence("```\n```")).toBe("");
  });

  it("returns empty string for fence with only whitespace inside", () => {
    expect(unwrapMarkdownCodeFence("```\n   \n```")).toBe("   \n");
  });

  it("preserves content with only a single character", () => {
    expect(unwrapMarkdownCodeFence("```\nx\n```")).toBe("x\n");
  });

  it("handles language tag with plus sign (C++)", () => {
    const input = "```c++\nint x = 1;\n```";
    expect(unwrapMarkdownCodeFence(input)).toBe("int x = 1;\n");
  });

  it("handles language tag with dots", () => {
    const input = "```foo.bar\ncontent\n```";
    expect(unwrapMarkdownCodeFence(input)).toBe("content\n");
  });

  it("preserves content when input is only backticks (no newline after lang)", () => {
    const input = "```py\nx = 1\n```";
    expect(unwrapMarkdownCodeFence(input)).toBe("x = 1\n");
  });

  it("preserves leading and trailing whitespace on the same line for non-fenced content", () => {
    expect(unwrapMarkdownCodeFence("   some text")).toBe("   some text");
    expect(unwrapMarkdownCodeFence("stuff   ")).toBe("stuff   ");
  });

  it("preserves file content that itself contains BDS-like tags", () => {
    const input = "```markdown\nUse `<BDS:create_file>` to create files\n```";
    expect(unwrapMarkdownCodeFence(input)).toBe(
      "Use `<BDS:create_file>` to create files\n",
    );
  });

  it("handles closing fence with trailing whitespace", () => {
    const input = "```py\nx = 1\n```   ";
    expect(unwrapMarkdownCodeFence(input)).toBe("x = 1\n");
  });

  it("preserves content with mixed blank lines (1, 2, 3+)", () => {
    const input = "```\n\n\na\n\n\n\nb\n\n\n```";
    expect(unwrapMarkdownCodeFence(input)).toBe("\n\na\n\n\n\nb\n\n\n");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Unit: parseTagAttributes — malformed & edge cases
// ═════════════════════════════════════════════════════════════════════════════
describe("parseTagAttributes — malformed & edge cases", () => {
  it("parses standard filename attribute", () => {
    expect(parseTagAttributes('fileName="test.py"')).toEqual({
      fileName: "test.py",
    });
  });

  it("falls back to lowercase filename attribute", () => {
    expect(parseTagAttributes('filename="test.py"')).toEqual({
      filename: "test.py",
    });
  });

  it("falls back to path attribute", () => {
    expect(parseTagAttributes('path="src/test.py"')).toEqual({
      path: "src/test.py",
    });
  });

  it("parses multiple attributes", () => {
    expect(
      parseTagAttributes('fileName="app.js" usage="demo" lang="en"'),
    ).toEqual({
      fileName: "app.js",
      usage: "demo",
      lang: "en",
    });
  });

  it("ignores unquoted attribute values", () => {
    expect(parseTagAttributes("fileName=test.py")).toEqual({});
  });

  it("handles empty attribute values", () => {
    expect(parseTagAttributes('fileName=""')).toEqual({ fileName: "" });
  });

  it("ignores malformed key=value pairs", () => {
    expect(parseTagAttributes("bad=demo")).toEqual({});
  });

  it("handles extra whitespace around attributes", () => {
    expect(parseTagAttributes('   fileName   =   "test.py"   ')).toEqual({
      fileName: "test.py",
    });
  });

  it("ignores trailing content without =\"...\"", () => {
    expect(parseTagAttributes('fileName="x" extra junk')).toEqual({
      fileName: "x",
    });
  });

  it("handles empty input", () => {
    expect(parseTagAttributes("")).toEqual({});
  });

  it("handles input with only whitespace", () => {
    expect(parseTagAttributes("   ")).toEqual({});
  });

  it("overwrites with the last value for duplicate keys", () => {
    expect(
      parseTagAttributes('fileName="first.py" fileName="second.py"'),
    ).toEqual({
      fileName: "second.py",
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Unit: normalizeTaggedCodeContent — whitespace preservation
// ═════════════════════════════════════════════════════════════════════════════
describe("normalizeTaggedCodeContent — whitespace preservation", () => {
  it("preserves indent for create_file with fenced content", () => {
    const input = "```python\ndef foo():\n    pass\n```";
    expect(normalizeTaggedCodeContent(input, "create_file")).toBe(
      "def foo():\n    pass\n",
    );
  });

  it("preserves indent for create_file with unclosed fence", () => {
    const input = "```python\n    pass";
    expect(normalizeTaggedCodeContent(input, "create_file")).toBe("    pass");
  });

  it("preserves multi-block content for create_file (README)", () => {
    const input =
      "```markdown\n# Project\n\n```bash\nnpm i\n```\n\n## API\n\n```js\nuse()\n```\n```";
    expect(normalizeTaggedCodeContent(input, "create_file")).toBe(
      "# Project\n\n```bash\nnpm i\n```\n\n## API\n\n```js\nuse()\n```\n",
    );
  });

  it("preserves content for create_file without any fences", () => {
    const input = "class Test:\n    def run(self):\n        pass\n";
    expect(normalizeTaggedCodeContent(input, "create_file")).toBe(
      "class Test:\n    def run(self):\n        pass",
    );
  });

  it("preserves indent for html tag content (stripLeadingChatter strips trailing \\n)", () => {
    const input = "```html\n<div>\n  <p>text</p>\n</div>\n```";
    expect(normalizeTaggedCodeContent(input, "html")).toBe(
      "<div>\n  <p>text</p>\n</div>",
    );
  });

  it("preserves multi-block markdown for character_create", () => {
    const input = "```markdown\n# Character\n\n**Rules:**\n- Be kind\n\n```yaml\nname: Alice\n```\n```";
    expect(normalizeTaggedCodeContent(input, "character_create")).toBe(
      "# Character\n\n**Rules:**\n- Be kind\n\n```yaml\nname: Alice\n```\n",
    );
  });

  it("preserves multi-block markdown for skill_create", () => {
    const input = "```markdown\n# Skill\n\n## Examples\n\n```css\n.red { color: red; }\n```\n\n```js\nlog('done');\n```\n```";
    expect(normalizeTaggedCodeContent(input, "skill_create")).toBe(
      "# Skill\n\n## Examples\n\n```css\n.red { color: red; }\n```\n\n```js\nlog('done');\n```\n",
    );
  });

  it("strips chatter and fence for auto:code_runner, preserves internal layout", () => {
    const input = "Here:\n```py\nx = 1\n  y = 2\n```";
    expect(normalizeTaggedCodeContent(input, "auto:code_runner")).toBe(
      "x = 1\n  y = 2",
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Unit: normalizeTaggedCodeContent — chatter by tool type
// ═════════════════════════════════════════════════════════════════════════════
describe("normalizeTaggedCodeContent — chatter by tool type", () => {
  it("strips leading natural language line when content has JS-like code for chatter-stripping tools", () => {
    const input = "Here is the code:\nconst doc = new Document();\ndoc.addSection();";
    expect(normalizeTaggedCodeContent(input, "docx")).toBe(
      "const doc = new Document();\ndoc.addSection();",
    );
  });

  it("strips natural language + fence when fenced content has leading text", () => {
    const input = "Run this:\n```js\nconsole.log('hello');\n```";
    expect(normalizeTaggedCodeContent(input, "auto:code_runner")).toBe(
      "console.log('hello');",
    );
  });

  it("preserves content unchanged for non-chatter-stripping tool types", () => {
    expect(normalizeTaggedCodeContent("Hello World", "memory_write")).toBe(
      "Hello World",
    );
    expect(normalizeTaggedCodeContent("<div>raw</div>", "ask_question")).toBe(
      "<div>raw</div>",
    );
  });

  it("does not unwrap fence for tag types not in the normalize/chatter list", () => {
    const input = "```\ncode\n```";
    expect(normalizeTaggedCodeContent(input, "unknown_tag")).toBe(input);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Unit: sanitizeVisibleText — tag stripping behavior
// ═════════════════════════════════════════════════════════════════════════════
describe("sanitizeVisibleText — tag stripping", () => {
  it("removes paired BDS tags entirely", () => {
    expect(
      sanitizeVisibleText(
        "Hello<BDS:create_file fileName=\"x\">content</BDS:create_file>World",
      ),
    ).toBe("HelloWorld");
  });

  it("removes BetterDeepSeek blocks", () => {
    expect(
      sanitizeVisibleText(
        "Hello<BetterDeepSeek>system stuff</BetterDeepSeek>World",
      ),
    ).toBe("HelloWorld");
  });

  it("removes BDS:SKILLS blocks", () => {
    expect(
      sanitizeVisibleText(
        "Hello<BDS:SKILLS>skill content</BDS:SKILLS>World",
      ),
    ).toBe("HelloWorld");
  });

  it("removes memory_calls blocks", () => {
    expect(
      sanitizeVisibleText(
        "Hello<BDS:memory_calls>mem content</BDS:memory_calls>World",
      ),
    ).toBe("HelloWorld");
  });

  it("removes stray unclosed opening tags", () => {
    expect(sanitizeVisibleText("Hello<BDS:create_file fileName=\"x\">World")).toBe(
      "HelloWorld",
    );
  });

  it("removes stray closing tags", () => {
    expect(sanitizeVisibleText("Hello</BDS:create_file>World")).toBe(
      "HelloWorld",
    );
  });

  it("collapses 3+ consecutive newlines to double newline", () => {
    expect(sanitizeVisibleText("a\n\n\n\n\nb")).toBe("a\n\nb");
  });

  it("trims leading and trailing whitespace", () => {
    expect(sanitizeVisibleText("  \nHello\n  ")).toBe("Hello");
  });

  it("removes self-closing create_file tags", () => {
    expect(
      sanitizeVisibleText(
        'Hello<BDS:create_file fileName="x" content="stuff"/>World',
      ),
    ).toBe("HelloWorld");
  });

  it("removes legacy Bds create file> lines", () => {
    expect(
      sanitizeVisibleText(
        "Hello\nBds create file> fileName=\"x\" content=\"stuff\"\nWorld",
      ),
    ).toBe("Hello\n\nWorld");
  });

  it("removes LONG_WORK tags", () => {
    expect(
      sanitizeVisibleText(
        "Hello<BDS:LONG_WORK>stuff</BDS:LONG_WORK>World",
      ),
    ).toBe("HelloWorld");
  });

  it("handles mixed tag types in one string", () => {
    const input =
      "Start<BDS:html>div</BDS:html>Mid<BetterDeepSeek>sys</BetterDeepSeek>End";
    expect(sanitizeVisibleText(input)).toBe("StartMidEnd");
  });

  it("returns empty string for only-tags input", () => {
    expect(sanitizeVisibleText("<BDS:create_file fileName=\"x\">content</BDS:create_file>")).toBe("");
  });

  it("handles empty input", () => {
    expect(sanitizeVisibleText("")).toBe("");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Integration: parseBdsMessage — create_file indent preservation
// ═════════════════════════════════════════════════════════════════════════════
describe("parseBdsMessage — create_file indent preservation", () => {
  it("preserves Python class indent in standalone create_file", () => {
    const raw =
      '<BDS:create_file fileName="test.py">```python\nclass Library:\n    def __init__(self):\n        self.books = []\n\n    def add(self, title):\n        self.books.append(title)\n```</BDS:create_file>';
    const result = parseBdsMessage(raw);
    expect(result.createFiles).toHaveLength(1);
    expect(result.createFiles[0].content).toBe(
      "class Library:\n    def __init__(self):\n        self.books = []\n\n    def add(self, title):\n        self.books.append(title)\n",
    );
  });

  it("preserves blank lines in create_file content", () => {
    const raw =
      '<BDS:create_file fileName="util.py">```python\ndef a():\n    return 1\n\n\ndef b():\n    return 2\n```</BDS:create_file>';
    const result = parseBdsMessage(raw);
    expect(result.createFiles[0].content).toBe(
      "def a():\n    return 1\n\n\ndef b():\n    return 2\n",
    );
  });

  it("preserves README with multiple code blocks", () => {
    const raw =
      '<BDS:create_file fileName="README.md">```markdown\n# My Project\n\n## Install\n\n```bash\nnpm install\n```\n\n## Usage\n\n```js\nconst lib = require("lib");\nlib.run();\n```\n\n## License\nMIT\n```</BDS:create_file>';
    const result = parseBdsMessage(raw);
    expect(result.createFiles).toHaveLength(1);
    expect(result.createFiles[0].content).toBe(
      "# My Project\n\n## Install\n\n```bash\nnpm install\n```\n\n## Usage\n\n```js\nconst lib = require(\"lib\");\nlib.run();\n```\n\n## License\nMIT\n",
    );
  });

  it("preserves HTML content with deep nesting", () => {
    const raw =
      '<BDS:create_file fileName="index.html">```html\n<!DOCTYPE html>\n<html>\n<head>\n  <style>\n    body { font-family: sans-serif; }\n  </style>\n</head>\n<body>\n  <div id="app">\n    <p>Hello World</p>\n  </div>\n</body>\n</html>\n```</BDS:create_file>';
    const result = parseBdsMessage(raw);
    expect(result.createFiles).toHaveLength(1);
    expect(result.createFiles[0].content).toBe(
      "<!DOCTYPE html>\n<html>\n<head>\n  <style>\n    body { font-family: sans-serif; }\n  </style>\n</head>\n<body>\n  <div id=\"app\">\n    <p>Hello World</p>\n  </div>\n</body>\n</html>\n",
    );
  });

  it("preserves indent when tag is immediately followed by backticks (no newline)", () => {
    const raw =
      '<BDS:create_file fileName="test.py">```python\n    def run():\n        pass\n```</BDS:create_file>';
    const result = parseBdsMessage(raw);
    expect(result.createFiles[0].content).toBe(
      "    def run():\n        pass\n",
    );
  });

  it("preserves content without any fences inside create_file", () => {
    const raw =
      '<BDS:create_file fileName="raw.py">class Foo:\n    pass\n</BDS:create_file>';
    const result = parseBdsMessage(raw);
    expect(result.createFiles[0].content).toBe(
      "class Foo:\n    pass",
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Integration: parseBdsMessage — create_file additional edge cases
// ═════════════════════════════════════════════════════════════════════════════
describe("parseBdsMessage — create_file edge cases", () => {
  it("preserves content when there is trailing text after closing fence before closing tag", () => {
    const raw =
      '<BDS:create_file fileName="test.py">```py\nx = 1\n```\nLet me know if it works!\n</BDS:create_file>';
    const result = parseBdsMessage(raw);
    expect(result.createFiles).toHaveLength(1);
    // The unclosed-fence branch captures everything after the first ``` line.
    // The stray text is currently preserved alongside code.
    expect(result.createFiles[0].content).toContain("Let me know if it works!");
  });

  it("handles duplicate fileNames (AI produces same file twice)", () => {
    const raw =
      '<BDS:create_file fileName="dup.py">```py\na = 1\n```</BDS:create_file>' +
      '<BDS:create_file fileName="dup.py">```py\na = 2\n```</BDS:create_file>';
    const result = parseBdsMessage(raw);
    expect(result.createFiles).toHaveLength(2);
    expect(result.createFiles[0].content).toBe("a = 1\n");
    expect(result.createFiles[1].content).toBe("a = 2\n");
  });

  it("handles Unicode filenames and content", () => {
    const raw =
      '<BDS:create_file fileName="méthode.py">```py\ndef méthode():\n    return "héllo"\n```</BDS:create_file>';
    const result = parseBdsMessage(raw);
    expect(result.createFiles).toHaveLength(1);
    expect(result.createFiles[0].fileName).toBe("méthode.py");
    expect(result.createFiles[0].content).toBe(
      "def méthode():\n    return \"héllo\"\n",
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Integration: parseBdsMessage — LONG_WORK scenarios
// ═════════════════════════════════════════════════════════════════════════════
describe("parseBdsMessage — LONG_WORK indent preservation", () => {
  it("preserves indent for single Python file inside LONG_WORK", () => {
    const raw =
      '<BDS:LONG_WORK><BDS:create_file fileName="app.py">```python\nclass App:\n    def start(self):\n        print("ok")\n```</BDS:create_file></BDS:LONG_WORK>';
    const result = parseBdsMessage(raw);
    expect(result.createFiles).toHaveLength(1);
    expect(result.createFiles[0].content).toBe(
      "class App:\n    def start(self):\n        print(\"ok\")\n",
    );
  });

  it("preserves indent for multiple Python files inside LONG_WORK", () => {
    const raw =
      '<BDS:LONG_WORK><BDS:create_file fileName="main.py">```python\nif __name__ == "__main__":\n    run()\n```</BDS:create_file><BDS:create_file fileName="lib.py">```python\ndef helper():\n    return 42\n```</BDS:create_file></BDS:LONG_WORK>';
    const result = parseBdsMessage(raw);
    expect(result.createFiles).toHaveLength(2);
    expect(result.createFiles[0].content).toBe(
      "if __name__ == \"__main__\":\n    run()\n",
    );
    expect(result.createFiles[1].content).toBe(
      "def helper():\n    return 42\n",
    );
  });

  it("preserves indent for README + Python + CSS inside LONG_WORK", () => {
    const raw =
      '<BDS:LONG_WORK>' +
      '<BDS:create_file fileName="README.md">```markdown\n# Demo\n\n## Setup\n```bash\nnpm i\n```\n```</BDS:create_file>' +
      '<BDS:create_file fileName="src/index.js">```js\nimport { greet } from "./util.js";\n\ngreet("world");\n```</BDS:create_file>' +
      '<BDS:create_file fileName="src/style.css">```css\n.container {\n  display: flex;\n  gap: 8px;\n}\n```</BDS:create_file>' +
      '</BDS:LONG_WORK>';
    const result = parseBdsMessage(raw);
    expect(result.createFiles).toHaveLength(3);

    expect(result.createFiles[0].content).toBe(
      "# Demo\n\n## Setup\n```bash\nnpm i\n```\n",
    );

    expect(result.createFiles[1].content).toBe(
      "import { greet } from \"./util.js\";\n\ngreet(\"world\");\n",
    );

    expect(result.createFiles[2].content).toBe(
      ".container {\n  display: flex;\n  gap: 8px;\n}\n",
    );
  });

  it("preserves indent when create_file has no ``` wrapper", () => {
    const raw =
      '<BDS:LONG_WORK><BDS:create_file fileName="raw.py">def run():\n    return True\n</BDS:create_file></BDS:LONG_WORK>';
    const result = parseBdsMessage(raw);
    expect(result.createFiles[0].content).toBe(
      "def run():\n    return True",
    );
  });

  it("preserves trailing newline for fenced files inside LONG_WORK", () => {
    const raw =
      '<BDS:LONG_WORK><BDS:create_file fileName="a.py">```py\nx = 1\n```</BDS:create_file><BDS:create_file fileName="b.py">```py\ny = 2\n```</BDS:create_file></BDS:LONG_WORK>';
    const result = parseBdsMessage(raw);
    expect(result.createFiles[0].content.endsWith("\n")).toBe(true);
    expect(result.createFiles[1].content.endsWith("\n")).toBe(true);
  });

  it("handles explanatory text between create_file tags inside LONG_WORK", () => {
    const raw =
      '<BDS:LONG_WORK>' +
      'First, create the main file:\n' +
      '<BDS:create_file fileName="main.py">```py\nprint("hello")\n```</BDS:create_file>' +
      '\nNow add the utility:\n' +
      '<BDS:create_file fileName="util.py">```py\ndef helper():\n    return 42\n```</BDS:create_file>' +
      '\nThat is all!\n' +
      '</BDS:LONG_WORK>';
    const result = parseBdsMessage(raw);
    expect(result.createFiles).toHaveLength(2);
    expect(result.createFiles[0].fileName).toBe("main.py");
    expect(result.createFiles[1].fileName).toBe("util.py");
    expect(result.createFiles[1].content).toBe(
      "def helper():\n    return 42\n",
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Integration: parseBdsMessage — tag-position edge cases
// ═════════════════════════════════════════════════════════════════════════════
describe("parseBdsMessage — tag-position edge cases", () => {
  it("handles tag immediately followed by backticks (no \\n between > and ```)", () => {
    const raw =
      '<BDS:create_file fileName="test.py">```python\nx = 1\n```</BDS:create_file>';
    const result = parseBdsMessage(raw);
    expect(result.createFiles[0].content).toBe("x = 1\n");
  });

  it("handles tag with newline before backticks", () => {
    const raw =
      '<BDS:create_file fileName="test.py">\n```python\nx = 1\n```\n</BDS:create_file>';
    const result = parseBdsMessage(raw);
    expect(result.createFiles[0].content).toBe("x = 1\n");
  });

  it("handles tag with multiple newlines before backticks", () => {
    const raw =
      '<BDS:create_file fileName="test.py">\n\n\n```python\nx = 1\n```\n</BDS:create_file>';
    const result = parseBdsMessage(raw);
    expect(result.createFiles[0].content).toBe("x = 1\n");
  });

  it("handles tag without closing backticks (unclosed fence)", () => {
    const raw =
      '<BDS:create_file fileName="test.py">```python\nx = 1\n</BDS:create_file>';
    const result = parseBdsMessage(raw);
    expect(result.createFiles[0].content).toBe("x = 1\n");
  });

  it("handles LONG_WORK wrapping tag with no newline after >", () => {
    const raw =
      '<BDS:LONG_WORK><BDS:create_file fileName="a.py">```py\nx = 1\n```</BDS:create_file></BDS:LONG_WORK>';
    const result = parseBdsMessage(raw);
    expect(result.createFiles[0].content).toBe("x = 1\n");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Integration: parseBdsMessage — renderable blocks (html, auto:code_runner)
// ═════════════════════════════════════════════════════════════════════════════
describe("parseBdsMessage — renderable block content preservation", () => {
  it("preserves html block indent (trailing \\n stripped by stripLeadingChatter)", () => {
    const raw =
      '<BDS:html>```html\n<div>\n  <p>text</p>\n</div>\n```</BDS:html>';
    const result = parseBdsMessage(raw);
    expect(result.renderableBlocks).toHaveLength(1);
    expect(result.renderableBlocks[0].content).toBe(
      "<div>\n  <p>text</p>\n</div>",
    );
  });

  it("preserves auto:code_runner code layout (trailing \\n stripped by stripLeadingChatter)", () => {
    const raw =
      '<BDS:AUTO:CODE_RUNNER language="py">```py\nx = 1\n  y = 2\n```</BDS:AUTO:CODE_RUNNER>';
    const result = parseBdsMessage(raw);
    expect(result.renderableBlocks).toHaveLength(1);
    expect(result.renderableBlocks[0].content).toBe("x = 1\n  y = 2");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// [NEW] Integration: parseBdsMessage — visibleText output
// ═════════════════════════════════════════════════════════════════════════════
describe("parseBdsMessage — visibleText output", () => {
  it("strips tags from visibleText and keeps conversation text", () => {
    const raw =
      "Here is your file:\n<BDS:create_file fileName=\"test.py\">```python\nx = 1\n```</BDS:create_file>\nLet me know if you need changes!";
    const result = parseBdsMessage(raw);
    expect(result.visibleText).toBe(
      "Here is your file:\n\nLet me know if you need changes!",
    );
  });

  it("returns empty visibleText when message is only tags", () => {
    const raw =
      '<BDS:create_file fileName="test.py">```python\nx = 1\n```</BDS:create_file>';
    const result = parseBdsMessage(raw);
    expect(result.visibleText).toBe("");
  });

  it("preserves visibleText before the first tag when streaming is detected", () => {
    const raw =
      "Hello\n<BDS:create_file fileName=\"test.py\">```python\nx = 1\n```";
    const result = parseBdsMessage(raw);
    expect(result.visibleText).toBe("Hello");
  });

  it("preserves full visibleText after tag is closed (not streaming)", () => {
    const raw =
      "Before\n<BDS:create_file fileName=\"test.py\">```python\nx = 1\n```</BDS:create_file>\nAfter";
    const result = parseBdsMessage(raw);
    expect(result.visibleText).toBe("Before\n\nAfter");
  });

  it("handles visibleText with only normal conversation (no BDS tags)", () => {
    const raw = "Hello World\nThis is a normal message.";
    const result = parseBdsMessage(raw);
    expect(result.visibleText).toBe("Hello World\nThis is a normal message.");
    expect(result.createFiles).toHaveLength(0);
  });

  it("strips html renderable tags from visibleText", () => {
    const raw =
      "Check this:\n<BDS:html>```html\n<div>text</div>\n```</BDS:html>\nCool right?";
    const result = parseBdsMessage(raw);
    expect(result.visibleText).toBe("Check this:\n\x00BLOCK:0\x00\nCool right?");
  });

  it("strips LONG_WORK wrappers from visibleText", () => {
    const raw =
      "Files:\n<BDS:LONG_WORK><BDS:create_file fileName=\"a.py\">```py\nx=1\n```</BDS:create_file></BDS:LONG_WORK>\nDone!";
    const result = parseBdsMessage(raw);
    expect(result.visibleText).toBe("Files:\n\nDone!");
  });

  it("removes BetterDeepSeek blocks from visibleText", () => {
    const raw =
      "Hello<BetterDeepSeek>invisible system prompt</BetterDeepSeek>World";
    const result = parseBdsMessage(raw);
    expect(result.visibleText).toBe("HelloWorld");
  });

  it("collapses multiple newlines created by tag removal", () => {
    const raw =
      "a\n<BDS:create_file fileName=\"x\">c</BDS:create_file>\n\nb";
    const result = parseBdsMessage(raw);
    expect(result.visibleText).toBe("a\n\nb");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// [NEW] Integration: parseBdsMessage — malformed tags (AI hallucination)
// ═════════════════════════════════════════════════════════════════════════════
describe("parseBdsMessage — malformed tags", () => {
  it("skips create_file with empty fileName", () => {
    const raw =
      '<BDS:create_file fileName="">```\ncontent\n```</BDS:create_file>';
    const result = parseBdsMessage(raw);
    expect(result.createFiles).toHaveLength(0);
  });

  it("skips create_file with missing fileName attribute", () => {
    const raw =
      '<BDS:create_file>```\ncontent\n```</BDS:create_file>';
    const result = parseBdsMessage(raw);
    expect(result.createFiles).toHaveLength(0);
  });

  it("accepts lowercase 'filename' attribute as fallback", () => {
    const raw =
      '<BDS:create_file filename="test.py">```\nx = 1\n```</BDS:create_file>';
    const result = parseBdsMessage(raw);
    expect(result.createFiles).toHaveLength(1);
    expect(result.createFiles[0].fileName).toBe("test.py");
  });

  it("accepts 'path' attribute as fallback", () => {
    const raw =
      '<BDS:create_file path="src/test.py">```\nx = 1\n```</BDS:create_file>';
    const result = parseBdsMessage(raw);
    expect(result.createFiles).toHaveLength(1);
    expect(result.createFiles[0].fileName).toBe("src/test.py");
  });

  it("handles extra whitespace in opening tag", () => {
    const raw =
      '<BDS:create_file  fileName="test.py">```\nx = 1\n```</BDS:create_file>';
    const result = parseBdsMessage(raw);
    expect(result.createFiles).toHaveLength(1);
    expect(result.createFiles[0].content).toBe("x = 1\n");
  });

  it("skips tag with no space between tag name and attributes (requires whitespace)", () => {
    const raw =
      '<BDS:create_filefileName="test.py">```\nx = 1\n```</BDS:create_file>';
    const result = parseBdsMessage(raw);
    expect(result.createFiles).toHaveLength(0);
  });

  it("handles lowercase tag name", () => {
    const raw =
      '<bds:create_file fileName="test.py">```\nx = 1\n```</bds:create_file>';
    const result = parseBdsMessage(raw);
    expect(result.createFiles).toHaveLength(1);
    expect(result.createFiles[0].content).toBe("x = 1\n");
  });

  it("handles uppercase tag name", () => {
    const raw =
      '<BDS:CREATE_FILE fileName="test.py">```\nx = 1\n```</BDS:CREATE_FILE>';
    const result = parseBdsMessage(raw);
    expect(result.createFiles).toHaveLength(1);
    expect(result.createFiles[0].content).toBe("x = 1\n");
  });

  it("handles tag with trailing stray attributes", () => {
    const raw =
      '<BDS:create_file fileName="test.py" extra>```\nx = 1\n```</BDS:create_file>';
    const result = parseBdsMessage(raw);
    expect(result.createFiles).toHaveLength(1);
    expect(result.createFiles[0].content).toBe("x = 1\n");
  });

  it("skips tag with unquoted attribute values", () => {
    const raw =
      '<BDS:create_file fileName=test.py>```\nx = 1\n```</BDS:create_file>';
    const result = parseBdsMessage(raw);
    expect(result.createFiles).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// [NEW] Integration: parseBdsMessage — isSettled auto-close
// ═════════════════════════════════════════════════════════════════════════════
describe("parseBdsMessage — isSettled auto-close behavior", () => {
  it("does NOT auto-close when isSettled=false (unclosed tag not parsed)", () => {
    const raw =
      '<BDS:create_file fileName="test.py">```\nunclosed content';
    const result = parseBdsMessage(raw, false);
    expect(result.createFiles).toHaveLength(0);
    expect(result.isStreamingTool).toBe(true);
  });

  it("auto-closes unclosed create_file when isSettled=true", () => {
    const raw =
      '<BDS:create_file fileName="test.py">```python\nx = 1\n```';
    const result = parseBdsMessage(raw, true);
    expect(result.createFiles).toHaveLength(1);
    expect(result.createFiles[0].content).toBe("x = 1\n");
    expect(result.isStreamingTool).toBe(false);
  });

  it("auto-closes unclosed html renderable when isSettled=true", () => {
    const raw =
      '<BDS:html>```html\n<div>text</div>\n```';
    const result = parseBdsMessage(raw, true);
    expect(result.renderableBlocks).toHaveLength(1);
    expect(result.renderableBlocks[0].content).toBe("<div>text</div>");
    expect(result.isStreamingTool).toBe(false);
  });

  it("does NOT affect tags that are already properly closed", () => {
    const raw =
      '<BDS:create_file fileName="test.py">```\nx = 1\n```</BDS:create_file>';
    const result = parseBdsMessage(raw, true);
    expect(result.createFiles).toHaveLength(1);
    expect(result.createFiles[0].content).toBe("x = 1\n");
  });

  it("does NOT auto-close AUTO tags (background requests)", () => {
    const raw = '<BDS:AUTO:REQUEST_WEB_FETCH>https://example.com</BDS:AUTO:REQUEST_WEB_FETCH>';
    const result = parseBdsMessage(raw, true);
    expect(result.autoRequests.webFetch).toHaveLength(1);
    expect(result.isStreamingTool).toBe(false);
  });

  it("auto-closes multiple unclosed tags when isSettled=true (both LONG_WORK and create_file)", () => {
    const raw =
      '<BDS:LONG_WORK><BDS:create_file fileName="a.py">```\nx = 1\n```';
    const result = parseBdsMessage(raw, true);
    expect(result.createFiles).toHaveLength(1);
    expect(result.longWorkOpen).toBe(true);
    expect(result.longWorkClose).toBe(true);
  });

  it("does not duplicate content when isSettled auto-closes", () => {
    const raw =
      '<BDS:create_file fileName="test.py">```\nx = 1\n```';
    const result = parseBdsMessage(raw, true);
    expect(result.createFiles).toHaveLength(1);
    expect(result.createFiles[0].content).toBe("x = 1\n");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// [NEW] Integration: parseBdsMessage — self-closing tags
// ═════════════════════════════════════════════════════════════════════════════
describe("parseBdsMessage — self-closing create_file", () => {
  it("parses self-closing tag with content attribute", () => {
    const raw =
      '<BDS:create_file fileName="test.py" content="print(1)" />';
    const result = parseBdsMessage(raw);
    expect(result.createFiles).toHaveLength(1);
    expect(result.createFiles[0].fileName).toBe("test.py");
    expect(result.createFiles[0].content).toBe("print(1)");
  });

  it("parses self-closing tag with fenced content attribute", () => {
    const raw =
      '<BDS:create_file fileName="test.py" content="```python\nprint(1)\n```" />';
    const result = parseBdsMessage(raw);
    expect(result.createFiles).toHaveLength(1);
    expect(result.createFiles[0].content).toBe("print(1)\n");
  });

  it("skips self-closing tag with empty fileName", () => {
    const raw =
      '<BDS:create_file fileName="" content="stuff" />';
    const result = parseBdsMessage(raw);
    expect(result.createFiles).toHaveLength(0);
  });

  it("skips self-closing tag with no fileName", () => {
    const raw = '<BDS:create_file content="stuff" />';
    const result = parseBdsMessage(raw);
    expect(result.createFiles).toHaveLength(0);
  });

  it("parses self-closing tag with empty content", () => {
    const raw =
      '<BDS:create_file fileName="empty.txt" content="" />';
    const result = parseBdsMessage(raw);
    expect(result.createFiles).toHaveLength(1);
    expect(result.createFiles[0].content).toBe("");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// [NEW] Integration: parseBdsMessage — legacy format
// ═════════════════════════════════════════════════════════════════════════════
describe("parseBdsMessage — legacy Bds create file> format", () => {
  it("parses legacy format with simple content", () => {
    const raw =
      'Bds create file> fileName="test.py" content="print(1)"';
    const result = parseBdsMessage(raw);
    expect(result.createFiles).toHaveLength(1);
    expect(result.createFiles[0].fileName).toBe("test.py");
    expect(result.createFiles[0].content).toBe("print(1)");
  });

  it("parses legacy format with fenced content", () => {
    const raw =
      'Bds create file> fileName="test.py" content="```python\nprint(1)\n```"';
    const result = parseBdsMessage(raw);
    expect(result.createFiles).toHaveLength(1);
    expect(result.createFiles[0].content).toBe("print(1)\n");
  });

  it("parses legacy format with multiline content", () => {
    const raw =
      'Bds create file> fileName="app.py" content="class Foo:\n    def bar(self):\n        pass\n"';
    const result = parseBdsMessage(raw);
    expect(result.createFiles).toHaveLength(1);
    expect(result.createFiles[0].content).toBe("class Foo:\n    def bar(self):\n        pass");
  });

  it("parses BDS pair tags before legacy format (BDS tags come first in result array)", () => {
    const raw =
      'Bds create file> fileName="readme.txt" content="Hello"\n<BDS:create_file fileName="code.py">```\nx=1\n```</BDS:create_file>';
    const result = parseBdsMessage(raw);
    expect(result.createFiles).toHaveLength(2);
    // parser processes createFilePairRegex before plainCreateRegex
    expect(result.createFiles[0].fileName).toBe("code.py");
    expect(result.createFiles[1].fileName).toBe("readme.txt");
  });

  it("legacy format triggers containsControlTags", () => {
    const raw =
      'Bds create file> fileName="x" content="y"';
    const result = parseBdsMessage(raw);
    expect(result.containsControlTags).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// [NEW] Integration: parseBdsMessage — empty/null/edge inputs
// ═════════════════════════════════════════════════════════════════════════════
describe("parseBdsMessage — empty/null/edge inputs", () => {
  it("handles empty string input", () => {
    const result = parseBdsMessage("");
    expect(result.createFiles).toHaveLength(0);
    expect(result.renderableBlocks).toHaveLength(0);
    expect(result.visibleText).toBe("");
    expect(result.containsControlTags).toBe(false);
  });

  it("handles null input", () => {
    const result = parseBdsMessage(null);
    expect(result.createFiles).toHaveLength(0);
    expect(result.visibleText).toBe("");
  });

  it("handles undefined input", () => {
    const result = parseBdsMessage(undefined);
    expect(result.createFiles).toHaveLength(0);
    expect(result.visibleText).toBe("");
  });

  it("handles text with no BDS tags", () => {
    const result = parseBdsMessage("Just a regular conversation message.");
    expect(result.createFiles).toHaveLength(0);
    expect(result.renderableBlocks).toHaveLength(0);
    expect(result.containsControlTags).toBe(false);
    expect(result.visibleText).toBe("Just a regular conversation message.");
  });

  it("handles text that mentions BDS but is not a real tag", () => {
    const result = parseBdsMessage("I wrote a <BDS:create_file> tag in my code.");
    expect(result.createFiles).toHaveLength(0);
    expect(result.containsControlTags).toBe(true);
  });

  it("handles text that mentions BDS in normal conversation (lowercase)", () => {
    const result = parseBdsMessage("The create_file function is useful.");
    expect(result.createFiles).toHaveLength(0);
    expect(result.containsControlTags).toBe(false);
  });

  it("handles input with only whitespace", () => {
    const result = parseBdsMessage("   \n  \n   ");
    expect(result.createFiles).toHaveLength(0);
    expect(result.visibleText).toBe("   \n  \n   ");
  });

  it("does not crash on extremely long single-line input", () => {
    const longContent = "x".repeat(5000);
    const raw = `<BDS:create_file fileName="big.txt">\`\`\`\n${longContent}\n\`\`\`</BDS:create_file>`;
    const result = parseBdsMessage(raw);
    expect(result.createFiles).toHaveLength(1);
    expect(result.createFiles[0].content).toBe(`${longContent}\n`);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// [NEW] Integration: parseBdsMessage — streaming state
// ═════════════════════════════════════════════════════════════════════════════
describe("parseBdsMessage — streaming state detection", () => {
  it("isStreamingTool=false when all tags are properly closed", () => {
    const raw =
      '<BDS:create_file fileName="test.py">```\nx = 1\n```</BDS:create_file>';
    const result = parseBdsMessage(raw);
    expect(result.isStreamingTool).toBe(false);
    expect(result.streamingTagName).toBeNull();
  });

  it("isStreamingTool=true when create_file is not closed", () => {
    const raw =
      '<BDS:create_file fileName="test.py">```\nx = 1\n```';
    const result = parseBdsMessage(raw, false);
    expect(result.isStreamingTool).toBe(true);
    expect(result.streamingTagName).toBe("create_file");
  });

  it("isStreamingTool=true when html tag is not closed", () => {
    const raw = '<BDS:html>```html\n<div>text</div>\n```';
    const result = parseBdsMessage(raw, false);
    expect(result.isStreamingTool).toBe(true);
    expect(result.streamingTagName).toBe("html");
  });

  it("isStreamingTool=false for properly closed html tag", () => {
    const raw = '<BDS:html>```html\n<div>text</div>\n```</BDS:html>';
    const result = parseBdsMessage(raw);
    expect(result.isStreamingTool).toBe(false);
  });

  it("isStreamingTool=false for auto tags (background requests)", () => {
    const raw = '<BDS:AUTO:REQUEST_WEB_FETCH>https://example.com';
    const result = parseBdsMessage(raw, false);
    expect(result.isStreamingTool).toBe(false);
  });

  it("isStreamingTool=true for auto:code_runner (has UI card)", () => {
    const raw = '<BDS:AUTO:CODE_RUNNER language="py">```\nx = 1';
    const result = parseBdsMessage(raw, false);
    expect(result.isStreamingTool).toBe(true);
    expect(result.streamingTagName).toBe("auto:code_runner");
  });

  it("streaming detection handles multiple tags, identifies first unclosed", () => {
    const raw =
      '<BDS:html>```\ndone\n```</BDS:html><BDS:create_file fileName="x">```\nstill streaming';
    const result = parseBdsMessage(raw, false);
    expect(result.isStreamingTool).toBe(true);
    expect(result.streamingTagName).toBe("create_file");
  });

  it("after auto-close via isSettled, isStreamingTool=false", () => {
    const raw =
      '<BDS:create_file fileName="test.py">```python\nx = 1\n```';
    const result = parseBdsMessage(raw, true);
    expect(result.isStreamingTool).toBe(false);
    expect(result.streamingTagName).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// [NEW] Integration: parseBdsMessage — content containing BDS-like text
// ═════════════════════════════════════════════════════════════════════════════
describe("parseBdsMessage — content containing BDS-like text", () => {
  it("handles file content that mentions <BDS:create_file> as literal text (position-based matching skips fake close tag)", () => {
    const raw =
      '<BDS:create_file fileName="about.md">```markdown\nUse `<BDS:create_file>` to create files.\nThen use `</BDS:create_file>` to close.\n```</BDS:create_file>';
    const result = parseBdsMessage(raw);
    expect(result.createFiles).toHaveLength(1);
    expect(result.createFiles[0].content).toBe(
      "Use `<BDS:create_file>` to create files.\nThen use `</BDS:create_file>` to close.\n",
    );
  });

  it("preserves file content that contains <BDS:LONG_WORK> as text", () => {
    const raw =
      '<BDS:create_file fileName="notes.md">```markdown\nWrap in `<BDS:LONG_WORK>` tags for multi-file projects.\n```</BDS:create_file>';
    const result = parseBdsMessage(raw);
    expect(result.createFiles).toHaveLength(1);
    expect(result.createFiles[0].content).toBe(
      "Wrap in `<BDS:LONG_WORK>` tags for multi-file projects.\n",
    );
  });

  it("does not confuse inner code fences in visibleText", () => {
    const raw =
      "Guide:\n<BDS:create_file fileName=\"guide.md\">```markdown\n# Title\n```js\ncode\n```\n## End\n```</BDS:create_file>\nDone.";
    const result = parseBdsMessage(raw);
    expect(result.createFiles).toHaveLength(1);
    expect(result.createFiles[0].content).toBe(
      "# Title\n```js\ncode\n```\n## End\n",
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// [NEW] Integration: parseBdsMessage — BDS tags inside code blocks (related to https://github.com/EdgeTypE/better-deepseek/issues/115)
// ═════════════════════════════════════════════════════════════════════════════
describe("parseBdsMessage — BDS tags inside code blocks (issue #115)", () => {
  it("ignores create_file inside fenced code block", () => {
    const raw =
      '```markdown\n<BDS:create_file fileName="x.py">```py\npass\n```</BDS:create_file>\n```';
    const result = parseBdsMessage(raw);
    expect(result.createFiles).toHaveLength(0);
    expect(result.containsControlTags).toBe(false);
  });

  it("ignores LONG_WORK inside fenced code block", () => {
    const raw =
      '```\n<BDS:LONG_WORK>content</BDS:LONG_WORK>\n```';
    const result = parseBdsMessage(raw);
    expect(result.longWorkOpen).toBe(false);
    expect(result.longWorkClose).toBe(false);
  });

  it("ignores BDS tags inside inline code", () => {
    const raw =
      'Use `<BDS:create_file>` to create files.';
    const result = parseBdsMessage(raw);
    expect(result.createFiles).toHaveLength(0);
  });

  it("processes real tags outside code blocks while ignoring fake ones inside", () => {
    const raw =
      'Text\n<BDS:create_file fileName="real.py">```py\nx=1\n```</BDS:create_file>\n```markdown\n<BDS:create_file fileName="fake.py">```py\ny=2\n```</BDS:create_file>\n```';
    const result = parseBdsMessage(raw);
    expect(result.createFiles).toHaveLength(1);
    expect(result.createFiles[0].fileName).toBe("real.py");
  });

  it("preserves BDS tag text inside code block in visibleText", () => {
    const raw =
      'Example:\n```markdown\n<BDS:create_file>\n```\nEnd.';
    const result = parseBdsMessage(raw);
    expect(result.visibleText).toContain("&lt;BDS:create_file>");
  });

  it("processes adjacent create_files correctly (regression: spurious inline range)", () => {
    const raw =
      '<BDS:create_file fileName="a.py">```py\nx=1\n```</BDS:create_file>' +
      '<BDS:create_file fileName="b.py">```py\ny=2\n```</BDS:create_file>';
    const result = parseBdsMessage(raw);
    expect(result.createFiles).toHaveLength(2);
    expect(result.createFiles[0].fileName).toBe("a.py");
    expect(result.createFiles[1].fileName).toBe("b.py");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// [NEW] Integration: parseBdsMessage — multiple diverse tag types
// ═════════════════════════════════════════════════════════════════════════════
describe("parseBdsMessage — multiple diverse tag types", () => {
  it("parses multiple create_file tags in one message", () => {
    const raw =
      '<BDS:create_file fileName="a.py">```\nx = 1\n```</BDS:create_file>' +
      '<BDS:create_file fileName="b.py">```\ny = 2\n```</BDS:create_file>';
    const result = parseBdsMessage(raw);
    expect(result.createFiles).toHaveLength(2);
    expect(result.createFiles[0].fileName).toBe("a.py");
    expect(result.createFiles[1].fileName).toBe("b.py");
  });

  it("parses create_file and renderable block side by side", () => {
    const raw =
      '<BDS:create_file fileName="data.json">```json\n{"key": "value"}\n```</BDS:create_file>' +
      '<BDS:html>```html\n<div>Preview</div>\n```</BDS:html>';
    const result = parseBdsMessage(raw);
    expect(result.createFiles).toHaveLength(1);
    expect(result.createFiles[0].fileName).toBe("data.json");
    expect(result.renderableBlocks).toHaveLength(1);
    expect(result.renderableBlocks[0].name).toBe("html");
  });

  it("sets containsControlTags for create_file tags", () => {
    const raw =
      '<BDS:create_file fileName="test.py">```\nx = 1\n```</BDS:create_file>';
    const result = parseBdsMessage(raw);
    expect(result.containsControlTags).toBe(true);
  });

  it("sets containsControlTags=true for auto web fetch tags (regex double-negative quirk)", () => {
    const raw = '<BDS:AUTO:REQUEST_WEB_FETCH>https://example.com</BDS:AUTO:REQUEST_WEB_FETCH>';
    const result = parseBdsMessage(raw);
    expect(result.containsControlTags).toBe(true);
  });

  it("sets containsControlTags=true for auto:code_runner", () => {
    const raw =
      '<BDS:AUTO:CODE_RUNNER language="py">```\nx = 1\n```</BDS:AUTO:CODE_RUNNER>';
    const result = parseBdsMessage(raw);
    expect(result.containsControlTags).toBe(true);
  });

  it("detects LONG_WORK open/close flags", () => {
    const raw =
      '<BDS:LONG_WORK><BDS:create_file fileName="x.py">```\npass\n```</BDS:create_file></BDS:LONG_WORK>';
    const result = parseBdsMessage(raw);
    expect(result.longWorkOpen).toBe(true);
    expect(result.longWorkClose).toBe(true);
  });

  it("sets longWorkOpen without longWorkClose when only opening tag exists", () => {
    const raw =
      '<BDS:LONG_WORK><BDS:create_file fileName="x.py">```\npass\n```</BDS:create_file>';
    const result = parseBdsMessage(raw, false);
    expect(result.longWorkOpen).toBe(true);
    expect(result.longWorkClose).toBe(false);
  });

  it("handles repeated same-type tags inside and outside LONG_WORK", () => {
    const raw =
      '<BDS:create_file fileName="pre.py">```\npre\n```</BDS:create_file>' +
      '<BDS:LONG_WORK><BDS:create_file fileName="inner.py">```\ninner\n```</BDS:create_file></BDS:LONG_WORK>' +
      '<BDS:create_file fileName="post.py">```\npost\n```</BDS:create_file>';
    const result = parseBdsMessage(raw);
    expect(result.createFiles).toHaveLength(3);
    expect(result.createFiles[0].fileName).toBe("pre.py");
    expect(result.createFiles[1].fileName).toBe("inner.py");
    expect(result.createFiles[2].fileName).toBe("post.py");
  });

  describe("ask_question — backslash escaping repair", () => {
    it("parses ask_question with Windows path containing backslash", () => {
      const raw = '<BDS:ask_question>[{"id":"q1","question":"Is path F:\\\\better-deepseek?","type":"input"}]</BDS:ask_question>';
      const result = parseBdsMessage(raw);
      expect(result.askQuestions).toHaveLength(1);
      expect(result.askQuestions[0].question).toBe("Is path F:\\better-deepseek?");
    });

    it("repairs ask_question JSON with unescaped backslash before b", () => {
      const raw = '<BDS:ask_question>[{"id":"q1","question":"F:\\better-deepseek?","type":"input"}]</BDS:ask_question>';
      const result = parseBdsMessage(raw);
      expect(result.askQuestions).toHaveLength(1);
      expect(result.askQuestions[0].question).toBe("F:\\better-deepseek?");
    });

    it("repairs ask_question JSON with invalid escape sequences", () => {
      const raw = '<BDS:ask_question>[{"id":"q1","question":"C:\\program files\\test","type":"input"}]</BDS:ask_question>';
      const result = parseBdsMessage(raw);
      expect(result.askQuestions).toHaveLength(1);
      expect(result.askQuestions[0].question).toBe("C:\\program files\\test");
    });

    it("renders ask_question as a renderable block when JSON is repairable", () => {
      const raw = '<BDS:ask_question>[{"id":"q1","question":"F:\\better?","type":"input"}]</BDS:ask_question>';
      const result = parseBdsMessage(raw);
      expect(result.renderableBlocks).toHaveLength(1);
      expect(result.renderableBlocks[0].name).toBe("ask_question");
    });
  });
});
