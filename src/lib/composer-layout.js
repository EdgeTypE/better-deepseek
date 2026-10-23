/**
 * Layout decisions for the injected composer button group (#210).
 *
 * The composer's bottom bar belongs to DeepSeek, so we cannot lay it out — we
 * can only measure it. At a 299px viewport the bar is 174px wide and already
 * needs 40px for the send button plus ~126px for the native chips, which are
 * `flex: 1 1 auto` and absorb every bit of shrink. Our group (126px) therefore
 * squeezed the chips to 0px, and because the chips container is
 * `overflow: visible` their icons painted straight over our buttons.
 *
 * When that happens the bottom line becomes one horizontal carousel instead of
 * squeezing anything or adding a second row; on desktop widths nothing moves.
 */

/** Slack before the line turns into a carousel: gaps plus rounding. */
export const CAROUSEL_SLACK = 8;

/**
 * @param {object} sizes measured in CSS pixels
 * @param {number} sizes.groupWidth the group's natural width (`scrollWidth`)
 * @param {number} sizes.sendWidth width of the native send control
 * @param {number} sizes.chipsWidth natural width of the native chips
 * @param {number} sizes.hostWidth width available to the bar
 * @returns {boolean} true when the bottom line must become a carousel
 */
export function needsCarousel({ groupWidth, sendWidth, chipsWidth, hostWidth }) {
  const numbers = [groupWidth, sendWidth, chipsWidth, hostWidth];
  if (!numbers.every((value) => Number.isFinite(value))) return false;
  if (hostWidth <= 0) return false;
  const needed = groupWidth + sendWidth + chipsWidth + CAROUSEL_SLACK;
  return needed > hostWidth + 1;
}
