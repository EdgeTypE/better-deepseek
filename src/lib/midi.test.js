import { describe, expect, it } from "vitest";
import { DEFAULT_SYSTEM_PROMPT } from "./constants.js";
import {
  BEATS_PER_BAR,
  buildMidiFile,
  flattenNotes,
  midiFileName,
  midiToFrequency,
  midiToPitch,
  parseMidiScore,
  pitchToMidi,
  PPQ,
  programToName,
  resolveInstrument,
  waveformForProgram,
} from "./midi.js";

/** Minimal Standard MIDI File reader so byte-level assertions stay readable. */
function readSmf(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const state = { pos: 0 };

  const expectBytes = (text) => {
    for (const char of text) {
      expect(bytes[state.pos++]).toBe(char.charCodeAt(0));
    }
  };

  const readVarLen = () => {
    let value = 0;
    let byte;
    do {
      byte = bytes[state.pos++];
      value = (value << 7) | (byte & 0x7f);
    } while (byte & 0x80);
    return value;
  };

  expectBytes("MThd");
  const headerLength = view.getUint32(4);
  const format = view.getUint16(8);
  const trackCount = view.getUint16(10);
  const division = view.getUint16(12);
  state.pos = 8 + headerLength;

  const tracks = [];
  while (state.pos < bytes.length) {
    expectBytes("MTrk");
    const length = view.getUint32(state.pos);
    state.pos += 4;
    const end = state.pos + length;

    const events = [];
    let tick = 0;
    while (state.pos < end) {
      tick += readVarLen();
      const status = bytes[state.pos++];

      if (status === 0xff) {
        const type = bytes[state.pos++];
        const len = readVarLen();
        const data = Array.from(bytes.subarray(state.pos, state.pos + len));
        state.pos += len;
        events.push({ tick, status, type, data });
      } else if ((status & 0xf0) === 0xc0 || (status & 0xf0) === 0xd0) {
        const data = Array.from(bytes.subarray(state.pos, state.pos + 1));
        state.pos += 1;
        events.push({ tick, status, data });
      } else {
        const data = Array.from(bytes.subarray(state.pos, state.pos + 2));
        state.pos += 2;
        events.push({ tick, status, data });
      }
    }

    tracks.push(events);
  }

  return { format, trackCount, division, tracks };
}

describe("parseMidiScore", () => {
  it("parses a bare note line into an implicit track", () => {
    const score = parseMidiScore("C4/4 D4/4");

    expect(score.ok).toBe(true);
    expect(score.errors).toEqual([]);
    expect(score.tracks).toHaveLength(1);
    expect(score.tracks[0].name).toBe("");
    expect(score.tracks[0].notes).toEqual([
      { pitch: 60, start: 0, duration: 1, velocity: 100 },
      { pitch: 62, start: 1, duration: 1, velocity: 100 },
    ]);
    expect(score.durationBeats).toBe(2);
  });

  it("reads title and tempo directives, and defaults tempo to 120", () => {
    expect(parseMidiScore("tempo: 96\nC4/4").tempo).toBe(96);
    expect(parseMidiScore("bpm=140\nC4/4").tempo).toBe(140);
    expect(parseMidiScore("C4/4").tempo).toBe(120);
    expect(parseMidiScore('title: "Night Drive"\nC4/4').title).toBe("Night Drive");
  });

  it("computes duration in seconds from tempo", () => {
    const score = parseMidiScore("tempo: 120\nC4/1 R/1 R/1 R/1");
    expect(score.durationBeats).toBe(16); // four whole notes
    expect(score.durationSeconds).toBeCloseTo(8, 5);
  });

  it("parses a quoted track header with an instrument", () => {
    const score = parseMidiScore('track "Bass Line" instrument=bass\nC2/2');

    expect(score.tracks[0].name).toBe("Bass Line");
    expect(score.tracks[0].instrument).toBe("bass");
    expect(score.tracks[0].program).toBe(33);
  });

  it("accepts a numeric program as the instrument", () => {
    expect(parseMidiScore("track Lead inst=81\nC4/4").tracks[0].program).toBe(81);
  });

  it("accepts a multi-word instrument name without quotes", () => {
    const score = parseMidiScore("track Melody instrument=electric piano\nC4/4");

    expect(score.errors).toEqual([]);
    expect(score.tracks[0].name).toBe("Melody");
    expect(score.tracks[0].instrument).toBe("electric piano");
    expect(score.tracks[0].program).toBe(4);
  });

  it("accepts a quoted multi-word instrument name", () => {
    const score = parseMidiScore('track "Synth Lead" instrument="synth pad"\nC4/4');

    expect(score.tracks[0].name).toBe("Synth Lead");
    expect(score.tracks[0].program).toBe(88);
  });

  it("ends an unquoted instrument value at the next option", () => {
    const score = parseMidiScore("track Lead instrument=french horn tempo=99\nC4/4");

    expect(score.tracks[0].program).toBe(60);
    expect(score.tracks[0].name).toBe("Lead");
    expect(score.errors[0].message).toContain("tempo");
  });

  it("reports unknown instruments but keeps going with piano", () => {
    const score = parseMidiScore("track Lead instrument=theremin\nC4/4");

    expect(score.ok).toBe(false);
    expect(score.errors[0]).toMatchObject({ line: 1 });
    expect(score.errors[0].message).toContain("theremin");
    expect(score.tracks[0].program).toBe(0);
    expect(score.tracks[0].notes).toHaveLength(1);
  });

  it("treats R as a rest that advances the cursor", () => {
    const score = parseMidiScore("C4/4 R/4 E4/4");

    expect(score.noteCount).toBe(2);
    expect(score.tracks[0].notes.map((note) => note.start)).toEqual([0, 2]);
    expect(score.durationBeats).toBe(3);
  });

  it("places chord notes on the same beat", () => {
    const score = parseMidiScore("[C4,E4,G4]/2");

    expect(score.tracks[0].notes.map((note) => note.pitch)).toEqual([60, 64, 67]);
    expect(score.tracks[0].notes.every((note) => note.start === 0 && note.duration === 2)).toBe(true);
    expect(score.durationBeats).toBe(2);
  });

  it("supports dotted lengths and explicit velocity", () => {
    const score = parseMidiScore("C4/4. C4/4@64");

    expect(score.tracks[0].notes[0]).toMatchObject({ start: 0, duration: 1.5, velocity: 100 });
    expect(score.tracks[0].notes[1]).toMatchObject({ start: 1.5, duration: 1, velocity: 64 });
  });

  it("keeps per-track cursors independent", () => {
    const score = parseMidiScore("track A\nC4/4 D4/4\ntrack B\nC2/1");

    expect(score.tracks[0].notes.map((note) => note.start)).toEqual([0, 1]);
    expect(score.tracks[1].notes[0].start).toBe(0);
    expect(score.durationBeats).toBe(4);
  });

  it("ignores bar lines, comments and blank lines", () => {
    const score = parseMidiScore("# a comment\n\nC4/4 | E4/4  // trailing\n\n");

    expect(score.ok).toBe(true);
    expect(score.noteCount).toBe(2);
  });

  it("does not mistake a sharp for a comment", () => {
    const score = parseMidiScore("C#4/4 # verse\nF#4/4");

    expect(score.ok).toBe(true);
    expect(score.tracks[0].notes.map((note) => note.pitch)).toEqual([61, 66]);
  });

  it("ignores a comment that mentions a track", () => {
    const score = parseMidiScore("C4/4 E4/4 // track 5 starts here\nF4/4");

    expect(score.ok).toBe(true);
    expect(score.tracks).toHaveLength(1);
    expect(score.noteCount).toBe(3);
  });

  it("does not read a title containing the word track as a header", () => {
    const score = parseMidiScore("title: Night Track\ntempo: 100\nC4/4");

    expect(score.errors).toEqual([]);
    expect(score.title).toBe("Night Track");
    expect(score.tracks).toHaveLength(1);
    expect(score.tracks[0].name).toBe("");
  });

  it("opens a new track when the header is glued onto a note line", () => {
    const score = parseMidiScore("track Lead\nC4/4 D4/4 track Bass instrument=bass\nC2/1");

    expect(score.errors).toEqual([]);
    expect(score.tracks.map((track) => track.name)).toEqual(["Lead", "Bass"]);
    expect(score.tracks[0].notes).toHaveLength(2);
    expect(score.tracks[1].notes).toHaveLength(1);
    expect(score.tracks[1].program).toBe(33);
  });

  it("splits adjacent notes that lost their separating space", () => {
    const score = parseMidiScore("E5/8G5/8");

    expect(score.errors).toEqual([]);
    expect(score.tracks[0].notes.map((note) => note.pitch)).toEqual([76, 79]);
    expect(score.durationBeats).toBe(1);
  });

  it("keeps each glued chord's own length", () => {
    const score = parseMidiScore("[C4,E4,G4]/2[C4,E4,G4]/4");

    expect(score.errors).toEqual([]);
    expect(score.tracks[0].notes.map((note) => [note.pitch, note.start, note.duration])).toEqual([
      [60, 0, 2],
      [64, 0, 2],
      [67, 0, 2],
      [60, 2, 1],
      [64, 2, 1],
      [67, 2, 1],
    ]);
  });

  it("still reports one error for a chunk it cannot decompose", () => {
    const score = parseMidiScore("!!! C4/4");

    expect(score.errors).toHaveLength(1);
    expect(score.errors[0].message).toContain("!!!");
    expect(score.noteCount).toBe(1);
  });

  it("parses a score whose headers and chords lost their whitespace", () => {
    // Regression: a model that drops newlines and spaces used to lose a whole
    // track and nine chord runs, then mis-report the following instrument.
    const score = parseMidiScore(
      [
        "title: Neon Rush",
        "tempo: 170",
        "track Lead instrument=synth",
        "E5/8 G5/8 B5/8 A5/8 | [E5,G5,B5]/2 track Bass instrument=bass",
        "E2/8 E2/8 E3/8 E2/8 | C2/8 C2/8 C3/8 C2/8",
        "track Chords instrument=electric guitar",
        "[E4,G4,B4]/4[E4,G4,B4]/4[C4,E4,G4]/4[C4,E4,G4]/4| [G3,B3,D4]/1",
      ].join("\n")
    );

    expect(score.errors).toEqual([]);
    expect(score.title).toBe("Neon Rush");
    expect(score.tracks.map((track) => [track.name, track.instrument, track.program])).toEqual([
      ["Lead", "synth", 80],
      ["Bass", "bass", 33],
      ["Chords", "electric guitar", 27],
    ]);
    expect(score.tracks[0].notes).toHaveLength(7); // four singles plus a chord
    expect(score.tracks[1].notes).toHaveLength(8);
    expect(score.tracks[2].notes).toHaveLength(15); // four glued chords plus a whole note
  });

  it("flags unsupported note lengths", () => {
    const score = parseMidiScore("C4/5");

    expect(score.ok).toBe(false);
    expect(score.errors[0].message).toContain("/5");
    expect(score.noteCount).toBe(0);
  });

  it("flags unrecognised tokens with their line number", () => {
    const score = parseMidiScore("C4/4\nHere is your song:");

    expect(score.ok).toBe(false);
    expect(score.errors[0].line).toBe(2);
    expect(score.noteCount).toBe(1);
  });

  it("flags an out-of-range tempo", () => {
    const score = parseMidiScore("tempo: 900\nC4/4");

    expect(score.ok).toBe(false);
    expect(score.tempo).toBe(120);
  });

  it("flags a chord containing an invalid note without emitting any of it", () => {
    const score = parseMidiScore("[C4,H4]/2");

    expect(score.ok).toBe(false);
    expect(score.noteCount).toBe(0);
  });

  it("returns an empty, non-throwing score for junk input", () => {
    for (const input of ["", null, undefined, 42]) {
      const score = parseMidiScore(input);
      expect(score.noteCount).toBe(0);
      expect(score.durationBeats).toBe(0);
      expect(Array.isArray(score.tracks)).toBe(true);
    }
  });

  it("reports the pitch range for the piano roll", () => {
    const score = parseMidiScore("C4/4 C6/4");

    expect(score.minPitch).toBe(60);
    expect(score.maxPitch).toBe(84);
  });
});

describe("pitch helpers", () => {
  it("maps note names to MIDI numbers with C4 as middle C", () => {
    expect(pitchToMidi("C4")).toBe(60);
    expect(pitchToMidi("A4")).toBe(69);
    expect(pitchToMidi("c4")).toBe(60);
    expect(pitchToMidi("C#4")).toBe(61);
    expect(pitchToMidi("Db4")).toBe(61);
    expect(pitchToMidi("C-1")).toBe(0);
  });

  it("returns null for unparseable or out-of-range pitches", () => {
    expect(pitchToMidi("H4")).toBeNull();
    expect(pitchToMidi("C10")).toBeNull();
    expect(pitchToMidi("C-2")).toBeNull();
    expect(pitchToMidi("")).toBeNull();
  });

  it("round-trips through midiToPitch", () => {
    expect(midiToPitch(60)).toBe("C4");
    expect(midiToPitch(61)).toBe("C#4");
    expect(pitchToMidi(midiToPitch(84))).toBe(84);
  });

  it("converts pitches to equal-temperament frequencies", () => {
    expect(midiToFrequency(69)).toBeCloseTo(440, 6);
    expect(midiToFrequency(81)).toBeCloseTo(880, 6);
    expect(midiToFrequency(60)).toBeCloseTo(261.6256, 3);
  });
});

describe("instrument helpers", () => {
  it("resolves names, numbers and unknown values", () => {
    expect(resolveInstrument("Bass")).toMatchObject({ program: 33, known: true });
    expect(resolveInstrument("synth_pad")).toMatchObject({ program: 88, known: true });
    expect(resolveInstrument("12")).toMatchObject({ program: 12, known: true });
    expect(resolveInstrument("kazzoo")).toMatchObject({ program: 0, known: false });
    expect(resolveInstrument("")).toMatchObject({ program: 0, known: true });
  });

  it("names programs back for display", () => {
    expect(programToName(33)).toBe("bass");
    expect(programToName(999)).toBe("program 999");
  });

  it("picks a waveform per instrument family", () => {
    expect(waveformForProgram(33)).toBe("sine");
    expect(waveformForProgram(19)).toBe("square");
    expect(waveformForProgram(88)).toBe("sawtooth");
    expect(waveformForProgram(73)).toBe("triangle");
    expect(waveformForProgram(0)).toBe("triangle");
  });
});

describe("flattenNotes", () => {
  it("tags every note with its track index", () => {
    const score = parseMidiScore("track A\nC4/4\ntrack B\nE4/4 G4/4");
    const flat = flattenNotes(score);

    expect(flat).toHaveLength(3);
    expect(flat.map((note) => note.trackIndex)).toEqual([0, 1, 1]);
  });

  it("tolerates a missing score", () => {
    expect(flattenNotes(null)).toEqual([]);
  });
});

describe("buildMidiFile", () => {
  const score = parseMidiScore("tempo: 120\ntrack Melody instrument=piano\nC4/4 D4/4\ntrack Bass instrument=bass\nC2/2");

  it("writes a format 1 header with one track per score track plus conductor", () => {
    const bytes = buildMidiFile(score);
    const smf = readSmf(bytes);

    expect(smf.format).toBe(1);
    expect(smf.division).toBe(PPQ);
    expect(smf.trackCount).toBe(3);
    expect(smf.tracks).toHaveLength(3);
  });

  it("stores the tempo as a microseconds-per-quarter meta event", () => {
    const smf = readSmf(buildMidiFile(score));
    const tempoEvent = smf.tracks[0].find((event) => event.type === 0x51);

    expect(tempoEvent.tick).toBe(0);
    expect(tempoEvent.data).toEqual([0x07, 0xa1, 0x20]); // 500000 µs = 120 bpm
    expect(smf.tracks[0].at(-1)).toMatchObject({ type: 0x2f, tick: 0 });
  });

  it("writes track name, program change and note events with tick deltas", () => {
    const smf = readSmf(buildMidiFile(score));
    const melody = smf.tracks[1];

    const nameEvent = melody.find((event) => event.type === 0x03);
    expect(nameEvent.data).toEqual(Array.from("Melody", (char) => char.charCodeAt(0)));

    expect(melody.find((event) => event.status === 0xc0)).toMatchObject({ tick: 0, data: [0] });

    const noteOns = melody.filter((event) => event.status === 0x90);
    expect(noteOns.map((event) => [event.tick, event.data[0]])).toEqual([[0, 60], [480, 62]]);

    const noteOffs = melody.filter((event) => event.status === 0x80);
    expect(noteOffs.map((event) => [event.tick, event.data[0]])).toEqual([[480, 60], [960, 62]]);
  });

  it("puts the second track on a different channel and closes every track", () => {
    const smf = readSmf(buildMidiFile(score));

    expect(smf.tracks[1].find((event) => (event.status & 0xf0) === 0x90).status).toBe(0x90);
    expect(smf.tracks[2].find((event) => (event.status & 0xf0) === 0x90).status).toBe(0x91);
    expect(smf.tracks[2].find((event) => (event.status & 0xf0) === 0xc0).data).toEqual([33]);

    for (const events of smf.tracks) {
      expect(events.at(-1).type).toBe(0x2f);
    }
  });

  it("skips the GM percussion channel for the tenth track", () => {
    const many = parseMidiScore(
      Array.from({ length: 10 }, (_, index) => `track T${index}\nC${(index % 5) + 3}/4`).join("\n")
    );
    const smf = readSmf(buildMidiFile(many));
    const channels = smf.tracks
      .slice(1)
      .map((events) => events.find((event) => (event.status & 0xf0) === 0x90).status & 0x0f);

    expect(channels).not.toContain(9);
    expect(channels.slice(0, 9)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("clamps nonsense values instead of emitting invalid bytes", () => {
    const bytes = buildMidiFile({
      tempo: 5000,
      tracks: [
        {
          name: "Weird",
          program: 300,
          notes: [{ pitch: 999, start: -5, duration: 0, velocity: 900 }],
        },
      ],
    });
    const smf = readSmf(bytes);
    const program = smf.tracks[1].find((event) => event.status === 0xc0);

    expect(program.data[0]).toBeLessThanOrEqual(127);
    const noteOn = smf.tracks[1].find((event) => event.status === 0x90);
    expect(noteOn.data).toEqual([127, 127]);
  });

  it("still produces a playable file when the score has no notes", () => {
    const smf = readSmf(buildMidiFile(parseMidiScore("")));

    expect(smf.trackCount).toBe(1);
    expect(smf.tracks[0].at(-1).type).toBe(0x2f);
  });

  it("tolerates a null score", () => {
    expect(() => buildMidiFile(null)).not.toThrow();
  });

  it("uses a 4/4 time signature and 480 ticks per quarter", () => {
    const smf = readSmf(buildMidiFile(score));
    const timeSignature = smf.tracks[0].find((event) => event.type === 0x58);

    expect(timeSignature.data).toEqual([4, 2, 24, 8]);
    expect(BEATS_PER_BAR).toBe(4);
  });
});

/**
 * The system prompt is the contract the model writes against, so its own
 * example has to survive the parser and obey the rules the prompt states.
 */
describe("system prompt <BDS:midi> contract", () => {
  // The prompt is assembled by joining its source array, so it arrives as a string.
  const prompt = String(DEFAULT_SYSTEM_PROMPT);

  const exampleStart = prompt.indexOf("EXAMPLE (structure only");
  const exampleOpen = prompt.indexOf("<BDS:midi>", exampleStart);
  const exampleClose = prompt.indexOf("</BDS:midi>", exampleOpen);
  const example = prompt.slice(exampleOpen + "<BDS:midi>".length, exampleClose).trim();

  /** Group the example's note lines by track, splitting on bar lines. */
  function exampleBars() {
    const bars = new Map();
    for (const line of example.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || /^(title|tempo)\s*[:=]/i.test(trimmed)) continue;

      if (/^track\b/i.test(trimmed)) {
        bars.set(trimmed, []);
        continue;
      }

      const key = [...bars.keys()].at(-1);
      if (!key) continue;
      for (const bar of trimmed.split("|").map((part) => part.trim()).filter(Boolean)) {
        bars.get(key).push(bar);
      }
    }
    return bars;
  }

  it("documents the tool and ships a parseable example", () => {
    expect(exampleStart).toBeGreaterThan(-1);
    expect(exampleOpen).toBeGreaterThan(exampleStart);
    expect(exampleClose).toBeGreaterThan(exampleOpen);

    const score = parseMidiScore(example);
    expect(score.errors).toEqual([]);
    expect(score.ok).toBe(true);
    expect(score.noteCount).toBeGreaterThan(0);
    expect(score.title).not.toBe("");
  });

  it("keeps the example inside the rules the prompt states", () => {
    const bars = exampleBars();
    expect(bars.size).toBeGreaterThan(1);

    const barCounts = new Set();
    for (const list of bars.values()) {
      barCounts.add(list.length);
      for (const bar of list) {
        const parsed = parseMidiScore(`track X\n${bar}`);
        expect(parsed.errors).toEqual([]);
        expect(parsed.durationBeats).toBe(4); // 4/4, every bar full
      }
    }
    expect(barCounts.size).toBe(1); // all tracks the same length
  });

  it("parses every form the prompt documents", () => {
    // One sample that exercises each documented feature at once: comments
    // (line + trailing), title, tempo, a track header, a multi-word instrument,
    // the standalone instrument line, dotted lengths, velocity, rests, chords,
    // bar lines and the 4/4 bar rule.
    const documented = [
      "# doc check",
      "title: Doc Check",
      "tempo: 100",
      "track Lead instrument=electric piano",
      "C4/4 D4/4 E4/4 F4/4 | G4/2 R/2 | [C4,E4,G4]/2 A4/4 B4/4 | C5/2. R/4",
      "track Pad",
      "instrument=synth pad",
      "C3/1 | C3/1 | C3/1 | C3/1 // trailing comment",
    ].join("\n");

    const score = parseMidiScore(documented);

    expect(score.errors).toEqual([]);
    expect(score.title).toBe("Doc Check");
    expect(score.tempo).toBe(100);
    expect(score.tracks.map((track) => [track.name, track.instrument, track.program])).toEqual([
      ["Lead", "electric piano", 4],
      ["Pad", "synth pad", 88],
    ]);
    expect(score.noteCount).toBe(15);
    expect(score.durationBeats).toBe(16); // four full 4/4 bars per track
    expect(score.durationSeconds).toBeCloseTo(9.6, 5);
  });

  it("advertises only instruments the parser understands", () => {
    const advertised = [
      "piano", "electric piano", "organ", "guitar", "electric guitar", "bass", "violin", "cello",
      "harp", "strings", "choir", "trumpet", "trombone", "french horn", "sax", "oboe", "clarinet",
      "flute", "synth", "synth pad", "marimba", "celesta", "music box",
    ];

    for (const name of advertised) {
      expect(prompt).toContain(name);
      expect(resolveInstrument(name).known).toBe(true);
    }
  });
});

describe("midiFileName", () => {
  it("derives a safe file name from the title", () => {
    expect(midiFileName({ title: "Night Drive" })).toBe("Night-Drive.mid");
    expect(midiFileName({ title: "a/b:c*d" })).toBe("abcd.mid");
    expect(midiFileName({})).toBe("bds-music.mid");
    expect(midiFileName(null)).toBe("bds-music.mid");
  });
});
