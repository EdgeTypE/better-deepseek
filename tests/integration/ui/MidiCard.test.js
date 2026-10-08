// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const downloadMock = vi.hoisted(() => vi.fn());
vi.mock("../../../src/lib/utils/download.js", () => ({
  triggerBlobDownload: downloadMock,
}));

import MidiCard from "../../../src/content/ui/MidiCard.svelte";
import appState from "../../../src/content/state.js";
import { STORAGE_KEYS } from "../../../src/lib/constants.js";
import { renderSvelte, flushUi } from "../../helpers/svelte.js";

const SCORE = [
  "title: Evening Loop",
  "tempo: 96",
  "track Melody instrument=piano",
  "C4/4 E4/4 G4/2",
  "track Bass instrument=bass",
  "C2/1",
].join("\n");

/**
 * AudioContext stub — jsdom has none, and the card must stay silent without one.
 * It covers every node the synth engine in `lib/midi.js` builds. `createPeriodicWave`
 * is deliberately absent: without it the engine falls back to a plain
 * `oscillator.type`, which is what the assertions below pin.
 */
class FakeAudioParam {
  constructor(value = 0) {
    this.value = value;
    this.ramps = [];
  }

  cancelScheduledValues() {}

  setValueAtTime(value) {
    this.value = value;
  }

  linearRampToValueAtTime(value) {
    this.value = value;
    this.ramps.push(value);
  }

  exponentialRampToValueAtTime(value) {
    this.value = value;
  }

  setTargetAtTime(value) {
    this.value = value;
  }
}

class FakeAudioContext {
  constructor() {
    this.currentTime = 0;
    this.sampleRate = 44100;
    this.destination = {};
    created.contexts.push(this);
  }

  createOscillator() {
    const oscillator = {
      type: "",
      frequency: new FakeAudioParam(),
      detune: new FakeAudioParam(),
      connect() {},
      disconnect() {},
      start: vi.fn(),
      stop: vi.fn(),
    };
    created.oscillators.push(oscillator);
    return oscillator;
  }

  createGain() {
    const node = { gain: new FakeAudioParam(1), connect() {}, disconnect() {} };
    created.gains.push(node);
    return node;
  }

  createBiquadFilter() {
    return {
      type: "",
      Q: new FakeAudioParam(1),
      frequency: new FakeAudioParam(0),
      connect() {},
      disconnect() {},
    };
  }

  createStereoPanner() {
    return { pan: new FakeAudioParam(0), connect() {}, disconnect() {} };
  }

  createBuffer(channels, length) {
    const channelsData = Array.from({ length: channels }, () => new Float32Array(length));
    return { getChannelData: (channel) => channelsData[channel] };
  }

  createBufferSource() {
    return {
      buffer: null,
      loop: false,
      connect() {},
      disconnect() {},
      start: vi.fn(),
      stop: vi.fn(),
    };
  }

  resume() {
    return Promise.resolve();
  }

  close() {
    return Promise.resolve();
  }
}

/** `gains[0]` is the master bus of the most recent session — the engine builds it first. */
const created = { oscillators: [], contexts: [], gains: [] };

/** Give the roll a real box so click positions map to a fraction of the width. */
function makeRollMeasurable(target) {
  const roll = target.querySelector(".bds-midi-roll");
  roll.getBoundingClientRect = () => ({ left: 0, width: 200, top: 0, right: 200, bottom: 100, height: 100 });
  return roll;
}

function clickRoll(roll, clientX) {
  roll.dispatchEvent(new MouseEvent("click", { clientX, bubbles: true }));
}

function pressKey(roll, key, init = {}) {
  roll.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...init }));
}

function render(content, attrs = {}) {
  return renderSvelte(MidiCard, { content, attrs });
}

function buttonByTitle(target, title) {
  return [...target.querySelectorAll("button")].find((button) => button.getAttribute("title") === title);
}

describe("MidiCard", () => {
  beforeEach(() => {
    downloadMock.mockReset();
    document.body.innerHTML = "";
    created.oscillators = [];
    created.contexts = [];
    created.gains = [];
    // The level is a shared setting, so a test that moves it must not leak.
    appState.settings.midiVolume = 1;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders one block per note and the title from the score", async () => {
    const { target, cleanup } = render(SCORE);
    await flushUi();

    expect(target.querySelector(".bds-midi-title").textContent).toBe("Evening Loop");
    expect(target.querySelectorAll(".bds-midi-note")).toHaveLength(4);
    expect(target.querySelector(".bds-midi-roll")).not.toBeNull();
    expect(target.querySelector(".bds-midi-error")).toBeNull();
    cleanup();
  });

  it("draws a key gutter and shades the black keys", async () => {
    const { target, cleanup } = render("C4/4 C5/4");
    await flushUi();

    expect([...target.querySelectorAll(".bds-midi-gutter-label")].map((node) => node.textContent)).toEqual([
      "C5",
      "C4",
    ]);
    expect(target.querySelectorAll(".bds-midi-row.black").length).toBe(7);
    cleanup();
  });

  it("summarises tempo, tracks and notes in the subtitle", async () => {
    const { target, cleanup } = render(SCORE);
    await flushUi();

    const subtitle = target.querySelector(".bds-midi-subtitle").textContent;
    expect(subtitle).toContain("96 BPM");
    expect(subtitle).toContain("2 tracks");
    expect(subtitle).toContain("4 notes");
    cleanup();
  });

  it("prefers attrs.title and falls back to the localized default", async () => {
    const withAttr = render(SCORE, { title: "Custom Name" });
    await flushUi();
    expect(withAttr.target.querySelector(".bds-midi-title").textContent).toBe("Custom Name");
    withAttr.cleanup();

    const withoutTitle = render("C4/4");
    await flushUi();
    expect(withoutTitle.target.querySelector(".bds-midi-title").textContent).toBe("MIDI Composition");
    withoutTitle.cleanup();
  });

  it("lists the tracks with their instruments", async () => {
    const { target, cleanup } = render(SCORE);
    await flushUi();

    expect([...target.querySelectorAll(".bds-midi-track-name")].map((node) => node.textContent)).toEqual([
      "Melody",
      "Bass",
    ]);
    expect([...target.querySelectorAll(".bds-midi-track-meta")].map((node) => node.textContent)).toEqual([
      "piano",
      "bass",
    ]);
    cleanup();
  });

  it("names untitled tracks by index", async () => {
    const { target, cleanup } = render("C4/4 E4/4");
    await flushUi();

    expect(target.querySelector(".bds-midi-track-name").textContent).toBe("Track 1");
    cleanup();
  });

  it("shows the error state when nothing parses", async () => {
    const { target, cleanup } = render("this is not a score");
    await flushUi();

    expect(target.querySelector(".bds-midi-error")).not.toBeNull();
    expect(target.querySelector(".bds-midi-roll")).toBeNull();
    expect(target.querySelector(".bds-midi-btn-primary")).toBeNull();
    cleanup();
  });

  it("reports line-level problems but still plays the valid notes", async () => {
    const { target, cleanup } = render("C4/4 oops/4");
    await flushUi();

    const warnings = target.querySelector(".bds-midi-warning-list");
    expect(warnings).not.toBeNull();
    expect(warnings.textContent).toContain("Line 1");
    expect(warnings.textContent).toContain("oops/4");
    expect(target.querySelectorAll(".bds-midi-note")).toHaveLength(1);
    cleanup();
  });

  it("disables playback when the environment has no AudioContext", async () => {
    const { target, cleanup } = render(SCORE);
    await flushUi();

    expect(buttonByTitle(target, "Play").disabled).toBe(true);
    expect(target.querySelector(".bds-midi-hint").textContent).toContain("Audio playback");
    cleanup();
  });

  it("downloads a .mid file built from the score", async () => {
    const { target, cleanup } = render(SCORE);
    await flushUi();

    buttonByTitle(target, "Download .mid").click();
    await flushUi();

    expect(downloadMock).toHaveBeenCalledTimes(1);
    const [blob, fileName] = downloadMock.mock.calls[0];
    expect(fileName).toBe("Evening-Loop.mid");
    expect(blob.type).toBe("audio/midi");
    cleanup();
  });

  it("toggles the notation view and copies it", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    const { target, cleanup } = render(SCORE);
    await flushUi();

    expect(target.querySelector(".bds-midi-notation")).toBeNull();

    buttonByTitle(target, "View notation").click();
    await flushUi();

    const notation = target.querySelector(".bds-midi-notation");
    expect(notation).not.toBeNull();
    expect(notation.querySelector("code").textContent).toBe(SCORE);

    notation.querySelector(".bds-midi-copy").click();
    await flushUi();
    expect(writeText).toHaveBeenCalledWith(SCORE);
    cleanup();
  });

  it("schedules every note when playback starts, and pauses on a second click", async () => {
    vi.stubGlobal("AudioContext", FakeAudioContext);

    const { target, cleanup } = render(SCORE);
    await flushUi();

    const playButton = buttonByTitle(target, "Play");
    expect(playButton.disabled).toBe(false);

    playButton.click();
    await flushUi();

    // Piano is a two-oscillator voice (detuned pair), bass a single one:
    // 3 melody notes + 1 bass note = 3 * 2 + 1.
    expect(created.oscillators).toHaveLength(7);
    expect(created.oscillators[0].type).toBe("triangle"); // piano
    expect(created.oscillators[0].frequency.setValueAtTime).toBeDefined();
    expect(target.querySelector(".bds-midi-playhead")).not.toBeNull();

    const pauseButton = buttonByTitle(target, "Pause");
    expect(pauseButton).not.toBeUndefined();
    pauseButton.click();
    await flushUi();

    expect(buttonByTitle(target, "Play")).not.toBeUndefined();
    cleanup();
  });

  it("resumes from the paused position instead of restarting", async () => {
    vi.stubGlobal("AudioContext", FakeAudioContext);

    const { target, cleanup } = render(SCORE);
    await flushUi();

    buttonByTitle(target, "Play").click();
    await flushUi();

    // 2.5s of score; playback starts at 0.12, so 1.5 on the clock is 1.38s in.
    created.contexts.at(-1).currentTime = 1.5;
    buttonByTitle(target, "Pause").click();
    await flushUi();

    const roll = target.querySelector(".bds-midi-roll");
    expect(roll.getAttribute("aria-valuenow")).toBe("55");
    expect(target.querySelector(".bds-midi-playhead")).not.toBeNull();

    created.oscillators = [];
    buttonByTitle(target, "Play").click();
    await flushUi();

    // Only the notes reaching past 1.38s are rescheduled: one piano note
    // (two oscillators) and the bass line (one).
    expect(created.oscillators).toHaveLength(3);
    cleanup();
  });

  it("seeks to the clicked position on the timeline", async () => {
    vi.stubGlobal("AudioContext", FakeAudioContext);

    const { target, cleanup } = render(SCORE);
    await flushUi();

    const roll = makeRollMeasurable(target);
    clickRoll(roll, 100);
    await flushUi();

    expect(roll.getAttribute("aria-valuenow")).toBe("50");
    expect(target.querySelector(".bds-midi-playhead")).not.toBeNull();
    cleanup();
  });

  it("reschedules from the clicked position while playing", async () => {
    vi.stubGlobal("AudioContext", FakeAudioContext);

    const { target, cleanup } = render(SCORE);
    await flushUi();

    buttonByTitle(target, "Play").click();
    await flushUi();
    expect(created.oscillators).toHaveLength(7);

    const roll = makeRollMeasurable(target);
    created.oscillators = [];
    clickRoll(roll, 100); // halfway: the first two notes are already behind us
    await flushUi();

    // One piano note (two oscillators) plus the bass line (one).
    expect(created.oscillators).toHaveLength(3);
    cleanup();
  });

  it("ends playback when the timeline is jumped to the very end", async () => {
    vi.stubGlobal("AudioContext", FakeAudioContext);

    const { target, cleanup } = render(SCORE);
    await flushUi();

    buttonByTitle(target, "Play").click();
    await flushUi();

    const roll = makeRollMeasurable(target);
    clickRoll(roll, 200); // the far right edge
    await flushUi();

    expect(buttonByTitle(target, "Play")).not.toBeUndefined();
    expect(roll.getAttribute("aria-valuenow")).toBe("100");
    cleanup();
  });

  it("nudges the playhead with the arrow keys", async () => {
    vi.stubGlobal("AudioContext", FakeAudioContext);

    const { target, cleanup } = render(SCORE);
    await flushUi();

    const roll = target.querySelector(".bds-midi-roll");
    pressKey(roll, "ArrowRight"); // one bar — the whole four-beat score
    await flushUi();
    expect(roll.getAttribute("aria-valuenow")).toBe("100");

    pressKey(roll, "Home");
    await flushUi();
    expect(roll.getAttribute("aria-valuenow")).toBe("0");
    cleanup();
  });

  it("replays from the start when play is pressed at the very end", async () => {
    vi.stubGlobal("AudioContext", FakeAudioContext);

    const { target, cleanup } = render(SCORE);
    await flushUi();

    const roll = target.querySelector(".bds-midi-roll");
    pressKey(roll, "End");
    await flushUi();
    expect(roll.getAttribute("aria-valuenow")).toBe("100");

    buttonByTitle(target, "Play").click();
    await flushUi();

    expect(created.oscillators).toHaveLength(7);
    expect(roll.getAttribute("aria-valuenow")).toBe("0");
    cleanup();
  });

  it("starts the volume slider at the globally stored level", async () => {
    appState.settings.midiVolume = 0.4;

    const { target, cleanup } = render(SCORE);
    await flushUi();

    expect(target.querySelector(".bds-midi-volume-slider").value).toBe("40");
    cleanup();
  });

  it("keeps the volume control out of the action-button row", async () => {
    const { target, cleanup } = render(SCORE);
    await flushUi();

    // The slider lives in the footer, next to the track legend.
    expect(target.querySelector(".bds-midi-footer .bds-midi-volume")).not.toBeNull();
    expect(target.querySelector(".bds-midi-actions .bds-midi-volume")).toBeNull();
    expect([...target.querySelectorAll(".bds-midi-actions button")].map((b) => b.getAttribute("title"))).toEqual([
      "Play",
      "Loop",
      "Download .mid",
      "View notation",
    ]);
    cleanup();
  });

  it("scales the master gain while playing, then persists the level", async () => {
    vi.stubGlobal("AudioContext", FakeAudioContext);

    const { target, cleanup } = render(SCORE);
    await flushUi();

    buttonByTitle(target, "Play").click();
    await flushUi();
    expect(created.gains[0].gain.value).toBeCloseTo(0.9); // full volume

    const slider = target.querySelector(".bds-midi-volume-slider");
    slider.value = "30";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    await flushUi();

    // Audible immediately, but nothing written yet — the drag is not over.
    expect(created.gains[0].gain.value).toBeCloseTo(0.27);
    expect(appState.settings.midiVolume).toBe(1);

    slider.dispatchEvent(new Event("change", { bubbles: true }));
    await flushUi();

    expect(appState.settings.midiVolume).toBeCloseTo(0.3);
    const stored = await chrome.storage.local.get(STORAGE_KEYS.settings);
    expect(stored[STORAGE_KEYS.settings].midiVolume).toBeCloseTo(0.3);
    cleanup();
  });

  it("mutes to silence and restores the level it had before", async () => {
    appState.settings.midiVolume = 0.5;
    vi.stubGlobal("AudioContext", FakeAudioContext);

    const { target, cleanup } = render(SCORE);
    await flushUi();

    const muteButton = buttonByTitle(target, "Mute");
    expect(muteButton.getAttribute("aria-pressed")).toBe("false");

    buttonByTitle(target, "Play").click();
    await flushUi();
    expect(created.gains[0].gain.value).toBeCloseTo(0.45);

    muteButton.click();
    await flushUi();
    expect(created.gains[0].gain.value).toBe(0);
    expect(target.querySelector(".bds-midi-volume-slider").value).toBe("0");
    expect(appState.settings.midiVolume).toBe(0);

    buttonByTitle(target, "Unmute").click();
    await flushUi();
    expect(created.gains[0].gain.value).toBeCloseTo(0.45);
    expect(appState.settings.midiVolume).toBeCloseTo(0.5);
    cleanup();
  });

  it("shares one level between cards", async () => {
    const first = render(SCORE);
    const second = render(SCORE);
    await flushUi();

    const slider = first.target.querySelector(".bds-midi-volume-slider");
    slider.value = "20";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    slider.dispatchEvent(new Event("change", { bubbles: true }));
    await flushUi();

    expect(appState.settings.midiVolume).toBeCloseTo(0.2);

    // The settings event is what carries the change to the other card.
    window.dispatchEvent(new CustomEvent("bds:settingsChanged"));
    await flushUi();

    expect(second.target.querySelector(".bds-midi-volume-slider").value).toBe("20");
    first.cleanup();
    second.cleanup();
  });
});
