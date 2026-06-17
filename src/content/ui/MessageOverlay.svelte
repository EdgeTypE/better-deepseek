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
  import ProposeScriptCard from "./ProposeScriptCard.svelte";
  import DiffCard from "./DiffCard.svelte";
  import WorkflowStepsCard from "./WorkflowStepsCard.svelte";
  import LoadingIndicator from "./LoadingIndicator.svelte";
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
  let { text, blocks = [], loading = false, loadingIndex = 1 } = $props();

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

  function parseQuestions(content) {
    try {
      const parsed = JSON.parse(content);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
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
          <!-- Entire header is the toggle now, giving excellent click area and UX -->
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
      {:else if block.name === 'propose_local_script'}
        <ProposeScriptCard content={block.content} language={block.attrs.lang || block.attrs.language} />
      {:else if block.name === 'diff_request'}
        <DiffCard attrs={block.attrs} />
      {:else if block.name === 'workflow_steps'}
        <WorkflowStepsCard content={block.content} />
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
    font-size: inherit;
    line-height: inherit;
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
    font-family: inherit;
    font-size: inherit;
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

</style>
