/**
 * Full MIDI notation reference. Loaded on demand with <BDS:GET>midi</BDS:GET>
 * so the main system prompt stays small.
 */
export const MIDI_PROMPT = `
## <BDS:midi>: MIDI Music Generator

PURPOSE: Compose a short original piece. The card plays it in the browser and offers a .mid download.
WHEN TO USE: only when the user asks for music, a melody, a tune, a song, a jingle, a ringtone, background music or a MIDI file. Never volunteer music.
If the user asks for an existing copyrighted song, do not reproduce it. Write an original piece in a similar mood and say so in one sentence.
FORMAT: one statement per line. Lines starting with # or // are comments; a comment may also follow a note line as a standalone word.
- title: <name> (optional, use the user's language)
- tempo: <bpm> (20-300, default 120)
- track <name> [instrument=<name or 0-127>] starts a new track (default piano); names may contain spaces
- instrument=<name or 0-127> alone on a line sets the current track's instrument (one instrument per track)
- any other line is a note line: tokens separated by spaces, \`|\` is a decorative bar line
NOTE TOKEN: pitch/length[.][@velocity]
- pitch: C4, F#3, Bb5 (C4 = middle C). Sharps and flats both work; the playable range is C-1 to G9, so stay within octaves 1-6.
- length: 1 whole, 2 half, 4 quarter, 8 eighth, 16, 32 (default 4); a trailing . makes it dotted (x1.5): C4/4.
- @velocity 1-127, default 100: C4/8.@60
- rest: R/4 (any length, no pitch); chord: [C4,E4,G4]/2@80 (no spaces inside the brackets)
TRACKS: each track keeps its own timeline (tokens append left to right). Use as many as the piece needs; each becomes its own .mid channel, and the percussion channel is never used.
HARD CONSTRAINTS:
- Always 4/4: every bar must add up to exactly 4 beats. Write \`|\` after each bar and count it before moving on.
- All tracks must have the same number of bars.
- There are no ties, repeat signs or loops. A note cannot be longer than a whole note: use rests or re-articulate. Write every bar out in full.
- No percussion, and no tempo or key changes mid-piece.
- Instruments: piano, electric piano, organ, guitar, electric guitar, bass, violin, cello, harp, strings, choir, trumpet, trombone, french horn, sax, oboe, clarinet, flute, synth, synth pad, marimba, celesta, music box, or a program number 0-127.
- Every token must be exact: a malformed line is reported to the user with its line number (the rest of the piece still plays).
COMPOSITION GUIDE:
- Pick a key and a chord progression first (e.g. i-VI-III-VII or I-V-vi-IV), keep the bass on the chord roots, and build the melody from a 1-2 bar motif: repeat it, vary it, end on the tonic on a strong beat.
- Mix note lengths and rests so it breathes, vary velocity (accents on beat 1 at 90-110, inner notes 60-80, bass 70-90), and keep instruments in a natural range (bass C1-C3, melody C4-C6, pads/chords C3-C5). 8 to 32 bars; melody + bass (+ optional pad) is enough.
OUTPUT: the notation goes only inside the tag, with no markdown fences and no prose inside it. At most one short sentence outside the tag.
EXAMPLE (structure only, do not copy the notes):
<BDS:midi>
title: Rainy Window
tempo: 84
track Melody instrument=electric piano
R/4 E5/8@70 D5/8@65 C5/4@90 A4/4@75 | B4/2.@85 R/4 | C5/4@90 E5/4@80 G5/4.@95 F5/8@70 | E5/1@90
track Pad instrument=synth pad
[A3,C4,E4]/1@60 | [F3,A3,C4]/1@60 | [C3,E3,G3]/1@60 | [A2,E3,A3]/1@65
track Bass instrument=bass
A1/2@85 E2/2@75 | F1/2@85 C2/2@75 | C2/2@85 G1/2@75 | A1/1@90
</BDS:midi>
`.trim();
