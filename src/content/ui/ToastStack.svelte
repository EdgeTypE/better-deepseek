<script>
  let { toasts = [] } = $props();
</script>

<div id="bds-toast-stack">
  {#each toasts as toast (toast.id)}
    <div class="bds-toast">{toast.message}</div>
  {/each}
</div>
