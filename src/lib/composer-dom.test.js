// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import {
  isBdsInjectedControl,
  isNativeComposerModeToggle,
} from "./composer-dom.js";

function mount(html) {
  document.body.innerHTML = html;
  return document.body.firstElementChild;
}

describe("composer-dom", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("treats injected controls and their mount wrappers as BDS-owned", () => {
    const chip = mount(
      `<div class="bds-deep-research-toggle ds-toggle-button"><svg></svg></div>`,
    );
    expect(isBdsInjectedControl(chip)).toBe(true);

    mount(`<div class="bds-deep-code-mount"><button id="inner"><svg></svg></button></div>`);
    expect(isBdsInjectedControl(document.querySelector("#inner"))).toBe(true);

    mount(`<div id="composer"><button id="native"><svg></svg></button></div>`);
    expect(isBdsInjectedControl(document.querySelector("#native"))).toBe(false);
    expect(isBdsInjectedControl(null)).toBe(false);
  });

  it("matches a native Lottie mode chip regardless of its label", () => {
    const chip = mount(`<div tabindex="0" aria-pressed="false" class="f79352dc ds-toggle-button ds-toggle-button--m">
      <div class="ds-toggle-button__icon"><div class="ds-icon">
        <div class="ds-lottie-toggle-icon" aria-hidden="true">
          <svg viewBox="0 0 16 16"><path d=" M8,6.769999980926514 C8.678836822509766,7.321163177490234"></path></svg>
        </div>
      </div></div>
      <span>Derin Düşünme</span>
    </div>`);

    expect(isNativeComposerModeToggle(chip)).toBe(true);
  });

  it("rejects bare toggles, injected chips and non-toggles", () => {
    // Same class, no icon: not a composer mode chip.
    expect(isNativeComposerModeToggle(mount(`<div class="ds-toggle-button"></div>`))).toBe(false);

    // Our own chips carry the native classes for styling.
    expect(
      isNativeComposerModeToggle(
        mount(`<div class="bds-deep-code-toggle ds-toggle-button">
          <div class="ds-toggle-button__icon"><svg></svg></div>
        </div>`),
      ),
    ).toBe(false);

    // A chip nested inside a BDS mount wrapper is ours too.
    expect(
      isNativeComposerModeToggle(
        (mount(`<div class="bds-deep-research-mount"><div class="ds-toggle-button"><svg></svg></div></div>`),
          document.querySelector(".ds-toggle-button")),
      ),
    ).toBe(false);

    expect(isNativeComposerModeToggle(mount(`<button class="ds-button"><svg></svg></button>`))).toBe(false);
  });
});
