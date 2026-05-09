/**
 * Hides the "Get App" promotional button injected by chat.deepseek.com on mobile viewports.
 * Called by MainActivity.injectBdsScripts() on every page finish.
 *
 * Detection is text-based ("Get App" span) so it survives DeepSeek's dynamic class renames.
 * A MutationObserver retries if the element is not yet in the DOM at call time.
 */
export function hideGetAppButton() {
  if (window.__bdsGetAppHidden) return;

  function attempt() {
    const spans = document.querySelectorAll("span");
    for (const span of spans) {
      if (span.textContent.trim() !== "Get App") continue;
      let el = span.parentElement;
      while (el && el.tagName !== "BUTTON") {
        el = el.parentElement;
      }
      if (el && el.parentElement) {
        el.parentElement.style.display = "none";
        window.__bdsGetAppHidden = true;
        console.log("[BDS] Hidden Get App container");
        return true;
      }
    }
    return false;
  }

  if (attempt()) return;

  // Element not yet in DOM — watch for it.
  let timeout;
  const observer = new MutationObserver(() => {
    if (attempt()) {
      observer.disconnect();
      clearTimeout(timeout);
    }
  });
  observer.observe(document.body, { subtree: true, childList: true });
  // Safety disconnect after 10 s to avoid leaking the observer.
  timeout = setTimeout(() => observer.disconnect(), 10_000);
}
