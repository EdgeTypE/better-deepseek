// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import QuestionPanel from "../../../src/content/ui/QuestionPanel.svelte";
import { resetAppState } from "../../helpers/app-state.js";
import { renderSvelte, flushUi } from "../../helpers/svelte.js";

describe("QuestionPanel integration", () => {
  beforeEach(() => {
    resetAppState({
      ui: { showToast: vi.fn() },
    });
    document.body.innerHTML = `
      <div class="ds-textarea">
        <textarea id="chat-input"></textarea>
      </div>
      <button title="Send message"></button>
    `;
    document.querySelector("button").click = vi.fn();
    vi.useFakeTimers();
  });

  it("renders questions, supports keyboard selection, and submits answers", async () => {
    const { target, cleanup } = renderSvelte(QuestionPanel);
    await flushUi();

    window.dispatchEvent(
      new CustomEvent("bds-ask-questions", {
        detail: {
          questions: [
            {
              id: "q1",
              question: "Pick one",
              type: "test",
              options: ["Alpha", "Beta"],
            },
          ],
        },
      }),
    );
    await vi.advanceTimersByTimeAsync(150);
    await flushUi();

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await vi.advanceTimersByTimeAsync(700);

    expect(document.querySelector("#chat-input").value).toContain("Beta");
    expect(document.querySelector("button").click).toHaveBeenCalled();
    cleanup();
  });
});
