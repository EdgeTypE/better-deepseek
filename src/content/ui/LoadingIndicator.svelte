<script>
  let { index = 1 } = $props();
  let svgPath = $derived(chrome.runtime.getURL(`static/loading/${index}.svg`));
</script>

<div class="bds-loading-indicator">
  <div class="bds-loading-icon">
    <img src={svgPath} alt="Working..." />
  </div>
  <p class="bds-loading-text">Working...</p>
</div>

<style>
  .bds-loading-indicator {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    padding: 20px 0;
    font-family: inherit;
    animation: fadeIn 0.3s ease-in-out;
    width: 100%;
  }

  .bds-loading-icon img {
    width: 120px;
    height: auto;
    max-width: 100%;
    display: block;
  }

  .bds-loading-text {
    margin: 0;
    font-size: 14px;
    font-weight: 500;
    letter-spacing: 0.5px;
    color: #888;
  }

  :global(.dark) .bds-loading-text {
    color: #999;
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(5px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>
