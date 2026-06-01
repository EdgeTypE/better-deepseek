<script>
  import { onMount } from "svelte";
  import { remoteConfig, getFlag, getConfig, detectModelType, REMOTE_CONFIG_EVENT } from "../../lib/remote-config.svelte.js";

  let visible = $state(false);
  let currentModel = $state("—");
  let configSnapshot = $state({});
  let pendingOverrides = $state({});
  let activeTab = $state("features");

  function show() { visible = true; }
  function hide() { visible = false; }
  function toggle() { visible = !visible; }

  function refresh() {
    currentModel = detectModelType();
    configSnapshot = remoteConfig.raw;
  }

  onMount(() => {
    refresh();
    window.addEventListener(REMOTE_CONFIG_EVENT, refresh);
    window.addEventListener("bds:toggle-debug-panel", toggle);

    return () => {
      window.removeEventListener(REMOTE_CONFIG_EVENT, refresh);
      window.removeEventListener("bds:toggle-debug-panel", toggle);
    };
  });

  function setBool(path, value) {
    setNested(pendingOverrides, path, value);
    pendingOverrides = { ...pendingOverrides };
  }

  function setNested(obj, path, value) {
    const parts = path.split(".");
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!cur[parts[i]] || typeof cur[parts[i]] !== "object") cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = value;
  }

  function getNested(obj, path) {
    const parts = path.split(".");
    let cur = obj;
    for (const p of parts) {
      if (cur == null || typeof cur !== "object") return undefined;
      cur = cur[p];
    }
    return cur;
  }

  function applyChanges() {
    if (Object.keys(pendingOverrides).length > 0) {
      remoteConfig.applyRemote(pendingOverrides);
      pendingOverrides = {};
    }
  }

  function resetAll() {
    remoteConfig.resetToBuiltin();
    pendingOverrides = {};
  }

  function modelBadgeClass(m) {
    if (m === "expert") return "bds-cdbadge bds-cdbadge--expert";
    if (m === "deepthink") return "bds-cdbadge bds-cdbadge--deepthink";
    return "bds-cdbadge bds-cdbadge--instant";
  }

  function isBool(v) { return typeof v === "boolean"; }
  function isObj(v) { return v && typeof v === "object" && !Array.isArray(v); }

  function keyDisplay(key) {
    return key.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase());
  }

  function getOverride(path) {
    return getNested(pendingOverrides, path);
  }

  function getEffective(path) {
    const ov = getOverride(path);
    return ov !== undefined ? ov : getFlag(path);
  }
</script>

{#if visible}
<div class="bds-cdpanel">
  <div class="bds-cdpanel-header">
    <span class="bds-cdpanel-title">BDS Config Debug</span>
    <button class="bds-cdpanel-close" onclick={() => (visible = false)}>×</button>
  </div>

  <div class="bds-cdpanel-body">
    <div class="bds-cdpanel-section">
      <span class="bds-cdlabel">Detected Model</span>
      <span class={modelBadgeClass(currentModel)}>{currentModel}</span>
    </div>

    <div class="bds-cdpanel-tabs">
      <button
        class="bds-cdtab"
        class:bds-cdtab--active={activeTab === "features"}
        onclick={() => (activeTab = "features")}>Features</button>
      <button
        class="bds-cdtab"
        class:bds-cdtab--active={activeTab === "attach"}
        onclick={() => (activeTab = "attach")}>AttachMenu</button>
      <button
        class="bds-cdtab"
        class:bds-cdtab--active={activeTab === "raw"}
        onclick={() => (activeTab = "raw")}>Raw JSON</button>
    </div>

    <div class="bds-cdpanel-content">
      {#if activeTab === "features"}
        <div class="bds-cdgroup">
          <div class="bds-cdgroup-title">Feature Flags</div>
          {#each Object.entries(configSnapshot.features || {}) as [key, val]}
            <div class="bds-cdrow">
              <span class="bds-cdkey">{keyDisplay(key)}</span>
              {#if isBool(val)}
                <label class="bds-cdtoggle">
                  <input
                    type="checkbox"
                    checked={getEffective("features." + key)}
                    onchange={(e) => setBool("features." + key, e.target.checked)}
                  />
                  <span class="bds-cdslider"></span>
                </label>
              {:else if isObj(val)}
                <div class="bds-cdsub">
                  {#each Object.entries(val) as [subKey, subVal]}
                    <div class="bds-cdrow">
                      <span class="bds-cdkey">{keyDisplay(subKey)}</span>
                      {#if isBool(subVal)}
                        <label class="bds-cdtoggle">
                          <input
                            type="checkbox"
                            checked={getEffective("features." + key + "." + subKey)}
                            onchange={(e) => setBool("features." + key + "." + subKey, e.target.checked)}
                          />
                          <span class="bds-cdslider"></span>
                        </label>
                      {:else if isObj(subVal)}
                        <div class="bds-cdsub">
                          {#each Object.entries(subVal) as [leafKey, leafVal]}
                            <div class="bds-cdrow">
                              <span class="bds-cdkey">{keyDisplay(leafKey)}</span>
                              {#if isBool(leafVal)}
                                <label class="bds-cdtoggle">
                                  <input
                                    type="checkbox"
                                    checked={getEffective("features." + key + "." + subKey + "." + leafKey)}
                                    onchange={(e) => setBool("features." + key + "." + subKey + "." + leafKey, e.target.checked)}
                                  />
                                  <span class="bds-cdslider"></span>
                                </label>
                              {:else}
                                <span class="bds-cdval">{String(leafVal)}</span>
                              {/if}
                            </div>
                          {/each}
                        </div>
                      {:else}
                        <span class="bds-cdval">{String(subVal)}</span>
                      {/if}
                    </div>
                  {/each}
                </div>
              {:else}
                <span class="bds-cdval">{String(val)}</span>
              {/if}
            </div>
          {/each}
        </div>
      {/if}

      {#if activeTab === "attach"}
        <div class="bds-cdgroup">
          <div class="bds-cdgroup-title">AttachMenu — {currentModel} mode</div>
          {#each ["enabled", "show", "showPlus", "showUploadFile", "showUploadFolder", "showGithub", "showWeb", "showProject", "showVoice"] as flag}
            <div class="bds-cdrow">
              <span class="bds-cdkey">{keyDisplay(flag)}</span>
              <label class="bds-cdtoggle">
                <input
                  type="checkbox"
                  checked={getEffective(currentModel === "expert" ? "features.attachMenu.expertMode." + flag : currentModel === "deepthink" ? "features.attachMenu.deepthinkMode." + flag : "features.attachMenu.instantMode." + flag)}
                  onchange={(e) => {
                    const p = "features.attachMenu." + (currentModel === "expert" ? "expertMode" : currentModel === "deepthink" ? "deepthinkMode" : "instantMode") + "." + flag;
                    setBool(p, e.target.checked);
                  }}
                />
                <span class="bds-cdslider"></span>
              </label>
            </div>
          {/each}
        </div>

        <div class="bds-cdgroup">
          <div class="bds-cdgroup-title">Expert Mode (independent override)</div>
          {#each ["show", "showPlus", "showUploadFile", "showUploadFolder", "showGithub", "showWeb", "showProject", "showVoice"] as flag}
            <div class="bds-cdrow">
              <span class="bds-cdkey">{keyDisplay(flag)}</span>
              <label class="bds-cdtoggle">
                <input
                  type="checkbox"
                  checked={getEffective("features.attachMenu.expertMode." + flag)}
                  onchange={(e) => setBool("features.attachMenu.expertMode." + flag, e.target.checked)}
                />
                <span class="bds-cdslider"></span>
              </label>
            </div>
          {/each}
        </div>
      {/if}

      {#if activeTab === "raw"}
        <div class="bds-cdgroup">
          <div class="bds-cdgroup-title">Pending Overrides</div>
          <pre class="bds-cdpre">{JSON.stringify(pendingOverrides, null, 2) || "{}"}</pre>
        </div>
        <div class="bds-cdgroup">
          <div class="bds-cdgroup-title">Merged Config</div>
          <pre class="bds-cdpre">{JSON.stringify(configSnapshot, null, 2)}</pre>
        </div>
      {/if}
    </div>

    <div class="bds-cdpanel-actions">
      <button class="bds-cdbtn bds-cdbtn--apply" onclick={applyChanges}
        disabled={Object.keys(pendingOverrides).length === 0}>
        Apply Overrides
      </button>
      <button class="bds-cdbtn bds-cdbtn--reset" onclick={resetAll}>
        Reset to Defaults
      </button>
      <button class="bds-cdbtn bds-cdbtn--refresh" onclick={refresh}>
        Refresh
      </button>
    </div>
  </div>
</div>
{/if}

<style>
  .bds-cdpanel {
    position: fixed;
    top: 60px;
    right: 16px;
    z-index: 9999999;
    width: 380px;
    max-height: calc(100vh - 80px);
    background: var(--bds-bg-panel);
    border: 1px solid var(--bds-border);
    border-radius: var(--bds-radius);
    box-shadow: var(--bds-shadow);
    display: flex;
    flex-direction: column;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 13px;
    color: var(--bds-text-primary);
    overflow: hidden;
  }
  .bds-cdpanel-header {
    display: flex;
    align-items: center;
    padding: 10px 14px;
    border-bottom: 1px solid var(--bds-border);
    background: var(--bds-bg-elevated);
    flex-shrink: 0;
  }
  .bds-cdpanel-title {
    font-weight: 700;
    font-size: 14px;
    flex: 1;
  }
  .bds-cdpanel-close {
    cursor: pointer;
    background: none;
    border: none;
    color: var(--bds-text-tertiary);
    font-size: 20px;
    padding: 0 4px;
    line-height: 1;
    font-family: inherit;
  }
  .bds-cdpanel-close:hover { color: var(--bds-text-primary); }
  .bds-cdpanel-body {
    padding: 10px 14px 14px;
    overflow-y: auto;
    flex: 1;
  }
  .bds-cdpanel-section {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
  }
  .bds-cdlabel {
    font-size: 12px;
    font-weight: 600;
    color: var(--bds-text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .bds-cdbadge {
    font-size: 11px;
    font-weight: 700;
    padding: 2px 10px;
    border-radius: 999px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .bds-cdbadge--instant { background: #1a3a2e; color: #4ade80; }
  .bds-cdbadge--expert { background: #3a1a2e; color: #f87171; }
  .bds-cdbadge--deepthink { background: #2a1a4e; color: #a78bfa; }

  .bds-cdpanel-tabs {
    display: flex;
    gap: 4px;
    margin-bottom: 10px;
  }
  .bds-cdtab {
    flex: 1;
    padding: 6px 0;
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--bds-text-tertiary);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all var(--bds-transition);
    font-family: inherit;
  }
  .bds-cdtab:hover { color: var(--bds-text-secondary); }
  .bds-cdtab--active {
    color: var(--bds-accent);
    border-bottom-color: var(--bds-accent);
  }

  .bds-cdpanel-content { flex: 1; overflow-y: auto; }

  .bds-cdgroup { margin-bottom: 12px; }
  .bds-cdgroup-title {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--bds-accent);
    margin-bottom: 6px;
  }

  .bds-cdrow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 0;
    gap: 8px;
  }
  .bds-cdkey {
    font-size: 12px;
    color: var(--bds-text-primary);
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .bds-cdval {
    font-size: 11px;
    color: var(--bds-text-tertiary);
    font-family: monospace;
    max-width: 180px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .bds-cdsub {
    flex: 1;
    padding-left: 12px;
    border-left: 1px solid var(--bds-border);
  }

  .bds-cdtoggle {
    position: relative;
    display: inline-block;
    width: 32px;
    height: 18px;
    flex-shrink: 0;
  }
  .bds-cdtoggle input {
    opacity: 0;
    width: 0;
    height: 0;
  }
  .bds-cdslider {
    position: absolute;
    cursor: pointer;
    inset: 0;
    background: var(--bds-border);
    border-radius: 999px;
    transition: 0.2s;
  }
  .bds-cdslider::before {
    content: "";
    position: absolute;
    width: 14px;
    height: 14px;
    left: 2px;
    bottom: 2px;
    background: var(--bds-text-tertiary);
    border-radius: 50%;
    transition: 0.2s;
  }
  .bds-cdtoggle input:checked + .bds-cdslider { background: var(--bds-accent); }
  .bds-cdtoggle input:checked + .bds-cdslider::before {
    transform: translateX(14px);
    background: #fff;
  }

  .bds-cdpre {
    font-size: 11px;
    line-height: 1.4;
    background: var(--bds-bg-elevated);
    border-radius: 6px;
    padding: 8px;
    max-height: 200px;
    overflow: auto;
    margin: 0;
    white-space: pre-wrap;
    word-break: break-all;
    color: var(--bds-text-secondary);
  }

  .bds-cdpanel-actions {
    display: flex;
    gap: 6px;
    margin-top: 10px;
    flex-shrink: 0;
    flex-wrap: wrap;
  }
  .bds-cdbtn {
    flex: 1;
    min-width: 80px;
    padding: 7px 10px;
    border: none;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity var(--bds-transition);
    font-family: inherit;
  }
  .bds-cdbtn:disabled { opacity: 0.35; cursor: not-allowed; }
  .bds-cdbtn:hover:not(:disabled) { opacity: 0.85; }
  .bds-cdbtn--apply { background: var(--bds-accent); color: #fff; }
  .bds-cdbtn--reset { background: var(--bds-danger); color: #fff; }
  .bds-cdbtn--refresh { background: var(--bds-bg-elevated); color: var(--bds-text-secondary); border: 1px solid var(--bds-border); }
</style>
