// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import FileReadResultCard from "../../../src/content/ui/FileReadResultCard.svelte";
import DirectorySearchResultCard from "../../../src/content/ui/DirectorySearchResultCard.svelte";
import MessageOverlay from "../../../src/content/ui/MessageOverlay.svelte";
import { renderSvelte, flushUi } from "../../helpers/svelte.js";

describe("DeepCode Renderable Cards", () => {
  describe("FileReadResultCard", () => {
    it("renders successful file read card with metadata and code content", async () => {
      const code = "import express from 'express';\nconst app = express();\napp.listen(3000);";
      const { target, cleanup } = renderSvelte(FileReadResultCard, {
        path: "src/server/index.js",
        fileName: "index.js",
        linesCount: 3,
        success: true,
        content: code
      });
      await flushUi();

      const card = target.querySelector(".bds-file-read-card");
      expect(card).toBeTruthy();
      expect(target.querySelector(".bds-file-name").textContent).toBe("index.js");
      expect(target.querySelector(".bds-file-path").textContent).toBe("src/server/index.js");
      expect(target.querySelector(".bds-lines-badge").textContent).toContain("3");
      expect(target.querySelector(".bds-code-block").textContent).toContain("import express");

      // Toggle content visibility
      const toggleBtn = target.querySelector(".bds-btn-toggle");
      expect(toggleBtn).toBeTruthy();
      toggleBtn.click();
      await flushUi();
      expect(target.querySelector(".bds-code-block")).toBeNull();

      cleanup();
    });

    it("renders error file read card when file is not found", async () => {
      const { target, cleanup } = renderSvelte(FileReadResultCard, {
        path: "missing/file.txt",
        success: false,
        error: "File was not found in the active codebase directory."
      });
      await flushUi();

      const card = target.querySelector(".bds-file-read-card.bds-file-error");
      expect(card).toBeTruthy();
      expect(target.querySelector(".bds-file-error-msg").textContent).toContain("not found");
      expect(target.querySelector(".bds-file-actions")).toBeNull();

      cleanup();
    });
  });

  describe("DirectorySearchResultCard", () => {
    it("renders directory search results with matches and line numbers", async () => {
      const sampleResults = [
        {
          fileName: "src/auth/jwt.js",
          startLine: 10,
          endLine: 25,
          score: 0.92,
          content: "export function verifyToken(token) {\n  return jwt.verify(token, SECRET);\n}"
        },
        {
          fileName: "src/routes/api.js",
          startLine: 40,
          endLine: 50,
          score: 0.78,
          content: "router.use(verifyToken);"
        }
      ];

      const { target, cleanup } = renderSvelte(DirectorySearchResultCard, {
        query: "jwt token verification",
        count: 2,
        results: sampleResults
      });
      await flushUi();

      const card = target.querySelector(".bds-dir-search-card");
      expect(card).toBeTruthy();
      expect(target.querySelector(".bds-dir-search-title").textContent).toContain("jwt token verification");
      expect(target.querySelector(".bds-dir-search-subtitle").textContent).toContain("2");

      const entries = target.querySelectorAll(".bds-dir-entry");
      expect(entries.length).toBe(2);

      // First entry is expanded by default
      expect(target.querySelector(".bds-dir-code-block").textContent).toContain("export function verifyToken");
      expect(target.querySelector(".bds-dir-line-badge").textContent).toBe("L10-25");
      expect(target.querySelector(".bds-dir-score-badge").textContent).toBe("92% score");

      cleanup();
    });

    it("renders multi-query search results with query badges", async () => {
      const sampleResults = [
        {
          query: "dsh",
          fileName: "packages/core/src/index.ts",
          startLine: 1,
          endLine: 15,
          score: 0.85,
          content: "export * from './dsh';"
        },
        {
          query: "better-deepseek",
          fileName: "packages/extensions/better-deepseek/package.json",
          startLine: 1,
          endLine: 10,
          score: 0.95,
          content: "{\n  \"name\": \"dsh-better-deepseek\"\n}"
        }
      ];

      const { target, cleanup } = renderSvelte(DirectorySearchResultCard, {
        query: "dsh, DeepSeek Harness, harness, better-deepseek",
        count: 2,
        results: sampleResults
      });
      await flushUi();

      const card = target.querySelector(".bds-dir-search-card");
      expect(card).toBeTruthy();
      const badges = target.querySelectorAll(".bds-dir-query-badge");
      expect(badges.length).toBe(2);
      expect(badges[0].textContent).toBe("dsh");
      expect(badges[1].textContent).toBe("better-deepseek");

      cleanup();
    });

    it("renders empty state or error message gracefully", async () => {
      const { target, cleanup } = renderSvelte(DirectorySearchResultCard, {
        query: "nonexistent query",
        count: 0,
        results: []
      });
      await flushUi();

      expect(target.querySelector(".bds-dir-search-empty")).toBeTruthy();

      cleanup();
    });
  });

  describe("MessageOverlay Integration", () => {
    it("renders auto:file_read request card and auto_file_read_result card", async () => {
      const blocks = [
        {
          name: "auto:file_read",
          attrs: { path: "src/App.svelte" },
          content: "src/App.svelte"
        },
        {
          name: "auto_file_read_result",
          attrs: { path: "src/App.svelte", fileName: "App.svelte", linesCount: 20, success: true },
          content: "<script>\n  let count = $state(0);\n</script>"
        }
      ];

      const { target, cleanup } = renderSvelte(MessageOverlay, {
        text: "Here is the inspection result: \x00BLOCK:0\x00 \x00BLOCK:1\x00",
        blocks: blocks
      });
      await flushUi();

      expect(target.querySelector(".bds-file-read-card")).toBeTruthy();
      expect(target.querySelector(".bds-file-read-icon")).toBeTruthy();
      expect(target.querySelector(".bds-code-block").textContent).toContain("let count");

      cleanup();
    });

    it("renders auto:search_in_directory request card and auto_directory_search_result card", async () => {
      const blocks = [
        {
          name: "auto:search_in_directory",
          attrs: { queries: "handleLogin authentication" },
          content: "handleLogin authentication"
        },
        {
          name: "auto_directory_search_result",
          attrs: { query: "handleLogin authentication", count: "1" },
          content: JSON.stringify([
            { fileName: "src/auth.js", startLine: 5, endLine: 15, score: 0.95, content: "function handleLogin() {}" }
          ])
        }
      ];

      const { target, cleanup } = renderSvelte(MessageOverlay, {
        text: "Searching codebase: \x00BLOCK:0\x00 \x00BLOCK:1\x00",
        blocks: blocks
      });
      await flushUi();

      expect(target.querySelector(".bds-dir-search-info-card")).toBeTruthy();
      expect(target.querySelector(".bds-dir-search-card")).toBeTruthy();
      expect(target.querySelector(".bds-dir-entry-file").textContent).toBe("src/auth.js");

      cleanup();
    });

    it("renders auto:list_dir request card and auto_dir_list_result card", async () => {
      const blocks = [
        {
          name: "auto:list_dir",
          attrs: { path: "src/components" },
          content: "src/components"
        },
        {
          name: "auto_dir_list_result",
          attrs: { path: "src/components", childCount: "2" },
          content: JSON.stringify([
            { name: "utils/", type: "dir" },
            { name: "main.js", type: "file" }
          ])
        }
      ];

      const { target, cleanup } = renderSvelte(MessageOverlay, {
        text: "Listing directory: \x00BLOCK:0\x00 \x00BLOCK:1\x00",
        blocks: blocks
      });
      await flushUi();

      expect(target.querySelector(".bds-dir-list-info-card")).toBeTruthy();
      expect(target.querySelector(".bds-dir-list-card")).toBeTruthy();
      expect(target.querySelector(".bds-dir-list-title").textContent).toContain("src/components");
      expect(target.querySelector(".bds-dir-list-entry-dir .bds-dir-list-entry-name").textContent).toBe("utils/");
      const fileEntry = target.querySelector(".bds-dir-list-entry:not(.bds-dir-list-entry-dir) .bds-dir-list-entry-name");
      expect(fileEntry.textContent).toBe("main.js");

      cleanup();
    });
  });
});
