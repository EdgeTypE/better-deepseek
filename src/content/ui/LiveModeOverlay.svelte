<script>
  import { onMount, onDestroy } from "svelte";
  import { liveEngine } from "../live/live-engine.js";
  import { t } from "../../lib/i18n.svelte.js";

  /** @type {{ onclose: () => void }} */
  let { onclose } = $props();

  let status = $state("idle");
  let isMuted = $state(false);
  let canvasRef = $state(null);
  let animationFrameId = null;
  let audioDataArray = null;

  const statusLabel = $derived.by(() => {
    switch (status) {
      case "listening":
        return t("liveMode.listening") || "Listening...";
      case "thinking":
        return t("liveMode.thinking") || "Thinking...";
      case "speaking":
        return t("liveMode.speaking") || "Speaking...";
      case "muted":
        return t("liveMode.muted") || "Microphone Muted";
      default:
        return t("liveMode.ready") || "Live Voice Mode";
    }
  });

  const canInterrupt = $derived(status === "speaking" || status === "thinking");

  onMount(async () => {
    liveEngine.onStateChange = (newStatus) => {
      status = newStatus;
      isMuted = liveEngine.isMuted;
    };

    const res = await liveEngine.start();
    if (!res || !res.supported) {
      status = "idle";
    }

    if (liveEngine.vadProcessor?._audioContext?.state === "suspended") {
      liveEngine.vadProcessor._audioContext.resume().catch(() => {});
    }

    initVisualizer();
  });

  onDestroy(() => {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    liveEngine.stop();
  });

  function handleClose() {
    liveEngine.stop();
    if (typeof onclose === "function") {
      onclose();
    }
  }

  function toggleMute() {
    isMuted = liveEngine.toggleMute();
    status = liveEngine.status;
  }

  function handleInterrupt() {
    liveEngine.interrupt();
    status = liveEngine.status;
  }

  function handleStageClick() {
    if (liveEngine.vadProcessor?._audioContext?.state === "suspended") {
      liveEngine.vadProcessor._audioContext.resume().catch(() => {});
    }
    if (status === "speaking" || status === "thinking") {
      handleInterrupt();
    }
  }

  function handleKeydown(e) {
    if (e.key === "Escape") {
      handleClose();
    } else if (e.key === " ") {
      e.preventDefault();
      if (status === "speaking" || status === "thinking") {
        handleInterrupt();
      } else {
        toggleMute();
      }
    }
  }

  // ── Canvas Audio Visualizer ──
  function initVisualizer() {
    if (!canvasRef) return;
    const canvas = canvasRef;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let time = 0;

    // Ambient floating particles
    const particles = Array.from({ length: 28 }, () => ({
      x: Math.random(),
      y: Math.random(),
      radius: Math.random() * 2 + 1,
      speedX: (Math.random() - 0.5) * 0.0008,
      speedY: (Math.random() - 0.5) * 0.0008,
      alpha: Math.random() * 0.5 + 0.2,
      baseAlpha: Math.random() * 0.4 + 0.2,
    }));

    function resize() {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(300, Math.floor(rect.width * dpr));
      canvas.height = Math.max(300, Math.floor(rect.height * dpr));
      ctx.scale(dpr, dpr);
    }

    resize();
    window.addEventListener("resize", resize);

    function render() {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;
      const cx = width / 2;
      const cy = height / 2;

      ctx.clearRect(0, 0, width, height);

      time += 0.025;

      // Extract real audio energy from VAD / Web Audio Analyser
      let energy = 0;
      const analyser = liveEngine.analyser;
      if (analyser && !isMuted) {
        if (!audioDataArray || audioDataArray.length !== analyser.frequencyBinCount) {
          audioDataArray = new Uint8Array(analyser.frequencyBinCount);
        }
        analyser.getByteFrequencyData(audioDataArray);

        let sum = 0;
        const binCount = Math.min(64, audioDataArray.length);
        for (let i = 0; i < binCount; i++) {
          sum += audioDataArray[i];
        }
        energy = sum / (binCount * 255); // 0.0 to 1.0
      }

      // ── Layer 1: Ambient Drifting Cosmic Particles ──
      for (const p of particles) {
        p.x += p.speedX;
        p.y += p.speedY;
        if (p.x < 0) p.x = 1;
        if (p.x > 1) p.x = 0;
        if (p.y < 0) p.y = 1;
        if (p.y > 1) p.y = 0;

        const px = p.x * width;
        const py = p.y * height;
        const pulse = Math.sin(time * 2 + p.x * 10) * 0.2;
        ctx.fillStyle = `rgba(147, 197, 253, ${Math.max(0, p.baseAlpha + pulse)})`;
        ctx.beginPath();
        ctx.arc(px, py, p.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      // ── Layer 2: Central Pulsing Glowing Aura ──
      const baseRadius = Math.min(width, height) * 0.28;
      const dynamicRadius =
        status === "listening"
          ? baseRadius + energy * 70 + Math.sin(time * 3) * 6
          : status === "speaking"
          ? baseRadius + Math.sin(time * 6) * 16 + Math.cos(time * 3) * 12
          : status === "thinking"
          ? baseRadius + Math.sin(time * 4) * 12
          : baseRadius;

      const auraGradient = ctx.createRadialGradient(cx, cy, 10, cx, cy, dynamicRadius * 1.4);

      if (status === "speaking") {
        auraGradient.addColorStop(0, "rgba(168, 85, 247, 0.45)");
        auraGradient.addColorStop(0.5, "rgba(59, 130, 246, 0.25)");
        auraGradient.addColorStop(1, "rgba(168, 85, 247, 0)");
      } else if (status === "thinking") {
        auraGradient.addColorStop(0, "rgba(245, 158, 11, 0.4)");
        auraGradient.addColorStop(0.5, "rgba(234, 179, 8, 0.2)");
        auraGradient.addColorStop(1, "rgba(245, 158, 11, 0)");
      } else if (isMuted) {
        auraGradient.addColorStop(0, "rgba(239, 68, 68, 0.25)");
        auraGradient.addColorStop(0.6, "rgba(107, 114, 128, 0.1)");
        auraGradient.addColorStop(1, "rgba(0, 0, 0, 0)");
      } else {
        // Listening / active mic
        const glowBoost = Math.min(0.7, 0.35 + energy * 0.5);
        auraGradient.addColorStop(0, `rgba(56, 189, 248, ${glowBoost})`);
        auraGradient.addColorStop(0.5, `rgba(99, 102, 241, ${glowBoost * 0.5})`);
        auraGradient.addColorStop(1, "rgba(56, 189, 248, 0)");
      }

      ctx.fillStyle = auraGradient;
      ctx.beginPath();
      ctx.arc(cx, cy, dynamicRadius * 1.4, 0, Math.PI * 2);
      ctx.fill();

      // ── Layer 3: Organic Fluid Waves (Gemini Live Style) ──
      if (status === "thinking") {
        // Rotating orbital thinking ring
        drawThinkingRings(ctx, cx, cy, dynamicRadius, time);
      } else {
        // Multi-curve fluid speech waveform
        drawFluidWaves(ctx, cx, cy, width, height, dynamicRadius, energy, time, status, isMuted);
      }

      animationFrameId = requestAnimationFrame(render);
    }

    render();
  }

  function drawThinkingRings(ctx, cx, cy, radius, time) {
    ctx.save();
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      const r = radius * (0.8 + i * 0.15);
      const angleOffset = time * (1.5 - i * 0.4) + (i * Math.PI) / 2;
      ctx.arc(cx, cy, r, angleOffset, angleOffset + Math.PI * 1.25);
      ctx.lineWidth = 3 - i * 0.6;
      ctx.strokeStyle = i === 0 ? "rgba(245, 158, 11, 0.85)" : i === 1 ? "rgba(56, 189, 248, 0.7)" : "rgba(168, 85, 247, 0.6)";
      ctx.lineCap = "round";
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawFluidWaves(ctx, cx, cy, width, height, radius, energy, time, currentStatus, muted) {
    const waveCount = 4;
    const waveColors = [
      ["rgba(56, 189, 248, 0.85)", "rgba(99, 102, 241, 0.85)"],
      ["rgba(168, 85, 247, 0.8)", "rgba(236, 72, 153, 0.75)"],
      ["rgba(34, 197, 94, 0.75)", "rgba(56, 189, 248, 0.75)"],
      ["rgba(129, 140, 248, 0.7)", "rgba(192, 132, 252, 0.7)"],
    ];

    const amplitudeMultiplier = muted
      ? 2
      : currentStatus === "speaking"
      ? 28 + Math.sin(time * 5) * 14
      : 8 + energy * 75;

    ctx.save();
    for (let w = 0; w < waveCount; w++) {
      const grad = ctx.createLinearGradient(0, cy - radius, width, cy + radius);
      grad.addColorStop(0, waveColors[w][0]);
      grad.addColorStop(1, waveColors[w][1]);

      ctx.beginPath();
      const points = 70;
      const step = width / points;
      const phase = time * (1.2 + w * 0.35) + (w * Math.PI) / 3;

      for (let i = 0; i <= points; i++) {
        const x = i * step;
        // Bell envelope so waves taper naturally at canvas edges
        const distFromCenter = Math.abs(x - cx) / (width * 0.5);
        const envelope = Math.max(0, 1 - Math.pow(distFromCenter, 1.8));

        const sine1 = Math.sin(x * 0.015 + phase) * amplitudeMultiplier;
        const sine2 = Math.cos(x * 0.025 - phase * 0.8) * (amplitudeMultiplier * 0.5);
        const y = cy + (sine1 + sine2) * envelope;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }

      ctx.strokeStyle = grad;
      ctx.lineWidth = 2.5 + (waveCount - w) * 0.5;
      ctx.lineCap = "round";
      ctx.shadowBlur = 14;
      ctx.shadowColor = waveColors[w][0];
      ctx.stroke();
    }
    ctx.restore();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="bds-live-overlay" role="dialog" aria-modal="true" aria-label={t('liveMode.title') || 'Live Voice Mode'}>
  <!-- Top bar -->
  <header class="bds-live-header">
    <div class="bds-live-brand">
      <span class="bds-live-sparkle" aria-hidden="true">✦</span>
      <span class="bds-live-title">{t('liveMode.title') || 'Better DeepSeek Live'}</span>
    </div>

    <div class="bds-live-status-pill bds-status-{status}">
      <span class="bds-live-dot" aria-hidden="true"></span>
      <span class="bds-live-status-text">{statusLabel}</span>
    </div>

    <button
      class="bds-live-icon-btn bds-live-icon-btn--close"
      onclick={handleClose}
      title={t('liveMode.exit') || 'Exit Live Mode'}
      aria-label={t('liveMode.exit') || 'Exit Live Mode'}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    </button>
  </header>

  <!-- Center Stage: The Live Audio Wave Visualizer -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <main class="bds-live-stage" onclick={handleStageClick}>
    <canvas bind:this={canvasRef} class="bds-live-canvas"></canvas>
  </main>

  <!-- Bottom Control Bar -->
  <footer class="bds-live-footer">
    <!-- Mute/Unmute Mic -->
    <button
      class="bds-live-action-btn bds-live-action-btn--mute"
      class:bds-is-muted={isMuted}
      onclick={toggleMute}
      title={isMuted ? (t('liveMode.unmute') || 'Unmute') : (t('liveMode.mute') || 'Mute')}
      aria-label={isMuted ? 'Unmute' : 'Mute'}
    >
      {#if isMuted}
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="1" y1="1" x2="23" y2="23"></line>
          <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path>
          <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path>
          <line x1="12" y1="19" x2="12" y2="23"></line>
          <line x1="8" y1="23" x2="16" y2="23"></line>
        </svg>
      {:else}
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
          <line x1="12" y1="19" x2="12" y2="23"></line>
          <line x1="8" y1="23" x2="16" y2="23"></line>
        </svg>
      {/if}
    </button>

    <!-- End / Close Live Session (Crimson Circular Button) -->
    <button
      class="bds-live-action-btn bds-live-action-btn--end"
      onclick={handleClose}
      title={t('liveMode.exit') || 'End Live Session'}
      aria-label={t('liveMode.exit') || 'End Live Session'}
    >
      <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.996.996 0 0 1 0-1.41C3.36 8.79 7.43 7 12 7s8.64 1.79 11.71 4.67c.39.39.39 1.02 0 1.41l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"/>
      </svg>
    </button>

    <!-- Interrupt Button -->
    <button
      class="bds-live-action-btn bds-live-action-btn--interrupt"
      class:bds-disabled={!canInterrupt}
      disabled={!canInterrupt}
      onclick={handleInterrupt}
      title={t('liveMode.stop') || 'Interrupt Response'}
      aria-label={t('liveMode.stop') || 'Interrupt Response'}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="6" y="6" width="12" height="12" rx="2" ry="2"></rect>
      </svg>
    </button>
  </footer>
</div>

<style>
  .bds-live-overlay {
    position: fixed;
    inset: 0;
    z-index: 999999;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;
    background: radial-gradient(circle at 50% 40%, rgba(15, 23, 42, 0.94) 0%, rgba(5, 7, 12, 0.98) 100%);
    backdrop-filter: blur(32px);
    -webkit-backdrop-filter: blur(32px);
    color: #f8fafc;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    padding: 24px 28px 48px;
    box-sizing: border-box;
    user-select: none;
    overflow: hidden;
    animation: bds-live-fade-in 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }

  @keyframes bds-live-fade-in {
    from {
      opacity: 0;
      transform: scale(0.98);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  /* ── Header ── */
  .bds-live-header {
    width: 100%;
    max-width: 900px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    z-index: 10;
  }

  .bds-live-brand {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .bds-live-sparkle {
    font-size: 18px;
    background: linear-gradient(135deg, #38bdf8, #a855f7);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    animation: bds-sparkle-spin 6s linear infinite;
  }

  @keyframes bds-sparkle-spin {
    0% { transform: rotate(0deg) scale(1); }
    50% { transform: rotate(180deg) scale(1.15); }
    100% { transform: rotate(360deg) scale(1); }
  }

  .bds-live-title {
    font-size: 15px;
    font-weight: 600;
    letter-spacing: -0.01em;
    color: #e2e8f0;
  }

  /* ── Status Pill ── */
  .bds-live-status-pill {
    display: inline-flex;
    align-items: center;
    gap: 9px;
    padding: 7px 16px;
    border-radius: 9999px;
    background: rgba(30, 41, 59, 0.65);
    border: 1px solid rgba(148, 163, 184, 0.18);
    backdrop-filter: blur(16px);
    transition: all 0.3s ease;
  }

  .bds-live-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    transition: all 0.3s ease;
  }

  .bds-live-status-text {
    font-size: 13.5px;
    font-weight: 500;
    letter-spacing: 0.01em;
  }

  /* Status Pill Themes */
  .bds-status-listening .bds-live-dot {
    background: #38bdf8;
    box-shadow: 0 0 10px #38bdf8;
    animation: bds-pulse-dot 1.4s ease-in-out infinite;
  }
  .bds-status-listening {
    border-color: rgba(56, 189, 248, 0.35);
    color: #38bdf8;
  }

  .bds-status-thinking .bds-live-dot {
    background: #f59e0b;
    box-shadow: 0 0 10px #f59e0b;
    animation: bds-pulse-dot 1s ease-in-out infinite;
  }
  .bds-status-thinking {
    border-color: rgba(245, 158, 11, 0.35);
    color: #f59e0b;
  }

  .bds-status-speaking .bds-live-dot {
    background: #a855f7;
    box-shadow: 0 0 10px #a855f7;
    animation: bds-pulse-dot 0.8s ease-in-out infinite;
  }
  .bds-status-speaking {
    border-color: rgba(168, 85, 247, 0.4);
    color: #c084fc;
  }

  .bds-status-muted .bds-live-dot {
    background: #ef4444;
    box-shadow: 0 0 8px #ef4444;
  }
  .bds-status-muted {
    border-color: rgba(239, 68, 68, 0.3);
    color: #fca5a5;
  }

  @keyframes bds-pulse-dot {
    0%, 100% { transform: scale(1); opacity: 0.9; }
    50% { transform: scale(1.35); opacity: 0.4; }
  }

  .bds-live-icon-btn {
    width: 38px;
    height: 38px;
    border-radius: 50%;
    background: rgba(30, 41, 59, 0.5);
    border: 1px solid rgba(148, 163, 184, 0.15);
    color: #94a3b8;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .bds-live-icon-btn:hover {
    background: rgba(51, 65, 85, 0.8);
    color: #ffffff;
    border-color: rgba(255, 255, 255, 0.25);
    transform: scale(1.05);
  }

  /* ── Center Stage & Canvas ── */
  .bds-live-stage {
    flex: 1;
    width: 100%;
    max-width: 900px;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
  }

  .bds-live-canvas {
    width: 100%;
    height: 100%;
    max-width: 720px;
    max-height: 480px;
    display: block;
  }

  /* ── Bottom Footer Controls ── */
  .bds-live-footer {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 24px;
    z-index: 10;
  }

  .bds-live-action-btn {
    border: none;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1);
  }

  /* Secondary action buttons (Mute & Interrupt) */
  .bds-live-action-btn--mute,
  .bds-live-action-btn--interrupt {
    width: 54px;
    height: 54px;
    background: rgba(30, 41, 59, 0.7);
    border: 1px solid rgba(148, 163, 184, 0.2);
    color: #cbd5e1;
    backdrop-filter: blur(12px);
  }

  .bds-live-action-btn--mute:hover:not(:disabled),
  .bds-live-action-btn--interrupt:hover:not(:disabled) {
    background: rgba(51, 65, 85, 0.95);
    color: #ffffff;
    transform: translateY(-2px) scale(1.04);
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.4);
  }

  .bds-live-action-btn--mute.bds-is-muted {
    background: rgba(239, 68, 68, 0.2);
    border-color: rgba(239, 68, 68, 0.5);
    color: #ef4444;
  }

  .bds-live-action-btn--interrupt.bds-disabled,
  .bds-live-action-btn--interrupt:disabled {
    opacity: 0.35;
    cursor: not-allowed;
    transform: none;
  }

  /* Prominent End Session Button (Gemini Live red hangup aesthetic) */
  .bds-live-action-btn--end {
    width: 66px;
    height: 66px;
    background: linear-gradient(135deg, #ef4444, #dc2626);
    color: #ffffff;
    box-shadow: 0 8px 24px rgba(239, 68, 68, 0.35);
  }

  .bds-live-action-btn--end:hover {
    background: linear-gradient(135deg, #f87171, #ef4444);
    transform: translateY(-2px) scale(1.06);
    box-shadow: 0 12px 30px rgba(239, 68, 68, 0.5);
  }

  .bds-live-action-btn:active {
    transform: scale(0.96);
  }

  /* Mobile responsiveness */
  @media (max-width: 640px) {
    .bds-live-overlay {
      padding: 16px 16px 32px;
    }
    .bds-live-footer {
      gap: 18px;
    }
    .bds-live-action-btn--mute,
    .bds-live-action-btn--interrupt {
      width: 48px;
      height: 48px;
    }
    .bds-live-action-btn--end {
      width: 58px;
      height: 58px;
    }
  }
</style>
