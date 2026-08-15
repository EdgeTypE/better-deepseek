import { describe, expect, it } from "vitest";
import {
  isAutoLinkArtifact,
  stripAutoLinkArtifacts,
} from "./link-artifacts.js";

describe("stripAutoLinkArtifacts", () => {
  it("collapses sentinel autolinks to plain text", () => {
    expect(stripAutoLinkArtifacts("├── [main.rs](https_main.rs)")).toBe(
      "├── main.rs",
    );
  });

  it("collapses bare-domain autolinks with a trailing slash", () => {
    expect(stripAutoLinkArtifacts("[main.rs](https://main.rs/)")).toBe("main.rs");
    expect(stripAutoLinkArtifacts("[main.rs](https://www.main.rs)")).toBe("main.rs");
  });

  it("preserves real links pointing at a path on a matching host", () => {
    expect(
      stripAutoLinkArtifacts("[main.rs](https://main.rs/foo)"),
    ).toBe("[main.rs](https://main.rs/foo)");
    expect(
      stripAutoLinkArtifacts("[github.com](https://github.com/acme/repo)"),
    ).toBe("[github.com](https://github.com/acme/repo)");
  });

  it("preserves real links with distinct text", () => {
    expect(
      stripAutoLinkArtifacts("see [DeepSeek](https://chat.deepseek.com)"),
    ).toBe("see [DeepSeek](https://chat.deepseek.com)");
  });

  it("is idempotent", () => {
    const input = "├── [main.rs](https_main.rs)";
    expect(stripAutoLinkArtifacts(stripAutoLinkArtifacts(input))).toBe(
      stripAutoLinkArtifacts(input),
    );
  });
});

describe("isAutoLinkArtifact", () => {
  it("treats sentinel hrefs as artifacts", () => {
    expect(isAutoLinkArtifact("main.rs", "https_main.rs")).toBe(true);
  });

  it("treats href-less links as artifacts", () => {
    expect(isAutoLinkArtifact("main.rs", "")).toBe(true);
    expect(isAutoLinkArtifact("main.rs", "#")).toBe(true);
  });

  it("collapses bare-domain links with no path", () => {
    expect(isAutoLinkArtifact("main.rs", "https://main.rs")).toBe(true);
    expect(isAutoLinkArtifact("main.rs", "https://main.rs/")).toBe(true);
    expect(isAutoLinkArtifact("main.rs", "https://www.main.rs")).toBe(true);
  });

  it("preserves real links pointing at a path on a matching host", () => {
    expect(
      isAutoLinkArtifact(
        "github.com",
        "https://github.com/acme/repo/blob/main.rs",
      ),
    ).toBe(false);
  });

  it("preserves real links with distinct text", () => {
    expect(isAutoLinkArtifact("DeepSeek docs", "https://chat.deepseek.com")).toBe(
      false,
    );
  });
});