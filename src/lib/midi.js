/**
 * Compact MIDI toolkit — text-notation parser + Standard MIDI File writer.
 *
 * Backs the `<BDS:midi>` card. The model emits a short, human-readable score
 * ("C4/4 E4/4 G4/2"), the card plays it through Web Audio and can export a
 * real `.mid` file. Everything here is dependency-free and side-effect-free,
 * so the same code runs in the content script, the sandbox bundle and Vitest.
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

/** Note denominators we accept — anything else is a typo, not a rhythm. */
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

/** Inverse of {@link pitchToMidi} — always renders with sharps. */
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

/**
 * Oscillator shape used by the card's synth. Timbre is a nice-to-have here,
 * so this is a coarse three-bucket mapping rather than a full GM table.
 */
export function waveformForProgram(program) {
  const value = Number(program) || 0;
  if (value >= 32 && value <= 39) return "sine"; // basses
  if (value >= 16 && value <= 23) return "square"; // organs
  if (value >= 80) return "sawtooth"; // synths
  if (value >= 56 && value <= 79) return "triangle"; // winds, brass, flute
  return "triangle"; // piano, guitar, strings, percussion
}

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
    // line ("… [E5,G5,B5]/2 track Bass instrument=bass"). Read that as a new
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
 * unrecognised token and every note in it is lost — but the engine's contract is
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
 * because most instrument names are multi-word — matching a single `\S+`
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
 * is skipped — a melody landing on it would turn into drums.
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

    // Note-offs first at equal ticks, then by pitch — the ordering every DAW
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
