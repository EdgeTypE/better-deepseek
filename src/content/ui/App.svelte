<script>
  import Drawer from "./Drawer.svelte";
  import LongWorkOverlay from "./LongWorkOverlay.svelte";
  import ToastStack from "./ToastStack.svelte";

  let drawerOpen = $state(false);
  let overlayVisible = $state(false);

  /** @type {Array<{id: number, message: string}>} */
  let toasts = $state([]);
  let toastId = 0;

  // ── Public API (called from non-Svelte code via mount.js) ──

  export function showLongWorkOverlay(show) {
    overlayVisible = show;
  }

  export function showToast(message) {
    const id = ++toastId;
    toasts = [...toasts, { id, message }];

    setTimeout(() => {
      toasts = toasts.filter((t) => t.id !== id);
    }, 2880);
  }

  // Settings/skills/memories refresh — forwarded to Drawer
  let drawerRef = $state(null);

  export function refreshSettings() {
    if (drawerRef) drawerRef.refreshSettings();
  }
  export function refreshSkills() {
    if (drawerRef) drawerRef.refreshSkills();
  }
  export function refreshMemories() {
    if (drawerRef) drawerRef.refreshMemories();
  }

  function toggleDrawer() {
    drawerOpen = !drawerOpen;
  }

  function closeDrawer() {
    drawerOpen = false;
  }
</script>

<button id="bds-toggle" type="button" onclick={toggleDrawer}>BDS</button>

<Drawer bind:this={drawerRef} open={drawerOpen} onclose={closeDrawer} />

<LongWorkOverlay visible={overlayVisible} />

<ToastStack {toasts} />
