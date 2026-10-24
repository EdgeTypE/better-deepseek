<script>
  /**
   * "Add context" — Perplexity-style excerpt quoting (issue #201).
   *
   * Selecting text in an answer raises a small popup; the chosen excerpt then
   * appears as a card in the composer (the same in-flow slot the RAG preview
   * and the question panel use) and is attached to the next request as a
   * one-shot hidden block (see `buildQuoteContextBlock`). The excerpt is
   * deliberately kept out of the textarea: the user types their follow-up and
   * the model still knows what "this" refers to.
   */
  import { onMount } from "svelte";
  import appState from "../state.js";
  import { t } from "../../lib/i18n.svelte.js";
  import { BRIDGE_EVENTS } from "../../lib/constants.js";
  import { normalizeQuoteText } from "../../lib/quote-context.js";
  import { readQuotableSelection } from "../dom/quote-target.js";

  /** Gap between the selection and the popup. */
  const POPUP_GAP = 10;
  /** The popup is centred on the last selected line; this keeps it on screen. */
  const POPUP_HALF_WIDTH = 74;
  /** Below this the popup would clip against the top of the window. */
  const POPUP_FLIP_THRESHOLD = 64;
  /**
   * Touch selection has no reliable mouseup: the handles are dragged, so the
   * popup waits for the selection to stop moving.
   */
  const SELECTION_SETTLE_MS = 220;
  /** DeepSeek rebuilds the composer on every render; the card must follow it. */
  const ATTACH_POLL_MS = 300;

  let popup = $state(null);
  let quote = $state(appState.quoteContext);
  let expanded = $state(false);
  /** @type {HTMLElement | null} */
  let cardEl = $state(null);

  let popupStyle = $derived(
    popup ? `left:${popup.x}px;top:${popup.y}px;` : "",
  );

  /**
   * Same container chain as QuestionPanel / RagPreview: the composer is
   * rebuilt constantly and none of its hashed class names are stable.
   */
  function findComposerContainer() {
    const editor = document.querySelector("textarea#chat-input") ||
      document.querySelector(".ds-textarea textarea");

    return document.querySelector("._75e1990") ||
      document.querySelector("._6f68655") ||
      document.querySelector("._77cefa5") ||
      document.querySelector("._24fad49") ||
      // The wrapper around *our* textarea wins over the first one on the page:
      // the edit-message flow can leave another `.ds-textarea` behind.
      editor?.closest(".ds-textarea") ||
      document.querySelector(".ds-textarea") ||
      editor?.parentElement ||
      null;
  }

  function hidePopup() {
    popup = null;
  }

  /**
   * Place the popup on the last line of the selection: for a multi-line
   * excerpt that is where the pointer usually ends up.
   */
  function measurePopup(range) {
    const rects = Array.from(range.getClientRects?.() || []);
    const rect = rects[rects.length - 1] || range.getBoundingClientRect?.();
    if (!rect || (!rect.width && !rect.height)) return null;

    const half = Math.min(POPUP_HALF_WIDTH, Math.max(56, (window.innerWidth - 16) / 2));
    const center = rect.left + rect.width / 2;
    const x = Math.min(Math.max(center, half + 8), window.innerWidth - half - 8);

    if (rect.top < POPUP_FLIP_THRESHOLD) {
      return { x, y: rect.bottom + POPUP_GAP, below: true };
    }
    return { x, y: rect.top - POPUP_GAP, below: false };
  }

  function syncFromSelection() {
    if (appState.selectionMode) return hidePopup();

    const selection = window.getSelection?.();
    const text = readQuotableSelection(selection);
    if (!text) return hidePopup();

    const position = measurePopup(selection.getRangeAt(0));
    if (!position) return hidePopup();

    popup = { text, ...position };
  }

  function pushQuoteToPage(text) {
    window.dispatchEvent(new CustomEvent(BRIDGE_EVENTS.quoteContext, {
      detail: JSON.stringify({ text }),
    }));
  }

  function addContext() {
    const text = normalizeQuoteText(popup?.text);
    if (!text) return;

    quote = { text };
    expanded = false;
    appState.quoteContext = quote;
    pushQuoteToPage(text);

    // Drop the native selection so the popup and the highlight both go away.
    window.getSelection?.()?.removeAllRanges?.();
    hidePopup();

    // The user's next move is typing the follow-up; put the caret there
    // without yanking the page around.
    const composer = document.querySelector("textarea#chat-input") ||
      document.querySelector(".ds-textarea textarea");
    composer?.focus?.({ preventScroll: true });
  }

  function removeContext() {
    quote = null;
    expanded = false;
    appState.quoteContext = null;
    pushQuoteToPage("");
  }

  /** The excerpt reached the request (or the session changed) — clear it. */
  function clearContext() {
    quote = null;
    expanded = false;
    appState.quoteContext = null;
  }

  onMount(() => {
    let selectionTimer = null;

    const onPointerUp = (event) => {
      if (event.target?.closest?.(".bds-quote-popup")) return;
      // Let the browser settle the selection before reading it.
      setTimeout(syncFromSelection, 0);
    };

    const onKeyUp = (event) => {
      if (!event.shiftKey) return;
      syncFromSelection();
    };

    // Dragging a touch handle fires this continuously; only the final position
    // matters, so the popup waits for the drag to stop.
    const onSelectionChange = () => {
      clearTimeout(selectionTimer);
      selectionTimer = setTimeout(syncFromSelection, SELECTION_SETTLE_MS);
    };

    const onPointerDown = (event) => {
      if (event.target?.closest?.(".bds-quote-popup")) return;
      hidePopup();
    };

    const onEscape = (event) => {
      if (event.key === "Escape") hidePopup();
    };

    const onConsumed = () => clearContext();

    const onSessionChange = () => {
      clearContext();
      // A pending excerpt must not ride into the next chat.
      pushQuoteToPage("");
    };

    document.addEventListener("mouseup", onPointerUp);
    document.addEventListener("touchend", onPointerUp);
    document.addEventListener("keyup", onKeyUp);
    document.addEventListener("selectionchange", onSelectionChange);
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onEscape);
    window.addEventListener("scroll", hidePopup, true);
    window.addEventListener("resize", hidePopup);
    window.addEventListener(BRIDGE_EVENTS.quoteContextConsumed, onConsumed);
    window.addEventListener("bds:urlChanged", onSessionChange);

    return () => {
      clearTimeout(selectionTimer);
      document.removeEventListener("mouseup", onPointerUp);
      document.removeEventListener("touchend", onPointerUp);
      document.removeEventListener("keyup", onKeyUp);
      document.removeEventListener("selectionchange", onSelectionChange);
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onEscape);
      window.removeEventListener("scroll", hidePopup, true);
      window.removeEventListener("resize", hidePopup);
      window.removeEventListener(BRIDGE_EVENTS.quoteContextConsumed, onConsumed);
      window.removeEventListener("bds:urlChanged", onSessionChange);
    };
  });

  /**
   * Park the card in the composer. The element is never destroyed while it
   * lives there — Svelte removes it from `#bds-root`, where it no longer is —
   * so it is only ever hidden, and re-attached when the composer is rebuilt.
   */
  $effect(() => {
    if (!cardEl) return;

    const attach = () => {
      const target = findComposerContainer();
      if (target && cardEl.parentElement !== target) {
        target.prepend(cardEl);
      }
    };

    attach();
    // Nothing to keep in place while the card is hidden.
    if (!quote) return;

    const timer = setInterval(attach, ATTACH_POLL_MS);

    return () => clearInterval(timer);
  });
</script>

{#if popup}
  <div
    class="bds-quote-popup"
    class:is-below={popup.below}
    style={popupStyle}
  >
    <button
      type="button"
      class="bds-quote-add"
      onclick={addContext}
      onmousedown={(event) => event.preventDefault()}
      aria-label={t('quoteContext.addContext')}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M7.5 11.5h3v6h-6v-4.2c0-3.4 1.6-5.6 4.6-6.6l.6 1.7c-1.5.6-2.4 1.6-2.6 3.1Z"
          fill="currentColor"
        />
        <path
          d="M16.5 11.5h3v6h-6v-4.2c0-3.4 1.6-5.6 4.6-6.6l.6 1.7c-1.5.6-2.4 1.6-2.6 3.1Z"
          fill="currentColor"
        />
      </svg>
      <span>{t('quoteContext.addContext')}</span>
    </button>
  </div>
{/if}

<div
  class="bds-quote-context"
  class:bds-quote-context--hidden={!quote}
  class:is-expanded={expanded}
  bind:this={cardEl}
>
  <div class="bds-quote-head">
    <span class="bds-quote-title">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M7.5 11.5h3v6h-6v-4.2c0-3.4 1.6-5.6 4.6-6.6l.6 1.7c-1.5.6-2.4 1.6-2.6 3.1Z"
          fill="currentColor"
        />
        <path
          d="M16.5 11.5h3v6h-6v-4.2c0-3.4 1.6-5.6 4.6-6.6l.6 1.7c-1.5.6-2.4 1.6-2.6 3.1Z"
          fill="currentColor"
        />
      </svg>
      {t('quoteContext.added')}
    </span>
    <span class="bds-quote-hint">{t('quoteContext.hint')}</span>
    <button
      type="button"
      class="bds-quote-remove"
      onclick={removeContext}
      title={t('quoteContext.remove')}
      aria-label={t('quoteContext.remove')}
    >
      ×
    </button>
  </div>

  <button
    type="button"
    class="bds-quote-excerpt"
    onclick={() => { expanded = !expanded; }}
    title={expanded ? t('quoteContext.collapse') : t('quoteContext.expand')}
  >
    <span class="bds-quote-excerpt-text">{quote?.text || ""}</span>
  </button>
</div>

<style>
  .bds-quote-popup {
    position: fixed;
    z-index: 10020;
    transform: translate(-50%, -100%);
    animation: bdsQuotePop 0.12s ease-out;
  }

  .bds-quote-popup.is-below {
    transform: translate(-50%, 0);
  }

  @keyframes bdsQuotePop {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .bds-quote-add {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 12px;
    border-radius: 10px;
    border: 1px solid var(--bds-border, #e5e5e5);
    background: var(--bds-bg-panel, #ffffff);
    color: var(--bds-text-primary, #0d0d0d);
    box-shadow: var(--bds-shadow, 0 4px 12px rgba(0, 0, 0, 0.12));
    font-size: 12px;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    white-space: nowrap;
    transition: border-color var(--bds-transition, 0.18s ease),
      background var(--bds-transition, 0.18s ease);
  }

  .bds-quote-add:hover {
    border-color: var(--bds-accent, #4d6bfe);
    background: var(--bds-bg-hover, #ececee);
  }

  .bds-quote-add svg {
    color: var(--bds-accent, #4d6bfe);
    flex-shrink: 0;
  }

  /* Lives inside the composer container, in flow: width and alignment come
     from the composer itself, so nothing has to be measured. */
  .bds-quote-context {
    position: relative;
    box-sizing: border-box;
    width: 100%;
    margin-bottom: 6px;
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: 6px 6px 7px 10px;
    border-radius: 10px;
    /* A quote, not a second input: hairline frame plus one accent rule. */
    border: 1px solid var(--bds-border, #e5e5e5);
    border-left: 2px solid var(--bds-accent, #4d6bfe);
    background: var(--bds-accent-glow, rgba(77, 107, 254, 0.12));
    color: var(--bds-text-primary, #0d0d0d);
    font-family: inherit;
    animation: bdsQuoteRise 0.16s ease-out;
  }

  .bds-quote-context.bds-quote-context--hidden {
    display: none;
  }

  @keyframes bdsQuoteRise {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .bds-quote-head {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 18px;
  }

  .bds-quote-title {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.02em;
    color: var(--bds-text-secondary, #6b6b6b);
    flex-shrink: 0;
  }

  .bds-quote-title svg {
    color: var(--bds-accent, #4d6bfe);
    flex-shrink: 0;
  }

  .bds-quote-hint {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 10px;
    color: var(--bds-text-tertiary, #999999);
    opacity: 0.85;
  }

  .bds-quote-remove {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    padding: 0;
    border: none;
    border-radius: 5px;
    background: transparent;
    color: var(--bds-text-tertiary, #999999);
    font-size: 14px;
    line-height: 1;
    cursor: pointer;
    transition: background var(--bds-transition, 0.18s ease),
      color var(--bds-transition, 0.18s ease);
  }

  .bds-quote-remove:hover {
    background: var(--bds-bg-hover, #ececee);
    color: var(--bds-danger, #ef4444);
  }

  .bds-quote-excerpt {
    display: block;
    width: 100%;
    /* Flex items refuse to shrink below their content without this. */
    min-width: 0;
    margin: 0;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--bds-text-primary, #0d0d0d);
    font-family: inherit;
    font-size: 12.5px;
    line-height: 1.45;
    text-align: left;
    cursor: pointer;
  }

  /* Two lines, wrapped — never nowrap: the card sits in the composer's own
     flex chain, and a nowrap excerpt would stretch the composer instead of
     being clipped. */
  .bds-quote-excerpt-text {
    display: block;
    max-height: 2.9em;
    overflow: hidden;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  /* Fade the last line instead of a hard cut, so a truncated excerpt reads as
     "there is more" rather than as a broken card. */
  .bds-quote-context:not(.is-expanded) .bds-quote-excerpt {
    -webkit-mask-image: linear-gradient(to bottom, #000 86%, transparent 100%);
    mask-image: linear-gradient(to bottom, #000 86%, transparent 100%);
  }

  .bds-quote-context.is-expanded .bds-quote-excerpt-text {
    max-height: 40vh;
    overflow-y: auto;
  }
</style>
