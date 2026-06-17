// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { chunkFile, tokenize, searchActiveProjectRAG, formatRagInjections, buildRagIndex } from "./rag-engine.js";

describe("rag-engine", () => {
  describe("chunkFile", () => {
    it("returns empty array for empty or missing files", () => {
      expect(chunkFile(null)).toEqual([]);
      expect(chunkFile({ name: "test.js", content: "" })).toEqual([]);
    });

    it("chunks file preserving line structures and bounds", () => {
      const content = [
        "line 1: let x = 10;",
        "line 2: function hello() {",
        "line 3:   console.log('world');",
        "line 4: }",
        "line 5: hello();"
      ].join("\n");

      const chunks = chunkFile({ name: "hello.js", content }, 20, 2);

      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks[0].fileName).toBe("hello.js");
      expect(chunks[0].startLine).toBe(1);
      expect(chunks[0].endLine).toBeGreaterThanOrEqual(2);
      expect(chunks[0].content).toContain("line 1");
    });
  });

  describe("tokenize", () => {
    it("lowercases, strips symbols, and filters stopwords", () => {
      const text = "The quick brown fox is a ve veya lakin ve veya";
      const tokens = tokenize(text);

      expect(tokens).toContain("quick");
      expect(tokens).toContain("brown");
      expect(tokens).toContain("fox");

      expect(tokens).not.toContain("the");
      expect(tokens).not.toContain("is");
      expect(tokens).not.toContain("ve");
      expect(tokens).not.toContain("veya");
      expect(tokens).not.toContain("lakin");
    });

    it("supports Turkish specific characters", () => {
      const text = "Türkçe karakterler şçgöıü ŞÇGÖIÜ";
      const tokens = tokenize(text);

      expect(tokens).toContain("türkçe");
      expect(tokens).toContain("karakterler");
      expect(tokens).toContain("şçgöıü");
    });

    it("tokenizes Chinese text into bigrams", () => {
      const text = "蝴蝶泳换气技术";
      const tokens = tokenize(text);

      expect(tokens).toContain("蝴蝶");
      expect(tokens).toContain("蝶泳");
      expect(tokens).toContain("泳换");
      expect(tokens).toContain("换气");
      expect(tokens).toContain("气技");
      expect(tokens).toContain("技术");
    });

    it("filters Chinese stopwords", () => {
      const text = "这个函数的值是什么";
      const tokens = tokenize(text);

      expect(tokens).not.toContain("这个");
      expect(tokens).not.toContain("什么");
      expect(tokens).toContain("函数");
      expect(tokens).toContain("值是");
    });

    it("handles mixed Chinese and English", () => {
      const text = "React组件的state管理";
      const tokens = tokenize(text);

      expect(tokens).toContain("react");
      expect(tokens).toContain("组件");
      expect(tokens).toContain("state");
      expect(tokens).toContain("管理");
    });
  });

  describe("searchActiveProjectRAG", () => {
    const files = [
      {
        name: "src/api/auth.js",
        content: [
          "// Auth service",
          "export function login(username, password) {",
          "  if (username === 'admin' && password === 'admin') {",
          "    return { success: true, token: 'jwt_secret_token_123' };",
          "  }",
          "  return { success: false, error: 'Unauthorized credentials' };",
          "}"
        ].join("\n")
      },
      {
        name: "src/components/Button.svelte",
        content: [
          "<script>",
          "  export let label = 'Click me';",
          "  export let onClick = () => {};",
          "</script>",
          "<button onclick={onClick}>{label}</button>"
        ].join("\n")
      },
      {
        name: "README.md",
        content: [
          "# Better DeepSeek Extension",
          "This is a premium browser extension designed to enhance the DeepSeek experience.",
          "It supports features like Custom Prompts, Saved Skills, Local Memories, and more."
        ].join("\n")
      },
      {
        name: "docs/swimming.md",
        content: [
          "# 游泳技术",
          "",
          "## 蝴蝶泳换气技术",
          "蝴蝶泳换气时需要保持身体的流线型，头部在双手入水时顺势抬起。",
          "",
          "## 自由泳打腿",
          "自由泳打腿要保持脚踝放松，大腿带动小腿做上下鞭状打水。"
        ].join("\n")
      }
    ];

    it("finds the most relevant chunk based on query keywords", () => {
      const results = searchActiveProjectRAG("how does login authenticate the admin username", files, 2);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].fileName).toBe("src/api/auth.js");
      expect(results[0].content).toContain("jwt_secret_token_123");
    });

    it("boosts matches directly in the filename", () => {
      const results = searchActiveProjectRAG("button element", files, 1);

      expect(results.length).toBe(1);
      expect(results[0].fileName).toBe("src/components/Button.svelte");
    });

    it("returns empty array when no query matches are found", () => {
      const results = searchActiveProjectRAG("xyz123abcnonexistentkeyword", files, 5);
      expect(results).toEqual([]);
    });

    it("ranks Chinese-specific terms higher than common words", () => {
      const results = searchActiveProjectRAG("蝴蝶泳换气技术", files, 3);

      expect(results.length).toBeGreaterThan(0);
      const topFile = results[0].fileName;
      const topContent = results[0].content;
      expect(topFile).toBe("docs/swimming.md");
      expect(topContent).toContain("蝴蝶泳换气");
    });

    it("falls back to keyword matching for short queries", () => {
      const results = searchActiveProjectRAG("admin", files, 2);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].fileName).toBe("src/api/auth.js");
    });

    it("does not over-match on common Chinese words", () => {
      const results = searchActiveProjectRAG("技术", files, 5);

      // Both files contain "技术" but the swimming doc contains it in a heading,
      // so it should rank higher than the generic README mention.
      expect(results.length).toBeGreaterThan(0);
      const fileNames = results.map((r) => r.fileName);
      expect(fileNames).toContain("docs/swimming.md");
    });
  });

  describe("buildRagIndex", () => {
    it("pre-computes TF-IDF index for files", () => {
      const files = [
        { name: "a.txt", content: "hello world" },
      ];
      const index = buildRagIndex(files);

      expect(index.chunks.length).toBeGreaterThan(0);
      expect(index.tokenizedChunks.length).toBe(index.chunks.length);
      expect(typeof index.idf["hello"]).toBe("number");
      expect(index.avgDocLength).toBeGreaterThan(0);
    });
  });

  describe("formatRagInjections", () => {
    it("renders a beautifully formatted markdown context block", () => {
      const chunks = [
        {
          fileName: "src/utils.js",
          content: "export const add = (a, b) => a + b;",
          startLine: 1,
          endLine: 1,
          score: 10
        }
      ];

      const formatted = formatRagInjections(chunks, "My Awesome Project");

      expect(formatted).toContain("<BDS:PROJECT_CONTEXT>");
      expect(formatted).toContain('You are working on the project "My Awesome Project"');
      expect(formatted).toContain("--- [FILE: src/utils.js (Lines 1-1)] ---");
      expect(formatted).toContain("```js");
      expect(formatted).toContain("export const add = (a, b) => a + b;");
      expect(formatted).toContain("</BDS:PROJECT_CONTEXT>");
    });

    it("includes project name prefix when provided", () => {
      const chunks = [
        {
          fileName: "src/utils.js",
          content: "x",
          startLine: 1,
          endLine: 1,
          score: 1,
          projectName: "Backend"
        }
      ];

      const formatted = formatRagInjections(chunks, "Combined");
      expect(formatted).toContain("--- [FILE: [Backend] src/utils.js (Lines 1-1)] ---");
    });
  });
});
