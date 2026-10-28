// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const autoMocks = vi.hoisted(() => ({
  injectPureTextAndSend: vi.fn(),
}));

vi.mock("../../../src/content/auto.js", () => autoMocks);

import Autocomplete from "../../../src/content/commands/Autocomplete.svelte";
import state from "../../../src/content/state.js";
import { resetAppState } from "../../helpers/app-state.js";
import { renderSvelte, flushUi } from "../../helpers/svelte.js";

let view = null;
let editor = null;

function type(value, caret = value.length) {
  editor.value = value;
  editor.setSelectionRange(caret, caret);
  editor.dispatchEvent(new Event("input", { bubbles: true }));
}

function press(key) {
  editor.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
}

function dropdown() {
  return document.querySelector(".bds-cmd-dropdown");
}

function dropdownNames() {
  return Array.from(document.querySelectorAll(".bds-cmd-name")).map((el) => el.textContent);
}

async function setup() {
  editor = document.createElement("textarea");
  document.body.appendChild(editor);
  view = renderSvelte(Autocomplete, { editor });
  await flushUi();
}

describe("command autocomplete", () => {
  beforeEach(async () => {
    resetAppState();
    state.skills = [
      { id: "s1", name: "translate", usage: "i18n", content: "T", active: true },
      { id: "s2", name: "code review", usage: "", content: "CR", active: false },
    ];
    document.body.innerHTML = "";
    await setup();
  });

  afterEach(() => {
    view?.cleanup();
    view = null;
    editor = null;
  });

  it("opens on / at the start of the message", async () => {
    type("/he");
    await flushUi();
    expect(dropdown()).not.toBeNull();
  });

  it("opens on @ anywhere in the message", async () => {
    type("please @tra");
    await flushUi();

    expect(dropdown()).not.toBeNull();
    expect(dropdownNames()).toContain("@translate");
  });

  it("does not open on an @ glued to a word", async () => {
    type("mail@tra");
    await flushUi();
    expect(dropdown()).toBeNull();
  });

  it("keeps matching across spaces in a skill name", async () => {
    type("@code re");
    await flushUi();

    expect(dropdownNames()).toContain("@code review");
  });

  it("inserts the mention at the caret and closes", async () => {
    type("hi @tra");
    await flushUi();

    press("Enter");
    await flushUi();

    expect(editor.value).toBe("hi @translate ");
    expect(dropdown()).toBeNull();
    expect(editor.selectionStart).toBe("hi @translate ".length);
  });

  it("does not send the message while the mention menu is open", async () => {
    type("@tra");
    await flushUi();

    const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    editor.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(autoMocks.injectPureTextAndSend).not.toHaveBeenCalled();
  });

  it("closes once the mention is complete", async () => {
    type("@translate take this");
    await flushUi();
    expect(dropdown()).toBeNull();
  });
});
