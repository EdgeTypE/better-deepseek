<script>
  import { marked } from 'marked';
  import { onMount } from 'svelte';
  import VisualizerCard from "./VisualizerCard.svelte";
  import appState from "../state.js";
  import ToolCard from "./ToolCard.svelte";
  import PptxCard from "./PptxCard.svelte";
  import ExcelCard from "./ExcelCard.svelte";
  import DocxCard from "./DocxCard.svelte";
  import AutoCodeRunnerCard from "./AutoCodeRunnerCard.svelte";
  import AutoCodeResultCard from "./AutoCodeResultCard.svelte";
  import SearchResultCard from "./SearchResultCard.svelte";
  import DeepResearchPlanCard from "./DeepResearchPlanCard.svelte";
  import DeepResearchStatusCard from "./DeepResearchStatusCard.svelte";
  import DeepResearchReportCard from "./DeepResearchReportCard.svelte";
  import DeepResearchStepDoneCard from "./DeepResearchStepDoneCard.svelte";
  import LoadingIndicator from "./LoadingIndicator.svelte";
  import ImageCard from "./ImageCard.svelte";
  import TodoCard from "./TodoCard.svelte";
  import McpLoadingStatus from "./McpLoadingStatus.svelte";
  import McpResultCard from "./McpResultCard.svelte";
  import { t } from "../../lib/i18n.svelte.js";
  import { parseLooseJson } from "../parser/json-repair.js";


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
  let { text, blocks = [], loading = false, loadingIndex = 1, isRtl = false } = $props();

  let answeredData = $state(null);
  let outerOpen = $state(false);
  let innerOpen = $state({});

  let parsed = $derived.by(() => {
    const qBlock = blocks.find(b => b.name === 'ask_question');
    return qBlock ? parseQuestions(qBlock.content) : [];
  });

  $effect(() => {
    if (parsed.length === 1) {
      outerOpen = true;
      innerOpen = { 0: true };
    } else {
      outerOpen = false;
      innerOpen = {};
    }
  });

  onMount(() => {
    const handler = (e) => {
      answeredData = e.detail;
    };
    window.addEventListener('bds-questions-answered', handler);
    return () => window.removeEventListener('bds-questions-answered', handler);
  });

  function toggleOuter() {
    outerOpen = !outerOpen;
  }

  function toggleInner(i) {
    const next = { ...innerOpen };
    next[i] = !next[i];
    innerOpen = next;
  }

  function interleave(text, blocks) {
    const segments = [];
    const markerRegex = /\x00BLOCK:(\d+)\x00/g;
    const usedBlockIndices = new Set();

    if (text) {
      let lastEnd = 0;
      let match;
      while ((match = markerRegex.exec(text)) !== null) {
        const textBefore = text.substring(lastEnd, match.index);
        if (textBefore) {
          segments.push({ type: 'text', content: textBefore });
        }
        const blockIdx = parseInt(match[1], 10);
        if (blockIdx >= 0 && blockIdx < blocks.length) {
          segments.push({ type: 'block', block: blocks[blockIdx] });
          usedBlockIndices.add(blockIdx);
        }
        lastEnd = match.index + match[0].length;
      }
      const textAfter = text.substring(lastEnd);
      if (textAfter) {
        segments.push({ type: 'text', content: textAfter });
      }
    }

    for (let i = 0; i < blocks.length; i++) {
      if (!usedBlockIndices.has(i)) {
        segments.push({ type: 'block', block: blocks[i] });
      }
    }

    return segments;
  }

  function parseQuestions(content) {
    const parsed = parseLooseJson(content);
    return Array.isArray(parsed.value) ? parsed.value : [];
  }

  function typeLabel(type) {
    const labels = {
      test: 'Single',
      radio: 'Single',
      single: 'Single',
      checkbox: 'Multiple',
      multiple: 'Multiple',
      input: 'Text',
      text: 'Text'
    };
    return labels[type] || type || '';
  }

  function parseJsonBlock(content) {
    return parseLooseJson(content);
  }

  function getRunId(block) {
    return block.attrs.runId || block.attrs.runid || "";
  }

  function approveDeepResearch(block) {
    const parsedPlan = parseJsonBlock(block.content).value;
    window.dispatchEvent(new CustomEvent("bds:deep-research-approve", {
      detail: {
        runId: getRunId(block),
        plan: parsedPlan,
      },
    }));
  }

  function requestDeepResearchChanges(block) {
    const parsedPlan = parseJsonBlock(block.content).value;
    window.dispatchEvent(new CustomEvent("bds:deep-research-open-revision", {
      detail: {
        runId: getRunId(block),
        plan: parsedPlan,
      },
    }));
  }

  function cancelDeepResearch(block) {
    window.dispatchEvent(new CustomEvent("bds:deep-research-cancel", {
      detail: {
        runId: getRunId(block),
      },
    }));
  }

  function isDeepResearchPlanInteractive(runId) {
    const run = appState.deepResearch.runs.find((item) => item.id === runId);
    if (!run) return Boolean(appState.deepResearch.enabled);
    return Boolean(appState.deepResearch.enabled && run.status === "planning");
  }

  // Configure marked for better rendering
  marked.setOptions({
    breaks: true,
    gfm: true,
    headerIds: false,
    mangle: false
  });
</script>

<div class="bds-message-overlay" class:rtl={isRtl} dir={isRtl ? 'rtl' : 'ltr'}>
  <!-- INTERLEAVED TEXT AND BLOCKS -->
  {#each interleave(text, blocks) as segment}
    {#if segment.type === 'text'}
      {#if segment.content?.trim()}
        <div class="ds-markdown bds-sanitized-text">
          {@html marked.parse(segment.content)}
        </div>
      {/if}
    {:else}
      {@const block = segment.block}
      {#if block.name === 'visualizer'}
        <VisualizerCard
          content={block.content}
          onopenpanel={(srcdoc) => appState.ui?.showPreviewPanel?.('Visualizer', srcdoc)}
        />
      {:else if block.name === 'pptx'}
        <PptxCard content={block.content} />
      {:else if block.name === 'excel'}
        <ExcelCard content={block.content} />
      {:else if block.name === 'docx'}
        <DocxCard content={block.content} />
      {:else if block.name === 'auto:code_runner'}
        <AutoCodeRunnerCard language={block.attrs.language || block.attrs.lang} content={block.content} />
      {:else if block.name === 'auto_code_result'}
        <AutoCodeResultCard language={block.attrs.language} status={block.attrs.status} output={block.content} />
      {:else if block.name === 'ask_question'}
        <div class="bds-question-info-card bds-questions-card" class:bds-q-collapsed={!outerOpen}>
          <div 
            class="bds-q-header-toggle" 
            onclick={toggleOuter} 
            role="button" 
            tabindex="0" 
            onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleOuter(); } }}
          >
            <div class="bds-question-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
              </svg>
            </div>
            
            <div class="bds-q-title-area">
              <span class="bds-question-title">{t('messageOverlay.questionsAsked')}</span>
              {#if parsed.length > 0}
                <span class="bds-q-count">({parsed.length})</span>
              {/if}
            </div>

            <span class="bds-chevron">{outerOpen ? '▼' : '▶'}</span>
          </div>

          {#if outerOpen}
            {#if parsed.length > 0}
              <div class="bds-questions-list">
                {#each parsed as q, i}
                  <div class="bds-q-item">
                    <div class="bds-q-header" onclick={() => toggleInner(i)} role="button" tabindex="0" onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleInner(i); } }}>
                      <span class="bds-chevron">{innerOpen[i] ? '▼' : '▶'}</span>
                      <span class="bds-q-num">{i + 1}.</span>
                      <span class="bds-q-text">{q.question}</span>
                      {#if typeLabel(q.type)}
                        <span class="bds-q-type">{typeLabel(q.type)}</span>
                      {/if}
                    </div>
                    {#if innerOpen[i]}
                      <div class="bds-q-detail">
                        {#if q.options?.length}
                          <div class="bds-q-options">
                            {#each q.options as opt}
                              <div class="bds-q-opt-row">{opt}</div>
                            {/each}
                          </div>
                        {/if}
                        {#if answeredData?.answers?.[q.id || `q_${i}`]}
                          <div class="bds-q-answer-row">
                            <span class="bds-q-answer">→ {answeredData.answers[q.id || `q_${i}`]}</span>
                          </div>
                        {/if}
                      </div>
                    {/if}
                  </div>
                {/each}
              </div>
            {:else}
              <div class="bds-questions-list">
                <div class="bds-question-subtitle" style="padding: 8px; font-size: 13px; color: var(--bds-text-secondary, #8e8ea0);">{t('messageOverlay.questionsSubtitle')}</div>
              </div>
            {/if}
          {/if}
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
            <div class="bds-question-title">{t('messageOverlay.characterCreated')}</div>
            <div class="bds-question-subtitle">{@html t('messageOverlay.characterActive', { name: block.attrs.name || 'New Character' })}</div>
          </div>
        </div>
      {:else if block.name === 'skill_create'}
        <div class="bds-question-info-card bds-skill-card">
          <div class="bds-question-icon bds-skill-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path>
            </svg>
          </div>
          <div class="bds-question-content">
            <div class="bds-question-title">{t('messageOverlay.skillCreated')}</div>
            <div class="bds-question-subtitle">
              {@html t('messageOverlay.skillActive', { name: block.attrs.name || 'New Skill' })}
              {#if block.attrs.usage}
                <br><span style="font-size: 12px; opacity: 0.7;">{block.attrs.usage}</span>
              {/if}
            </div>
          </div>
        </div>
      {:else if block.name === 'auto:request_web_fetch'}
        <div class="bds-question-info-card bds-web-fetch-card">
          <div class="bds-question-icon bds-web-fetch-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="2" y1="12" x2="22" y2="12"></line>
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
            </svg>
          </div>
          <div class="bds-question-content">
            <div class="bds-question-title">{t('messageOverlay.webFetchRequested')}</div>
            <div class="bds-question-subtitle">{block.content}</div>
          </div>
        </div>
      {:else if block.name === 'auto:request_github_fetch'}
        <div class="bds-question-info-card bds-github-fetch-card">
          <div class="bds-question-icon bds-github-fetch-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path>
            </svg>
          </div>
          <div class="bds-question-content">
            <div class="bds-question-title">{t('messageOverlay.githubFetchRequested')}</div>
            <div class="bds-question-subtitle">{block.content}</div>
          </div>
        </div>
      {:else if block.name === 'auto:search'}
        <div class="bds-question-info-card bds-search-info-card">
          <div class="bds-question-icon bds-search-info-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
          </div>
          <div class="bds-question-content">
            <div class="bds-question-title">{t('messageOverlay.searchRequested')}</div>
            <div class="bds-question-subtitle">{block.content}</div>
          </div>
        </div>
      {:else if block.name === 'auto_search_result'}
        <SearchResultCard query={block.attrs.query} count={block.attrs.count} results={block.content} />
      {:else if block.name === 'deep_research_plan'}
        {@const parsedPlan = parseJsonBlock(block.content)}
        <DeepResearchPlanCard
          runId={getRunId(block)}
          plan={parsedPlan.value}
          raw={parsedPlan.value ? "" : block.content}
          error={parsedPlan.error}
          interactive={isDeepResearchPlanInteractive(getRunId(block))}
          onApprove={() => approveDeepResearch(block)}
          onRequestChanges={() => requestDeepResearchChanges(block)}
          onCancel={() => cancelDeepResearch(block)}
        />
      {:else if block.name === 'deep_research_status'}
        {@const parsedStatus = parseJsonBlock(block.content)}
        <DeepResearchStatusCard
          runId={getRunId(block)}
          status={parsedStatus.value}
          raw={parsedStatus.value ? "" : block.content}
        />
      {:else if block.name === 'deep_research_report'}
        <DeepResearchReportCard runId={getRunId(block)} markdown={block.content} />
      {:else if block.name === 'deep_research_step_done'}
        {@const parsedStep = parseJsonBlock(block.content)}
        <DeepResearchStepDoneCard
          runId={getRunId(block)}
          stepId={block.attrs.stepId || block.attrs.stepid || ""}
          analysis={parsedStep.value}
          raw={parsedStep.value ? "" : block.content}
          error={parsedStep.error}
        />
      {:else if block.name === 'memory_write'}
        <div class="bds-question-info-card bds-memory-card">
          <div class="bds-question-icon bds-memory-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <ellipse cx="12" cy="5" rx="9" ry="3"/>
              <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
              <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
            </svg>
          </div>
          <div class="bds-question-content">
            <div class="bds-question-title">{t('messageOverlay.memoryStored', { count: block.attrs.count })}</div>
          </div>
        </div>
      {:else if block.name === 'image'}
        <ImageCard content={block.content} attrs={block.attrs} />
      {:else if block.name === 'todo'}
        <TodoCard content={block.content} />
      {:else if block.name === 'auto:mcp'}
        <McpLoadingStatus
          toolName={block.attrs.tool || block.attrs.toolName || ""}
          serverName={block.attrs.url || block.attrs.serverUrl || ""}
          args={block.attrs.args || ""}
        />
      {:else if block.name === 'auto:mcp_result'}
        <McpResultCard
          serverName={block.attrs.serverName || ""}
          toolName={block.attrs.toolName || ""}
          args={block.attrs.args || ""}
          content={block.content || ""}
        />
      {:else}
        <ToolCard name={block.name} content={block.content} />
      {/if}
    {/if}
  {/each}

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
    max-width: 100%;
    min-width: 0;
    overflow: hidden;
    box-sizing: border-box;
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

  .bds-question-content {
    min-width: 0;
    flex: 1;
    overflow: hidden;
  }

  .bds-question-subtitle {
    font-size: 13px;
    color: var(--bds-text-secondary, #8e8ea0);
    margin-top: 2px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .bds-character-icon {
    color: #10b981; /* Emerald Green for success/creation */
    background: rgba(16, 185, 129, 0.1);
  }

  .bds-character-card {
    border-left: 3px solid #10b981;
  }

  .bds-skill-icon {
    color: #8b5cf6;
    background: rgba(139, 92, 246, 0.1);
  }

  .bds-skill-card {
    border-left: 3px solid #8b5cf6;
  }

  .bds-web-fetch-icon {
    color: #0ea5e9;
    background: rgba(14, 165, 233, 0.1);
  }

  .bds-web-fetch-card {
    border-left: 3px solid #0ea5e9;
  }

  .bds-github-fetch-icon {
    color: #6e40c9;
    background: rgba(110, 64, 201, 0.1);
  }

  .bds-github-fetch-card {
    border-left: 3px solid #6e40c9;
  }

  .bds-search-info-icon {
    color: #22c55e;
    background: rgba(34, 197, 94, 0.1);
  }

  .bds-search-info-card {
    border-left: 3px solid #22c55e;
  }

  .bds-memory-icon {
    color: #f59e0b;
    background: rgba(245, 158, 11, 0.1);
  }

  .bds-memory-card {
    border-left: 3px solid #f59e0b;
  }

  /* Overrides for bds-questions-card */
  .bds-questions-card {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    padding: 0 !important;
    gap: 0;
  }

  /* Header Toggle */
  .bds-q-header-toggle {
    display: flex;
    align-items: center;
    width: 100%;
    gap: 12px;
    padding: 14px 16px;
    cursor: pointer;
    box-sizing: border-box;
    transition: background-color 0.2s ease;
  }

  .bds-q-header-toggle:hover {
    background-color: var(--bds-bg-hover, rgba(255, 255, 255, 0.04));
  }

  /* Title and count wrapper */
  .bds-q-title-area {
    flex-grow: 1;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .bds-questions-card .bds-question-title {
    font-weight: 600;
    font-size: 14px;
    color: var(--bds-text-primary, #ececec);
    margin: 0;
    padding: 0;
    line-height: 1;
    user-select: text;
  }

  .bds-questions-card .bds-q-count {
    font-weight: 500;
    font-size: 12px;
    color: var(--bds-text-secondary, #8e8ea0);
    background: var(--bds-bg-hover, rgba(255, 255, 255, 0.08));
    padding: 2px 6px;
    border-radius: 6px;
  }

  .bds-chevron {
    font-size: 11px;
    color: var(--bds-text-tertiary, #6b6b7b);
    flex-shrink: 0;
    width: 16px;
    text-align: center;
  }

  /* Expanded list style */
  .bds-questions-list {
    margin: 0;
    padding: 0 16px 16px 16px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    border-top: 1px solid var(--bds-border, #3a3b3f);
    background: rgba(0, 0, 0, 0.05);
  }

  .bds-q-item {
    border-radius: 8px;
  }

  .bds-q-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px;
    cursor: pointer;
    font-size: 13px;
    border-radius: 6px;
    transition: background 0.15s;
  }

  .bds-q-header:hover {
    background: var(--bds-bg-hover, rgba(255, 255, 255, 0.06));
  }

  .bds-q-num {
    color: var(--bds-text-secondary, #8e8ea0);
    font-weight: 600;
    min-width: 20px;
    flex-shrink: 0;
    text-align: right;
  }

  .bds-q-text {
    color: var(--bds-text-primary, #ececec);
    flex-grow: 1;
    line-height: 1.4;
    user-select: text;
  }

  .bds-q-type {
    font-size: 11px;
    font-weight: 500;
    color: var(--bds-accent, #5b7bff);
    background: var(--bds-bg-hover, rgba(255, 255, 255, 0.08));
    padding: 2px 8px;
    border-radius: 10px;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .bds-q-detail {
    margin: 4px 0 8px 32px;
    padding-left: 12px;
    border-left: 2px solid var(--bds-bg-hover, rgba(255, 255, 255, 0.08));
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .bds-q-options {
    font-size: 13px;
    color: var(--bds-text-secondary, #8e8ea0);
    display: flex;
    flex-direction: column;
    gap: 2px;
    user-select: text;
  }

  .bds-q-opt-row {
    padding: 2px 0;
    font-size: 13px;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .bds-q-answer-row {
    display: flex;
    align-items: center;
  }

  .bds-q-answer {
    color: var(--bds-accent, #5b7bff);
    font-size: 13px;
    font-weight: 500;
    background: var(--bds-bg-hover, rgba(255, 255, 255, 0.08));
    padding: 2px 10px;
    border-radius: 12px;
    user-select: text;
  }

  .bds-message-overlay {
    margin-top: 10px;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
    font-family: inherit;
    color: inherit;
    max-width: 100%;
    min-width: 0;
    overflow: hidden;
    box-sizing: border-box;
  }

  .bds-sanitized-text {
    font: var(--dsw-font-markdown-base, inherit);
    color: var(--dsw-alias-label-primary, var(--bds-text-primary, currentColor));
    background: transparent;
  }

  .bds-sanitized-text :global(strong) {
    font-weight: 600;
  }

  .bds-sanitized-text :global(em) {
    font-style: italic;
  }

  .bds-sanitized-text :global(img) {
    max-width: 100%;
  }

  .bds-sanitized-text :global(h1) {
    font: var(--dsw-font-markdown-h1, 600 1.75em/1.3 inherit);
  }

  .bds-sanitized-text :global(h2) {
    font: var(--dsw-font-markdown-h2, 600 1.5em/1.3 inherit);
  }

  .bds-sanitized-text :global(h3) {
    font: var(--dsw-font-markdown-h3, 600 1.25em/1.3 inherit);
  }

  .bds-sanitized-text :global(h4) {
    font: var(--dsw-font-markdown-h4, 600 1.1em/1.3 inherit);
  }

  .bds-sanitized-text :global(h5),
  .bds-sanitized-text :global(h6) {
    font: var(--dsw-font-markdown-base-strong, 600 1em/1.3 inherit);
  }

  .bds-sanitized-text :global(h1 strong),
  .bds-sanitized-text :global(h2 strong),
  .bds-sanitized-text :global(h3 strong),
  .bds-sanitized-text :global(h4 strong),
  .bds-sanitized-text :global(h5 strong),
  .bds-sanitized-text :global(h6 strong) {
    font-weight: inherit;
  }

  .bds-sanitized-text :global(h1),
  .bds-sanitized-text :global(h2),
  .bds-sanitized-text :global(h3) {
    margin: 32px 0 16px;
  }

  .bds-sanitized-text :global(h4),
  .bds-sanitized-text :global(h5),
  .bds-sanitized-text :global(h6),
  .bds-sanitized-text :global(p) {
    margin: 16px 0;
  }

  .bds-sanitized-text :global(h4+ul),
  .bds-sanitized-text :global(h5+ul),
  .bds-sanitized-text :global(h6+ul),
  .bds-sanitized-text :global(h4+ol),
  .bds-sanitized-text :global(h5+ol),
  .bds-sanitized-text :global(h6+ol) {
    margin-top: 8px;
  }

  .bds-sanitized-text :global(h4:has(+ul)),
  .bds-sanitized-text :global(h5:has(+ul)),
  .bds-sanitized-text :global(h6:has(+ul)),
  .bds-sanitized-text :global(h4:has(+ol)),
  .bds-sanitized-text :global(h5:has(+ol)),
  .bds-sanitized-text :global(h6:has(+ol)) {
    margin-bottom: 8px;
  }

  .bds-sanitized-text :global(h1 .header-anchor),
  .bds-sanitized-text :global(h2 .header-anchor),
  .bds-sanitized-text :global(h3 .header-anchor),
  .bds-sanitized-text :global(h4 .header-anchor),
  .bds-sanitized-text :global(h5 .header-anchor),
  .bds-sanitized-text :global(h6 .header-anchor) {
    opacity: 0;
    margin-left: 4px;
  }

  .bds-sanitized-text :global(h1:hover .header-anchor),
  .bds-sanitized-text :global(h2:hover .header-anchor),
  .bds-sanitized-text :global(h3:hover .header-anchor),
  .bds-sanitized-text :global(h4:hover .header-anchor),
  .bds-sanitized-text :global(h5:hover .header-anchor),
  .bds-sanitized-text :global(h6:hover .header-anchor) {
    opacity: 1;
  }

  .bds-sanitized-text :global(a:not(.ds-a)) {
    color: var(--dsw-alias-brand-text, var(--bds-accent, #5b7bff));
    transition: box-shadow var(--ds-transition-duration) var(--ds-ease-in-out);
    border: 2px solid rgba(255,255,255,0);
    border-width: 2px 3px;
    margin-left: -3px;
    margin-right: -3px;
    text-decoration: none;
    position: relative;
  }

  .bds-sanitized-text :global(a:not(.ds-a):hover),
  .bds-sanitized-text :global(a:not(.ds-a):focus) {
    -webkit-text-decoration: underline var(--dsw-alias-brand-text, var(--bds-accent, #5b7bff));
    text-decoration: underline var(--dsw-alias-brand-text, var(--bds-accent, #5b7bff));
    outline: none;
  }

  .bds-sanitized-text :global(a:not(.ds-a):focus-visible) {
    box-shadow: 0 0 0 2px var(--dsw-alias-brand-text, var(--bds-accent, #5b7bff));
  }

  .bds-sanitized-text :global(li>ul),
  .bds-sanitized-text :global(li>ol) {
    margin-top: 4px;
  }

  .bds-sanitized-text :global(ul) {
    margin: 16px 0;
    padding-left: 18px;
  }

  .bds-sanitized-text :global(ol) {
    margin: 16px 0;
    padding-left: 28px;
  }

  .bds-sanitized-text :global(li:not(:first-child)) {
    margin-top: 6px;
  }

  .bds-sanitized-text :global(li::marker) {
    color: var(--dsw-alias-label-secondary, var(--bds-text-secondary, #8e8ea0));
    line-height: 28px;
  }

  .bds-sanitized-text :global(ul ol),
  .bds-sanitized-text :global(ol ol) {
    padding-left: 0;
    list-style-position: inside;
  }

  .bds-sanitized-text :global(ul ol li p),
  .bds-sanitized-text :global(ol ol li p) {
    display: inline;
  }

  .bds-sanitized-text :global(hr) {
    background: var(--dsw-alias-border-l2, var(--bds-border, #3a3b3f));
    border: none;
    height: 1px;
    margin: 32px 0;
    display: block;
  }

  .bds-sanitized-text :global(blockquote) {
    border-left: 2px solid var(--dsw-alias-label-caption, var(--bds-text-tertiary, #6b6b7b));
    margin: 16px 0;
    padding-left: 14px;
  }

  .bds-sanitized-text :global(table) {
    border-collapse: collapse;
    width: 100%;
    max-width: 100%;
    margin: 16px 0;
    display: block;
    overflow-x: auto;
  }

  .bds-sanitized-text :global(th) {
    border-bottom: 1px solid var(--dsw-alias-border-l3, var(--bds-border, #4a4b50));
    font: var(--dsw-font-markdown-table-head, 600 1em inherit);
    max-width: min(30vw,320px);
    border-top: none;
    min-width: 100px;
    padding: 10px 16px;
  }

  .bds-sanitized-text :global(th:not(:is(:lang(ae),:lang(ar),:lang(arc),:lang(bcc),:lang(bqi),:lang(ckb),:lang(dv),:lang(fa),:lang(glk),:lang(he),:lang(ku),:lang(mzn),:lang(nqo),:lang(pnb),:lang(ps),:lang(sd),:lang(ug),:lang(ur),:lang(yi)))) {
    text-align: left;
  }

  .bds-sanitized-text :global(th:is(:lang(ae),:lang(ar),:lang(arc),:lang(bcc),:lang(bqi),:lang(ckb),:lang(dv),:lang(fa),:lang(glk),:lang(he),:lang(ku),:lang(mzn),:lang(nqo),:lang(pnb),:lang(ps),:lang(sd),:lang(ug),:lang(ur),:lang(yi))) {
    text-align: right;
  }

  .bds-sanitized-text :global(th:first-child) {
    padding-left: 0;
  }

  .bds-sanitized-text :global(td) {
    border-bottom: 1px solid var(--dsw-alias-border-l2, var(--bds-border, #3a3b3f));
    font: var(--dsw-font-markdown-table, 1em inherit);
    min-width: 100px;
    max-width: min(30vw,320px);
    padding: 10px 16px;
  }

  .bds-sanitized-text :global(td:first-child) {
    padding-left: 0;
  }

  .bds-sanitized-text :global(td:last-child) {
    padding-right: 0;
  }

  .bds-sanitized-text :global(pre) {
    font-family: var(--ds-font-family-code);
    margin: 16px 0;
    overflow-x: auto;
    background: var(--bds-bg-code, rgba(0, 0, 0, 0.2));
    padding: 1em;
    border-radius: 8px;
    border: 1px solid var(--bds-border, rgba(255, 255, 255, 0.1));
  }

  .bds-sanitized-text :global(code) {
    box-sizing: border-box;
    font: var(--dsw-font-markdown-code, 0.9em monospace);
    font-family: var(--ds-font-family-code);
    background-color: var(--dsw-alias-markdown-inline-code, rgba(255, 255, 255, 0.08));
    border-radius: 6px;
    align-items: center;
    padding: 0 5px;
    display: inline-flex;
    font-size: .875em;
  }

  .bds-sanitized-text :global(h1 code),
  .bds-sanitized-text :global(h2 code),
  .bds-sanitized-text :global(h3 code),
  .bds-sanitized-text :global(h4 code),
  .bds-sanitized-text :global(h5 code),
  .bds-sanitized-text :global(h6 code) {
    font: inherit;
    font-family: var(--ds-font-family-code);
  }

  .bds-sanitized-text :global(table code) {
    font-size: 13px;
  }

  .bds-sanitized-text :global(li>p) {
    margin: 8px 0;
  }

  .bds-sanitized-text :global(li>:first-child) {
    margin-top: 0;
  }

  .bds-sanitized-text :global(li>:last-child:not(.md-code-block)) {
    margin-bottom: 0;
  }

  .bds-sanitized-text :global(>:first-child) {
    margin-top: 0!important;
  }

  .bds-sanitized-text :global(>:last-child) {
    margin-bottom: 0!important;
  }
  /* ── RTL support ── */
.bds-message-overlay.rtl {
  direction: rtl;
  text-align: right;
  unicode-bidi: isolate;
}

/* Keep code blocks, tables, and other LTR‑only elements LTR */
.bds-message-overlay.rtl pre,
.bds-message-overlay.rtl code,
.bds-message-overlay.rtl .bds-code-block,
.bds-message-overlay.rtl table,
.bds-message-overlay.rtl th,
.bds-message-overlay.rtl td {
  direction: ltr;
  text-align: left;
  unicode-bidi: embed;
}

/* Adjust lists, blockquotes, etc. for RTL */
.bds-message-overlay.rtl ul,
.bds-message-overlay.rtl ol {
  padding-right: 1.5em;
  padding-left: 0;
}

.bds-message-overlay.rtl blockquote {
  border-right: 2px solid var(--dsw-alias-label-caption, var(--bds-text-tertiary, #6b6b7b));
  border-left: none;
  padding-right: 14px;
  padding-left: 0;
}

/* Override table header alignment for RTL */
.bds-message-overlay.rtl th:is(:lang(ae),:lang(ar),:lang(arc),:lang(bcc),:lang(bqi),:lang(ckb),:lang(dv),:lang(fa),:lang(glk),:lang(he),:lang(ku),:lang(mzn),:lang(nqo),:lang(pnb),:lang(ps),:lang(sd),:lang(ug),:lang(ur),:lang(yi)) {
  text-align: right;
}
.bds-message-overlay.rtl th:not(:is(:lang(ae),:lang(ar),:lang(arc),:lang(bcc),:lang(bqi),:lang(ckb),:lang(dv),:lang(fa),:lang(glk),:lang(he),:lang(ku),:lang(mzn),:lang(nqo),:lang(pnb),:lang(ps),:lang(sd),:lang(ug),:lang(ur),:lang(yi))) {
  text-align: left;
}

</style>
