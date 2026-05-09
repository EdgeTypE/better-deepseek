/**
 * Hides the "Get App" promotional button injected by chat.deepseek.com on mobile viewports.
 * Called by MainActivity.injectBdsScripts() on every page finish.
 *
 * Detection is text-based ("Get App" span) so it survives DeepSeek's dynamic class renames.
 * The MutationObserver stays alive for the lifetime of the page so SPA navigations that
 * re-insert the button are caught automatically.
 */
export function hideGetAppButton() {
  if (window.__bdsGetAppObserver) return;

  function hideButton() {
    const spans = document.querySelectorAll("span");
    for (const span of spans) {
      if (span.textContent.trim() !== "Get App") continue;
      let el = span.parentElement;
      while (el && el.tagName !== "BUTTON") {
        el = el.parentElement;
      }
      if (el && el.parentElement) {
        el.parentElement.style.display = "none";
        console.log("[BDS] Hidden Get App container");
      }
    }
  }

  hideButton();

  const observer = new MutationObserver(hideButton);
  observer.observe(document.body, { subtree: true, childList: true });
  window.__bdsGetAppObserver = observer;
}
