<script>
  import { t } from "../../lib/i18n.svelte.js";

  let { store, onsave } = $props();

  let request = $derived(store.request);
  let apiKeys = $derived(store.apiKeys);
  let activeKeyId = $derived(store.activeKeyId);

  let collapsedSections = $state({
    streaming: true,
    output: true,
    tools: true,
    more: true,
  });

  let toolsText = $state("");
  let toolsError = $state("");

  $effect(() => {
    if (request.tools?.length) {
      toolsText = JSON.stringify(request.tools, null, 2);
    }
  });

  let thinkingValue = $derived(
    request.thinking?.type === 'enabled'
      ? request.reasoningEffort === 'max' ? 'max' : 'high'
      : 'disabled'
  );

  function setThinkingMode(val) {
    if (val === 'disabled') {
      store.updateRequest({ thinking: { type: 'disabled' }, reasoningEffort: undefined });
    } else {
      store.updateRequest({ thinking: { type: 'enabled' }, reasoningEffort: val });
    }
  }

  function toggleSection(name) {
    collapsedSections[name] = !collapsedSections[name];
  }

  function handleToolsBlur() {
    if (!toolsText.trim()) {
      store.updateRequest({ tools: [], toolChoice: "auto" });
      toolsError = "";
      return;
    }
    const err = store.updateTools(toolsText);
    toolsError = err || "";
  }

  function getKeyName(id) {
    return apiKeys.find((k) => k.id === id)?.name || "(unknown)";
  }

  function getKeyMasked(id) {
    const k = apiKeys.find((k) => k.id === id);
    if (!k) return "";
    return k.key.slice(0, 8) + "..." + k.key.slice(-4);
  }

  function getRoleClass(role) {
    return 'bds-api-msg-row-' + role;
  }
</script>

<div class="bds-api-builder">
  <div class="bds-api-toolbar">
    <select
      value={request.endpoint}
      onchange={(e) => store.updateRequest({ endpoint: e.target.value })}
      class="bds-api-select"
    >
      <option value="chat/completions">POST /chat/completions</option>
      <option value="completions">POST /completions (Beta)</option>
      <option value="models">GET /models</option>
      <option value="user/balance">GET /user/balance</option>
    </select>

    <select
      value={request.model}
      onchange={(e) => store.updateRequest({ model: e.target.value })}
      class="bds-api-select"
      disabled={request.endpoint === 'models' || request.endpoint === 'user/balance'}
    >
      <option value="deepseek-flash">deepseek-flash</option>
      <option value="deepseek-v4-pro">deepseek-v4-pro</option>
    </select>

    <div class="bds-api-key-selector">
      <select
        value={activeKeyId || ''}
        onchange={(e) => store.setActiveKey(e.target.value)}
        class="bds-api-select"
      >
        <option value="">{t('apiPlayground.noKey')}</option>
        {#each apiKeys as key}
          <option value={key.id}>{key.name} ({getKeyMasked(key.id)})</option>
        {/each}
      </select>
      <button type="button" class="bds-api-btn bds-api-btn-sm" onclick={() => store.showKeyManager = true}>
        {t('apiPlayground.manageKeys')}
      </button>
    </div>

    {#if request.endpoint !== 'models' && request.endpoint !== 'user/balance'}
      <select
        value={thinkingValue}
        onchange={(e) => setThinkingMode(e.target.value)}
        class="bds-api-chip"
        title="Thinking mode"
      >
        <option value="disabled">🧠 off</option>
        <option value="high">🧠 high</option>
        <option value="max">🧠 max</option>
      </select>
    {/if}

    <button
      type="button"
      class="bds-api-btn bds-api-btn-primary"
      onclick={() => store.sendRequest()}
      disabled={store.isLoading}
    >
      {store.isLoading ? t('apiPlayground.sending') : t('apiPlayground.send')}
    </button>
  </div>

  {#if store.error}
    <div class="bds-api-error">{store.error}</div>
  {/if}

  {#if request.endpoint === 'chat/completions' || request.endpoint === 'completions'}
    <div class="bds-api-section">
      <div class="bds-api-section-title">{t('apiPlayground.messages')}</div>
      {#each request.messages || [] as msg, i}
        <div class="bds-api-msg-row {getRoleClass(msg.role)}">
          <select
            value={msg.role}
            onchange={(e) => store.updateMessage(i, { role: e.target.value })}
            class="bds-api-msg-role"
          >
            <option value="system">system</option>
            <option value="user">user</option>
            <option value="assistant">assistant</option>
            <option value="tool">tool</option>
          </select>
          {#if msg.role === 'assistant'}
            <label class="bds-api-checkbox-label">
              <input
                type="checkbox"
                checked={!!msg.prefix}
                onchange={(e) => store.updateMessage(i, { prefix: e.target.checked })}
              />
              prefix
            </label>
          {/if}
          {#if msg.role !== 'tool'}
            <input
              class="bds-api-msg-name"
              placeholder="name (optional)"
              value={msg.name || ''}
              oninput={(e) => store.updateMessage(i, { name: e.target.value })}
            />
          {/if}
          {#if msg.role === 'tool'}
            <input
              class="bds-api-msg-name"
              placeholder="tool_call_id"
              value={msg.tool_call_id || ''}
              oninput={(e) => store.updateMessage(i, { tool_call_id: e.target.value })}
            />
          {/if}
          <div class="bds-api-msg-actions">
            <button type="button" class="bds-api-btn bds-api-btn-sm" onclick={() => store.moveMessage(i, i - 1)} disabled={i === 0}>&#8593;</button>
            <button type="button" class="bds-api-btn bds-api-btn-sm" onclick={() => store.moveMessage(i, i + 1)} disabled={i === request.messages.length - 1}>&#8595;</button>
            <button type="button" class="bds-api-btn bds-api-btn-sm bds-api-btn-danger" onclick={() => store.removeMessage(i)}>&#10005;</button>
          </div>
          <textarea
            class="bds-api-msg-content"
            rows="3"
            placeholder={t('apiPlayground.messagePlaceholder')}
            value={msg.content || ''}
            oninput={(e) => store.updateMessage(i, { content: e.target.value })}
          ></textarea>
        </div>
      {/each}
      <div class="bds-api-add-msg">
        <button type="button" class="bds-api-btn" onclick={() => store.addMessage('system')}>+ system</button>
        <button type="button" class="bds-api-btn" onclick={() => store.addMessage('user')}>+ user</button>
        <button type="button" class="bds-api-btn" onclick={() => store.addMessage('assistant')}>+ assistant</button>
        <button type="button" class="bds-api-btn" onclick={() => store.addMessage('tool')}>+ tool</button>
      </div>
    </div>
  {:else if request.endpoint === 'completions'}
    <div class="bds-api-section">
      <div class="bds-api-section-title">FIM Completion</div>
      <label class="bds-api-field">
        <span>Prompt (prefix)</span>
        <textarea
          rows="4"
          value={request.prompt || ''}
          oninput={(e) => store.updateRequest({ prompt: e.target.value })}
          placeholder="def fibonacci(n):"
        ></textarea>
      </label>
      <label class="bds-api-field">
        <span>Suffix</span>
        <textarea
          rows="2"
          value={request.suffix || ''}
          oninput={(e) => store.updateRequest({ suffix: e.target.value })}
          placeholder="    return fib(n)"
        ></textarea>
      </label>
      <label class="bds-api-checkbox-label">
        <input type="checkbox" checked={!!request.echo} onchange={(e) => store.updateRequest({ echo: e.target.checked })} />
        echo (include prompt in response)
      </label>
    </div>
  {/if}

  {#if request.endpoint !== 'models' && request.endpoint !== 'user/balance'}
    <div class="bds-api-section">
      <div class="bds-api-section-title bds-api-collapsible" onclick={() => toggleSection('streaming')}>
        <span>Streaming</span>
        <span class="bds-api-chevron {collapsedSections.streaming ? '' : 'bds-api-chevron-open'}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </span>
      </div>
      {#if !collapsedSections.streaming}
        <div class="bds-api-section-body">
          <label class="bds-api-checkbox-label">
            <input type="checkbox" checked={request.stream} onchange={(e) => store.updateRequest({ stream: e.target.checked })} />
            Stream response
          </label>
          {#if request.stream}
            <label class="bds-api-checkbox-label">
              <input type="checkbox" checked={request.streamOptions?.includeUsage || false} onchange={(e) => store.updateRequest({ streamOptions: { includeUsage: e.target.checked } })} />
              Include usage in stream
            </label>
          {/if}
        </div>
      {/if}
    </div>

    <div class="bds-api-section">
      <div class="bds-api-section-title bds-api-collapsible" onclick={() => toggleSection('output')}>
        <span>Output Control</span>
        <span class="bds-api-chevron {collapsedSections.output ? '' : 'bds-api-chevron-open'}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </span>
      </div>
      {#if !collapsedSections.output}
        <div class="bds-api-section-body bds-api-grid">
          <label class="bds-api-field">
            <span>Max Tokens</span>
            <input type="number" value={request.maxTokens || 4096} oninput={(e) => store.updateRequest({ maxTokens: Number(e.target.value) || 4096 })} min="1" max="393216" />
          </label>
          <label class="bds-api-field">
            <span>Temperature ({request.temperature ?? 1.0})</span>
            <input type="range" value={request.temperature ?? 1.0} oninput={(e) => store.updateRequest({ temperature: Number(e.target.value) })} min="0" max="2" step="0.05" />
          </label>
          <label class="bds-api-field">
            <span>Top P ({request.topP ?? 1.0})</span>
            <input type="range" value={request.topP ?? 1.0} oninput={(e) => store.updateRequest({ topP: Number(e.target.value) })} min="0" max="1" step="0.05" />
          </label>
          <label class="bds-api-field">
            <span>Stop Sequences</span>
            <input
              placeholder="comma-separated"
              value={(request.stop || []).join(', ')}
              onchange={(e) => store.updateRequest({ stop: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
            />
          </label>
          <label class="bds-api-field">
            <span>Response Format</span>
            <select
              value={request.responseFormat?.type || 'text'}
              onchange={(e) => store.updateRequest({ responseFormat: { type: e.target.value } })}
            >
              <option value="text">Text</option>
              <option value="json_object">JSON Object</option>
            </select>
          </label>
          <label class="bds-api-field">
            <span>Logprobs</span>
            <input type="checkbox" checked={request.logprobs || false} onchange={(e) => {
              store.updateRequest({ logprobs: e.target.checked });
              if (!e.target.checked) store.updateRequest({ topLogprobs: 0 });
            }} />
          </label>
          {#if request.logprobs}
            <label class="bds-api-field">
              <span>Top Logprobs ({request.topLogprobs ?? 0})</span>
              <input type="number" value={request.topLogprobs || 0} oninput={(e) => store.updateRequest({ topLogprobs: Math.min(20, Math.max(0, Number(e.target.value) || 0)) })} min="0" max="20" />
            </label>
          {/if}
        </div>
      {/if}
    </div>

    {#if request.endpoint === 'chat/completions'}
      <div class="bds-api-section">
        <div class="bds-api-section-title bds-api-collapsible" onclick={() => toggleSection('tools')}>
          <span>Tool Calls</span>
          <span class="bds-api-chevron {collapsedSections.tools ? '' : 'bds-api-chevron-open'}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </span>
        </div>
        {#if !collapsedSections.tools}
          <div class="bds-api-section-body">
            <label class="bds-api-field">
              <span>Tool Choice</span>
              <select
                value={request.toolChoice || 'auto'}
                onchange={(e) => store.updateRequest({ toolChoice: e.target.value })}
              >
                <option value="auto">auto</option>
                <option value="none">none</option>
                <option value="required">required</option>
              </select>
            </label>
            <label class="bds-api-field">
              <span>Tools (JSON array)</span>
              <textarea
                rows="6"
                value={toolsText}
                oninput={(e) => toolsText = e.target.value}
                onblur={handleToolsBlur}
                placeholder={String.raw`[{ "type": "function", "function": { "name": "my_func", "parameters": { ... } } }]`}
              ></textarea>
              {#if toolsError}
                <div class="bds-api-field-error">{toolsError}</div>
              {/if}
            </label>
          </div>
        {/if}
      </div>
    {/if}

    <div class="bds-api-section">
      <div class="bds-api-section-title bds-api-collapsible" onclick={() => toggleSection('more')}>
        <span>More</span>
        <span class="bds-api-chevron {collapsedSections.more ? '' : 'bds-api-chevron-open'}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </span>
      </div>
      {#if !collapsedSections.more}
        <div class="bds-api-section-body">
          {#if request.endpoint === 'chat/completions'}
            <p class="bds-api-hint">Prefix completion requires <code>base_url="https://api.deepseek.com/beta"</code>. Set the last assistant message's <code>prefix</code> flag to true.</p>
          {/if}
          {#if request.endpoint === 'completions'}
            <p class="bds-api-hint">FIM completion uses <code>base_url="https://api.deepseek.com/beta"</code>. Max 4K tokens.</p>
          {/if}
          <label class="bds-api-field">
            <span>User ID (for isolation)</span>
            <input
              value={request.userId || ''}
              oninput={(e) => store.updateRequest({ userId: e.target.value })}
              placeholder="a-zA-Z0-9_-"
            />
          </label>
        </div>
      {/if}
    </div>
  {/if}

  <div class="bds-api-actions">
    <button type="button" class="bds-api-btn" onclick={onsave}>
      {t('apiPlayground.save')}
    </button>
    <button type="button" class="bds-api-btn" onclick={() => store.resetRequest()}>
      {t('apiPlayground.reset')}
    </button>
  </div>
</div>
