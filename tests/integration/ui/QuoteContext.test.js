// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const scannerMocks = vi.hoisted(() => ({
  detectMessageRole: vi.fn(),
}));

vi.mock("../../../src/content/scanner.js", () => scannerMocks);
vi.mock("../../../src/lib/i18n.svelte.js", () => ({
  t: (key) => key,
}));

import QuoteContext from "../../../src/content/ui/QuoteContext.svelte";
import appState from "../../../src/content/state.js";
import { BRIDGE_EVENTS } from "../../../src/lib/constants.js";
import { resetAppState } from "../../helpers/app-state.js";
import { renderSvelte, flushUi } from "../../helpers/svelte.js";

/** jsdom does no layout, so the popup anchor has to be faked. */
function stubRangeLayout() {
  Range.prototype.getClientRects = () => [];
  Range.prototype.getBoundingClientRect = () => ({
    left: 120,
    top: 240,
    right: 220,
    bottom: 258,
    width: 100,
    height: 18,
    x: 120,
    y: 240,
    toJSON() {},
  });
}

function buildAnswer(text = "Retries are capped at three, then the job is dropped.") {
  const message = document.createElement("div");
  message.className = "ds-message";

  const body = document.createElement("div");
  body.className = "ds-markdown";
  body.textContent = text;

  message.appendChild(body);
  document.body.appendChild(message);
  return { message, body };
}

function select(node) {
  const range = document.createRange();
  range.selectNodeContents(node);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

/** The card is always mounted; only the `--hidden` class tells it apart. */
function visibleCard() {
  const el = document.querySelector(".bds-quote-context");
  if (!el || el.classList.contains("bds-quote-context--hidden")) return null;
  return el;
}

/** Mount and let `onMount` register its listeners before any selection. */
async function render() {
  const handle = renderSvelte(QuoteContext);
  await flushUi();
  return handle;
}

async function releaseMouse() {
  document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  // The component defers the read by a tick so the browser can settle.
  await new Promise((resolve) => setTimeout(resolve, 0));
  await flushUi();
}

describe("QuoteContext", () => {
  let view;

  beforeEach(() => {
    resetAppState({ quoteContext: null });
    document.body.innerHTML = "";
    stubRangeLayout();
    scannerMocks.detectMessageRole.mockReturnValue("assistant");
  });

  afterEach(() => {
    view?.cleanup();
    view = null;
    document.body.innerHTML = "";
    window.getSelection()?.removeAllRanges();
  });

  it("offers the popup when an answer is selected", async () => {
    view = await render();
    const { body } = buildAnswer();

    select(body);
    await releaseMouse();

    expect(document.querySelector(".bds-quote-add")).not.toBeNull();
  });

  it("ignores selections inside Better DeepSeek's own UI", async () => {
    view = await render();

    const root = document.createElement("div");
    root.id = "bds-root";
    const panel = document.createElement("div");
    panel.textContent = "Settings copy";
    root.appendChild(panel);
    document.body.appendChild(root);

    select(panel);
    await releaseMouse();

    expect(document.querySelector(".bds-quote-add")).toBeNull();
  });

  it("ignores selections in the user's own messages", async () => {
    scannerMocks.detectMessageRole.mockReturnValue("user");
    view = await render();
    const { body } = buildAnswer("my own question");

    select(body);
    await releaseMouse();

    expect(document.querySelector(".bds-quote-add")).toBeNull();
  });

  it("shows the excerpt as a card and sends it to the page", async () => {
    view = await render();
    const { body } = buildAnswer();

    const sent = vi.fn();
    window.addEventListener(BRIDGE_EVENTS.quoteContext, sent);

    select(body);
    await releaseMouse();
    document.querySelector(".bds-quote-add").click();
    await flushUi();

    const card = visibleCard();
    expect(card).not.toBeNull();
    expect(card.textContent).toContain("Retries are capped at three");
    expect(appState.quoteContext?.text).toContain("Retries are capped at three");
    expect(document.querySelector(".bds-quote-add")).toBeNull();

    const detail = JSON.parse(sent.mock.calls.at(-1)[0].detail);
    expect(detail.text).toContain("Retries are capped at three");

    window.removeEventListener(BRIDGE_EVENTS.quoteContext, sent);
  });

  it("clears the card once the request has consumed the excerpt", async () => {
    view = await render();
    const { body } = buildAnswer();

    select(body);
    await releaseMouse();
    document.querySelector(".bds-quote-add").click();
    await flushUi();
    expect(visibleCard()).not.toBeNull();

    window.dispatchEvent(new CustomEvent(BRIDGE_EVENTS.quoteContextConsumed));
    await flushUi();

    expect(visibleCard()).toBeNull();
    expect(appState.quoteContext).toBeNull();
  });

  it("withdraws the excerpt from the page when the card is removed", async () => {
    view = await render();
    const { body } = buildAnswer();

    select(body);
    await releaseMouse();
    document.querySelector(".bds-quote-add").click();
    await flushUi();

    const sent = vi.fn();
    window.addEventListener(BRIDGE_EVENTS.quoteContext, sent);
    document.querySelector(".bds-quote-remove").click();
    await flushUi();

    expect(visibleCard()).toBeNull();
    expect(JSON.parse(sent.mock.calls.at(-1)[0].detail).text).toBe("");

    window.removeEventListener(BRIDGE_EVENTS.quoteContext, sent);
  });

  it("parks the card inside the composer so it never floats over the chat", async () => {
    const composer = document.createElement("div");
    composer.className = "ds-textarea";
    const textarea = document.createElement("textarea");
    textarea.id = "chat-input";
    composer.appendChild(textarea);
    document.body.appendChild(composer);

    view = await render();
    await flushUi();

    expect(composer.firstElementChild).toBe(document.querySelector(".bds-quote-context"));
  });

  it("never submits the composer form its buttons live in", async () => {
    const form = document.createElement("form");
    const composer = document.createElement("div");
    composer.className = "ds-textarea";
    const textarea = document.createElement("textarea");
    textarea.id = "chat-input";
    composer.appendChild(textarea);
    form.appendChild(composer);
    document.body.appendChild(form);

    const submitted = vi.fn((event) => event.preventDefault());
    form.addEventListener("submit", submitted);

    view = await render();
    const { body } = buildAnswer();
    select(body);
    await releaseMouse();
    document.querySelector(".bds-quote-add").click();
    await flushUi();

    // Both card buttons sit inside the form, where a bare <button> is a submit.
    document.querySelector(".bds-quote-excerpt").click();
    await flushUi();
    document.querySelector(".bds-quote-remove").click();
    await flushUi();

    expect(submitted).not.toHaveBeenCalled();
  });
});
