<script>
import VisualizerCard from "./VisualizerCard.svelte";
  import ToolCard from "./ToolCard.svelte";
  import PptxCard from "./PptxCard.svelte";
  import ExcelCard from "./ExcelCard.svelte";
  import DocxCard from "./DocxCard.svelte";
  import LoadingIndicator from "./LoadingIndicator.svelte";

  /** 
   * @typedef {object} ToolBlock
   * @property {string} name
   * @property {string} content
   * @property {object} attrs
   */

  /** @type {{
   *   text: string, 
   *   blocks: ToolBlock[],
   *   loading?: boolean
   * }} */
  let { text, blocks = [], loading = false, loadingIndex = 1 } = $props();
</script>

<div class="bds-message-overlay">
  <!-- TEXT -->
  {#if text && text.trim()}
    <div class="bds-sanitized-text">
      {text}
    </div>
  {/if}

  <!-- TOOLS BELOW TEXT -->
  <div class="bds-tool-blocks">
    {#each blocks as block}
      {#if block.name === 'visualizer'}
        <VisualizerCard content={block.content} />
      {:else if block.name === 'pptx'}
        <PptxCard content={block.content} />
      {:else if block.name === 'excel'}
        <ExcelCard content={block.content} />
      {:else if block.name === 'docx'}
        <DocxCard content={block.content} />
      {:else}
        <ToolCard name={block.name} content={block.content} />
      {/if}
    {/each}
  </div>

  <!-- LOADING INDICATOR AT THE BOTTOM -->
  {#if loading}
    <div class="bds-loading-wrapper">
      <LoadingIndicator index={loadingIndex} />
    </div>
  {/if}
</div>

<style>
  .bds-message-overlay {
    margin-top: 10px;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
    font-family: inherit;
    /* Explicitly avoid magenta/purple inheriting from weird parent states */
    color: #333; 
  }

  .bds-sanitized-text {
    font-size: 14px;
    line-height: 1.6;
    white-space: pre-wrap;
    color: inherit;
    background: transparent;
  }

  /* DeepSeek color sync */
  :global(.dark) .bds-message-overlay {
    color: #ececec;
  }


</style>
