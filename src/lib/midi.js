/**
 * Compact MIDI toolkit: text-notation parser, Standard MIDI File writer and a
 * dependency-free Web Audio synth engine.
 *
 * Backs the `<BDS:midi>` card. The model emits a short, human-readable score
 * ("C4/4 E4/4 G4/2"), the card plays it through Web Audio and can export a
 * real `.mid` file. Parsing and file writing are side-effect-free; the synth
 * only touches the AudioContext it is handed, so the same code runs in the
 * content script, the sandbox bundle and Vitest.
 *
 * Notation (one statement per line, `#` or `//` starts a comment):
 *
 *   title: Evening Loop
 *   tempo: 96
 *   track Melody instrument=piano
 *   C4/4 E4/4 G4/4 A4/4 | G4/2 R/2
 *   track "Bass Line" instrument=bass
 *   C2/2 C2/2 [C2,G2]/1
 *
 *   token  := pitch "/" denominator ["."] ["@" velocity]
 *   pitch  := note name + accidental + octave (C4 = middle C) | chord | rest
 *
 * Parsing is forgiving about whitespace: a `track` header glued onto the end of
 * a note line still opens a new track, and adjacent tokens with no separator are
 * re-scanned rather than lost.
 */

/** Ticks per quarter note written into every file we produce. */
export const PPQ = 480;

/** Beats per bar assumed by the piano-roll renderer and the bar grid. */
export const BEATS_PER_BAR = 4;

export const DEFAULT_TEMPO = 120;

const MIN_TEMPO = 20;
const MAX_TEMPO = 300;
const DEFAULT_VELOCITY = 100;
const DEFAULT_DENOMINATOR = 4;
const MIN_PITCH = 0;
const MAX_PITCH = 127;
const MAX_VELOCITY = 127;

/** Note denominators we accept. Anything else is a typo, not a rhythm. */
const VALID_DENOMINATORS = new Set([1, 2, 4, 8, 16, 32]);

/** Semitone offsets inside an octave. */
const NOTE_OFFSETS = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

/**
 * General MIDI program numbers for the instrument names the model is likely
 * to use. Names are matched loosely (case, spaces and underscores ignored).
 */
export const INSTRUMENT_PROGRAMS = {
  piano: 0,
  "acoustic grand": 0,
  "bright piano": 1,
  "electric piano": 4,
  "music box": 10,
  marimba: 12,
  celesta: 8,
  organ: 19,
  "church organ": 19,
  guitar: 24,
  "acoustic guitar": 24,
  "electric guitar": 27,
  "clean guitar": 27,
  bass: 33,
  "electric bass": 33,
  "finger bass": 33,
  violin: 40,
  cello: 42,
  harp: 46,
  timpani: 47,
  strings: 48,
  "string ensemble": 48,
  choir: 52,
  "choir aahs": 52,
  trumpet: 56,
  trombone: 57,
  "french horn": 60,
  sax: 65,
  saxophone: 65,
  oboe: 68,
  clarinet: 71,
  flute: 73,
  piccolo: 72,
  synth: 80,
  "synth lead": 80,
  "synth pad": 88,
  pad: 88,
  "synth effects": 96,
};

/** Reverse lookup for display: program number -> canonical instrument name. */
const PROGRAM_NAMES = (() => {
  const names = new Map();
  for (const [name, program] of Object.entries(INSTRUMENT_PROGRAMS)) {
    if (!names.has(program)) names.set(program, name);
  }
  return names;
})();

/**
 * Pitch/rest token: group 1 is the pitch spec, then denominator, dot and
 * velocity. A bare `r`/`R` is a rest.
 */
const TOKEN_RE = /^(\[[^\]]*\]|r|[a-g][#b]?-?\d+)(?:\/(\d+)(\.?))?(?:@(\d+))?$/i;

/** Where an option pair starts inside a `track` header: `instrument=`, `inst=`. */
const HEADER_OPTION_RE = /([a-z_]+)\s*=\s*/gi;

/** `key: value` / `key = value` line directives. */
const DIRECTIVE_RE = /^([a-z_]+)\s*[:=]\s*(.*)$/i;

/**
 * Convert a scientific pitch name (`C4`, `F#3`, `Bb5`) to a MIDI note number.
 * C4 is middle C (60). Returns `null` for anything unparseable or out of range.
 */
export function pitchToMidi(name) {
  const match = /^([a-g])([#b]?)(-?\d+)$/i.exec(String(name || "").trim());
  if (!match) return null;

  const [, letter, accidental, octaveText] = match;
  const octave = Number.parseInt(octaveText, 10);
  const offset = NOTE_OFFSETS[letter.toLowerCase()];
  const midi = (octave + 1) * 12 + offset + (accidental === "#" ? 1 : accidental === "b" ? -1 : 0);

  if (midi < MIN_PITCH || midi > MAX_PITCH) return null;
  return midi;
}

/** Inverse of {@link pitchToMidi}. Always renders with sharps. */
export function midiToPitch(midi) {
  const value = Math.round(Number(midi));
  if (!Number.isFinite(value)) return "";
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const pitch = Math.min(MAX_PITCH, Math.max(MIN_PITCH, value));
  return `${names[pitch % 12]}${Math.floor(pitch / 12) - 1}`;
}

/** Equal-temperament frequency of a MIDI note number (A4 = 440 Hz). */
export function midiToFrequency(pitch) {
  return 440 * Math.pow(2, (Number(pitch) - 69) / 12);
}

/** Resolve an instrument name or number to a General MIDI program number. */
export function resolveInstrument(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return { program: 0, name: "piano", known: true };

  if (/^\d+$/.test(raw)) {
    const program = Math.min(127, Math.max(0, Number.parseInt(raw, 10)));
    return { program, name: PROGRAM_NAMES.get(program) || `program ${program}`, known: true };
  }

  const key = raw.toLowerCase().replace(/[_\s]+/g, " ").trim();
  const program = INSTRUMENT_PROGRAMS[key];
  if (program === undefined) {
    return { program: 0, name: "piano", known: false };
  }
  return { program, name: PROGRAM_NAMES.get(program) || key, known: true };
}

/** Human-readable instrument name for a program number. */
export function programToName(program) {
  const value = Number(program);
  return PROGRAM_NAMES.get(value) || `program ${Number.isFinite(value) ? value : 0}`;
}

// ── Voices ──

/**
 * Harmonic spectra: the amplitude of partial 1, 2, 3 ... They become
 * `PeriodicWave`s in the synth, so each instrument starts from a real timbre
 * instead of a bare sine/saw/square. Arrays are module constants on purpose:
 * the synth caches built waves by array identity.
 */
const series = (count, fn) => Array.from({ length: count }, (_, i) => fn(i + 1));

const SINE = [1];
const SAW = series(32, (k) => 1 / k);
const SQUARE = series(31, (k) => (k % 2 ? 1 / k : 0));
const PIANO = [1, 0.62, 0.38, 0.27, 0.18, 0.12, 0.085, 0.06, 0.04, 0.028, 0.02, 0.014];
const EPIANO = [1, 0.15, 0.5, 0.06, 0.2, 0.03, 0.1];
const HARPSICHORD = series(16, (k) => 1 / Math.pow(k, 0.8));
const BELL = [1, 0.1, 0.5, 0.05, 0.3, 0.1, 0.2, 0.05, 0.1];
const ORGAN = [1, 0.85, 0.7, 0.55, 0.35, 0.25, 0.18, 0.12, 0.09];
const REED_ORGAN = series(14, (k) => 1 / Math.pow(k, 1.1));
const NYLON = [1, 0.7, 0.5, 0.3, 0.2, 0.12, 0.08, 0.05, 0.03];
const STEEL = series(18, (k) => 1 / Math.pow(k, 0.9));
const DRIVEN = series(30, (k) => 1 / Math.pow(k, 0.7));
const BASS_SOFT = [1, 0.55, 0.3, 0.15, 0.08, 0.04];
const SAW_BASS = series(20, (k) => 1 / k);
const BOWED = series(28, (k) => 1 / k);
const HARP = [1, 0.5, 0.25, 0.12, 0.06, 0.03];
const TIMPANI = [1, 0.35, 0.15, 0.1];
const CHOIR = [1, 0.45, 0.95, 0.55, 0.3, 0.18, 0.1, 0.06];
const BRASS = series(22, (k) => 1 / Math.pow(k, 0.85));
const SAX = series(16, (k) => (1 / k) * (k % 2 ? 1 : 0.75));
const DOUBLE_REED = [1, 0.95, 0.8, 0.9, 0.6, 0.5, 0.4, 0.3, 0.2, 0.15, 0.1];
const CLARINET = [1, 0, 0.75, 0, 0.5, 0, 0.14, 0, 0.18, 0, 0.08];
const FLUTE = [1, 0.22, 0.08, 0.03, 0.015];
const PAD = series(18, (k) => 1 / Math.pow(k, 1.2));
const FX = [1, 0.4, 0.2];

/**
 * Synth voice parameters.
 *
 *   waveform     OscillatorNode type, the fallback when PeriodicWave is missing
 *   partials     harmonic spectrum, see above
 *   attack       seconds to reach full level
 *   decay        seconds for the level to fall from full to `sustain`
 *   sustain      level held for the rest of the note, fraction of the peak
 *   release      seconds to fade out after the written end of the note
 *   cutoff       lowpass corner in Hz at full velocity, around middle C
 *   sweep        filter start as a multiple of `cutoff` (below 1 = opens up)
 *   filterTime   seconds the filter takes to travel from start to `cutoff`
 *   q            lowpass resonance
 *   keytrack     how much the cutoff follows pitch (0 = fixed, 1 = full)
 *   detune       cents for a second, detuned oscillator (0 = single)
 *   vibrato      LFO depth in cents (0 = none), at `vibratoRate` Hz
 *   noise        level of the noise layer (hammer, pluck, breath)
 *   noiseDecay   seconds the noise burst lasts, unless `noiseHold`
 *   noiseHold    noise lasts the whole note (breath, bow)
 *   noiseTone    noise band centre as a multiple of the note frequency
 *   sub          level of a sine one octave down
 *   gain         loudness trim for this family
 *   pitchDrop    start frequency multiple that glides to pitch (drums)
 *   decayKey     how much higher notes decay faster (0 = same for all)
 *   reverb       how much of the track feeds the reverb bus
 */
const VOICE_DEFAULTS = {
  waveform: "sine",
  partials: SINE,
  attack: 0.01,
  decay: 0.4,
  sustain: 0.6,
  release: 0.2,
  cutoff: 4000,
  sweep: 1,
  filterTime: 0.2,
  q: 0.7,
  keytrack: 0.35,
  detune: 0,
  vibrato: 0,
  vibratoRate: 5.2,
  noise: 0,
  noiseDecay: 0.04,
  noiseHold: false,
  noiseTone: 4,
  sub: 0,
  gain: 1,
  pitchDrop: 1,
  decayKey: 0,
  reverb: 1,
};

const makeVoice = (overrides) => Object.freeze({ ...VOICE_DEFAULTS, ...overrides });

/**
 * One voice per General MIDI group, keyed by the highest program it covers.
 * The list must stay sorted by `to`. `waveform` mirrors the family it replaced
 * so anything that still asks for a bare oscillator type gets the same answer.
 */
const VOICE_FAMILIES = [
  // Pianos
  makeVoice({ to: 3, waveform: "triangle", partials: PIANO, attack: 0.003, decay: 3.2, sustain: 0.03, release: 0.28, cutoff: 3600, sweep: 3.2, filterTime: 0.35, q: 0.6, keytrack: 0.7, detune: 2, noise: 0.35, noiseDecay: 0.025, noiseTone: 6, decayKey: 0.55, gain: 0.95 }),
  // Electric pianos
  makeVoice({ to: 5, waveform: "triangle", partials: EPIANO, attack: 0.004, decay: 1.6, sustain: 0.12, release: 0.3, cutoff: 5000, sweep: 1.6, filterTime: 0.2, keytrack: 0.4, detune: 3, noise: 0.12, noiseDecay: 0.02, decayKey: 0.3, gain: 0.95 }),
  // Harpsichord, clavinet
  makeVoice({ to: 7, waveform: "triangle", partials: HARPSICHORD, attack: 0.002, decay: 0.5, sustain: 0.08, release: 0.08, cutoff: 5200, sweep: 1.6, filterTime: 0.1, keytrack: 0.5, noise: 0.2, noiseDecay: 0.012, decayKey: 0.2, gain: 0.7 }),
  // Chromatic percussion: celesta, bells, music box, marimba
  makeVoice({ to: 15, waveform: "sine", partials: BELL, attack: 0.002, decay: 1.6, sustain: 0.01, release: 0.4, cutoff: 7000, sweep: 1.5, filterTime: 0.15, keytrack: 0.6, noise: 0.08, noiseDecay: 0.012, decayKey: 0.5, gain: 0.9, reverb: 1.3 }),
  // Organs
  makeVoice({ to: 20, waveform: "square", partials: ORGAN, attack: 0.012, decay: 0.05, sustain: 1, release: 0.09, cutoff: 4200, filterTime: 0.05, detune: 4, gain: 0.7, reverb: 1.1 }),
  // Accordion, harmonica
  makeVoice({ to: 23, waveform: "square", partials: REED_ORGAN, attack: 0.03, decay: 0.08, sustain: 0.9, release: 0.1, cutoff: 3200, sweep: 0.7, filterTime: 0.06, detune: 9, vibrato: 6, noise: 0.05, noiseHold: true, gain: 0.75 }),
  // Plucked guitars
  makeVoice({ to: 28, waveform: "sawtooth", partials: NYLON, attack: 0.002, decay: 1.4, sustain: 0.05, release: 0.12, cutoff: 2800, sweep: 3.6, filterTime: 0.22, q: 0.9, keytrack: 0.55, detune: 2, noise: 0.4, noiseDecay: 0.02, noiseTone: 5, decayKey: 0.35, gain: 0.95 }),
  // Driven guitars
  makeVoice({ to: 31, waveform: "sawtooth", partials: DRIVEN, attack: 0.004, decay: 0.9, sustain: 0.5, release: 0.12, cutoff: 2600, sweep: 2, filterTime: 0.15, q: 1.1, detune: 5, noise: 0.15, noiseDecay: 0.02, gain: 0.55 }),
  // Acoustic and finger bass
  makeVoice({ to: 35, waveform: "sine", partials: BASS_SOFT, attack: 0.006, decay: 0.9, sustain: 0.25, release: 0.12, cutoff: 1300, sweep: 2.6, filterTime: 0.18, q: 0.8, keytrack: 0.5, noise: 0.15, noiseDecay: 0.015, noiseTone: 3, decayKey: 0.2, gain: 1.05, reverb: 0.2 }),
  // Slap and synth bass
  makeVoice({ to: 39, waveform: "sine", partials: SAW_BASS, attack: 0.004, decay: 0.3, sustain: 0.55, release: 0.1, cutoff: 1100, sweep: 4.5, filterTime: 0.18, q: 2.2, keytrack: 0.5, detune: 6, sub: 0.55, gain: 0.75, reverb: 0.15 }),
  // Bowed strings
  makeVoice({ to: 44, waveform: "sawtooth", partials: BOWED, attack: 0.085, decay: 0.3, sustain: 0.88, release: 0.28, cutoff: 3400, sweep: 0.55, filterTime: 0.12, q: 0.6, keytrack: 0.6, detune: 6, vibrato: 14, vibratoRate: 5.4, noise: 0.03, noiseHold: true, gain: 0.8, reverb: 1.1 }),
  // Pizzicato
  makeVoice({ to: 45, waveform: "sawtooth", partials: NYLON, attack: 0.002, decay: 0.35, sustain: 0.02, release: 0.08, cutoff: 3000, sweep: 2.5, filterTime: 0.1, keytrack: 0.5, noise: 0.3, noiseDecay: 0.012, gain: 0.9 }),
  // Harp
  makeVoice({ to: 46, waveform: "triangle", partials: HARP, attack: 0.002, decay: 1.8, sustain: 0.02, release: 0.3, cutoff: 4200, sweep: 2, filterTime: 0.2, keytrack: 0.5, noise: 0.2, noiseDecay: 0.015, decayKey: 0.4, gain: 0.95, reverb: 1.2 }),
  // Timpani
  makeVoice({ to: 47, waveform: "triangle", partials: TIMPANI, attack: 0.002, decay: 1.1, sustain: 0.01, release: 0.25, cutoff: 1400, sweep: 2, filterTime: 0.1, keytrack: 0.2, pitchDrop: 1.18, noise: 0.4, noiseDecay: 0.03, noiseTone: 2, gain: 1.1, reverb: 1.2 }),
  // String ensembles, synth strings
  makeVoice({ to: 51, waveform: "sawtooth", partials: BOWED, attack: 0.18, decay: 0.4, sustain: 0.85, release: 0.55, cutoff: 2800, sweep: 0.45, filterTime: 0.35, keytrack: 0.6, detune: 11, vibrato: 9, vibratoRate: 5, gain: 0.7, reverb: 1.3 }),
  // Choir, voices
  makeVoice({ to: 54, waveform: "triangle", partials: CHOIR, attack: 0.14, decay: 0.3, sustain: 0.85, release: 0.5, cutoff: 3000, sweep: 0.6, filterTime: 0.2, detune: 7, vibrato: 16, vibratoRate: 5.1, noise: 0.06, noiseHold: true, noiseTone: 2.5, gain: 0.85, reverb: 1.4 }),
  // Orchestra hit
  makeVoice({ to: 55, waveform: "triangle", partials: BRASS, attack: 0.01, decay: 0.5, sustain: 0.4, release: 0.3, cutoff: 2600, sweep: 2.2, filterTime: 0.15, detune: 8, gain: 0.7 }),
  // Brass
  makeVoice({ to: 63, waveform: "sawtooth", partials: BRASS, attack: 0.045, decay: 0.25, sustain: 0.8, release: 0.14, cutoff: 3200, sweep: 0.32, filterTime: 0.09, q: 0.9, keytrack: 0.5, detune: 4, vibrato: 6, vibratoRate: 5.5, noise: 0.04, noiseDecay: 0.05, gain: 0.7, reverb: 0.9 }),
  // Saxophones
  makeVoice({ to: 67, waveform: "square", partials: SAX, attack: 0.04, decay: 0.2, sustain: 0.8, release: 0.12, cutoff: 2600, sweep: 0.5, filterTime: 0.1, keytrack: 0.5, detune: 3, vibrato: 12, vibratoRate: 5.3, noise: 0.1, noiseHold: true, noiseTone: 3, gain: 0.8 }),
  // Oboe, english horn, bassoon
  makeVoice({ to: 70, waveform: "square", partials: DOUBLE_REED, attack: 0.05, decay: 0.2, sustain: 0.8, release: 0.12, cutoff: 2400, sweep: 0.6, filterTime: 0.1, keytrack: 0.5, vibrato: 9, noise: 0.05, noiseHold: true, gain: 0.75 }),
  // Clarinet
  makeVoice({ to: 71, waveform: "square", partials: CLARINET, attack: 0.035, decay: 0.15, sustain: 0.85, release: 0.1, cutoff: 2800, sweep: 0.5, filterTime: 0.1, keytrack: 0.5, vibrato: 5, noise: 0.06, noiseHold: true, gain: 0.8 }),
  // Flutes and pipes
  makeVoice({ to: 79, waveform: "triangle", partials: FLUTE, attack: 0.06, decay: 0.15, sustain: 0.85, release: 0.14, cutoff: 5200, sweep: 0.6, filterTime: 0.1, keytrack: 0.5, vibrato: 10, vibratoRate: 5, noise: 0.2, noiseHold: true, noiseTone: 2.5, gain: 0.9, reverb: 1.2 }),
  // Square lead
  makeVoice({ to: 80, waveform: "sawtooth", partials: SQUARE, attack: 0.01, decay: 0.2, sustain: 0.75, release: 0.18, cutoff: 4200, sweep: 2.2, filterTime: 0.18, q: 1.6, keytrack: 0.5, detune: 9, vibrato: 4, gain: 0.55 }),
  // Other synth leads
  makeVoice({ to: 87, waveform: "sawtooth", partials: SAW, attack: 0.01, decay: 0.2, sustain: 0.75, release: 0.18, cutoff: 4200, sweep: 2.2, filterTime: 0.18, q: 1.6, keytrack: 0.5, detune: 9, vibrato: 4, gain: 0.6 }),
  // Synth pads
  makeVoice({ to: 95, waveform: "sawtooth", partials: PAD, attack: 0.45, decay: 0.5, sustain: 0.85, release: 0.9, cutoff: 2200, sweep: 0.4, filterTime: 0.8, q: 0.8, keytrack: 0.5, detune: 13, vibrato: 3, gain: 0.65, reverb: 1.5 }),
  // Synth effects
  makeVoice({ to: 103, waveform: "sawtooth", partials: BELL, attack: 0.25, decay: 0.8, sustain: 0.5, release: 0.9, cutoff: 3000, sweep: 0.5, filterTime: 0.6, detune: 10, vibrato: 5, gain: 0.7, reverb: 1.6 }),
  // Sitar, banjo, shamisen, koto, kalimba
  makeVoice({ to: 108, waveform: "triangle", partials: STEEL, attack: 0.002, decay: 0.8, sustain: 0.04, release: 0.12, cutoff: 3600, sweep: 2.4, filterTime: 0.15, keytrack: 0.5, detune: 3, noise: 0.3, noiseDecay: 0.015, gain: 0.85 }),
  // Bagpipe, fiddle, shanai
  makeVoice({ to: 111, waveform: "triangle", partials: DOUBLE_REED, attack: 0.04, decay: 0.15, sustain: 0.9, release: 0.1, cutoff: 3000, sweep: 0.7, keytrack: 0.5, detune: 8, vibrato: 9, gain: 0.7 }),
  // Percussive
  makeVoice({ to: 119, waveform: "sine", partials: BELL, attack: 0.002, decay: 0.35, sustain: 0.01, release: 0.1, cutoff: 3500, sweep: 2, filterTime: 0.08, keytrack: 0.3, pitchDrop: 1.35, noise: 0.35, noiseDecay: 0.02, gain: 0.9 }),
  // Sound effects
  makeVoice({ to: 127, waveform: "triangle", partials: FX, attack: 0.15, decay: 0.5, sustain: 0.4, release: 0.6, cutoff: 2000, noise: 0.15, noiseHold: true, gain: 0.6, reverb: 1.5 }),
];

/** Piano, the fallback for an out-of-range program number. */
const DEFAULT_VOICE = VOICE_FAMILIES[0];

/**
 * Synthesis parameters for a General MIDI program number. Out-of-range values
 * fall back to the piano voice, so the card can never be handed a broken spec.
 */
export function voiceForProgram(program) {
  const value = Number(program);
  const safe = Number.isFinite(value) ? Math.min(127, Math.max(0, Math.round(value))) : 0;
  return VOICE_FAMILIES.find((family) => safe <= family.to) || DEFAULT_VOICE;
}

/** Oscillator shape used as the fallback timbre. */
export function waveformForProgram(program) {
  return voiceForProgram(program).waveform;
}

// ── Parser ──

/**
 * Parse the compact notation into a playable score.
 *
 * Never throws: malformed lines are collected in `errors` (with their 1-based
 * line numbers) and the well-formed remainder is still returned, so a partly
 * broken generation still produces something the user can hear.
 *
 * @param {string} text Raw tag content.
 * @returns {{
 *   ok: boolean,
 *   errors: Array<{ line: number, message: string }>,
 *   title: string,
 *   tempo: number,
 *   tracks: Array<{ name: string, program: number, instrument: string, notes: Array<{ pitch: number, start: number, duration: number, velocity: number }> }>,
 *   durationBeats: number,
 *   durationSeconds: number,
 *   noteCount: number,
 *   minPitch: number,
 *   maxPitch: number
 * }}
 */
export function parseMidiScore(text) {
  const errors = [];
  const tracks = [];
  let title = "";
  let tempo = DEFAULT_TEMPO;
  let current = null;

  const lines = String(text ?? "").split(/\r?\n/);

  const createTrack = (name) => {
    const track = { name, program: 0, instrument: "piano", notes: [], cursor: 0 };
    tracks.push(track);
    return track;
  };

  const activeTrack = () => current || (current = createTrack(""));

  lines.forEach((rawLine, index) => {
    const lineNo = index + 1;
    const line = stripTrailingComment(String(rawLine).trim());

    if (!line) return;

    const directive = DIRECTIVE_RE.exec(line);
    if (directive) {
      const key = directive[1].toLowerCase();
      const value = directive[2].trim();

      if (key === "title" || key === "name") {
        title = stripQuotes(value);
        return;
      }

      if (key === "tempo" || key === "bpm") {
        const bpm = Number.parseFloat(value);
        if (!Number.isFinite(bpm) || bpm < MIN_TEMPO || bpm > MAX_TEMPO) {
          errors.push({
            line: lineNo,
            message: `Tempo must be a number between ${MIN_TEMPO} and ${MAX_TEMPO}, got "${value}"`,
          });
        } else {
          tempo = Math.round(bpm);
        }
        return;
      }

      if (key === "instrument" || key === "program" || key === "inst") {
        const instrument = resolveInstrument(stripQuotes(value));
        if (!instrument.known) {
          errors.push({ line: lineNo, message: `Unknown instrument "${value}" — using piano` });
        }
        const track = activeTrack();
        track.program = instrument.program;
        track.instrument = instrument.name;
        return;
      }

      errors.push({ line: lineNo, message: `Unknown directive "${directive[1]}"` });
      return;
    }

    // `track` opens a new track. It is normally the first word on the line, but a
    // model that forgets a newline can glue the header onto the end of a note
    // line ("... [E5,G5,B5]/2 track Bass instrument=bass"). Read that as a new
    // statement, otherwise the header becomes note tokens and the track is lost.
    // This runs after the directive check so a title like "Night Track" is safe.
    const headerAt = findTrackHeaderAt(line);
    if (headerAt >= 0) {
      if (headerAt > 0) {
        const previous = activeTrack();
        for (const token of splitTokens(line.slice(0, headerAt))) {
          parseToken(token, previous, lineNo, errors);
        }
      }

      const { name, instrument } = parseTrackHeader(
        line.slice(headerAt + TRACK_KEYWORD.length),
        lineNo,
        errors
      );
      current = createTrack(name);
      current.program = instrument.program;
      current.instrument = instrument.name;
      return;
    }

    const track = activeTrack();
    for (const token of splitTokens(line)) {
      parseToken(token, track, lineNo, errors);
    }
  });

  const notes = tracks.flatMap((track) => track.notes);
  const durationBeats = tracks.reduce((max, track) => Math.max(max, track.cursor), 0);
  const pitches = notes.map((note) => note.pitch);

  return {
    ok: errors.length === 0,
    errors,
    title,
    tempo,
    tracks: tracks.map(({ name, program, instrument, notes: trackNotes }) => ({
      name,
      program,
      instrument,
      notes: trackNotes,
    })),
    durationBeats,
    durationSeconds: (durationBeats * 60) / tempo,
    noteCount: notes.length,
    minPitch: pitches.length ? Math.min(...pitches) : 0,
    maxPitch: pitches.length ? Math.max(...pitches) : 0,
  };
}

/** The keyword that opens a new track header. */
const TRACK_KEYWORD = "track";

/** `track` as a standalone word, anywhere on the line. */
const TRACK_KEYWORD_RE = /\btrack\b/i;

/** Longest token we try to match when re-scanning glued input. */
const MAX_TOKEN_LENGTH = 64;

/**
 * Index of the `track` keyword on this line, or -1.
 *
 * It is normally at index 0, but a model that forgets a newline can glue the
 * header onto the end of the previous note line, so we look anywhere.
 */
function findTrackHeaderAt(line) {
  const match = TRACK_KEYWORD_RE.exec(line);
  return match ? match.index : -1;
}

/**
 * Drop everything from the first comment marker onwards.
 *
 * `#` only counts as a comment when it stands alone as a whitespace-delimited
 * chunk, otherwise it would swallow the sharp in `C#4`.
 */
function stripTrailingComment(line) {
  const parts = String(line).split(/\s+/);
  const commentAt = parts.findIndex((part) => part === "#" || part.startsWith("//"));
  return commentAt === -1 ? line : parts.slice(0, commentAt).join(" ");
}

/**
 * Split a note line into tokens: whitespace separates them, `|` is decorative
 * (a bar line) and a trailing comment is dropped.
 */
function splitTokens(line) {
  return stripTrailingComment(line)
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((part) => part.split("|"))
    .filter(Boolean)
    .flatMap(splitGluedTokens);
}

/**
 * Greedily peel complete tokens off the front of a chunk.
 *
 * Models routinely drop the space between two notes, e.g.
 * `[C4,E4,G4]/4[C4,E4,G4]/4`. Without this the whole run is reported as one
 * unrecognised token and every note in it is lost, but the engine's contract is
 * that a partly broken score still plays, so recovering the run matters.
 *
 * Returns `[chunk]` unchanged when it cannot be decomposed, so genuinely bad
 * input still produces exactly one error.
 */
function splitGluedTokens(chunk) {
  if (TOKEN_RE.test(chunk)) return [chunk];

  const pieces = [];
  let rest = chunk;

  while (rest) {
    let matched = "";

    // Longest prefix first: `[C4,E4,G4]` is itself a valid token, so a
    // shortest-first scan would split a chord off its length.
    for (let end = Math.min(rest.length, MAX_TOKEN_LENGTH); end > 0; end--) {
      const candidate = rest.slice(0, end);
      if (TOKEN_RE.test(candidate)) {
        matched = candidate;
        break;
      }
    }

    if (!matched) return [chunk];
    pieces.push(matched);
    rest = rest.slice(matched.length);
  }

  return pieces;
}

/**
 * Split the remainder of a `track` line into a display name and an instrument.
 *
 * `track "Lead Synth" instrument=synth`, `track Bass inst=33` and
 * `track Melody instrument=electric piano` all work.
 *
 * An unquoted value runs until the next `key=` pair or the end of the line,
 * because most instrument names are multi-word: matching a single `\S+`
 * silently truncated "electric piano" to "electric". Quotes still win when
 * present, so `instrument="synth pad" rest=...` stays unambiguous.
 */
function parseTrackHeader(rest, lineNo, errors) {
  const source = String(rest || "");
  let instrument = resolveInstrument("");

  HEADER_OPTION_RE.lastIndex = 0;
  const options = [];
  let match;
  while ((match = HEADER_OPTION_RE.exec(source)) !== null) {
    options.push({
      key: match[1].toLowerCase(),
      optionStart: match.index,
      valueStart: match.index + match[0].length,
    });
  }

  const removals = [];
  options.forEach((option, index) => {
    const spanEnd = index + 1 < options.length ? options[index + 1].optionStart : source.length;
    const raw = source.slice(option.valueStart, spanEnd).trim();
    const quoted = /^"([^"]*)"|^'([^']*)'/.exec(raw);
    const value = (quoted ? quoted[1] ?? quoted[2] : raw).trim();

    if (option.key === "instrument" || option.key === "program" || option.key === "inst") {
      const resolved = resolveInstrument(value);
      if (!resolved.known) {
        errors.push({ line: lineNo, message: `Unknown instrument "${value}" — using piano` });
      }
      instrument = resolved;
    } else {
      errors.push({ line: lineNo, message: `Unknown track option "${option.key}"` });
    }

    removals.push([option.optionStart, spanEnd]);
  });

  // Cut the options out back-to-front so earlier indices stay valid.
  let name = source;
  for (let i = removals.length - 1; i >= 0; i--) {
    name = name.slice(0, removals[i][0]) + name.slice(removals[i][1]);
  }

  return { name: stripQuotes(name.trim()), instrument };
}

/** Parse one note/rest/chord token and append it at the track's cursor. */
function parseToken(token, track, lineNo, errors) {
  const match = TOKEN_RE.exec(token);
  if (!match) {
    errors.push({ line: lineNo, message: `Unrecognised token "${token}"` });
    return;
  }

  const denominator = match[2] ? Number.parseInt(match[2], 10) : DEFAULT_DENOMINATOR;
  if (!VALID_DENOMINATORS.has(denominator)) {
    errors.push({
      line: lineNo,
      message: `Unsupported note length "/${denominator}" — use 1, 2, 4, 8, 16 or 32`,
    });
    return;
  }

  const velocity = match[4] === undefined ? DEFAULT_VELOCITY : Number.parseInt(match[4], 10);
  if (velocity > MAX_VELOCITY) {
    errors.push({ line: lineNo, message: `Velocity @${velocity} must be 0-${MAX_VELOCITY}` });
    return;
  }

  const beats = (4 / denominator) * (match[3] === "." ? 1.5 : 1);
  const spec = match[1];

  if (/^r$/i.test(spec)) {
    track.cursor += beats;
    return;
  }

  const entries = spec.startsWith("[")
    ? spec.slice(1, -1).split(",").map((entry) => entry.trim()).filter(Boolean)
    : [spec];

  if (!entries.length) {
    errors.push({ line: lineNo, message: `Empty chord "${spec}"` });
    return;
  }

  // Validate the whole chord before committing any of it, so a typo in the
  // third note doesn't leave a half-played chord behind.
  const pitches = [];
  for (const entry of entries) {
    const pitch = pitchToMidi(entry);
    if (pitch === null) {
      errors.push({ line: lineNo, message: `Invalid note "${entry}"` });
      return;
    }
    pitches.push(pitch);
  }

  for (const pitch of pitches) {
    track.notes.push({
      pitch,
      start: track.cursor,
      duration: beats,
      velocity,
    });
  }

  track.cursor += beats;
}

/** Strip one layer of surrounding quotes. */
function stripQuotes(value) {
  const text = String(value ?? "").trim();
  if (text.length >= 2) {
    const first = text[0];
    const last = text[text.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return text.slice(1, -1).trim();
    }
  }
  return text;
}

/**
 * Flatten every track's notes into one list, tagging each with its track index
 * so the piano roll can colour by track.
 */
export function flattenNotes(score) {
  const flat = [];
  (score?.tracks || []).forEach((track, trackIndex) => {
    for (const note of track.notes || []) {
      flat.push({ ...note, trackIndex });
    }
  });
  return flat;
}

// ── Synth engine ──

/** Reverb: a synthetic hall, mixed in under the dry signal. */
const REVERB_SECONDS = 2.2;
const REVERB_PREDELAY = 0.014;
const REVERB_DECAY_RATE = 3.4;
const WET_LEVEL = 0.26;

/** Early reflections for the impulse response: [seconds, amplitude]. */
const EARLY_REFLECTIONS = [
  [0.019, 0.8],
  [0.031, 0.65],
  [0.047, 0.5],
  [0.063, 0.38],
];

/** Fade applied to the master bus when a session stops, then the graph is freed. */
const FADE_TIME_CONSTANT = 0.03;
const FADE_STOP_SECONDS = 0.25;
const FADE_CLEANUP_MS = 350;

/**
 * Ceiling of the master bus. The user's volume (0-1) scales this rather than
 * replacing it, so a full-volume score keeps the headroom the compressor was
 * tuned against.
 */
const MAX_MASTER_GAIN = 0.9;

/** Ramp used for live volume changes, short enough to feel instant, long enough not to click. */
const VOLUME_RAMP_SECONDS = 0.03;

/** How far tracks are spread from the centre of the stereo field. */
const PAN_SPREAD = 0.5;

/** Notes shorter than this after a seek clip are not worth scheduling. */
const MIN_AUDIBLE_SECONDS = 0.02;

const MIDDLE_C = 261.63;

const clampNumber = (value, min, max) => Math.min(max, Math.max(min, value));

/** Even stereo slots for playable tracks, damped so nothing is hard-panned. */
function trackPans(tracks) {
  const playable = tracks.flatMap((track, index) => (track.notes.length ? [index] : []));
  const positions = tracks.map(() => 0);
  const span = Math.max(1, playable.length - 1);

  playable.forEach((index, order) => {
    positions[index] = playable.length > 1 ? ((order / span) * 2 - 1) * PAN_SPREAD : 0;
  });

  return positions;
}

/**
 * Build a synth bound to one AudioContext.
 *
 * Everything expensive and reusable (periodic waves, the noise buffer, the
 * reverb impulse) is created lazily once per synth. `start()` schedules a whole
 * score and hands back a session that can be stopped with a click-free fade.
 *
 * Signal path per track:
 *   osc(s) -> lowpass filter -> envelope -> track bus -> panner -> dry bus
 *                                                              \-> reverb send
 * The noise layer joins the track bus and the sub oscillator joins the
 * envelope. All buses meet in a master gain, then a compressor, so dense
 * chords and multi-track scores glue together instead of clipping.
 *
 * @param {BaseAudioContext} ctx
 */
export function createMidiSynth(ctx) {
  const sampleRate = ctx.sampleRate || 44100;
  const maxFrequency = Math.min(18000, sampleRate * 0.45);
  const canShapeWaves = typeof ctx.createPeriodicWave === "function";
  const waves = new Map();
  let noiseBuffer = null;
  let impulseBuffer = null;

  /** Periodic wave for a partials array, cached by array identity. */
  function waveFor(partials) {
    let wave = waves.get(partials);
    if (wave) return wave;

    const real = new Float32Array(partials.length + 1);
    const imag = new Float32Array(partials.length + 1);
    partials.forEach((amplitude, index) => {
      imag[index + 1] = amplitude;
    });

    wave = ctx.createPeriodicWave(real, imag);
    waves.set(partials, wave);
    return wave;
  }

  /** Two seconds of white noise, looped by whoever needs longer. */
  function getNoise() {
    if (noiseBuffer) return noiseBuffer;

    const length = Math.round(sampleRate * 2);
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;

    noiseBuffer = buffer;
    return buffer;
  }

  /**
   * Hall-like impulse response: a few early reflections, then stereo noise that
   * decays exponentially and gets darker as it goes, the way air and soft
   * surfaces absorb highs first. The convolver normalises the level.
   */
  function getImpulse() {
    if (impulseBuffer) return impulseBuffer;

    const length = Math.max(1, Math.round(sampleRate * REVERB_SECONDS));
    const preDelay = Math.min(length - 1, Math.round(sampleRate * REVERB_PREDELAY));
    const buffer = ctx.createBuffer(2, length, sampleRate);

    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      let lowpassed = 0;

      for (let i = preDelay; i < length; i++) {
        const t = (i - preDelay) / sampleRate;
        const envelope = Math.exp(-t * REVERB_DECAY_RATE);
        const brightness = 0.08 + 0.85 * Math.exp(-t * 2.2);
        const buildUp = Math.min(1, t * 60);
        lowpassed += (Math.random() * 2 - 1 - lowpassed) * brightness;
        data[i] = lowpassed * envelope * buildUp;
      }

      for (const [seconds, amplitude] of EARLY_REFLECTIONS) {
        const at = preDelay + Math.round(sampleRate * seconds) + channel * 9;
        if (at < length) data[at] += amplitude;
      }
    }

    impulseBuffer = buffer;
    return buffer;
  }

  /**
   * Schedule a score.
   *
   * @param {ReturnType<typeof parseMidiScore>} score
   * @param {{ from?: number, delay?: number, volume?: number }} [options] `from`
   *   is the score position in seconds, `delay` the lead time before the first
   *   sound, `volume` the master level (0-1, default 1).
   * @returns {{ startTime: number, stop: () => void, setVolume: (value: number) => void }}
   */
  function start(score, { from = 0, delay = 0.12, volume = 1 } = {}) {
    const tracks = Array.isArray(score?.tracks) ? score.tracks : [];
    const tempo = Number(score?.tempo) > 0 ? Number(score.tempo) : DEFAULT_TEMPO;
    const secondsPerBeat = 60 / tempo;
    const total = Math.max(0, Number(score?.durationSeconds) || 0);
    const startAt = ctx.currentTime + delay;

    const nodes = [];
    const sources = [];
    const keep = (node) => {
      nodes.push(node);
      return node;
    };

    // Master chain: master gain -> compressor -> speakers.
    const master = keep(ctx.createGain());
    master.gain.value = MAX_MASTER_GAIN * clampNumber(volume, 0, 1);

    if (typeof ctx.createDynamicsCompressor === "function") {
      const compressor = keep(ctx.createDynamicsCompressor());
      compressor.threshold.value = -14;
      compressor.knee.value = 18;
      compressor.ratio.value = 4;
      compressor.attack.value = 0.004;
      compressor.release.value = 0.22;
      master.connect(compressor);
      compressor.connect(ctx.destination);
    } else {
      master.connect(ctx.destination);
    }

    const dry = keep(ctx.createGain());
    dry.gain.value = 1;
    dry.connect(master);

    // Shared reverb bus. High-passed so low notes do not turn to mud.
    let reverbIn = null;
    if (typeof ctx.createConvolver === "function" && typeof ctx.createBuffer === "function") {
      const convolver = keep(ctx.createConvolver());
      convolver.normalize = true;
      convolver.buffer = getImpulse();

      const highpass = keep(ctx.createBiquadFilter());
      highpass.type = "highpass";
      highpass.frequency.value = 180;

      const wet = keep(ctx.createGain());
      wet.gain.value = WET_LEVEL;

      convolver.connect(highpass);
      highpass.connect(wet);
      wet.connect(master);
      reverbIn = convolver;
    }

    const playable = tracks.filter((track) => track.notes.length).length;
    const trackLevel = 0.26 / Math.max(1, Math.sqrt(playable));
    const pans = trackPans(tracks);
    const lfoStop = startAt + Math.max(0, total - from) + 4;

    tracks.forEach((track, trackIndex) => {
      if (!track.notes.length) return;

      const timbre = voiceForProgram(track.program);
      const useWave = canShapeWaves && timbre.partials && timbre.partials.length > 0;

      const bus = keep(ctx.createGain());
      bus.gain.value = trackLevel * timbre.gain;

      let tail = bus;
      if (typeof ctx.createStereoPanner === "function") {
        const panner = keep(ctx.createStereoPanner());
        panner.pan.value = pans[trackIndex];
        bus.connect(panner);
        tail = panner;
      }
      tail.connect(dry);

      if (reverbIn && timbre.reverb > 0) {
        const send = keep(ctx.createGain());
        send.gain.value = timbre.reverb;
        tail.connect(send);
        send.connect(reverbIn);
      }

      // One shared vibrato LFO per track, wired into every oscillator's detune.
      let vibrato = null;
      if (timbre.vibrato > 0) {
        const lfo = ctx.createOscillator();
        lfo.frequency.value = timbre.vibratoRate;
        const depth = keep(ctx.createGain());
        depth.gain.value = timbre.vibrato;
        lfo.connect(depth);
        lfo.start(startAt);
        lfo.stop(lfoStop);
        sources.push(lfo);
        vibrato = depth;
      }

      const cents = timbre.detune ? [-timbre.detune, timbre.detune] : [0];
      const stackScale = cents.length > 1 ? 0.62 : 1;

      for (const note of track.notes) {
        const noteStart = note.start * secondsPerBeat;
        const noteEnd = noteStart + Math.max(0.06, note.duration * secondsPerBeat);
        // Notes behind the seek point are dropped; one straddling it is clipped
        // so it still sounds, just shorter.
        if (noteEnd <= from) continue;

        const at = startAt + Math.max(0, noteStart - from);
        const length = noteEnd - Math.max(noteStart, from);
        if (length < MIN_AUDIBLE_SECONDS) continue;
        const noteOff = at + length;

        const frequency = midiToFrequency(note.pitch);
        const pitchRatio = frequency / MIDDLE_C;
        const velocity = clampNumber(note.velocity / 127, 0.02, 1);
        const peak = Math.max(0.015, Math.pow(velocity, 1.25)) * stackScale;

        // Brightness follows both pitch and how hard the note is struck.
        const cutoff = clampNumber(
          timbre.cutoff * Math.pow(pitchRatio, timbre.keytrack) * (0.5 + 0.5 * velocity),
          200,
          maxFrequency
        );
        const filterStart = clampNumber(cutoff * timbre.sweep, 200, maxFrequency);

        const filter = keep(ctx.createBiquadFilter());
        filter.type = "lowpass";
        filter.Q.value = timbre.q;
        filter.frequency.setValueAtTime(filterStart, at);
        filter.frequency.exponentialRampToValueAtTime(cutoff, at + Math.max(0.02, timbre.filterTime));

        // Envelope. The decay is an exponential fall; if the note ends partway
        // through it, release starts from wherever the curve had got to, so a
        // short piano note does not jump to its sustain level.
        const attackTime = Math.max(0.001, Math.min(timbre.attack, length * 0.5));
        const attackEnd = at + attackTime;
        const decayTime = clampNumber(timbre.decay * Math.pow(pitchRatio, -timbre.decayKey), 0.08, 8);
        const sustainRatio = Math.max(0.0005, timbre.sustain);
        const decaySpan = clampNumber(noteOff - attackEnd, 0, decayTime);
        const endAt = noteOff + timbre.release;

        const envelope = keep(ctx.createGain());
        let level = peak;
        envelope.gain.setValueAtTime(0, at);
        envelope.gain.linearRampToValueAtTime(peak, attackEnd);
        if (decaySpan > 0.001) {
          level = Math.max(0.0002, peak * Math.pow(sustainRatio, decaySpan / decayTime));
          envelope.gain.exponentialRampToValueAtTime(level, attackEnd + decaySpan);
        }
        envelope.gain.setValueAtTime(level, noteOff);
        envelope.gain.exponentialRampToValueAtTime(0.0001, endAt);
        envelope.gain.setValueAtTime(0, endAt);

        filter.connect(envelope);
        envelope.connect(bus);

        for (const offset of cents) {
          const oscillator = ctx.createOscillator();
          if (useWave) oscillator.setPeriodicWave(waveFor(timbre.partials));
          else oscillator.type = timbre.waveform;

          // Drums start sharp and glide down onto the written pitch.
          if (timbre.pitchDrop !== 1) {
            oscillator.frequency.setValueAtTime(frequency * timbre.pitchDrop, at);
            oscillator.frequency.exponentialRampToValueAtTime(frequency, at + 0.07);
          } else {
            oscillator.frequency.setValueAtTime(frequency, at);
          }
          oscillator.detune.setValueAtTime(offset, at);
          if (vibrato) vibrato.connect(oscillator.detune);

          oscillator.connect(filter);
          oscillator.start(at);
          oscillator.stop(endAt + 0.05);
          sources.push(oscillator);
        }

        // Sub oscillator, unfiltered, riding the same envelope.
        if (timbre.sub > 0) {
          const sub = ctx.createOscillator();
          sub.type = "sine";
          sub.frequency.setValueAtTime(frequency / 2, at);
          const subGain = keep(ctx.createGain());
          subGain.gain.value = timbre.sub;
          sub.connect(subGain);
          subGain.connect(envelope);
          sub.start(at);
          sub.stop(endAt + 0.05);
          sources.push(sub);
        }

        // Noise layer: hammer thump, pluck snap or sustained breath.
        if (timbre.noise > 0) {
          const source = ctx.createBufferSource();
          source.buffer = getNoise();
          source.loop = true;

          const band = keep(ctx.createBiquadFilter());
          band.type = "bandpass";
          band.frequency.value = clampNumber(frequency * timbre.noiseTone, 300, maxFrequency);
          band.Q.value = 0.9;

          const noiseGain = keep(ctx.createGain());
          const noiseLevel = Math.max(0.0005, timbre.noise * Math.pow(velocity, 1.25) * 0.5);
          noiseGain.gain.setValueAtTime(0, at);
          noiseGain.gain.linearRampToValueAtTime(noiseLevel, at + Math.min(0.01, attackTime + 0.004));

          let noiseEnd;
          if (timbre.noiseHold) {
            noiseGain.gain.setValueAtTime(noiseLevel, noteOff);
            noiseEnd = endAt;
          } else {
            noiseEnd = at + Math.max(0.015, timbre.noiseDecay);
          }
          noiseGain.gain.exponentialRampToValueAtTime(0.0001, noiseEnd);
          noiseGain.gain.setValueAtTime(0, noiseEnd);

          source.connect(band);
          band.connect(noiseGain);
          noiseGain.connect(bus);
          source.start(at, Math.random() * 1.5);
          source.stop(noiseEnd + 0.05);
          sources.push(source);
        }
      }
    });

    let stopped = false;

    return {
      startTime: startAt,
      stop() {
        if (stopped) return;
        stopped = true;

        // Fade the master first and let the voices die underneath it. Stopping
        // oscillators outright, or disconnecting a convolver mid-tail, steps the
        // signal to zero and clicks.
        const now = ctx.currentTime;
        try {
          master.gain.cancelScheduledValues(now);
          master.gain.setValueAtTime(master.gain.value, now);
          master.gain.setTargetAtTime(0, now, FADE_TIME_CONSTANT);
        } catch {
          // Ignore: a closing context rejects automation.
        }

        for (const source of sources) {
          try {
            source.stop(now + FADE_STOP_SECONDS);
          } catch {
            // Already stopped.
          }
        }

        setTimeout(() => {
          for (const node of nodes) {
            try {
              node.disconnect();
            } catch {
              // Ignore: some engines throw when disconnecting a finished node.
            }
          }
        }, FADE_CLEANUP_MS);
      },
      /**
       * Live master level, 0-1. Ramped instead of set so dragging a volume
       * slider never clicks. A stopped session ignores it — its nodes are
       * already on their way out, and its fade must not be undone.
       */
      setVolume(next) {
        if (stopped) return;

        const target = MAX_MASTER_GAIN * clampNumber(next, 0, 1);
        const now = ctx.currentTime;
        try {
          master.gain.cancelScheduledValues(now);
          master.gain.setValueAtTime(master.gain.value, now);
          master.gain.linearRampToValueAtTime(target, now + VOLUME_RAMP_SECONDS);
        } catch {
          master.gain.value = target;
        }
      },
    };
  }

  /** Drop cached buffers and waves. The AudioContext itself is not touched. */
  function dispose() {
    waves.clear();
    noiseBuffer = null;
    impulseBuffer = null;
  }

  return { start, dispose };
}

// ── Standard MIDI File writer ──

/** Encode a number as a MIDI variable-length quantity (1-4 bytes). */
function writeVarLen(value) {
  let remaining = Math.max(0, Math.round(value));
  const bytes = [remaining & 0x7f];
  remaining = Math.floor(remaining / 128);
  while (remaining > 0) {
    bytes.unshift((remaining & 0x7f) | 0x80);
    remaining = Math.floor(remaining / 128);
  }
  return bytes;
}

function uint16(value) {
  return [(value >> 8) & 0xff, value & 0xff];
}

function uint32(value) {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

/** Meta-event text bytes; falls back to ASCII when TextEncoder is absent. */
function textBytes(text) {
  const value = String(text ?? "");
  if (typeof TextEncoder === "function") {
    return Array.from(new TextEncoder().encode(value));
  }
  return Array.from(value, (char) => char.charCodeAt(0) & 0x7f);
}

function pushAll(target, ...chunks) {
  for (const chunk of chunks) {
    for (const byte of chunk) target.push(byte);
  }
  return target;
}

/** Wrap a flat event byte sequence in an `MTrk` chunk with its length prefix. */
function buildTrackChunk(body) {
  const chunk = [0x4d, 0x54, 0x72, 0x6b]; // "MTrk"
  pushAll(chunk, uint32(body.length), body);
  return chunk;
}

/**
 * MIDI channels for score tracks. Channel 9 is the GM percussion channel, so it
 * is skipped: a melody landing on it would turn into drums.
 */
function channelForTrack(index) {
  const slot = index % 15; // 0-8 and 10-15 are melodic channels
  return slot < 9 ? slot : slot + 1;
}

/**
 * Serialize a parsed score into a Standard MIDI File (format 1).
 *
 * A conductor track carries tempo and time signature, then one `MTrk` per score
 * track with its name, program change and note on/off pairs.
 *
 * @param {ReturnType<typeof parseMidiScore>} score
 * @returns {Uint8Array}
 */
export function buildMidiFile(score) {
  const tracks = Array.isArray(score?.tracks) ? score.tracks : [];
  const tempo = clampTempo(score?.tempo);

  const header = [
    0x4d, 0x54, 0x68, 0x64, // "MThd"
  ];
  pushAll(header, uint32(6), uint16(1), uint16(tracks.length + 1), uint16(PPQ));

  const microsecondsPerQuarter = Math.round(60000000 / tempo);
  const conductor = [];
  pushAll(conductor, writeVarLen(0), [0xff, 0x51, 0x03], [
    (microsecondsPerQuarter >> 16) & 0xff,
    (microsecondsPerQuarter >> 8) & 0xff,
    microsecondsPerQuarter & 0xff,
  ]);
  // Time signature 4/4: numerator, denominator as a power of two, MIDI clocks
  // per metronome click, 32nd notes per quarter.
  pushAll(conductor, writeVarLen(0), [0xff, 0x58, 0x04, 0x04, 0x02, 0x18, 0x08]);
  pushAll(conductor, writeVarLen(0), [0xff, 0x2f, 0x00]);

  const bytes = [...header, ...buildTrackChunk(conductor)];

  tracks.forEach((track, index) => {
    const channel = channelForTrack(index);
    const name = track.name || `Track ${index + 1}`;
    const nameData = textBytes(name);

    const events = [];
    pushAll(events, writeVarLen(0), [0xff, 0x03, nameData.length], nameData);
    pushAll(events, writeVarLen(0), [0xc0 | channel, clampProgram(track.program)]);

    const timed = [];
    for (const note of track.notes || []) {
      const pitch = clampPitch(note.pitch);
      const velocity = clampVelocity(note.velocity);
      const startTick = Math.max(0, Math.round(Number(note.start) * PPQ));
      const endTick = Math.max(startTick + 1, Math.round((Number(note.start) + Number(note.duration)) * PPQ));

      timed.push({ tick: startTick, rank: 1, data: [0x90 | channel, pitch, velocity] });
      timed.push({ tick: endTick, rank: 0, data: [0x80 | channel, pitch, 0x40] });
    }

    // Note-offs first at equal ticks, then by pitch: the ordering every DAW
    // expects when a repeated note ends and restarts on the same tick.
    timed.sort((a, b) => a.tick - b.tick || a.rank - b.rank || a.data[1] - b.data[1]);

    let previousTick = 0;
    for (const event of timed) {
      pushAll(events, writeVarLen(event.tick - previousTick), event.data);
      previousTick = event.tick;
    }

    pushAll(events, writeVarLen(0), [0xff, 0x2f, 0x00]);
    pushAll(bytes, buildTrackChunk(events));
  });

  return Uint8Array.from(bytes);
}

function clampTempo(value) {
  const tempo = Number(value);
  if (!Number.isFinite(tempo)) return DEFAULT_TEMPO;
  return Math.min(MAX_TEMPO, Math.max(MIN_TEMPO, Math.round(tempo)));
}

function clampProgram(value) {
  const program = Number.parseInt(value, 10);
  if (!Number.isFinite(program)) return 0;
  return Math.min(127, Math.max(0, program));
}

function clampPitch(value) {
  const pitch = Math.round(Number(value));
  if (!Number.isFinite(pitch)) return 60;
  return Math.min(MAX_PITCH, Math.max(MIN_PITCH, pitch));
}

function clampVelocity(value) {
  const velocity = Math.round(Number(value));
  if (!Number.isFinite(velocity)) return DEFAULT_VELOCITY;
  return Math.min(MAX_VELOCITY, Math.max(1, velocity));
}

/**
 * A filesystem-safe `.mid` file name derived from the score title.
 */
export function midiFileName(score) {
  const base = String(score?.title || "").trim()
    .replace(/[^\p{L}\p{N} _-]/gu, "")
    .replace(/\s+/g, "-")
    .slice(0, 60);
  return `${base || "bds-music"}.mid`;
}
