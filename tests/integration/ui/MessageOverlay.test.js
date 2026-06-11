// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import MessageOverlay from "../../../src/content/ui/MessageOverlay.svelte";
import appState from "../../../src/content/state.js";
import { renderSvelte, flushUi } from "../../helpers/svelte.js";

describe("MessageOverlay integration", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    appState.deepResearch.enabled = false;
    appState.deepResearch.pendingRun = null;
    appState.deepResearch.runs = [];
  });

  it("renders markdown text, ask-question info, and loading state", async () => {
    const questions = [
      { id: "q1", question: "Pick one", type: "test", options: ["A", "B"] }
    ];
    const { target, cleanup } = renderSvelte(MessageOverlay, {
      text: "# Heading\n\nParagraph",
      blocks: [{ name: "ask_question", content: JSON.stringify(questions), attrs: {} }],
      loading: true,
      loadingIndex: 2,
    });
    await flushUi();

    expect(target.querySelector("h1")?.textContent).toBe("Heading");
    expect(target.textContent).toContain("Clarifying questions asked.");
    expect(target.textContent).toContain("Pick one");
    expect(target.textContent).toContain("A");
    expect(target.textContent).toContain("B");
    expect(target.textContent).toContain("Working...");
    cleanup();
  });

  it("shows answers when bds-questions-answered event fires", async () => {
    const questions = [
      { id: "q1", question: "Pick one", type: "test", options: ["A", "B"] }
    ];
    const { target, cleanup } = renderSvelte(MessageOverlay, {
      blocks: [{ name: "ask_question", content: JSON.stringify(questions), attrs: {} }],
    });
    await flushUi();

    window.dispatchEvent(new CustomEvent("bds-questions-answered", {
      detail: { questions, answers: { q1: "A" } }
    }));
    await flushUi();

    expect(target.textContent).toContain("→ A");
    cleanup();
  });

  it("collapses outer by default when multiple questions", async () => {
    const questions = [
      { id: "q1", question: "First", type: "test" },
      { id: "q2", question: "Second", type: "input" }
    ];
    const { target, cleanup } = renderSvelte(MessageOverlay, {
      blocks: [{ name: "ask_question", content: JSON.stringify(questions), attrs: {} }],
    });
    await flushUi();

    expect(target.textContent).toContain("Clarifying questions asked.");
    expect(target.textContent).toContain("(2)");
    expect(target.textContent).not.toContain("First");
    expect(target.textContent).not.toContain("Second");
    cleanup();
  });

  it("renders deep research plan blocks and dispatches approval", async () => {
    const plan = {
      title: "Gaming Laptop Research",
      steps: [{ id: 1, action: "search", query: "best gaming laptop", purpose: "overview" }],
    };
    const listener = vi.fn();
    window.addEventListener("bds:deep-research-approve", listener, { once: true });
    appState.deepResearch.enabled = true;
    appState.deepResearch.runs = [{
      id: "run123",
      conversationId: "conv1",
      status: "planning",
      plan,
      sourceLedger: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }];

    const { target, cleanup } = renderSvelte(MessageOverlay, {
      blocks: [{
        name: "deep_research_plan",
        attrs: { runId: "run123" },
        content: JSON.stringify(plan),
      }],
    });
    await flushUi();

    expect(target.textContent).toContain("Gaming Laptop Research");
    expect(target.textContent).toContain("best gaming laptop");
    target.querySelector('[data-testid="dr-approve-btn"]').click();

    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0][0].detail.runId).toBe("run123");
    expect(listener.mock.calls[0][0].detail.plan.title).toBe("Gaming Laptop Research");
    cleanup();
  });

  it("dispatches deep research revision feedback for request changes", async () => {
    const plan = {
      title: "Gaming Laptop Research",
      steps: [{ id: 1, action: "search", query: "best gaming laptop", purpose: "overview" }],
    };
    const listener = vi.fn();
    window.addEventListener("bds:deep-research-revise", listener, { once: true });
    appState.deepResearch.enabled = true;
    appState.deepResearch.runs = [{
      id: "run-revise",
      conversationId: "conv1",
      status: "planning",
      plan,
      sourceLedger: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }];

    const { target, cleanup } = renderSvelte(MessageOverlay, {
      blocks: [{
        name: "deep_research_plan",
        attrs: { runId: "run-revise" },
        content: JSON.stringify(plan),
      }],
    });
    await flushUi();

    target.querySelector('[data-testid="dr-revise-btn"]').click();
    await flushUi();
    const input = target.querySelector('[data-testid="dr-feedback-input"]');
    input.value = "Add warranty and seller reputation checks.";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await flushUi();
    target.querySelector('[data-testid="dr-submit-feedback-btn"]').click();

    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0][0].detail.runId).toBe("run-revise");
    expect(listener.mock.calls[0][0].detail.feedback).toBe("Add warranty and seller reputation checks.");
    expect(listener.mock.calls[0][0].detail.plan.title).toBe("Gaming Laptop Research");
    cleanup();
  });
});
