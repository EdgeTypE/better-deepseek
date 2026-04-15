<script>
  /** @type {{name: string, content: string}} */
  let { name, content } = $props();

  let headerTitle = $derived(name === 'run_python_embed' ? 'Python Runner' : name.toUpperCase());
</script>

<div class="bds-tool-card">
  <header>
    <h4>{headerTitle}</h4>
  </header>
  <div class="bds-tool-body">
    <code><pre>{content}</pre></code>
  </div>
</div>

<style>
  .bds-tool-card {
    border: 1px solid #d1d5db;
    border-radius: 8px;
    background: transparent;
    padding: 12px;
    margin: 10px 0;
  }

  h4 {
    margin: 0 0 8px 0;
    font-size: 13px;
    color: inherit;
  }

  .bds-tool-body {
    font-size: 12px;
  }

  pre {
    margin: 0;
    white-space: pre-wrap;
    font-family: monospace;
    background: rgba(0,0,0,0.05);
    padding: 8px;
    border-radius: 4px;
  }
</style>
