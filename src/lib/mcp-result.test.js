import { describe, expect, it } from "vitest";
import { extractMcpResultText } from "./mcp-result.js";

describe("extractMcpResultText", () => {
  it("joins plain text parts", () => {
    expect(
      extractMcpResultText({
        content: [{ type: "text", text: "first" }, { type: "text", text: "second" }],
      }),
    ).toBe("first\nsecond");
  });

  it("reads the body of an embedded resource (issue #146)", () => {
    // GitHub MCP returns get_file_contents this way: the confirmation text sits
    // in `text`, the file body in `resource.text`.
    const result = {
      content: [
        { type: "text", text: "successfully downloaded text file (SHA: abc123)" },
        {
          type: "resource",
          resource: {
            uri: "repo://owner/name/sha/README.md",
            mimeType: "text/markdown",
            text: "# Title\n\nBody",
          },
        },
      ],
    };

    expect(extractMcpResultText(result)).toBe(
      "successfully downloaded text file (SHA: abc123)\n# Title\n\nBody",
    );
  });

  it("returns the resource body when it is the only content part", () => {
    expect(
      extractMcpResultText({
        content: [
          { type: "resource", resource: { uri: "repo://a/b", text: "file body" } },
        ],
      }),
    ).toBe("file body");
  });

  it("labels a binary resource instead of dropping it", () => {
    expect(
      extractMcpResultText({
        content: [
          {
            type: "resource",
            resource: { uri: "repo://a/logo.png", mimeType: "image/png", blob: "aGk=" },
          },
        ],
      }),
    ).toBe("[binary resource: repo://a/logo.png (image/png)]");
  });

  it("labels image and audio parts instead of dropping them", () => {
    expect(
      extractMcpResultText({
        content: [
          { type: "image", data: "aGk=", mimeType: "image/png" },
          { type: "audio", data: "aGk=", mimeType: "audio/wav" },
        ],
      }),
    ).toBe("[image: image/png]\n[audio: audio/wav]");
  });

  it("labels resource links", () => {
    expect(
      extractMcpResultText({
        content: [{ type: "resource_link", uri: "repo://a/b", name: "b" }],
      }),
    ).toBe("[resource link: repo://a/b]");
  });

  it("falls back to the uri when a resource carries no text or blob", () => {
    expect(
      extractMcpResultText({
        content: [{ type: "resource", resource: { uri: "repo://a/empty" } }],
      }),
    ).toBe("[resource: repo://a/empty]");
  });

  it("marks application-level tool errors", () => {
    expect(
      extractMcpResultText({
        isError: true,
        content: [{ type: "text", text: "path does not exist" }],
      }),
    ).toBe("MCP tool reported an error:\npath does not exist");
  });

  it("marks an error result that carries no content", () => {
    expect(extractMcpResultText({ isError: true, content: [] })).toBe(
      "MCP tool reported an error.",
    );
  });

  it("passes through a result without a content array", () => {
    expect(extractMcpResultText({ structuredContent: { ok: true } })).toBe(
      '{"structuredContent":{"ok":true}}',
    );
  });

  it("returns an empty string for nullish results", () => {
    // Previously JSON.stringify(undefined) produced `undefined`, and the caller
    // read `.length` off it.
    expect(extractMcpResultText(undefined)).toBe("");
    expect(extractMcpResultText(null)).toBe("");
  });

  it("ignores malformed content entries", () => {
    expect(
      extractMcpResultText({ content: [null, "text", { type: "text", text: "kept" }] }),
    ).toBe("kept");
  });
});
