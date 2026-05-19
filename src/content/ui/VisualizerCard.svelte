<script>
  import { t } from "../../lib/i18n.svelte.js";
  import { buildVisualizerDocument } from "../../lib/utils/html-utils.js";

  /** @type {{content: string}} */
  let { content } = $props();

  let iframeSrcDoc = $derived(buildVisualizerDocument(content));
</script>

<div class="bds-visualizer-card">
  <header class="bds-visualizer-header">
    <h4>{t('visualizerCard.title')}</h4>
    <p>{t('visualizerCard.subtitle')}</p>
  </header>
  
  <div class="bds-visualizer-body">
    <iframe
      class="bds-visualizer-frame"
      title={t('visualizerCard.title')}
      sandbox="allow-scripts allow-forms"
      srcdoc={iframeSrcDoc}
    ></iframe>
  </div>
</div>

<style>
  .bds-visualizer-card {
    border: 1px solid #000;
    border-radius: 4px;
    background: #fff;
    padding: 12px;
    margin: 10px 0;
    font-family: inherit;
    color: #000;
    /* Fix card size and prevent overflow */
    height: 600px; 
    display: flex;
    flex-direction: column;
    overflow: hidden; 
  }

  .bds-visualizer-header {
    margin-bottom: 8px;
    border-bottom: 1px solid #000;
    padding-bottom: 4px;
    flex-shrink: 0; /* Prevents the header from shrinking */
  }

  .bds-visualizer-header h4 {
    margin: 0;
    font-size: 11px;
    font-weight: 900;
    text-transform: uppercase;
    color: #1e3a8a;
    letter-spacing: 0.05em;
  }

  .bds-visualizer-header p {
    margin: 0;
    font-size: 10px;
    color: #666;
  }

  .bds-visualizer-body {
    flex-grow: 1; /* Body occupies the remaining space */
    overflow: hidden;
  }

  .bds-visualizer-frame {
    width: 100%;
    height: 100%; /* Fills the entire body */
    border: 1px solid #000;
    background: #fff;
    display: block;
    overflow: hidden; /* Prevents scrolling */
  }

  /* Hide internal iframe scrollbar with CSS (for some browsers) */
  .bds-visualizer-frame::-webkit-scrollbar {
    display: none;
  }

  :global(.dark) .bds-visualizer-card {
    background: #111;
    border-color: #444;
  }
</style>