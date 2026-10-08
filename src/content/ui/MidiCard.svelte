<script module>
  /**
   * Shared across every mounted card so that starting one playback silences
   * whichever card was playing before, otherwise two cards would overlap.
   */
  let stopActivePlayback = () => {};
</script>

<script>
  import { onDestroy, onMount } from "svelte";
  import { t } from "../../lib/i18n.svelte.js";
  import { STORAGE_KEYS } from "../../lib/constants.js";
  import { triggerBlobDownload } from "../../lib/utils/download.js";
  import appState from "../state.js";
  import {
    BEATS_PER_BAR,
    buildMidiFile,
    createMidiSynth,
    flattenNotes,
    midiFileName,
    midiToPitch,
    parseMidiScore,
    programToName,
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

  /**
   * Extra time after the last note before playback is considered finished.
   * Long enough for the note releases and most of the reverb tail to sound.
   */
  const TAIL_SECONDS = 2;

  let parsed = $derived(parseMidiScore(content));
  let notes = $derived(flattenNotes(parsed));
  let playableTracks = $derived(parsed.tracks.filter((track) => track.notes.length));

  let isPlaying = $state(false);
  let loopEnabled = $state(false);
  let progress = $state(0);
  let audioSupported = $state(true);
  let showNotation = $state(false);
  let copied = $state(false);

  /** Clamp anything (a stale setting, a slider string) into a 0-1 level. */
  const clamp01 = (value, fallback = 1) => {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(1, Math.max(0, number));
  };

  /**
   * Playback level, 0-1. The control lives on the card, but the value is
   * global: it is stored in `settings.midiVolume`, so every MIDI card in every
   * chat plays at the level the user last dialled in.
   */
  const storedVolume = clamp01(appState.settings.midiVolume);
  let volume = $state(storedVolume);
  let muted = $derived(volume === 0);
  /** Last audible level, so unmuting restores what the user had chosen. */
  let lastAudibleVolume = storedVolume > 0 ? storedVolume : 1;

  // Audio handles are deliberately non-reactive so the scheduler never
  // triggers a re-render mid-playback. The synth engine itself lives in
  // `lib/midi.js`; the card only owns the context, transport and playhead.
  let audioCtx = null;
  let synth = null;
  let session = null;
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
   * Stop the current playback session.
   *
   * The `AudioContext` itself is deliberately left open: seeking reschedules
   * playback, and browsers cap how many contexts a page may create, so we open
   * one per card and close it on unmount. The session fades its own bus out
   * before unhooking, so stopping never clicks.
   *
   * `reset` distinguishes the two ways playback ends. A pause keeps the position
   * so the next press resumes; a stop (unmount, another card taking over, the
   * score running out) rewinds to the beginning.
   */
  function teardown(reset = true) {
    cancelRaf(rafId);
    rafId = 0;
    clearTimeout(endTimer);
    endTimer = 0;

    if (session) {
      session.stop();
      session = null;
    }

    isPlaying = false;
    offsetSeconds = reset ? 0 : clamp(offsetSeconds, 0, Math.max(0, parsed.durationSeconds));
    progress = progressFor(offsetSeconds);
  }

  /** Release the audio context for good. Unmount only. */
  function closeAudio() {
    teardown();

    if (synth) {
      synth.dispose();
      synth = null;
    }

    if (audioCtx) {
      try {
        const closing = audioCtx.close();
        if (closing && typeof closing.catch === "function") closing.catch(() => {});
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
    if (typeof ctx.resume === "function") Promise.resolve(ctx.resume()).catch(() => {});

    if (!synth) synth = createMidiSynth(ctx);
    session = synth.start(parsed, { from, volume });

    // Offset so that `currentTime - playStart` is elapsed score time.
    playStart = session.startTime - from;
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

  /** Pause in place. The next press resumes from here. */
  function pause() {
    if (audioCtx) offsetSeconds = clamp(audioCtx.currentTime - playStart, 0, Math.max(0, parsed.durationSeconds));
    teardown(false);
    if (stopActivePlayback === teardown) stopActivePlayback = () => {};
  }

  function togglePlayback() {
    if (isPlaying) pause();
    else play();
  }

  // ── Volume (global) ──

  /** Push the level into the live session. A no-op while nothing is playing. */
  function applyVolume() {
    if (session) session.setVolume(volume);
  }

  /** Dragging: audible immediately, persisted once the drag ends. */
  function handleVolumeInput(event) {
    // The slider is 0-100 so it steps in whole percents; the setting is 0-1.
    const next = clamp01(Number(event.currentTarget.value) / 100);
    volume = next;
    if (next > 0) lastAudibleVolume = next;
    applyVolume();
  }

  function handleVolumeChange() {
    persistVolume();
  }

  function toggleMute() {
    const next = volume > 0 ? 0 : lastAudibleVolume || 1;
    volume = next;
    if (next > 0) lastAudibleVolume = next;
    applyVolume();
    persistVolume();
  }

  /** Settings are global, so this writes the same key the settings panel writes. */
  function persistVolume() {
    appState.settings.midiVolume = volume;
    if (typeof chrome === "undefined" || !chrome.storage?.local) return;
    try {
      chrome.storage.local.set({
        [STORAGE_KEYS.settings]: JSON.parse(JSON.stringify(appState.settings)),
      });
    } catch {
      // Storage unavailable in some embedded contexts; the in-memory choice still applies.
    }
  }

  /** Another card or tab changed the shared level — adopt it. */
  function syncVolume() {
    const next = clamp01(appState.settings.midiVolume);
    if (next === volume) return;
    volume = next;
    if (next > 0) lastAudibleVolume = next;
    applyVolume();
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
      // Jumping to the very end ends playback rather than restarting it. The
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

  /** The roll is the timeline: clicking anywhere on it seeks to that moment. */
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
    // The level is global, so another card (or the settings panel) may change it.
    window.addEventListener("bds:settingsChanged", syncVolume);
  });

  onDestroy(() => {
    closeAudio();
    if (stopActivePlayback === teardown) stopActivePlayback = () => {};
    if (typeof window !== "undefined") window.removeEventListener("bds:settingsChanged", syncVolume);
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

    <div class="bds-midi-footer">
      <div class="bds-midi-volume">
        <button
          type="button"
          class="bds-midi-btn bds-midi-mute"
          class:active={muted}
          onclick={toggleMute}
          aria-pressed={muted}
          title={muted ? t("midiCard.unmute") : t("midiCard.mute")}
          aria-label={muted ? t("midiCard.unmute") : t("midiCard.mute")}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            {#if muted}
              <line x1="22" y1="9" x2="16" y2="15" />
              <line x1="16" y1="9" x2="22" y2="15" />
            {:else}
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
            {/if}
          </svg>
        </button>

        <input
          class="bds-midi-volume-slider"
          type="range"
          min="0"
          max="100"
          step="1"
          value={Math.round(volume * 100)}
          oninput={handleVolumeInput}
          onchange={handleVolumeChange}
          title={t("midiCard.volume")}
          aria-label={t("midiCard.volume")}
        />
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

  /*
   * Volume sits in the footer next to the track legend, never inside the
   * action-button row. The value is global (settings.midiVolume).
   */
  .bds-midi-volume {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .bds-midi-mute {
    padding: 0 6px;
  }

  .bds-midi-volume-slider {
    width: 104px;
    height: 4px;
    margin: 0;
    padding: 0;
    background: transparent;
    accent-color: var(--bds-accent, #8b5cf6);
    cursor: pointer;
  }

  .bds-midi-volume-slider:focus-visible {
    outline: 2px solid var(--bds-accent, #8b5cf6);
    outline-offset: 2px;
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

  /* Key gutter, the piano-roll reference column. */
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

  /* Footer row: playback level on the left, the track legend on the right. */
  .bds-midi-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px 18px;
    margin-top: 12px;
  }

  .bds-midi-tracks {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 14px;
    min-width: 0;
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
