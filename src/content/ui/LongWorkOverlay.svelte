<script>
  let { visible = false } = $props();
</script>

<div
  id="bds-long-work-overlay"
  class={visible ? "bds-visible" : "bds-hidden"}
>
  <div class="bds-loader-card">
    <strong>Working...</strong>
    <p>Thinking and building your output</p>
    <div class="bds-dots">
      <span></span><span></span><span></span>
    </div>
  </div>
</div>
