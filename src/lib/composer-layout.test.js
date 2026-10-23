import { describe, expect, it } from "vitest";
import { needsCarousel, CAROUSEL_SLACK } from "./composer-layout.js";

describe("needsCarousel", () => {
  // Numbers measured on chat.deepseek.com at a 299px viewport (#210): the bar is
  // 174px and the native chips are squeezed to 0 because 134 + 40 + 126 > 174.
  it("turns the bottom line into a carousel when chips, send and us do not fit", () => {
    expect(
      needsCarousel({ groupWidth: 134, sendWidth: 40, chipsWidth: 126, hostWidth: 174 })
    ).toBe(true);
  });

  it("leaves the bottom line alone when there is room", () => {
    expect(
      needsCarousel({ groupWidth: 134, sendWidth: 40, chipsWidth: 126, hostWidth: 320 })
    ).toBe(false);
  });

  it("counts the slack, so a knife-edge fit still goes inline", () => {
    const hostWidth = 134 + 40 + 126 + CAROUSEL_SLACK;
    expect(needsCarousel({ groupWidth: 134, sendWidth: 40, chipsWidth: 126, hostWidth })).toBe(
      false
    );
    expect(
      needsCarousel({ groupWidth: 134, sendWidth: 40, chipsWidth: 126, hostWidth: hostWidth - 2 })
    ).toBe(true);
  });

  it("stays inline when the group alone is wide but the bar is empty", () => {
    expect(needsCarousel({ groupWidth: 134, sendWidth: 0, chipsWidth: 0, hostWidth: 200 })).toBe(
      false
    );
  });

  it("tolerates a missing or unmeasured host", () => {
    for (const hostWidth of [0, -1, Number.NaN, undefined, null]) {
      expect(needsCarousel({ groupWidth: 134, sendWidth: 40, chipsWidth: 126, hostWidth })).toBe(
        false
      );
    }
  });

  it("tolerates unmeasured siblings", () => {
    expect(
      needsCarousel({ groupWidth: 134, sendWidth: Number.NaN, chipsWidth: 126, hostWidth: 174 })
    ).toBe(false);
  });
});
