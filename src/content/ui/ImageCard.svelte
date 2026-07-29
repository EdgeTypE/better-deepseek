<script>
  import { searchImages } from "../../lib/wikimedia-commons.js";
  import { t } from "../../lib/i18n.svelte.js";
  import { extractHttpUrl } from "../../lib/utils/url-normalizer.js";

  let { content, attrs = {} } = $props();

  let cleanSrc = $derived(attrs.src ? (extractHttpUrl(attrs.src) || attrs.src) : null);

  let imageUrl = $state(cleanSrc);
  let fullImageUrl = $state(cleanSrc);
  let fileTitle = $state("");
  let descriptionUrl = $state("");
  let showFullscreen = $state(false);
  let dialogRef = $state(null);
  let cardRef = $state(null);
  let imgRef = $state(null);
  let inViewport = $state(false);
  let imgLoaded = $state(false);
  let imgWidth = $state(null);
  let imgHeight = $state(null);

  let query = $derived(
    cleanSrc ? "" : (attrs.query || attrs.q || content.trim() || "")
  );

  let aspectRatio = $derived(
    imgWidth && imgHeight ? imgWidth / imgHeight : 16 / 9
  );

  let status = $state(
    cleanSrc ? "loaded" : (query ? "searching" : "error")
  );

  $effect(() => {
    if (cleanSrc) {
      imageUrl = cleanSrc;
      fullImageUrl = cleanSrc;
      status = "loaded";
      return;
    }
    if (!query) return;
    const controller = new AbortController();
    searchImages({
      query,
      count: attrs.count || 1,
      width: attrs.width || 400,
      filetype: attrs.filetype,
      intitle: attrs.intitle,
      category: attrs.category,
      signal: controller.signal,
    }).then((result) => {
      if (result) {
        imageUrl = result.displayUrl;
        fullImageUrl = result.fullUrl;
        fileTitle = result.title;
        descriptionUrl = result.descriptionUrl;
        imgWidth = result.width;
        imgHeight = result.height;
        status = "loaded";
      } else {
        status = "error";
      }
    }).catch(() => { status = "error"; });

    return () => controller.abort();
  });

  $effect(() => {
    const el = cardRef;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          inViewport = true;
          observer.disconnect();
        }
      },
      { rootMargin: "400px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  });

  $effect(() => {
    if (!imgRef) return;
    const img = imgRef;
    if (img.complete && img.naturalWidth > 0) {
      imgLoaded = true;
      return;
    }
    const onLoad = () => { imgLoaded = true; };
    img.addEventListener("load", onLoad);
    return () => img.removeEventListener("load", onLoad);
  });

  function portal(node) {
    document.body.appendChild(node);
    return {
      destroy() {
        if (node.parentNode) node.parentNode.removeChild(node);
      },
    };
  }

  function openFullscreen() { showFullscreen = true; }
  function closeFullscreen() { showFullscreen = false; }

  $effect(() => {
    if (dialogRef) dialogRef.focus();
  });

  $effect(() => {
    if (showFullscreen) {
      const handler = (e) => { if (e.key === 'Escape') closeFullscreen(); };
      window.addEventListener('keydown', handler);
      return () => window.removeEventListener('keydown', handler);
    }
  });
</script>

<div bind:this={cardRef} class="bds-image-card">
  {#if status === "searching"}
    <div class="bds-image-skeleton">
      <div class="bds-image-skeleton-shape"></div>
    </div>
  {:else if status === "loaded"}
    <div
      class="bds-image-wrapper"
      style="aspect-ratio: {aspectRatio}"
      class:bds-image-wrapper--loaded={imgLoaded}
      onclick={openFullscreen}
    >
      {#if !imgLoaded}
        <div class="bds-image-skeleton bds-image-skeleton--overlay">
          <div class="bds-image-skeleton-shape"></div>
        </div>
      {/if}
      {#if inViewport}
        <img
          bind:this={imgRef}
          src={imageUrl}
          alt={attrs.alt || query}
          style={attrs.style}
          class:bds-image--loaded={imgLoaded}
        />
      {/if}
      {#if attrs.caption || descriptionUrl}
        <div class="bds-image-overlay">
          {#if attrs.caption}
            <span class="bds-image-caption">{attrs.caption}</span>
          {/if}
          {#if descriptionUrl}
            <a
              href={descriptionUrl}
              target="_blank"
              rel="noopener"
              class="bds-image-credit"
            >{fileTitle || "Wikimedia Commons"}</a>
          {/if}
        </div>
      {/if}
    </div>
  {:else if status === "error"}
    <div class="bds-image-error">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
      </svg>
      <span class="bds-image-error-text">{t('imageCard.notFound')}</span>
    </div>
  {/if}
</div>

{#if showFullscreen}
  <div class="bds-image-fullscreen" use:portal onclick={closeFullscreen} role="presentation">
    <div class="bds-image-fullscreen-dialog" bind:this={dialogRef} onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
      <button class="bds-image-close-btn" onclick={closeFullscreen} aria-label={t('imageCard.close')}>×</button>
      <img src={fullImageUrl || imageUrl} alt={attrs.alt || query} />
    </div>
  </div>
{/if}

<style>
  .bds-image-card {
    border-radius: 12px;
    overflow: hidden;
    border: 1px solid var(--bds-border, #3a3b3f);
    background: var(--bds-bg-panel, #1e1f23);
    margin: 10px 0;
    max-width: 100%;
    min-height: 100px;
  }

  .bds-image-skeleton {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    width: 100%;
    aspect-ratio: 16 / 9;
    max-height: 400px;
    overflow: hidden;
  }

  .bds-image-skeleton--overlay {
    position: absolute;
    inset: 0;
    z-index: 1;
    aspect-ratio: unset;
  }

  .bds-image-skeleton-shape {
    width: 100%;
    height: 100%;
    border-radius: 12px;
    background: var(--bds-bg-elevated, #2a2b30);
    animation: bds-shimmer 1.6s ease-in-out infinite;
  }

  @keyframes bds-shimmer {
    0% { opacity: 0.6; }
    50% { opacity: 1; }
    100% { opacity: 0.6; }
  }

  .bds-image-wrapper {
    position: relative;
    display: block;
    width: 100%;
    max-height: 400px;
    overflow: hidden;
    cursor: pointer;
  }

  .bds-image-wrapper img {
    display: block;
    width: 100%;
    height: auto;
    object-fit: cover;
    border-radius: 12px;
    opacity: 0;
    transition: opacity 0.35s ease;
  }

  .bds-image-wrapper--loaded img {
    opacity: 1;
  }

  .bds-image-wrapper img.bds-image--loaded {
    opacity: 1;
  }

  .bds-image-overlay {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    background: linear-gradient(transparent, rgba(0, 0, 0, 0.7));
    padding: 30px 12px 8px;
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 8px;
    pointer-events: none;
  }

  .bds-image-caption {
    color: #fff;
    font-size: 13px;
    font-weight: 500;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
  }

  .bds-image-credit {
    color: rgba(255, 255, 255, 0.7);
    font-size: 11px;
    text-decoration: none;
    pointer-events: auto;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .bds-image-credit:hover {
    color: #fff;
    text-decoration: underline;
  }

  .bds-image-error {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 18px 16px;
    justify-content: center;
    color: var(--bds-text-tertiary, #6b6b7b);
    font-size: 13px;
  }

  .bds-image-error svg {
    flex-shrink: 0;
    opacity: 0.5;
  }

  .bds-image-error-text {
    color: var(--bds-text-secondary, #8e8ea0);
  }

  .bds-image-fullscreen {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.85);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2147483647;
    animation: bds-fade-in 0.2s ease-out;
  }

  .bds-image-fullscreen-dialog {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    max-width: 92vw;
    max-height: 92vh;
    animation: bds-scale-in 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .bds-image-fullscreen-dialog img {
    max-width: 92vw;
    max-height: 92vh;
    object-fit: contain;
    border-radius: 8px;
    box-shadow: 0 8px 40px rgba(0, 0, 0, 0.5);
  }

  .bds-image-close-btn {
    position: fixed;
    top: 16px;
    right: 16px;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: none;
    background: rgba(255, 255, 255, 0.15);
    color: #fff;
    font-size: 22px;
    line-height: 1;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2147483647;
    backdrop-filter: blur(4px);
    transition: background 0.15s;
  }

  .bds-image-close-btn:hover {
    background: rgba(255, 255, 255, 0.3);
  }

  @keyframes bds-fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes bds-scale-in {
    from { transform: scale(0.92); opacity: 0; }
    to { transform: scale(1); opacity: 1; }
  }
</style>
