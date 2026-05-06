// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import MessageOverlay from "../../../src/content/ui/MessageOverlay.svelte";
import { renderSvelte, flushUi } from "../../helpers/svelte.js";

describe("MessageOverlay integration", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("renders markdown text, ask-question info, and loading state", async () => {
    const { target, cleanup } = renderSvelte(MessageOverlay, {
      text: "# Heading\n\nParagraph",
      blocks: [{ name: "ask_question", content: "[]", attrs: {} }],
      loading: true,
      loadingIndex: 2,
    });
    await flushUi();

    expect(target.querySelector("h1")?.textContent).toBe("Heading");
    expect(target.textContent).toContain("Clarifying questions asked.");
    expect(target.textContent).toContain("Working...");
    cleanup();
  });
});
