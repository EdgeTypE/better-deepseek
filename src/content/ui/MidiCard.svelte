<script module>
  /**
   * Shared across every mounted card so that starting one playback silences
   * whichever card was playing before — otherwise two cards would overlap.
   */
  let stopActivePlayback = () => {};
</script>

<script>
  import { onDestroy, onMount } from "svelte";
  import { t } from "../../lib/i18n.svelte.js";
  import { triggerBlobDownload } from "../../lib/utils/download.js";
  import {
    BEATS_PER_BAR,
    buildMidiFile,
    flattenNotes,
    midiFileName,
    midiToFrequency,
    midiToPitch,
    parseMidiScore,
    programToName,
    waveformForProgram,
  } from "../../lib/midi.js";

  /**
   * @type {{
   *   content: string,
   *   attrs?: Record<string, string>
   * }}
   */
  let { content = "", attrs = {} } = $props();

  /** Palette for the piano roll; index = track index. */
  const TRACK_COLORS = ["#8b5cf6", "#10b981", "#3b82f6", "#f97316", "#ec4899", "#14b8a6", "#eab308"];

  /** Extra time after the last note before playback is considered finished. */
  const TAIL_SECONDS = 0.35;

  let parsed = $derived(parseMidiScore(content));
  let notes = $derived(flattenNotes(parsed));
  let playableTracks = $derived(parsed.tracks.filter((track) => track.notes.length));

  let isPlaying = $state(false);
  let loopEnabled = $state(false);
  let progress = $state(0);
  let audioSupported = $state(true);
  let showNotation = $state(false);
  let copied = $state(false);

  // Audio graph handles — deliberately non-reactive so the scheduler never
  // triggers a re-render mid-playback.
  let audioCtx = null;
  let masterGain = null;
  let oscillators = [];
  let rafId = 0;
  let endTimer = 0;
  let playStart = 0;

  /** Where the next playback starts from, in score seconds. */
  let offsetSeconds = 0;

  /** Two keys rather than one: not every language pluralizes the same way. */
  const plural = (count, oneKey, manyKey) => t(count === 1 ? oneKey : manyKey, { count });

  let cardTitle = $derived(attrs.title || parsed.title || t("midiCard.defaultTitle"));

  let cardSubtitle = $derived.by(() => {
    if (!parsed.noteCount) return "";
    return [
      `${parsed.tempo} BPM`,
      plural(playableTracks.length, "midiCard.trackOne", "midiCard.trackMany"),
      plural(parsed.noteCount, "midiCard.noteOne", "midiCard.noteMany"),
      `${parsed.durationSeconds.toFixed(1)}s`,
    ].join(" · ");
  });

  let pitchView = $derived.by(() => {
    const max = Math.min(127, (parsed.noteCount ? parsed.maxPitch : 60) + 2);
    const min = Math.max(0, (parsed.noteCount ? parsed.minPitch : 60) - 2);
    const span = Math.max(1, max - min + 1);
    return { min, max, span, rowHeight: Math.min(220, Math.max(96, span * 7)) };
  });

  let barCount = $derived(Math.max(1, Math.ceil(parsed.durationBeats / BEATS_PER_BAR)));

  /**
   * One entry per semitone in view, top-down. Drives the key gutter and the
   * black-key shading, and keeps the vertical maths in one place.
   */
  let rows = $derived.by(() =>
    Array.from({ length: pitchView.span }, (_, offset) => {
      const pitch = pitchView.max - offset;
      const pitchClass = ((pitch % 12) + 12) % 12;
      return {
        offset,
        pitch,
        name: midiToPitch(pitch),
        isC: pitchClass === 0,
        isBlack: [1, 3, 6, 8, 10].includes(pitchClass),
      };
    })
  );

  let visibleErrors = $derived(parsed.errors.slice(0, 3));

  function trackLabel(track, index) {
    return track.name || t("midiCard.untitledTrack", { index: index + 1 });
  }

  function trackColor(index) {
    return TRACK_COLORS[index % TRACK_COLORS.length];
  }

  const raf = (callback) =>
    typeof requestAnimationFrame === "function" ? requestAnimationFrame(callback) : setTimeout(callback, 16);

  const cancelRaf = (id) => {
    if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(id);
    else clearTimeout(id);
  };

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  /** Fraction of the score a position corresponds to, for the playhead. */
  const progressFor = (seconds) => {
    const total = Math.max(0, parsed.durationSeconds);
    return total > 0 ? clamp(seconds / total, 0, 1) : 0;
  };

  /**
   * Stop every scheduled voice and drop the master bus.
   *
   * The `AudioContext` itself is deliberately left open: seeking reschedules
   * playback, and browsers cap how many contexts a page may create, so we open
   * one per card and close it on unmount.
   *
   * `reset` distinguishes the two ways playback ends. A pause keeps the position
   * so the next press resumes; a stop — unmount, another card taking over, the
   * score running out — rewinds to the beginning.
   */
  function teardown(reset = true) {
    cancelRaf(rafId);
    rafId = 0;
    clearTimeout(endTimer);
    endTimer = 0;

    for (const oscillator of oscillators) {
      try {
        oscillator.stop();
      } catch {
        // Already stopped — dropping the master bus is what silences it.
      }
      try {
        oscillator.disconnect();
      } catch {
        // Ignore: some engines throw when disconnecting a finished node.
      }
    }
    oscillators = [];

    if (masterGain) {
      try {
        masterGain.disconnect();
      } catch {
        // Ignore: disconnecting twice is harmless.
      }
      masterGain = null;
    }

    isPlaying = false;
    offsetSeconds = reset ? 0 : clamp(offsetSeconds, 0, Math.max(0, parsed.durationSeconds));
    progress = progressFor(offsetSeconds);
  }

  /** Release the audio context for good — unmount only. */
  function closeAudio() {
    teardown();
    if (audioCtx) {
      try {
        audioCtx.close();
      } catch {
        // Ignore: closing an already-closed context is harmless.
      }
      audioCtx = null;
    }
  }

  function tick() {
    if (!audioCtx || !isPlaying) return;
    const total = Math.max(0.001, parsed.durationSeconds);
    progress = Math.min(1, Math.max(0, (audioCtx.currentTime - playStart) / total));
    rafId = raf(tick);
  }

  /** Schedule playback starting at `fromSeconds` (defaults to where we paused). */
  function play(fromSeconds = offsetSeconds) {
    if (!parsed.noteCount) return;

    const AudioCtor = typeof window !== "undefined" ? window.AudioContext || window.webkitAudioContext : null;
    if (!AudioCtor) {
      audioSupported = false;
      return;
    }

    const total = Math.max(0, parsed.durationSeconds);
    // Seeking to the very end and pressing play should replay, not sit silent.
    const from = fromSeconds > 0 && fromSeconds < total ? fromSeconds : 0;

    stopActivePlayback();
    teardown();

    const ctx = audioCtx || new AudioCtor();
    audioCtx = ctx;
    if (typeof ctx.resume === "function") ctx.resume().catch(() => {});

    const master = ctx.createGain();
    master.gain.value = 0.85;
    master.connect(ctx.destination);
    masterGain = master;

    const secondsPerBeat = 60 / parsed.tempo;
    const startAt = ctx.currentTime + 0.12;
    // Split the headroom across tracks so a five-track score doesn't clip.
    const trackLevel = 0.26 / Math.max(1, Math.sqrt(playableTracks.length));

    for (const track of parsed.tracks) {
      const waveform = waveformForProgram(track.program);

      for (const note of track.notes) {
        const noteStart = note.start * secondsPerBeat;
        const noteEnd = noteStart + Math.max(0.06, note.duration * secondsPerBeat);
        // Notes behind the seek point are dropped; one straddling it is clipped
        // so it still sounds, just shorter.
        if (noteEnd <= from) continue;

        const at = startAt + Math.max(0, noteStart - from);
        const length = noteEnd - Math.max(noteStart, from);
        const peak = Math.max(0.005, trackLevel * (note.velocity / 127));

        const oscillator = ctx.createOscillator();
        oscillator.type = waveform;
        oscillator.frequency.setValueAtTime(midiToFrequency(note.pitch), at);

        const envelope = ctx.createGain();
        const attack = Math.min(0.015, length * 0.25);
        envelope.gain.setValueAtTime(0, at);
        envelope.gain.linearRampToValueAtTime(peak, at + attack);
        envelope.gain.setValueAtTime(peak, at + length * 0.7);
        envelope.gain.linearRampToValueAtTime(0, at + length);

        oscillator.connect(envelope);
        envelope.connect(master);
        oscillator.start(at);
        oscillator.stop(at + length + 0.02);
        oscillators.push(oscillator);
      }
    }

    // Offset so that `currentTime - playStart` is elapsed score time.
    playStart = startAt - from;
    offsetSeconds = from;
    isPlaying = true;
    progress = progressFor(from);
    stopActivePlayback = teardown;
    tick();

    endTimer = setTimeout(() => {
      if (loopEnabled) play(0);
      else teardown();
    }, (total - from + TAIL_SECONDS) * 1000);
  }

  /** Pause in place — the next press resumes from here. */
  function pause() {
    if (audioCtx) offsetSeconds = clamp(audioCtx.currentTime - playStart, 0, Math.max(0, parsed.durationSeconds));
    teardown(false);
    if (stopActivePlayback === teardown) stopActivePlayback = () => {};
  }

  function togglePlayback() {
    if (isPlaying) pause();
    else play();
  }

  /**
   * Jump to a fraction of the score. While playing this reschedules from the new
   * position; while paused it just moves the playhead.
   */
  function seek(fraction) {
    const total = Math.max(0, parsed.durationSeconds);
    if (!parsed.noteCount || total <= 0) return;

    const target = clamp(fraction, 0, 1);
    const atEnd = target >= 1;

    if (isPlaying) {
      // Jumping to the very end ends playback rather than restarting it — the
      // next press on play is what replays from the beginning.
      if (atEnd) {
        offsetSeconds = total;
        teardown(false);
        if (stopActivePlayback === teardown) stopActivePlayback = () => {};
        return;
      }
      play(target * total);
      return;
    }

    offsetSeconds = atEnd ? total : target * total;
    progress = target;
  }

  /** The roll is the timeline — clicking anywhere on it seeks to that moment. */
  function handleRollClick(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width) return;
    seek((event.clientX - rect.left) / rect.width);
  }

  /** Arrow keys nudge by one bar (four with Shift); Home/End jump to the ends. */
  function handleRollKeydown(event) {
    const step = BEATS_PER_BAR / Math.max(1, parsed.durationBeats);
    const nudge = step * (event.shiftKey ? 4 : 1);

    if (event.key === "ArrowRight") seek(progress + nudge);
    else if (event.key === "ArrowLeft") seek(progress - nudge);
    else if (event.key === "Home") seek(0);
    else if (event.key === "End") seek(1);
    else return;

    event.preventDefault();
  }

  function download() {
    if (!parsed.noteCount) return;
    const bytes = buildMidiFile(parsed);
    triggerBlobDownload(new Blob([bytes], { type: "audio/midi" }), midiFileName(parsed));
  }

  async function copyNotation() {
    try {
      await navigator.clipboard.writeText(content.trim());
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch {
      copied = false;
    }
  }

  onMount(() => {
    audioSupported = Boolean(window.AudioContext || window.webkitAudioContext);
  });

  onDestroy(() => {
    closeAudio();
    if (stopActivePlayback === teardown) stopActivePlayback = () => {};
  });
</script>

<div class="bds-midi-card">
  <div class="bds-midi-header">
    <div class="bds-midi-title-group">
      <h3 class="bds-midi-title">{cardTitle}</h3>
      {#if cardSubtitle}
        <p class="bds-midi-subtitle">{cardSubtitle}</p>
      {/if}
    </div>

    <div class="bds-midi-actions">
      {#if parsed.noteCount}
        <button
          type="button"
          class="bds-midi-btn bds-midi-btn-primary"
          onclick={togglePlayback}
          disabled={!audioSupported}
          title={isPlaying ? t("midiCard.pause") : t("midiCard.play")}
          aria-label={isPlaying ? t("midiCard.pause") : t("midiCard.play")}
        >
          {#if isPlaying}
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <rect x="6.5" y="5" width="4" height="14" rx="1.2" />
              <rect x="13.5" y="5" width="4" height="14" rx="1.2" />
            </svg>
          {:else}
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M8 5.5v13l11-6.5z" />
            </svg>
          {/if}
          <span>{isPlaying ? t("midiCard.pause") : t("midiCard.play")}</span>
        </button>

        <button
          type="button"
          class="bds-midi-btn"
          class:active={loopEnabled}
          onclick={() => (loopEnabled = !loopEnabled)}
          aria-pressed={loopEnabled}
          title={t("midiCard.loop")}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M17 2l4 4-4 4" />
            <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
            <path d="M7 22l-4-4 4-4" />
            <path d="M21 13v1a4 4 0 0 1-4 4H3" />
          </svg>
        </button>

        <button
          type="button"
          class="bds-midi-btn"
          onclick={download}
          title={t("midiCard.downloadMidi")}
          aria-label={t("midiCard.downloadMidi")}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          <span>.mid</span>
        </button>
      {/if}

      <button
        type="button"
        class="bds-midi-btn"
        class:active={showNotation}
        onclick={() => (showNotation = !showNotation)}
        aria-pressed={showNotation}
        title={showNotation ? t("midiCard.hideNotation") : t("midiCard.viewNotation")}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="16 18 22 12 16 6" />
          <polyline points="8 6 2 12 8 18" />
        </svg>
      </button>
    </div>
  </div>

  {#if showNotation}
    <div class="bds-midi-notation">
      <div class="bds-midi-notation-header">
        <span>{t("midiCard.notationLabel")}</span>
        <button type="button" class="bds-midi-copy" onclick={copyNotation}>
          {copied ? t("midiCard.copied") : t("midiCard.copyNotation")}
        </button>
      </div>
      <pre class="bds-midi-notation-body"><code>{content.trim()}</code></pre>
    </div>
  {/if}

  {#if !parsed.noteCount}
    <div class="bds-midi-error">
      <div class="bds-midi-error-title">{t("midiCard.renderError")}</div>
      {#if visibleErrors.length}
        <ul class="bds-midi-error-list">
          {#each visibleErrors as error}
            <li>{t("midiCard.lineError", { line: error.line, message: error.message })}</li>
          {/each}
        </ul>
      {:else}
        <p class="bds-midi-error-text">{t("midiCard.emptyHint")}</p>
      {/if}
    </div>
  {:else}
    <div class="bds-midi-roll-wrap">
      <div class="bds-midi-roll-grid" style="height: {pitchView.rowHeight}px;">
        <div class="bds-midi-gutter" aria-hidden="true">
          {#each rows as row (row.pitch)}
            {#if row.isC && pitchView.rowHeight >= 9}
              <span
                class="bds-midi-gutter-label"
                style="top: {((row.offset + 0.1) / pitchView.span) * 100}%; height: {(0.8 / pitchView.span) * 100}%"
              >
                {row.name}
              </span>
            {/if}
          {/each}
        </div>

        <div
          class="bds-midi-roll"
          role="slider"
          tabindex="0"
          aria-label={t("midiCard.seek")}
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow={Math.round(progress * 100)}
          title={t("midiCard.seek")}
          onclick={handleRollClick}
          onkeydown={handleRollKeydown}
        >
          {#each rows as row (row.pitch)}
            <span
              class="bds-midi-row"
              class:black={row.isBlack}
              aria-hidden="true"
              style="top: {((row.offset + 0.1) / pitchView.span) * 100}%; height: {(0.8 / pitchView.span) * 100}%"
            ></span>
          {/each}

          {#each Array(barCount) as _, bar}
            <span
              class="bds-midi-grid-line"
              aria-hidden="true"
              style="left: {((bar * BEATS_PER_BAR) / parsed.durationBeats) * 100}%"
            ></span>
          {/each}

          {#each notes as note, index (index)}
            <span
              class="bds-midi-note"
              aria-hidden="true"
              style="
                left: {(note.start / parsed.durationBeats) * 100}%;
                width: {(note.duration / parsed.durationBeats) * 100}%;
                top: {((pitchView.max - note.pitch + 0.1) / pitchView.span) * 100}%;
                height: {(0.8 / pitchView.span) * 100}%;
                background: {trackColor(note.trackIndex)};
              "
            ></span>
          {/each}

          {#if isPlaying || progress > 0}
            <span class="bds-midi-playhead" aria-hidden="true" style="left: {progress * 100}%"></span>
          {/if}
        </div>
      </div>
    </div>

    <div class="bds-midi-tracks">
      {#each playableTracks as track}
        {@const index = parsed.tracks.indexOf(track)}
        <span class="bds-midi-track">
          <span class="bds-midi-track-dot" style="background: {trackColor(index)}"></span>
          <span class="bds-midi-track-name">{trackLabel(track, index)}</span>
          <span class="bds-midi-track-meta">{programToName(track.program)}</span>
        </span>
      {/each}
    </div>

    {#if visibleErrors.length}
      <ul class="bds-midi-warning-list">
        {#each visibleErrors as error}
          <li>{t("midiCard.lineError", { line: error.line, message: error.message })}</li>
        {/each}
      </ul>
    {/if}

    {#if !audioSupported}
      <p class="bds-midi-hint">{t("midiCard.audioUnavailable")}</p>
    {/if}
  {/if}
</div>

<style>
  .bds-midi-card {
    position: relative;
    margin: 16px 0;
    padding: 18px 20px 16px 20px;
    background: var(--bds-bg-panel, #ffffff);
    border: 1px solid var(--bds-border, #e5e7eb);
    border-radius: 16px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.04), 0 1px 3px rgba(0, 0, 0, 0.02);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    color: var(--bds-text-primary, #111827);
    overflow: hidden;
  }

  :global(html.dark) .bds-midi-card,
  :global(body.dark) .bds-midi-card {
    background: var(--bds-bg-panel, #1c1c1f);
    border-color: var(--bds-border, #2f2f35);
    color: var(--bds-text-primary, #f4f4f5);
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.35);
  }

  .bds-midi-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }

  .bds-midi-title {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    line-height: 1.3;
  }

  .bds-midi-subtitle {
    margin: 4px 0 0 0;
    font-size: 12px;
    color: var(--bds-text-secondary, #6b7280);
    font-variant-numeric: tabular-nums;
  }

  .bds-midi-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .bds-midi-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 30px;
    padding: 0 9px;
    font-size: 12px;
    font-weight: 500;
    font-family: inherit;
    color: var(--bds-text-primary, #111827);
    background: transparent;
    border: 1px solid var(--bds-border, #e5e7eb);
    border-radius: 9px;
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
  }

  .bds-midi-btn svg {
    width: 15px;
    height: 15px;
    flex-shrink: 0;
  }

  .bds-midi-btn:hover:not(:disabled) {
    background: var(--bds-bg-hover, rgba(0, 0, 0, 0.05));
    border-color: var(--bds-border-hover, #d1d5db);
  }

  .bds-midi-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .bds-midi-btn.active {
    color: var(--bds-accent, #8b5cf6);
    border-color: var(--bds-accent, #8b5cf6);
    background: rgba(139, 92, 246, 0.1);
  }

  .bds-midi-btn-primary {
    color: #ffffff;
    background: var(--bds-accent, #8b5cf6);
    border-color: var(--bds-accent, #8b5cf6);
  }

  .bds-midi-btn-primary:hover:not(:disabled) {
    background: var(--bds-accent, #8b5cf6);
    border-color: var(--bds-accent, #8b5cf6);
    filter: brightness(1.08);
  }

  .bds-midi-notation {
    margin-top: 12px;
    border: 1px solid var(--bds-border, #e5e7eb);
    border-radius: 10px;
    overflow: hidden;
    background: var(--bds-bg-elevated, #f9fafb);
  }

  .bds-midi-notation-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 10px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: var(--bds-text-secondary, #6b7280);
    border-bottom: 1px solid var(--bds-border, #e5e7eb);
  }

  .bds-midi-copy {
    font-family: inherit;
    font-size: 11px;
    font-weight: 500;
    text-transform: none;
    color: var(--bds-text-secondary, #6b7280);
    background: none;
    border: none;
    cursor: pointer;
    padding: 2px 4px;
    border-radius: 6px;
  }

  .bds-midi-copy:hover {
    color: var(--bds-accent, #8b5cf6);
  }

  .bds-midi-notation-body {
    margin: 0;
    padding: 10px 12px;
    max-height: 220px;
    overflow: auto;
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
    font-size: 12px;
    line-height: 1.55;
    white-space: pre-wrap;
    word-break: break-word;
    color: var(--bds-text-primary, #111827);
  }

  .bds-midi-roll-wrap {
    margin-top: 14px;
    padding: 8px;
    border: 1px solid var(--bds-border, #e5e7eb);
    border-radius: 12px;
    background: var(--bds-bg-elevated, #f9fafb);
  }

  .bds-midi-roll-grid {
    display: flex;
    align-items: stretch;
    gap: 6px;
  }

  /* Key gutter — the piano-roll reference column. */
  .bds-midi-gutter {
    position: relative;
    width: 26px;
    flex-shrink: 0;
    border-right: 1px solid var(--bds-border, #e5e7eb);
  }

  .bds-midi-gutter-label {
    position: absolute;
    right: 5px;
    display: flex;
    align-items: center;
    font-size: 9px;
    line-height: 1;
    color: var(--bds-text-tertiary, #9ca3af);
    pointer-events: none;
    user-select: none;
  }

  .bds-midi-roll {
    position: relative;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    border-radius: 6px;
    background: var(--bds-bg-panel, #ffffff);
    cursor: pointer;
  }

  .bds-midi-roll:focus-visible {
    outline: 2px solid var(--bds-accent, #8b5cf6);
    outline-offset: 2px;
  }

  .bds-midi-row {
    position: absolute;
    left: 0;
    right: 0;
    border-radius: 2px;
  }

  .bds-midi-row.black {
    background: rgba(17, 24, 39, 0.055);
  }

  :global(html.dark) .bds-midi-row.black,
  :global(body.dark) .bds-midi-row.black {
    background: rgba(255, 255, 255, 0.045);
  }

  .bds-midi-grid-line {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 1px;
    background: var(--bds-border, #e5e7eb);
    opacity: 0.9;
  }

  .bds-midi-note {
    position: absolute;
    min-width: 2px;
    min-height: 2px;
    border-radius: 3px;
    opacity: 0.92;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
  }

  .bds-midi-playhead {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    margin-left: -1px;
    background: var(--bds-danger, #ef4444);
    box-shadow: 0 0 6px rgba(239, 68, 68, 0.6);
    pointer-events: none;
  }

  .bds-midi-tracks {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 14px;
    margin-top: 12px;
  }

  .bds-midi-track {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--bds-text-primary, #111827);
  }

  .bds-midi-track-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .bds-midi-track-meta {
    font-size: 11px;
    color: var(--bds-text-tertiary, #9ca3af);
  }

  .bds-midi-warning-list,
  .bds-midi-error-list {
    margin: 10px 0 0 0;
    padding-left: 18px;
    font-size: 12px;
    line-height: 1.5;
  }

  .bds-midi-warning-list {
    color: #b45309;
  }

  :global(html.dark) .bds-midi-warning-list,
  :global(body.dark) .bds-midi-warning-list {
    color: #fbbf24;
  }

  .bds-midi-error {
    margin-top: 14px;
    padding: 12px 14px;
    border: 1px solid var(--bds-danger-border, #fecaca);
    border-radius: 10px;
    background: rgba(239, 68, 68, 0.07);
    font-size: 12px;
  }

  .bds-midi-error-title {
    font-weight: 600;
    color: var(--bds-danger, #dc2626);
  }

  .bds-midi-error-list {
    color: var(--bds-text-secondary, #6b7280);
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }

  .bds-midi-error-text {
    margin: 6px 0 0 0;
    color: var(--bds-text-secondary, #6b7280);
  }

  .bds-midi-hint {
    margin: 10px 0 0 0;
    font-size: 12px;
    color: var(--bds-text-tertiary, #9ca3af);
  }
</style>
