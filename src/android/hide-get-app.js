/**
 * Hides the "Get App" promotional button injected by chat.deepseek.com on mobile viewports.
 * Installed by src/platform/globals-android.js when the Android content bundle starts.
 *
 * Uses a CSS rule with !important so the hiding survives framework re-renders that
 * overwrite inline styles. A MutationObserver re-marks any freshly created elements.
 */
export function hideGetAppButton() {
  if (window.__bdsGetAppObserver) return;

  const HIDE_ATTR = "data-bds-hide";

  const style = document.createElement("style");
  style.textContent = `[${HIDE_ATTR}] { display: none !important; }`;
  (document.head || document.documentElement).appendChild(style);

  function getHideTarget(label) {
    const control = label.closest?.("button, .ds-button, [role='button']");
    if (!control) return null;
    return control.matches?.(".ds-button") ? control : (control.parentElement || control);
  }

  function hideButton() {
    const spans = document.querySelectorAll("span");
    for (const span of spans) {
      if (span.textContent.trim() !== "Get App") continue;
      const target = getHideTarget(span);
      if (target && !target.hasAttribute(HIDE_ATTR)) {
        target.setAttribute(HIDE_ATTR, "");
        console.log("[BDS] Hidden Get App container");
      }
    }
  }

  hideButton();

  let rafId = 0;
  const observer = new MutationObserver(() => {
    hideButton();
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(hideButton);
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true });
  window.__bdsGetAppObserver = observer;
}
