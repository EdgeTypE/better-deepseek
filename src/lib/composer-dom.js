/**
 * Locale-independent DOM predicates for the native DeepSeek composer toolbar.
 *
 * Why this module exists: every *textual* marker on that toolbar is translated,
 * and DeepSeek replaced the mode-chip icons with Lottie animations whose
 * rendered `d` attributes are rewritten on every animation frame. Both of the
 * older signatures — the static `M7.0643` icon path and the English "DeepThink"
 * label — therefore only ever matched the English UI. That is why the injected
 * DeepResearch / DeepCode chips were laid out on the wrong side of the toolbar
 * in every other locale, and why Live Mode could not turn thinking off.
 *
 * Anything that decides *where* to mount, or *what must not be clicked*, has to
 * key off structure instead: the design-system class pair for the native chips,
 * and the `bds-` class prefix for everything Better DeepSeek injected.
 */

/** Better DeepSeek classes are all prefixed; DeepSeek's own are `ds-`/hashed. */
const BDS_CLASS_PREFIX = "bds-";
const BDS_ANCESTOR_SELECTOR = `#bds-root, [class*="${BDS_CLASS_PREFIX}"]`;

/**
 * True when the element is, or sits inside, an injected Better DeepSeek
 * control. The prefix check covers every injected component (and the
 * layout-transparent `bds-*-mount` wrappers around them) without enumerating
 * class names that get renamed whenever a component is.
 */
export function isBdsInjectedControl(element) {
  if (!element) return false;
  if (hasBdsClass(element)) return true;
  return Boolean(element.closest?.(BDS_ANCESTOR_SELECTOR));
}

function hasBdsClass(element) {
  const list = element.classList;
  if (!list) return false;
  for (const name of list) {
    if (String(name).startsWith(BDS_CLASS_PREFIX)) return true;
  }
  return false;
}

/**
 * A native DeepSeek composer mode chip (DeepThink / Search).
 *
 * The design-system class pair is the only marker that survives both a locale
 * switch and the Lottie migration. Better DeepSeek's own chips deliberately
 * carry the same classes for styling (see DeepResearchToggle.svelte), so they
 * have to be excluded by class rather than by ancestry alone.
 */
export function isNativeComposerModeToggle(element) {
  if (!element?.classList?.contains("ds-toggle-button")) {
    return false;
  }

  if (isBdsInjectedControl(element)) {
    return false;
  }

  return Boolean(
    element.querySelector?.(
      ".ds-toggle-button__icon, .ds-lottie-toggle-icon, svg",
    ),
  );
}
