import { afterEach, describe, expect, it, vi } from "vitest";

import { createMidiSynth, parseMidiScore, voiceForProgram } from "./midi.js";

/**
 * Minimal AudioContext stub. The engine only needs the node factories it
 * guards for; `createPeriodicWave`, `createConvolver` and `createStereoPanner`
 * are deliberately absent so the plain, un-panned path is exercised.
 */
class FakeParam {
  constructor(value = 0) {
    this.value = value;
  }

  cancelScheduledValues() {}

  setValueAtTime(value) {
    this.value = value;
  }

  linearRampToValueAtTime(value) {
    this.value = value;
  }

  exponentialRampToValueAtTime(value) {
    this.value = value;
  }

  setTargetAtTime(value) {
    this.value = value;
  }
}

function createContext() {
  const ctx = {
    currentTime: 0,
    sampleRate: 44100,
    destination: {},
    oscillators: [],
    disconnects: 0,
  };

  const node = () => ({
    connect() {},
    disconnect() {
      ctx.disconnects++;
    },
  });

  ctx.createGain = () => ({ gain: new FakeParam(1), ...node() });
  ctx.createBiquadFilter = () => ({ type: "", Q: new FakeParam(1), frequency: new FakeParam(0), ...node() });
  ctx.createBuffer = (channels, length) => ({
    getChannelData: () => new Float32Array(length),
  });
  ctx.createBufferSource = () => ({ buffer: null, loop: false, start() {}, stop() {}, ...node() });
  ctx.createOscillator = () => {
    const oscillator = {
      type: "",
      frequency: new FakeParam(),
      detune: new FakeParam(),
      starts: [],
      start(at) {
        this.starts.push(at);
      },
      stop() {},
      ...node(),
    };
    ctx.oscillators.push(oscillator);
    return oscillator;
  };

  return ctx;
}

/** One note per second: `bars` quarter notes at 60 BPM. */
function quarterNoteScore(count) {
  return parseMidiScore(["tempo: 60", "track Bass instrument=bass", "C2/4 ".repeat(count)].join("\n"));
}

/** Move the playhead forward, letting the scheduler top its window up. */
function advance(ctx, toSeconds, step = 0.5) {
  for (let now = 0; now <= toSeconds; now += step) {
    ctx.currentTime = now;
    vi.advanceTimersByTime(step * 1000);
  }
}

describe("midi synth scheduler", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("schedules only the first window instead of the whole score", () => {
    vi.useFakeTimers();
    const score = quarterNoteScore(60);
    const ctx = createContext();

    createMidiSynth(ctx).start(score);

    // Window is 3s: notes at 0, 1 and 2 seconds, and nothing beyond them.
    expect(score.noteCount).toBe(60);
    expect(ctx.oscillators).toHaveLength(3);
  });

  it("schedules every note exactly once as the playhead advances", () => {
    vi.useFakeTimers();
    const score = quarterNoteScore(60);
    const ctx = createContext();
    const perNote = voiceForProgram(score.tracks[0].program).detune ? 2 : 1;

    createMidiSynth(ctx).start(score);
    advance(ctx, 60);

    expect(ctx.oscillators).toHaveLength(score.noteCount * perNote);
  });

  it("keeps the absolute note times of a whole-score schedule", () => {
    vi.useFakeTimers();
    const score = quarterNoteScore(8);
    const ctx = createContext();
    const session = createMidiSynth(ctx).start(score);

    advance(ctx, 8);

    const starts = ctx.oscillators.map((oscillator) => oscillator.starts[0]).sort((a, b) => a - b);
    expect(starts).toEqual([0, 1, 2, 3, 4, 5, 6, 7].map((second) => session.startTime + second));
  });

  it("drops the nodes of a chunk once its last note has rung out", () => {
    vi.useFakeTimers();
    const score = quarterNoteScore(30);
    const ctx = createContext();

    createMidiSynth(ctx).start(score);
    expect(ctx.disconnects).toBe(0);

    advance(ctx, 30);
    expect(ctx.disconnects).toBeGreaterThan(0);
  });

  it("stops scheduling once the session is stopped", () => {
    vi.useFakeTimers();
    const score = quarterNoteScore(30);
    const ctx = createContext();
    const session = createMidiSynth(ctx).start(score);

    advance(ctx, 4);
    const scheduled = ctx.oscillators.length;
    expect(scheduled).toBeLessThan(score.noteCount);

    session.stop();
    advance(ctx, 30);

    expect(ctx.oscillators).toHaveLength(scheduled);
  });

  it("resumes from a seek point without scheduling the notes before it", () => {
    vi.useFakeTimers();
    const score = quarterNoteScore(30);
    const ctx = createContext();

    createMidiSynth(ctx).start(score, { from: 10 });

    // 10, 11 and 12 seconds: the window still opens at the seek point.
    expect(ctx.oscillators).toHaveLength(3);
    expect(ctx.oscillators.map((oscillator) => oscillator.starts[0])).toEqual([0.12, 1.12, 2.12]);
  });
});
