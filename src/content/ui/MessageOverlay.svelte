<script>
  import { marked } from 'marked';
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

  // Configure marked for better rendering
  marked.setOptions({
    breaks: true,
    gfm: true,
    headerIds: false,
    mangle: false
  });
</script>

<div class="bds-message-overlay">
  <!-- TEXT -->
  {#if text && text.trim()}
    <div class="bds-sanitized-text">
      {@html marked.parse(text)}
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
      {:else if block.name === 'ask_question'}
        <div class="bds-question-info-card">
          <div class="bds-question-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
          </div>
          <div class="bds-question-content">
            <div class="bds-question-title">Clarifying questions asked.</div>
            <div class="bds-question-subtitle">Please provide your answers in the interaction panel below.</div>
          </div>
        </div>
      {:else if block.name === 'character_create'}
        <div class="bds-question-info-card bds-character-card">
          <div class="bds-question-icon bds-character-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
          </div>
          <div class="bds-question-content">
            <div class="bds-question-title">Character/Persona created.</div>
            <div class="bds-question-subtitle">Active character: <strong>{block.attrs.name || 'New Character'}</strong></div>
          </div>
        </div>
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
  .bds-question-info-card {
    background: var(--bds-bg-panel, #1e1f23);
    border: 1px solid var(--bds-border, #3a3b3f);
    border-radius: 12px;
    padding: 16px;
    display: flex;
    align-items: center;
    gap: 14px;
    margin: 10px 0;
  }

  .bds-question-icon {
    font-size: 20px;
    background: var(--bds-bg-hover, rgba(255, 255, 255, 0.08));
    color: var(--bds-accent, #5b7bff);
    width: 44px;
    height: 44px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .bds-question-title {
    font-weight: 600;
    font-size: 15px;
    color: var(--bds-text-primary, #ececec);
  }

  .bds-question-subtitle {
    font-size: 13px;
    color: var(--bds-text-secondary, #8e8ea0);
    margin-top: 2px;
  }

  .bds-character-icon {
    color: #10b981; /* Emerald Green for success/creation */
    background: rgba(16, 185, 129, 0.1);
  }

  .bds-character-card {
    border-left: 3px solid #10b981;
  }

  .bds-message-overlay {
    margin-top: 10px;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
    font-family: inherit;
    color: #333; 
  }

  .bds-sanitized-text {
    font-size: 14px;
    line-height: 1.6;
    color: inherit;
    background: transparent;
  }

  .bds-sanitized-text :global(p) {
    margin-bottom: 1em;
  }

  .bds-sanitized-text :global(p:last-child) {
    margin-bottom: 0;
  }

  .bds-sanitized-text :global(pre) {
    background: var(--bds-bg-panel, #1e1f23);
    padding: 12px;
    border-radius: 8px;
    overflow-x: auto;
    margin: 12px 0;
    border: 1px solid var(--bds-border, #3a3b3f);
  }

  .bds-sanitized-text :global(code) {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    font-size: 0.9em;
    background: var(--bds-bg-hover, rgba(255, 255, 255, 0.08));
    padding: 0.2em 0.4em;
    border-radius: 4px;
  }

  .bds-sanitized-text :global(pre code) {
    background: transparent;
    padding: 0;
  }

  .bds-sanitized-text :global(ul), .bds-sanitized-text :global(ol) {
    margin-bottom: 1em;
    padding-left: 1.5em;
  }

  .bds-sanitized-text :global(li) {
    margin-bottom: 0.4em;
  }

  .bds-sanitized-text :global(strong) {
    font-weight: 600;
  }

  .bds-sanitized-text :global(em) {
    font-style: italic;
  }

  /* Tables */
  .bds-sanitized-text :global(table) {
    width: 100%;
    border-collapse: collapse;
    margin: 16px 0;
    font-size: 13px;
    border: 1px solid var(--bds-border, #3a3b3f);
  }

  .bds-sanitized-text :global(th), .bds-sanitized-text :global(td) {
    padding: 8px 12px;
    border: 1px solid var(--bds-border, #3a3b3f);
    text-align: left;
  }

  .bds-sanitized-text :global(th) {
    background: var(--bds-bg-hover, rgba(255, 255, 255, 0.08));
    font-weight: 600;
  }

  .bds-sanitized-text :global(tr:nth-child(even)) {
    background: rgba(255, 255, 255, 0.02);
  }

  /* Blockquotes */
  .bds-sanitized-text :global(blockquote) {
    margin: 16px 0;
    padding-left: 16px;
    border-left: 4px solid var(--bds-accent, #5b7bff);
    color: var(--bds-text-secondary, #8e8ea0);
    font-style: italic;
  }

  /* Headers */
  .bds-sanitized-text :global(h1), .bds-sanitized-text :global(h2), .bds-sanitized-text :global(h3) {
    margin: 20px 0 12px 0;
    font-weight: 600;
    line-height: 1.3;
  }

  .bds-sanitized-text :global(h1) { font-size: 1.5em; }
  .bds-sanitized-text :global(h2) { font-size: 1.3em; }
  .bds-sanitized-text :global(h3) { font-size: 1.1em; }

  /* DeepSeek color sync */
  :global(.dark) .bds-message-overlay {
    color: #ececec;
  }


</style>
