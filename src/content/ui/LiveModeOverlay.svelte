<script>
  /**
   * LiveModeOverlay — full-screen conversational voice UI (Gemini Live style).
   *
   * Visual model:
   *   · an aurora "orb" that breathes with the real microphone energy (canvas)
   *   · an optional transcript rail showing the assistant's reply (see `showText`)
   *   · a glass control dock (mute / end / interrupt) anchored at the bottom
   *
   * Everything is driven off the public surface of `liveEngine`:
   *   status · isMuted · analyser · activeAssistantNode
   * No engine behaviour is modified here — this component is presentation only.
   */
  import { onMount, onDestroy } from "svelte";
  import appState from "../state.js";
  import { liveEngine } from "../live/live-engine.js";
  import { extractMessageRawText } from "../dom/message-text.js";
  import { t } from "../../lib/i18n.svelte.js";

  /** @type {{ onclose: () => void }} */
  let { onclose } = $props();

  /**
   * Whether the assistant's reply is rendered as text beside the orb.
   * Read once at mount: Live Mode is a full-screen surface, so the settings
   * panel cannot be opened (and the flag changed) while it is up.
   */
  const showText = Boolean(appState?.settings?.liveModeShowText);

  const PHASE_LABELS = {
    listening: "liveMode.listening",
    thinking: "liveMode.thinking",
    speaking: "liveMode.speaking",
    muted: "liveMode.muted",
    idle: "liveMode.ready",
  };

  let status = $state("idle");
  let isMuted = $state(false);
  let supported = $state(true);
  let starting = $state(true);
  let aiText = $state(""); // live assistant transcript

  let canvasRef = $state(null);
  let orbRef = $state(null);
  let overlayRef = $state(null);
  let animationFrameId = null;
  let resizeObserver = null;
  let resizeHandler = null;
  let textPoller = null;

  let ripples = $state([]);
  let rippleId = 0;

  // ── Derived presentation state ──
  const phase = $derived(status);
  const phaseLabel = $derived(t(PHASE_LABELS[status] || PHASE_LABELS.idle));
  const canInterrupt = $derived(status === "speaking" || status === "thinking");
  const showCaps = $derived(status === "speaking" || status === "thinking");

  /** Colour pair for the current phase — used by both CSS and the canvas. */
  const palette = $derived.by(() => {
    if (!supported)
      return { a: "#94a3b8", b: "#64748b", rgb: [148, 163, 184] };
    if (isMuted || status === "muted")
      return { a: "#f87171", b: "#fb7185", rgb: [248, 113, 113] };
    if (status === "speaking")
      return { a: "#c084fc", b: "#f472b6", rgb: [192, 132, 252] };
    if (status === "thinking")
      return { a: "#fbbf24", b: "#f59e0b", rgb: [251, 191, 36] };
    return { a: "#5b7bff", b: "#22d3ee", rgb: [91, 123, 255] };
  });

  const visibleAiText = $derived(aiText.trim());

  /** Wrapping the orb in a hover-safe flex row keeps the palette in one place. */
  const orbStyle = $derived(`--orb-a:${palette.a};--orb-b:${palette.b};`);

  // ── Lifecycle ────────────────────────────────────────────────────────────
  onMount(async () => {
    liveEngine.onStateChange = (next) => {
      status = next;
      isMuted = liveEngine.isMuted;
      if (next === "listening" || next === "idle") {
        aiText = "";
      }
    };

    const res = await liveEngine.start();
    starting = false;

    if (!res || !res.supported) {
      supported = false;
      status = "idle";
      return;
    }

    if (liveEngine.vadProcessor?._audioContext?.state === "suspended") {
      liveEngine.vadProcessor._audioContext.resume().catch(() => {});
    }

    status = liveEngine.status || "listening";
    isMuted = liveEngine.isMuted;

    initVisualizer();
    startTextPoller();
  });

  onDestroy(() => {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
    if (textPoller) clearInterval(textPoller);
    textPoller = null;
    if (resizeObserver) resizeObserver.disconnect();
    resizeObserver = null;
    if (resizeHandler) window.removeEventListener("resize", resizeHandler);
    resizeHandler = null;
    if (liveEngine) liveEngine.stop();
  });

  /**
   * Poll the assistant's streamed reply. The engine streams straight from the
   * DOM node and emits no event, so a 120 ms read is cheap and keeps the
   * transcript in sync without touching engine internals. The user's own
   * interim STT text is deliberately never rendered.
   */
  function startTextPoller() {
    const tick = () => {
      if (!supported) return;
      const node = liveEngine.activeAssistantNode;
      if (node && node.isConnected) {
        const raw = extractMessageRawText(node) || "";
        const cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
        if (cleaned !== aiText) aiText = cleaned;
      } else if (liveEngine.status === "listening" || liveEngine.status === "idle") {
        if (aiText) aiText = "";
      }
    };
    textPoller = setInterval(tick, 120);
  }

  // ── Actions ──────────────────────────────────────────────────────────────
  function handleClose() {
    liveEngine.stop();
    if (typeof onclose === "function") onclose();
  }

  function resumeAudio() {
    if (liveEngine.vadProcessor?._audioContext?.state === "suspended") {
      liveEngine.vadProcessor._audioContext.resume().catch(() => {});
    }
  }

  function toggleMute() {
    isMuted = liveEngine.toggleMute();
    status = liveEngine.status;
    if (isMuted) aiText = "";
    spawnRipple();
  }

  function handleInterrupt() {
    liveEngine.interrupt();
    status = liveEngine.status;
    spawnRipple();
  }

  function handleStageClick() {
    resumeAudio();
    if (canInterrupt) handleInterrupt();
  }

  function handleKeydown(e) {
    if (e.key === "Escape") {
      handleClose();
    } else if (e.key === " ") {
      e.preventDefault();
      if (canInterrupt) handleInterrupt();
      else toggleMute();
    }
  }

  // ── Expanding ripple on the orb ─────────────────────────────────────────
  function spawnRipple() {
    const id = ++rippleId;
    ripples = [...ripples, { id, tone: phase }];
    setTimeout(() => {
      ripples = ripples.filter((r) => r.id !== id);
    }, 1200);
  }

  // ── Canvas aurora ────────────────────────────────────────────────────────
  function initVisualizer() {
    const canvas = canvasRef;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let time = 0;
    let energy = 0;
    let smoothEnergy = 0;
    let dataArray = null;

    // Ambient drifting dust, in normalised coordinates.
    const dust = Array.from({ length: 34 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: Math.random() * 1.8 + 0.6,
      vx: (Math.random() - 0.5) * 0.0007,
      vy: (Math.random() - 0.5) * 0.0007,
      phase: Math.random() * Math.PI * 2,
    }));

    let width = 0;
    let height = 0;
    let dpr = 1;
    let orbSize = 0; // drives the blob's scale — tied to the orb, not the canvas
    let orbX = 0; // orb centre, in canvas coordinates
    let orbY = 0;

    /**
     * The canvas covers the whole overlay and CSS owns its size, so the drawing
     * surface is never clipped to an inner rectangle and never goes stale. All
     * JS has to work out is the backing-store resolution and where the orb sits.
     */
    function resize() {
      const orb = orbRef;
      const overlay = overlayRef;
      if (!orb || !overlay || !canvas) return;
      const o = orb.getBoundingClientRect();
      const v = overlay.getBoundingClientRect();
      if (!o.width || !v.width) return;

      dpr = window.devicePixelRatio || 1;
      orbSize = o.width;

      // Read the layout size back off the element — `inset: 0` makes CSS
      // authoritative, so this cannot drift from what is actually painted.
      width = canvas.clientWidth || Math.round(v.width);
      height = canvas.clientHeight || Math.round(v.height);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      orbX = o.left + o.width / 2 - v.left;
      orbY = o.top + o.height / 2 - v.top;
    }

    resize();
    // The blob's centre follows the orb, which moves without changing size — and
    // ResizeObserver only fires on size changes. Re-measure on the next frames
    // too, since the stylesheet is injected separately and layout can still be
    // settling at mount time.
    requestAnimationFrame(() => requestAnimationFrame(resize));
    resizeHandler = resize;
    window.addEventListener("resize", resize);
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(resize);
      if (orbRef) resizeObserver.observe(orbRef);
      if (overlayRef) resizeObserver.observe(overlayRef);
    }

    function readEnergy() {
      const analyser = liveEngine.analyser;
      if (!analyser || isMuted) return 0;
      if (!dataArray || dataArray.length !== analyser.frequencyBinCount) {
        dataArray = new Uint8Array(analyser.frequencyBinCount);
      }
      analyser.getByteFrequencyData(dataArray);
      const bins = Math.min(72, dataArray.length);
      let sum = 0;
      for (let i = 0; i < bins; i++) sum += dataArray[i];
      return sum / (bins * 255);
    }

    function render() {
      if (!ctx) return;
      if (!width || !height) {
        // Geometry has not been measured yet — keep the loop alive.
        animationFrameId = requestAnimationFrame(render);
        return;
      }
      ctx.clearRect(0, 0, width, height);
      time += 0.016;

      energy = readEnergy();
      // Asymmetric smoothing: snap up on speech, relax down slowly.
      smoothEnergy += (energy - smoothEnergy) * (energy > smoothEnergy ? 0.45 : 0.06);

      // The blob is anchored to the orb, not to the centre of the canvas.
      const cx = orbX;
      const cy = orbY;
      // Scale off the orb, not the canvas — the canvas spans the whole overlay,
      // so sizing from it would make the blob gigantic. 0.48 puts the resting
      // blob at ~96% of the orb's width, which reproduces the size the previous
      // stage-based formula produced on a normal desktop window.
      const baseR = Math.max(48, orbSize * 0.48);
      const [r, g, b] = palette.rgb;

      const idle = !supported || status === "idle";
      const speaking = status === "speaking";
      const thinking = status === "thinking";
      const active = status === "listening";

      // Radius envelope per phase.
      let radius = baseR;
      if (idle) {
        radius = baseR * (0.92 + Math.sin(time * 1.2) * 0.03);
      } else if (thinking) {
        radius = baseR * (1 + Math.sin(time * 3.4) * 0.06 + smoothEnergy * 0.08);
      } else if (speaking) {
        // TTS has no analyser feed — synthesise a warm, organic pulse.
        radius = baseR * (1 + Math.sin(time * 5.2) * 0.075 + Math.sin(time * 2.1) * 0.045);
      } else {
        radius = baseR * (1 + smoothEnergy * 0.42 + Math.sin(time * 2.4) * 0.025);
      }

      ctx.save();
      ctx.globalCompositeOperation = "lighter";

      // ── Layer 1: drifting dust ──
      for (const p of dust) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < -0.05) p.x = 1.05;
        if (p.x > 1.05) p.x = -0.05;
        if (p.y < -0.05) p.y = 1.05;
        if (p.y > 1.05) p.y = -0.05;
        const twinkle = 0.35 + Math.sin(time * 1.6 + p.phase) * 0.25;
        ctx.beginPath();
        ctx.arc(p.x * width, p.y * height, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${idle ? twinkle * 0.25 : twinkle * 0.4})`;
        ctx.fill();
      }

      // ── Layer 2: outer halo ──
      const halo = ctx.createRadialGradient(cx, cy, radius * 0.6, cx, cy, radius * 2.5);
      halo.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${idle ? 0.1 : 0.26})`);
      halo.addColorStop(0.45, `rgba(${r}, ${g}, ${b}, ${idle ? 0.03 : 0.08})`);
      halo.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 2.5, 0, Math.PI * 2);
      ctx.fill();

      // ── Layer 2b: bloom, offset downward ──
      // Stands in for the coloured drop-shadow the orb used to carry in CSS,
      // which cost about half the frame budget. Painted here it is a single
      // gradient fill, and `lighter` blending keeps it additive.
      const bloomY = cy + radius * 0.14;
      const bloom = ctx.createRadialGradient(cx, bloomY, radius * 0.5, cx, bloomY, radius * 2.2);
      bloom.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${idle ? 0.06 : 0.17})`);
      bloom.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, ${idle ? 0.02 : 0.05})`);
      bloom.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
      ctx.fillStyle = bloom;
      ctx.beginPath();
      ctx.arc(cx, bloomY, radius * 2.2, 0, Math.PI * 2);
      ctx.fill();

      // ── Layer 3: rotating conic ring while thinking ──
      if (thinking) {
        drawThinkingRing(ctx, cx, cy, radius * 1.14, time, r, g, b);
      }

      // ── Layer 4: undulating blob (the orb itself) ──
      drawBlob(ctx, cx, cy, radius, time, smoothEnergy, active, speaking, r, g, b);

      // ── Layer 5: inner core ──
      const coreR = radius * (idle ? 0.42 : 0.4 + smoothEnergy * 0.12);
      const core = ctx.createRadialGradient(cx, cy - coreR * 0.2, 0, cx, cy, coreR);
      core.addColorStop(0, `rgba(255, 255, 255, ${idle ? 0.5 : 0.85})`);
      core.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, 0.7)`);
      core.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
      animationFrameId = requestAnimationFrame(render);
    }

    render();
  }

  function drawBlob(ctx, cx, cy, radius, time, energy, listening, speaking, r, g, b) {
    const SEGMENTS = 96;
    const wobbleAmp = listening ? 0.05 + energy * 0.16 : speaking ? 0.09 : 0.035;

    ctx.beginPath();
    for (let i = 0; i <= SEGMENTS; i++) {
      const theta = (i / SEGMENTS) * Math.PI * 2;
      // Layered sines give an organic, non-repeating silhouette.
      const noise =
        Math.sin(theta * 3 + time * 1.7) * 0.5 +
        Math.sin(theta * 5 - time * 2.3) * 0.3 +
        Math.sin(theta * 8 + time * 3.1) * 0.2;
      const rr = radius * (1 + noise * wobbleAmp);
      const x = cx + Math.cos(theta) * rr;
      const y = cy + Math.sin(theta) * rr;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();

    const fill = ctx.createRadialGradient(cx - radius * 0.3, cy - radius * 0.35, radius * 0.1, cx, cy, radius * 1.25);
    fill.addColorStop(0, `rgba(255, 255, 255, ${speaking ? 0.34 : 0.26})`);
    fill.addColorStop(0.35, `rgba(${r}, ${g}, ${b}, 0.5)`);
    fill.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0.08)`);
    ctx.fillStyle = fill;
    ctx.fill();

    ctx.lineWidth = 1.6;
    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.75)`;
    ctx.stroke();
  }

  function drawThinkingRing(ctx, cx, cy, radius, time, r, g, b) {
    for (let i = 0; i < 3; i++) {
      const rr = radius * (1 + i * 0.12);
      const spin = time * (0.9 - i * 0.22) + (i * Math.PI * 2) / 3;
      ctx.beginPath();
      ctx.arc(cx, cy, rr, spin, spin + Math.PI * 1.15);
      ctx.lineWidth = 2.4 - i * 0.5;
      ctx.lineCap = "round";
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${0.7 - i * 0.18})`;
      ctx.stroke();
    }
  }

  // ── Formatting helper ───────────────────────────────────────────────────
  function shorten(text, max) {
    if (!text) return "";
    const clean = text.replace(/\s+/g, " ").trim();
    return clean.length > max ? `…${clean.slice(-max)}` : clean;
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="bds-live"
  class:bds-live--unsupported={!supported}
  bind:this={overlayRef}
  role="dialog"
  aria-modal="true"
  aria-label={t("liveMode.title")}
>
  <div class="bds-live__aurora" aria-hidden="true"></div>
  <div class="bds-live__grid" aria-hidden="true"></div>

  <!-- ── Visualiser surface ─────────────────────────────────────────────
       Spans the whole overlay via CSS, so the glow can spread all the way to
       the screen edge and is never cut off by the canvas rectangle. Sizing it
       from JS was the previous approach and it went stale: the overlay grows by
       ~20px over the first frames as an initial scrollbar disappears, and
       ResizeObserver does not always catch that. Letting CSS own the size
       removes the whole class of problem. -->
  {#if supported}
    <canvas bind:this={canvasRef} class="bds-live__canvas" aria-hidden="true"></canvas>
  {/if}

  <!-- ── Top bar ─────────────────────────────────────────────────────
       Built to read as DeepSeek chrome: a real dialog title on the left, a
       quiet dot-plus-text status line beside it, and the same 32px square
       close affordance the panel headers use. -->
  <header class="bds-live__top">
    <div class="bds-live__head-text">
      <h1 class="bds-live__title">{t("liveMode.title")}</h1>
      <span class="bds-live__status" data-phase={phase} class:bds-live__status--muted={isMuted}>
        <span class="bds-live__status-dot" aria-hidden="true"></span>
        <span class="bds-live__status-text">
          {#if starting}{t("liveMode.connecting")}{:else}{phaseLabel}{/if}
        </span>
      </span>
    </div>

    <button
      class="bds-live__close"
      onclick={handleClose}
      title={t("liveMode.exit")}
      aria-label={t("liveMode.exit")}
    >
      <svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true">
        <path d="M14.1871 13.1265L13.1265 14.1872L1.81275 2.87347L2.87341 1.81281L14.1871 13.1265Z" fill="currentColor"></path>
        <path d="M13.1265 1.81282L14.1871 2.87348L2.8734 14.1872L1.81274 13.1265L13.1265 1.81282Z" fill="currentColor"></path>
      </svg>
    </button>
  </header>

  <!-- ── Stage: orb + captions ─────────────────────────────────────── -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <main class="bds-live__stage" onclick={handleStageClick}>
    {#if !supported}
      <div class="bds-live__fallback">
        <div class="bds-live__fallback-icon">
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor"
               stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
            <line x1="2" y1="2" x2="22" y2="22"></line>
            <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path>
            <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path>
            <line x1="12" y1="19" x2="12" y2="22"></line>
          </svg>
        </div>
        <h2>{t("liveMode.unsupportedBrowser")}</h2>
        <p>{t("liveMode.notSupportedDetail")}</p>
      </div>
    {:else}
      <div class="bds-live__orb" bind:this={orbRef} style={orbStyle} data-phase={phase}>
        {#each ripples as ripple (ripple.id)}
          <span class="bds-live__ripple" aria-hidden="true"></span>
        {/each}
      </div>

      {#if showText}
        <div class="bds-live__captions" class:bds-live__captions--muted={isMuted}>
          {#if isMuted}
            <p class="bds-live__caption bds-live__caption--idle">{t("liveMode.muted")}</p>
          {:else if showCaps && visibleAiText}
            <div class="bds-live__bubble bds-live__bubble--ai">
              <span class="bds-live__bubble-tag">{t("liveMode.assistant")}</span>
              <p>{shorten(visibleAiText, 460)}</p>
            </div>
          {:else}
            <p class="bds-live__caption bds-live__caption--idle">
              {starting ? t("liveMode.connecting") : t("liveMode.tagline")}
            </p>
          {/if}
        </div>
      {/if}
    {/if}
  </main>

  <!-- ── Dock ────────────────────────────────────────────────────────
       A segmented control (the shape DeepSeek already uses for model choice
       and toolbar groups) holding mic / interrupt, then a solid text button
       for ending the session — the same primary/secondary pairing as the
       panel footers, not a row of floating circles. -->
  <footer class="bds-live__dock">
    <div class="bds-live__segment">
      <button
        class="bds-live__seg-btn"
        class:bds-live__seg-btn--active={isMuted}
        onclick={toggleMute}
        disabled={!supported}
        title={isMuted ? t("liveMode.unmute") : t("liveMode.mute")}
        aria-label={isMuted ? t("liveMode.unmute") : t("liveMode.mute")}
        aria-pressed={isMuted}
      >
        {#if isMuted}
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
               stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <line x1="2" y1="2" x2="22" y2="22"></line>
            <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path>
            <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path>
            <line x1="12" y1="19" x2="12" y2="22"></line>
          </svg>
        {:else}
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
               stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="9" y="2" width="6" height="12" rx="3"></rect>
            <path d="M5 11a7 7 0 0 0 14 0"></path>
            <line x1="12" y1="18" x2="12" y2="22"></line>
            <line x1="8" y1="22" x2="16" y2="22"></line>
          </svg>
        {/if}
        <span>{isMuted ? t("liveMode.unmute") : t("liveMode.mute")}</span>
      </button>

      {#if supported}
        <span class="bds-live__seg-divider" aria-hidden="true"></span>
        <button
          class="bds-live__seg-btn"
          onclick={handleInterrupt}
          disabled={!canInterrupt}
          title={t("liveMode.stop")}
          aria-label={t("liveMode.stop")}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
            <rect x="6.5" y="6.5" width="11" height="11" rx="2.2"></rect>
          </svg>
          <span>{t("liveMode.stop")}</span>
        </button>
      {/if}
    </div>

    <button
      class="bds-live__end"
      onclick={handleClose}
      title={t("liveMode.exit")}
      aria-label={t("liveMode.exit")}
    >
      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
        <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.996.996 0 0 1 0-1.41C3.36 8.79 7.43 7 12 7s8.64 1.79 11.71 4.67c.39.39.39 1.02 0 1.41l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"/>
      </svg>
      <span>{t("liveMode.exit")}</span>
    </button>
  </footer>

  <p class="bds-live__hint">{t("liveMode.hint")}</p>
</div>

<style>
  /* ══ Shell ══════════════════════════════════════════════════════════ */
  .bds-live {
    position: fixed;
    inset: 0;
    z-index: 2147483600;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;
    padding: 22px 26px 26px;
    box-sizing: border-box;
    overflow: hidden;
    user-select: none;
    color: var(--bds-text-primary);
    font-family: inherit;
    background: var(--bds-bg-panel);
    animation: bds-live-in 0.34s cubic-bezier(0.16, 1, 0.3, 1);
  }

  @keyframes bds-live-in {
    from { opacity: 0; transform: scale(0.985); }
    to { opacity: 1; transform: scale(1); }
  }

  /* Ambient colour wash behind everything. Deliberately faint — the orb is the
     subject, this only stops the panel reading as a flat rectangle. */
  .bds-live__aurora {
    position: absolute;
    inset: -20%;
    pointer-events: none;
    background:
      radial-gradient(40% 44% at 50% 34%, var(--bds-accent-glow) 0%, transparent 64%),
      radial-gradient(36% 38% at 22% 84%, rgba(34, 211, 238, 0.045) 0%, transparent 72%),
      radial-gradient(38% 40% at 80% 76%, rgba(192, 132, 252, 0.045) 0%, transparent 72%);
    filter: blur(10px);
    animation: bds-live-drift 22s ease-in-out infinite alternate;
  }

  @keyframes bds-live-drift {
    from { transform: translate3d(-1.5%, -1%, 0) scale(1); }
    to { transform: translate3d(1.5%, 1.5%, 0) scale(1.06); }
  }

  /* Faint technical grid. Kept very low contrast and masked well away from the
     text columns, otherwise it reads as noise behind the captions. */
  .bds-live__grid {
    position: absolute;
    inset: 0;
    pointer-events: none;
    opacity: 0.22;
    background-image:
      linear-gradient(var(--bds-border) 1px, transparent 1px),
      linear-gradient(90deg, var(--bds-border) 1px, transparent 1px);
    background-size: 62px 62px;
    mask-image: radial-gradient(46% 42% at 50% 44%, #000 0%, transparent 70%);
    -webkit-mask-image: radial-gradient(46% 42% at 50% 44%, #000 0%, transparent 70%);
  }

  /* ══ Top bar ════════════════════════════════════════════════════════ */
  .bds-live__top {
    position: relative;
    z-index: 5;
    width: 100%;
    max-width: 880px;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--bds-border);
  }

  .bds-live__head-text {
    display: flex;
    flex-direction: column;
    gap: 5px;
    min-width: 0;
  }

  /* Matches .ds-modal-content__title — the project's dialog title scale. */
  .bds-live__title {
    margin: 0;
    font-size: 17px;
    font-weight: 700;
    letter-spacing: -0.3px;
    line-height: 1.2;
    color: var(--bds-text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* A quiet status line, not a pill: small dot + secondary-coloured label,
     the way DeepSeek annotates state under a heading. */
  .bds-live__status {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--phase-fg, var(--bds-text-secondary));
    transition: color var(--bds-transition);
    min-width: 0;
  }

  .bds-live__status[data-phase="listening"] { --phase-fg: var(--bds-accent); }
  .bds-live__status[data-phase="thinking"]  { --phase-fg: #f59e0b; }
  .bds-live__status[data-phase="speaking"]  { --phase-fg: #a855f7; }
  .bds-live__status[data-phase="muted"],
  .bds-live__status--muted                  { --phase-fg: var(--bds-danger); }
  .bds-live__status[data-phase="idle"]      { --phase-fg: var(--bds-text-tertiary); }

  .bds-live__status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
    flex-shrink: 0;
    animation: bds-live-dot 1.5s ease-in-out infinite;
  }

  .bds-live__status[data-phase="idle"] .bds-live__status-dot {
    animation: none;
    opacity: 0.7;
  }

  @keyframes bds-live-dot {
    0%, 100% { transform: scale(1); opacity: 1; }
    50% { transform: scale(1.4); opacity: 0.4; }
  }

  .bds-live__status-text {
    font-size: 12.5px;
    font-weight: 500;
    line-height: 1.4;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Sits flush with the header, same 8px radius as #bds-close. */
  .bds-live__close {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--bds-text-tertiary);
    cursor: pointer;
    flex-shrink: 0;
    transition: all var(--bds-transition);
  }

  .bds-live__close:hover {
    background: var(--bds-bg-hover);
    color: var(--bds-text-primary);
  }

  /* ══ Stage ══════════════════════════════════════════════════════════ */
  .bds-live__stage {
    position: relative;
    z-index: 4;
    flex: 1;
    width: 100%;
    max-width: 880px;
    min-height: 0;
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    gap: 34px;
    padding: 12px 0;
  }

  /* ── Orb ──
     Now purely a positioning anchor: it marks where the blob's centre sits and
     hosts the tap ripples. The canvas itself is a sibling that covers the whole
     overlay, so the orb's own box no longer has to contain it. */
  .bds-live__orb {
    position: relative;
    flex: 0 1 auto;
    width: min(46vh, 360px);
    height: min(46vh, 360px);
    min-width: 220px;
    min-height: 220px;
    cursor: pointer;
    /* No `filter` here on purpose. A drop-shadow on this element wraps its whole
       subtree and forces the browser to re-rasterise and blur it every frame.
       Measured in headless Chromium that halved the frame rate (11 fps vs
       24 fps). The equivalent bloom is drawn inside the canvas instead, where it
       is nearly free. */
  }

  /* Sized by CSS, not JS, so it always matches the overlay exactly no matter how
     the layout is settling at mount time. `z-index: 1` keeps it beneath the
     header (4) and dock (5) while still above the ambient aurora and grid.

     `width`/`height: 100%` are required, not redundant: a canvas is a *replaced*
     element, so `inset: 0` alone leaves `width: auto` resolving to the intrinsic
     300x150 backing-store size instead of stretching to the containing block. */
  .bds-live__canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    z-index: 1;
    display: block;
    pointer-events: none;
  }

  .bds-live__ripple {
    position: absolute;
    inset: 27%;
    border-radius: 50%;
    border: 1.5px solid var(--orb-a);
    pointer-events: none;
    animation: bds-live-ripple 1.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }

  @keyframes bds-live-ripple {
    from { transform: scale(1); opacity: 0.6; }
    to { transform: scale(2.6); opacity: 0; }
  }

  /* ── Captions ── */
  .bds-live__captions {
    flex: 1 1 300px;
    max-width: 380px;
    display: flex;
    flex-direction: column;
    gap: 11px;
    min-width: 0;
  }

  .bds-live__captions--muted { justify-content: center; }

  .bds-live__bubble {
    position: relative;
    padding: 11px 14px 12px;
    border-radius: 14px;
    background: var(--bds-bg-elevated);
    border: 1px solid var(--bds-border);
    animation: bds-live-rise 0.32s cubic-bezier(0.16, 1, 0.3, 1);
    max-height: 33vh;
    overflow: hidden;
  }

  @keyframes bds-live-rise {
    from { opacity: 0; transform: translateY(7px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .bds-live__bubble--ai {
    border-left: 2px solid #c084fc;
  }

  .bds-live__bubble-tag {
    display: block;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.09em;
    text-transform: uppercase;
    color: var(--bds-text-tertiary);
    margin-bottom: 4px;
  }

  .bds-live__bubble p {
    margin: 0;
    font-size: 13.5px;
    line-height: 1.55;
    color: var(--bds-text-primary);
    display: -webkit-box;
    -webkit-line-clamp: 5;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .bds-live__caption {
    margin: 0;
    font-size: 13px;
    line-height: 1.5;
    color: var(--bds-text-secondary);
  }

  .bds-live__caption--idle {
    color: var(--bds-text-tertiary);
    font-style: italic;
  }

  /* ── Unsupported fallback ── */
  .bds-live__fallback {
    max-width: 380px;
    /* `margin: auto` is what actually centres a stretched flex item. */
    margin: auto;
    text-align: center;
    padding: 26px;
    border-radius: 16px;
    background: var(--bds-bg-elevated);
    border: 1px solid var(--bds-border);
  }

  .bds-live__fallback-icon {
    display: grid;
    place-items: center;
    width: 54px;
    height: 54px;
    margin: 0 auto 14px;
    border-radius: 50%;
    color: #f87171;
    background: rgba(248, 113, 113, 0.12);
    border: 1px solid rgba(248, 113, 113, 0.3);
  }

  .bds-live--unsupported .bds-live__stage {
    flex-direction: row;
    align-items: center;
    justify-content: center;
  }

  .bds-live__fallback h2 {
    margin: 0 0 8px;
    font-size: 15px;
    font-weight: 600;
    color: var(--bds-text-primary);
  }

  .bds-live__fallback p {
    margin: 0;
    font-size: 12.5px;
    line-height: 1.55;
    color: var(--bds-text-secondary);
  }

  /* ══ Dock ═══════════════════════════════════════════════════════════ */
  .bds-live__dock {
    position: relative;
    z-index: 5;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  /* Segmented control — the grouping DeepSeek uses for related toolbar
     actions: one bordered container, hairline divider between segments. */
  .bds-live__segment {
    display: inline-flex;
    align-items: center;
    padding: 3px;
    gap: 2px;
    border-radius: 10px;
    background: var(--bds-bg-elevated);
    border: 1px solid var(--bds-border);
  }

  .bds-live__seg-btn {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    height: 30px;
    padding: 0 12px;
    border: none;
    border-radius: 7px;
    cursor: pointer;
    font-family: inherit;
    font-size: 12px;
    font-weight: 600;
    color: var(--bds-text-secondary);
    background: transparent;
    transition: all var(--bds-transition);
  }

  /* Disabled must still be readable. Stacking an `opacity` on top of the
     already-recessive tertiary token measured 1.7:1 against the segment track,
     which is effectively invisible — so express the dimming purely as a colour
     and keep opacity at 1. */
  .bds-live__seg-btn:disabled {
    color: var(--bds-text-secondary);
    opacity: 1;
    cursor: not-allowed;
    background: transparent;
  }

  /* Slightly softer than the enabled label, without leaving the legible range. */
  .bds-live__seg-btn:disabled { filter: opacity(0.72); }

  .bds-live__seg-btn:hover:not(:disabled) {
    background: var(--bds-bg-hover);
    color: var(--bds-text-primary);
  }

  .bds-live__seg-btn--active {
    color: var(--bds-danger);
    background: var(--bds-bg-panel);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
  }

  .bds-live__seg-btn--active:hover:not(:disabled) {
    color: var(--bds-danger);
    background: var(--bds-bg-panel);
  }

  /* Rendered only alongside the second segment, so it never dangles. */
  .bds-live__seg-divider {
    width: 1px;
    height: 18px;
    background: var(--bds-border);
    flex-shrink: 0;
  }

  /* Primary action: the solid text button from the panel footers (.bds-btn),
     tinted to the danger role because it ends the session. */
  .bds-live__end {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    height: 36px;
    padding: 0 16px;
    border: 0;
    border-radius: 8px;
    cursor: pointer;
    font-family: inherit;
    font-size: 12px;
    font-weight: 600;
    color: #ffffff;
    background: var(--bds-danger);
    transition: all var(--bds-transition);
  }

  .bds-live__end:hover { opacity: 0.88; }
  .bds-live__end:active { transform: scale(0.98); }

  .bds-live__hint {
    position: relative;
    z-index: 5;
    margin: 12px 0 0;
    font-size: 11px;
    letter-spacing: 0.02em;
    color: var(--bds-text-tertiary);
    opacity: 0.85;
  }

  /* ══ Responsive ═════════════════════════════════════════════════════ */
  @media (max-width: 760px) {
    .bds-live__stage {
      flex-direction: column;
      gap: 18px;
      padding: 4px 0;
    }

    .bds-live__orb {
      width: min(38vh, 280px);
      height: min(38vh, 280px);
      min-width: 170px;
      min-height: 170px;
    }

    .bds-live__captions {
      flex: 0 1 auto;
      max-width: 100%;
      width: 100%;
      text-align: center;
    }

    .bds-live__bubble { max-height: 20vh; }
    .bds-live__bubble p { -webkit-line-clamp: 3; }
  }

  @media (max-width: 520px) {
    .bds-live { padding: 16px 14px 20px; }
    .bds-live__title { font-size: 15px; }
    .bds-live__hint { display: none; }

    /* At this width the labels are what break the dock: "Mute Microphone" and
       "Interrupt" wrap inside the fixed-height segments and spill out. Drop
       back to icon-only segments and let the end action own the full width. */
    .bds-live__dock {
      flex-wrap: wrap;
      justify-content: center;
      width: 100%;
      gap: 8px;
    }

    .bds-live__segment { flex: 1 1 auto; justify-content: center; }
    .bds-live__end { flex: 1 1 100%; justify-content: center; }

    .bds-live__seg-btn {
      flex: 0 0 auto;
      width: 40px;
      padding: 0;
      justify-content: center;
    }

    /* Keep the text in the DOM (tests and screen readers read it) but take it
       out of the visual layout. */
    .bds-live__seg-btn > span {
      position: absolute;
      width: 1px;
      height: 1px;
      margin: -1px;
      padding: 0;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
      border: 0;
    }
  }

  /* Respect reduced-motion: kill the ambient loops, keep state changes legible. */
  @media (prefers-reduced-motion: reduce) {
    .bds-live,
    .bds-live__aurora,
    .bds-live__status-dot,
    .bds-live__ripple,
    .bds-live__bubble { animation: none !important; }
  }
</style>
