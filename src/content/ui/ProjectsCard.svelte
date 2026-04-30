<script>
  let { onmanage } = $props();
</script>

<div class="bds-section-title">
  <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
    <div style="display: flex; align-items: center;">
      <span class="bds-icon-inline">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M2 3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3Z" fill="currentColor" opacity="0.4"/>
          <path d="M2 8a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8Z" fill="currentColor" opacity="0.6"/>
          <path d="M3 12a1 1 0 0 0 0 2h10a1 1 0 0 0 0-2H3Z" fill="currentColor"/>
        </svg>
      </span>
      Projects
    </div>
    <button
      type="button"
      class="bds-btn-outlined"
      style="font-size: 11px; padding: 3px 8px;"
      onclick={onmanage}
    >
      Manage
    </button>
  </div>
</div>
<p style="font-size: 11px; opacity: 0.45; margin: 0 0 4px; padding: 0 2px;">
  Project &amp; file selection available below the chat input.
</p>
