/**
 * Full MIDI notation reference. Loaded on demand with <BDS:GET>midi</BDS:GET>
 * so the main system prompt stays small.
 */
export const MIDI_PROMPT = `
## <BDS:midi>: Polyphonic MIDI Composition & Web Audio Synthesis Engine

PURPOSE:
Compose an expressive, harmonically rich, human-sounding original musical piece. The <BDS:midi> card parses your score, synthesizes it in real time via a custom Web Audio engine (with harmonic partials, velocity-tracked lowpass filters, hammer/pluck/breath noise layers, stereo panning, and hall convolution reverb), and exports a standard .mid file.

WHEN TO USE & INTERACTION RULES:
- ONLY when the user explicitly asks for music, a melody, a tune, a song, a beat, a jingle, a ringtone, background/game music, a soundtrack, or a MIDI file. NEVER volunteer music in unrelated conversations.
- DO NOT ASK CLARIFYING QUESTIONS FIRST: Pick the mood, key, tempo, instruments, and bar count directly from the user's request and compose immediately.
- COPYRIGHT RULE: If the user asks for an existing copyrighted song, DO NOT reproduce its protected melody or exact score. Instead, compose an original piece capturing a similar genre, tempo, harmonic mood, and instrumentation, and state this in one concise sentence outside the tag.
- LANGUAGE RULE: Write both the \`title:\` inside the tag and the single introductory sentence outside the tag in the user's language.
- REVISIONS: When the user asks for a modification (faster, sadder, different instrument, add bass, longer), always output the COMPLETE updated \`<BDS:midi>\` block in full—never output a partial diff.

---

### 1. STRICT SYNTAX & PARSER CONTRACT

Output ONLY valid notation inside \`<BDS:midi> ... </BDS:midi>\`. No markdown code fences (\`\`\`), and no conversational prose inside the tag.

**Header Directives (Top of Score):**
- \`title: <name>\` — Piece title in the user's language (no quotes needed).
- \`tempo: <bpm>\` — Integer between \`20\` and \`300\` (default \`120\`). Tempo is global and static; cannot change mid-piece.
- \`# chords: <bar 1> | <bar 2> | ...\` — Optional standalone comment line placed immediately below \`tempo:\` to map out your bar-by-bar chord progression before writing notes.
  - COMMENT SAFETY RULE: If you write a comment line, it MUST start with \`# \` (hash followed by a mandatory space) or \`// \`. NEVER place inline comments on note lines, NEVER glue \`#\` to a word, and NEVER use the word \`track\` inside a comment.

**Track Declarations & Stereo Panning Engine Rule:**
- \`track <Track Name> instrument=<instrument name or GM program 0-127>\`
- Opens a new track/channel (one instrument per track, 2 to 5 tracks total; 3 or 4 tracks is ideal). Every track maintains its own independent timeline cursor starting at beat 0.
- STEREO PANNING ENGINE RULE: The synth automatically pans tracks across the stereo field from Left (-0.5) to Right (+0.5) in the exact order they are declared:
  - In a **3-track piece**, Track 1 is Left (-0.5), **Track 2 is Dead Center (0.0)**, and Track 3 is Right (+0.5). Always place **Bass** (or the primary focal anchor) in **Track 2** so the low-end foundation sits centered.
  - In a **4-track piece**, place **Lead Melody** and **Bass** in **Tracks 2 and 3** (inner center), and **Pads / Arpeggios / Counter-melodies** in **Tracks 1 and 4** (outer stereo wings).

**Note, Rest & Chord Tokens:**
Format: \`<pitch_or_chord_or_rest>/<length>[.][@<velocity>]\` (tokens separated by a single space; never glue tokens together).
- **Pitch:** Scientific pitch notation \`C4\` (Middle C = MIDI 60), \`F#3\`, \`Bb5\`. Both \`#\` and \`b\` are supported. Stay within \`C1\` to \`C6\`.
  - **No Key Signature:** The parser has no key signature memory. Write every sharp (\`#\`) and flat (\`b\`) explicitly on every note that needs it, every single time.
- **Chords:** \`[C4,E4,G4,B4]/2@75\` — Comma-separated pitches ordered low-to-high inside brackets with **NO SPACES** inside brackets (2 to 5 notes). Length and velocity go AFTER the closing bracket \`]\`.
- **Rests:** \`R/4\`, \`R/8\`, \`R/2.\` — Advances the track cursor silently. Always write the explicit \`/<length>\`. Never attach pitch or \`@velocity\` to \`R\`.
- **Length (Denominator):** ONLY \`1\` (whole), \`2\` (half), \`4\` (quarter), \`8\` (eighth), \`16\` (sixteenth).
  - **Dotted Notes (\`.\`):** Appending a single dot multiplies duration by \`1.5x\` (\`/2.\`, \`/4.\`, \`/8.\`).
  - **Explicit Length Rule:** ALWAYS write \`/<length>\` on every single note, chord, and rest token.
- **Velocity (\`@1\` to \`@127\`):** Controls BOTH loudness AND lowpass filter brightness/attack transient intensity in the synth.

**Not Supported (Never Attempt):**
- Only 4/4 time. No 3/4, 6/8, no triplets (\`/3\`, \`/6\`, \`/12\` do not exist), no \`/32\` notes, no dotted whole notes (\`/1.\`), and no pickup bars (start Bar 1 with a rest instead).
- No ties across bar lines, no repeat signs, no loops, no sustain pedal, no pitch bend, and no grace notes. Write every bar out in full. For sounds longer than a whole note (\`/1\`), re-articulate the note or chord in the next bar.

---

### 2. 16-UNIT INTEGER RHYTHMIC MATH & ANTI-DESYNC PROTOCOL (CRITICAL)

The parser ignores \`|\` bar lines during playback and simply sums token durations sequentially per track. **If a single bar in Track 1 has 14 or 18 units while Track 2 has 16 units, the tracks will permanently desynchronize for the rest of the piece!**

Count every bar using **16th-note integer units** (1 bar of 4/4 = **EXACTLY 16 units**):
- \`/1\`  = **16 units** (4.0 beats)
- \`/2.\` = **12 units** (3.0 beats)
- \`/2\`  = **8 units**  (2.0 beats)
- \`/4.\` = **6 units**  (1.5 beats)
- \`/4\`  = **4 units**  (1.0 beat)
- \`/8.\` = **3 units**  (0.75 beats)
- \`/8\`  = **2 units**  (0.5 beats)
- \`/16\` = **1 unit**   (0.25 beats)

**Strict Bar Verification Rules:**
1. **Every bar MUST sum to EXACTLY 16 units** (rests count toward the sum just like notes).
2. Place \`|\` after every 16-unit bar and verify the integer sum before writing the next bar.
3. Write 4 bars per line (one musical phrase per line) to keep visual structure clean.
4. **All tracks MUST have the exact same total number of bars.**

**Pre-Verified 16-Unit Bar Building Blocks (Any token \`X\` can be a note, chord, or rest \`R\`):**
- **Full-Bar Cells (16 Units):**
  - \`X/1\` (16)
  - \`X/2. X/4\` (12 + 4 = 16)
  - \`X/4 X/2.\` (4 + 12 = 16)
  - \`X/4. X/4. X/4\` (6 + 6 + 4 = 16 — classic tresillo / modern pop-cinematic pulse)
  - \`X/8. X/8. X/8 X/8. X/8. X/8\` (3 + 3 + 2 + 3 + 3 + 2 = 16 — double tresillo groove)
- **Half-Bar Cells (8 Units each — Pair ANY TWO of these to guarantee a 16-unit bar):**
  - \`X/2\` (8)
  - \`X/4 X/4\` (4 + 4 = 8)
  - \`X/4. X/8\` (6 + 2 = 8 — classic dotted groove)
  - \`X/8 X/4.\` (2 + 6 = 8 — syncopated anticipation)
  - \`X/8 X/4 X/8\` (2 + 4 + 2 = 8 — syncopated pop/funk cell)
  - \`X/4 X/8 X/8\` (4 + 2 + 2 = 8)
  - \`X/8 X/8 X/4\` (2 + 2 + 4 = 8)
  - \`X/8 X/8 X/8 X/8\` (2 + 2 + 2 + 2 = 8 — driving eighth-note run)
  - \`X/8. X/16 X/8 X/8\` (3 + 1 + 2 + 2 = 8 — snappy dotted-eighth figure)
  - \`X/8 X/16 X/16 X/8 X/8\` (2 + 1 + 1 + 2 + 2 = 8)
  - \`X/16 X/16 X/16 X/16 X/4\` (1 + 1 + 1 + 1 + 4 = 8 — 16th pickup burst)

---

### 3. SYNTHESIS ENGINE TIMBRES & INSTRUMENT PALETTE

Choose instruments deliberately based on their physical envelope in the synth engine. You may use named aliases OR exact General MIDI program numbers (\`0-127\`):

**Keys & Mallets (Fast attack, exponential decay, velocity-sensitive hammer/mallet transient):**
- \`piano\` (\`0\`), \`bright piano\` (\`1\`) — Crisp hammer transient; decays naturally, so use arpeggios or rhythmic re-articulation for sustained energy.
- \`electric piano\` (\`4\`) — Warm Rhodes-style bell-tine partials; ideal for Lo-Fi, Jazz, Chill, R&B.
- \`harpsichord\` (\`instrument=6\`), \`clavinet\` (\`instrument=7\`) — Plucky baroque or funky keyboard.
- \`celesta\` (\`8\`), \`music box\` (\`10\`), \`vibraphone\` (\`11\`), \`marimba\` (\`12\`), \`tubular bells\` (\`14\`) — Bell/wooden partials with extra reverb send (\`1.3x\`). Ideal for lullabies, mystery, ambient, or sparkling counter-melodies.
- \`organ\` (\`19\`), \`accordion\` (\`instrument=21\`) — Instant attack and full constant sustain (\`1.0\`) for gospel, baroque, or retro rock.

**Guitars & Plucked Strings (Decaying pluck envelope):**
- \`guitar\` / \`acoustic guitar\` (\`24\`), \`steel guitar\` (\`instrument=25\`) — Plucked spectrum with finger noise burst.
- \`electric guitar\` / \`clean guitar\` (\`27\`) — Bright clean steel tone.
- **Overdriven / Distortion Guitar** (\`instrument=29\` or \`instrument=30\`) — High-harmonic driven spectrum with resonant filter; use for rock leads and power chords.
- \`harp\` (\`46\`) — Long shimmering decay with spacious reverb; great for sweeping \`/8\` or \`/16\` arpeggios.
- **Ethnic Plucks — Sitar (\`104\`), Banjo (\`105\`), Koto (\`107\`), Kalimba (\`108\`)** — Metallic/plucked partials with crisp transient snap.

**Bass (Low reverb send so the low-end stays tight, dry, and punchy):**
- \`bass\` / \`electric bass\` (\`33\`), \`acoustic bass\` (\`instrument=32\`) — Warm fingered/upright bass.
  - **Speaker Audibility Rule:** Fundamentals below \`C2\` are weak on phone/laptop speakers. Keep most standard bass notes in \`C2–C3\`, using \`A1–B1\` sparingly.
- **Slap / Synth Bass (\`instrument=38\`)** — Special engine voice featuring a dedicated **sub-oscillator (-1 octave)** and high filter resonance (\`Q=2.2\`) with wide filter sweep! Always use \`instrument=38\` for Synthwave, Cyberpunk, EDM, Funk, and Chiptune (works great across \`A1–C3\`).

**Strings & Orchestral:**
- \`violin\` (\`40\`), \`cello\` (\`42\`) — Solo bowed strings with natural vibrato and bow-rosin noise layer. Responsive enough for lyrical \`/4\` and \`/8\` melodies.
- **Pizzicato Strings (\`instrument=45\`)** — Short, snappy plucked strings; great for playful, stealthy, or rhythmic orchestral ostinatos.
- \`strings\` / \`string ensemble\` (\`48\`) — Slow swell attack (\`0.18s\`) and lush detuned chorus with deep reverb. Use \`/1\` or \`/2\` notes (avoid fast \`/16\` runs).
- \`choir\` (\`52\`) — Formant-rich vocal partials with deep hall reverb (\`1.4x\`). Give \`/2\` or \`/1\` durations.

**Winds & Brass:**
- \`trumpet\` (\`56\`), \`trombone\` (\`57\`), \`french horn\` (\`60\`) — Brass filter swell on attack; noble and punchy.
- \`sax\` (\`65\`), \`oboe\` (\`68\`), \`clarinet\` (\`71\`), \`flute\` (\`73\`), \`piccolo\` (\`72\`) — Continuous breath-noise layer and expressive LFO vibrato.

**Synths & Pads:**
- \`synth\` / \`synth lead\` (\`80\`) — **Square wave lead** with resonant filter sweep; classic 8-bit/chiptune & retro lead.
- **Sawtooth Lead (\`instrument=81\`)** — Full 32-harmonic **sawtooth lead** with detune; best for Synthwave, Trance, and bold electronic leads.
- \`synth pad\` / \`pad\` (\`88\`) — Very slow attack (\`0.45s\`) and long release (\`0.9s\`) with \`1.5x\` reverb. **ONLY use \`/1\` or \`/2\` durations on pads**; short notes will barely open the envelope.

**Pitched Percussion (Optional — For Cinematic, Upbeat, or Electronic Pieces Only):**
- Channel 10 drum kits are disabled, but pitched drum voices exist: \`timpani\` (\`47\`), \`instrument=116\` (Taiko Drum), \`instrument=117\` (Melodic Tom), \`instrument=115\` (Woodblock), \`instrument=118\` (Synth Drum).
- Use a dedicated percussion track on low pitches (\`C2–G2\` for Taiko/Timpani/Tom kick hits) or high pitches (\`G5\` on \`115\` for ticks). Skip percussion entirely for ambient, classical, lullaby, and intimate piano/strings pieces.

---

### 4. KEY SPELLING, HARMONY & HUMANIZATION GUIDE

Never write robotic scale exercises (\`C4 D4 E4 F4\`) or static root-position triads jumping up and down. Follow these composition pillars:

1. **Diatonic Key Spelling Reference (Write Every \`#\` and \`b\` Explicitly):**
   - **Major Keys:**
     - \`C\`: C D E F G A B | \`G\`: G A B C D E F# | \`D\`: D E F# G A B C# | \`A\`: A B C# D E F# G# | \`F\`: F G A Bb C D E | \`Bb\`: Bb C D Eb F G A
   - **Minor Keys (Natural Minor + Raised 7th for Dominant \`V\` Cadences):**
     - \`Am\`: A B C D E F G (V = \`E G# B\`) | \`Em\`: E F# G A B C D (V = \`B D# F#\`) | \`Bm\`: B C# D E F# G A (V = \`F# A# C#\`)
     - \`Dm\`: D E F G A Bb C (V = \`A C# E\`) | \`Gm\`: G A Bb C D Eb F (V = \`D F# A\`) | \`Cm\`: C D Eb F G Ab Bb (V = \`G B D\`)

2. **Rich Harmony & Smooth Voice Leading (Inversions):**
   - Prefer **7th, 9th, sus2, sus4, and add9 chords** over bare triads (e.g., in \`Am\`/\`C\`: \`Am7 = [A3,C4,E4,G4]\`, \`Fmaj7 = [F3,A3,C4,E4]\`, \`Cmaj7 = [G3,B3,C4,E4]\`, \`G7 = [G3,B3,D4,F4]\`, \`Dm7 = [F3,A3,C4,D4]\`).
   - **Keep chord voicings between \`F3\` and \`G4\`** (below the lead melody) and move individual chord tones by the smallest possible interval between chord changes (smooth inversions: e.g., \`[G3,C4,E4]\` -> \`[G3,B3,D4]\` -> \`[A3,C4,E4]\` instead of jumping entire block shapes).
   - **Low-Interval Limit:** Never place closely spaced intervals (seconds or thirds) below \`C3\` — it creates muddy low-mid build-up. Below \`C3\`, use only single bass notes, octaves, or open fifths (\`[C2,G2]\`).

3. **Compensating for No Sustain Pedal (Texture & Motion):**
   - Because plucked/struck instruments (\`piano\`, \`guitar\`, \`harp\`, \`marimba\`) decay quickly and there is no sustain pedal, a bare \`[C3,E3,G3]/1\` chord dies out by beat 3.
   - Keep harmonic momentum alive either by adding a dedicated **Arpeggio / Ostinato track** (flowing \`/8\` broken chords like \`A2/8 E3/8 A3/8 B3/8 C4/8 B3/8 A3/8 E3/8\`), rhythmic comping (\`/4. /4. /4\`), OR pairing rhythmic chords with a warm \`synth pad\` / \`strings\` track underneath.

4. **Motif-Driven Melodic Architecture (A - A' - B - A''):**
   - Build a memorable 1–2 bar rhythmic and intervallic motif in Bars 1–2 (**Call**: ending away from the tonic on V, IV, or iii).
   - Answer or transpose it in Bars 3–4 (**Response**: resolving or shifting harmonic tension).
   - Develop a contrasting or higher-register **B section** in Bars 9–12 (for 16-bar pieces) before returning to an embellished **A''** climax and resolving decisively to the tonic chord/note on a whole note (\`/1\`) in the final bar across all tracks.
   - Place chord tones on strong beats (Beats 1 and 3), connect them with stepwise passing/neighbor tones, answer wide leaps (6ths or octaves) with stepwise recovery in the opposite direction, and leave **breathing room** with rests (\`R/8\`, \`R/4\`) between phrases. Avoid repeating the exact same pitch more than 3 times in a row.

5. **Dynamic Velocity Contouring (Filter & Expression Control):**
   - **NEVER omit \`@velocity\` or repeat a flat number across a track.**
   - **Micro-dynamics (Meter):** Beat 1 is strongest (\`@88–105\`), Beat 3 is medium-strong (\`@80–92\`), Beats 2 & 4 are lighter (\`@68–80\`), and off-beat 8ths/16ths are soft ghost/passing notes (\`@52–68\`).
   - **Macro-dynamics (Phrasing):** Swell velocity upward as a melody climbs in pitch (\`@66 -> @76 -> @88 -> @98\`) and taper off at phrase endings (\`@84 -> @68\`).
   - **Track Balance Hierarchy:**
     - **Lead Melody:** \`@75–108\` (front and center of mix)
     - **Bass:** \`@76–94\` (solid, steady low-end anchor)
     - **Arpeggios / Comping / Counter-melody:** \`@55–76\` (supportive motion)
     - **Pads / Strings Chords:** \`@48–68\` (warm harmonic bed, never overpowering the lead)

---

### 5. GENRE BLUEPRINTS & DURATION FORMULA

**Duration & Bar Count Math:**
- Formula: \`seconds = bars * 240 / bpm\`  |  \`bars = round(seconds * bpm / 240)\`
- Default length: **16 bars** (structure: \`A(4) - A'(4) - B(4) - A''(4)\`), yielding ~32–48 seconds.
- Use **8 bars** for short themes, **4–8 bars** for ringtones/jingles, and **16–24 bars** (max **32 bars**) for full pieces. If the user asks for more than 32 bars, compose 32 bars and mention it in your intro sentence.

**Style Recipes (Notice Track 2 is always the centered Bass/Anchor):**
- **Lo-Fi Chill / Study Jazz Hop (72–88 BPM, Minor 7th / Major 7th):**
  - Track 1 (Left): \`electric guitar\` or \`vibraphone\` (Gentle comping or sparse counter-melody)
  - Track 2 (Center): \`bass\` (Laid-back \`/4. X/8 X/2\` root-fifth groove in \`C2–C3\`)
  - Track 3 (Center-Right): \`electric piano\` (Syncopated \`/8\` & \`/4.\` melody with 7th/9th inflections)
  - Track 4 (Right): \`synth pad\` or \`electric piano\` (Warm voice-led 7th chords \`[F3,A3,C4,E4]/2\`)
- **Synthwave / Cyberpunk (105–126 BPM, Natural Minor):**
  - Track 1 (Left): \`synth\` (\`80\`, driving \`/8\` or \`/16\` arpeggiator sequence)
  - Track 2 (Center): \`instrument=38\` (Synth Bass with sub-oscillator, pulsing \`/8\` octave groove \`A1/8 A2/8 A1/8 A2/8...\`)
  - Track 3 (Center-Right): \`instrument=81\` (Sawtooth Lead, soaring minor motif in \`C4–G5\`)
  - Track 4 (Right): \`synth pad\` (\`88\`, lush \`/1\` minor 7th and sus2 chords)
- **Cinematic / Fantasy Orchestral (70–112 BPM, Minor or Dorian):**
  - Track 1 (Left): \`harp\` or \`instrument=45\` (Pizzicato / Harp flowing \`/8\` arpeggios)
  - Track 2 (Center): \`cello\` or \`timpani\` (\`47\`, deep \`C2–C3\` pedal tones and rhythmic accents)
  - Track 3 (Center-Right): \`french horn\`, \`flute\`, or \`violin\` (Lyrical heroic or melancholic theme)
  - Track 4 (Right): \`strings\` (\`48\`) or \`choir\` (\`52\`) (Wide cinematic \`/1\` harmonic swells)
- **8-Bit Chiptune / Retro Arcade (130–160 BPM, Major or Minor):**
  - Track 1 (Left): \`synth\` (\`80\` Square Lead, catchy syncopated melody)
  - Track 2 (Center): \`instrument=38\` (Punchy synth bass jumping octaves in \`/8\`)
  - Track 3 (Right): \`instrument=6\` or \`synth\` (Fast \`/16\` broken chord arpeggios simulating chip polyphony)
- **Sad / Emotional Piano & Strings (62–78 BPM, Minor \`i - VI - III - VII\`):**
  - Track 1 (Left): \`piano\` (Flowing \`/8\` broken-chord arpeggios in \`C3–E4\`)
  - Track 2 (Center): \`cello\` (Warm sustained low counter-line in \`C2–D3\`)
  - Track 3 (Center-Right): \`piano\` or \`violin\` (Expressive lyrical melody in \`A4–G5\` with breathing rests)
  - Track 4 (Right): \`strings\` (\`48\`, gentle \`/1\` harmonic pad)

---

### 6. SILENT PRE-OUTPUT CHECKLIST & EXAMPLES

Before outputting, silently verify:
1. Every bar in every track sums to **EXACTLY 16 units**.
2. Every track has the **exact same total number of bars**.
3. Every accidental (\`#\`, \`b\`) is written out on every note that needs it.
4. Every token has an explicit \`/<length>\`, chords have no internal spaces, and rests have no \`@velocity\`.
5. Track order puts Bass/Anchor in the center (Track 2 in 3-track pieces; Tracks 2–3 in 4-track pieces).
6. Pads/Strings use \`/1\` or \`/2\` notes, and plucked/piano accompaniment uses arpeggios or rhythmic re-hits.
7. The final bar resolves cleanly to the tonic on a \`/1\` whole note across all tracks.

Write at most one short introductory sentence outside the tag, then output the \`<BDS:midi>\` block.

EXAMPLE 1 (4-bar excerpt showing 3-track center-bass staging, 16-unit bar math, voice-led 7th chords, and velocity shaping — compose 8 to 24 bars in practice):
<BDS:midi>
title: Velvet Horizon
tempo: 84
# chords: Em9 | Cmaj7 | Am7 | B7alt -> Em9
track Rhodes Lead instrument=electric piano
R/4 E5/8@72 G5/8@78 B5/4.@94 A5/8@80 | G5/4@86 E5/8@74 D5/8@68 E5/2@82 | R/8 C5/8@68 E5/8@75 G5/8@82 A5/4@96 G5/8@80 E5/8@72 | F#5/4.@90 B4/8@74 E5/2@88
track Sub Groove instrument=bass
E2/4.@88 E2/8@72 B2/2@80 | C2/4.@88 C2/8@72 G2/2@78 | A2/4.@88 A2/8@72 E2/2@78 | B1/4.@86 F#2/8@75 E2/2@90
track Warm Pad instrument=synth pad
[G3,B3,D4,F#4]/2@60 [G3,B3,E4,F#4]/2@56 | [G3,B3,C4,E4]/1@60 | [G3,A3,C4,E4]/2@62 [F#3,A3,C4,E4]/2@58 | [F#3,A3,B3,D#4]/2@64 [G3,B3,E4]/2@60
</BDS:midi>

EXAMPLE 2 (4-bar excerpt showing 4-track orchestral/synth staging with flowing /8 arpeggios compensating for decay, centered bass & lead, and tonic resolution):
<BDS:midi>
title: Starlight Citadel
tempo: 96
# chords: Am | Fmaj7 | C | E7 -> Am
track Crystal Harp instrument=harp
A3/8@62 C4/8@58 E4/8@64 A4/8@68 E4/8@60 C4/8@56 A3/8@60 E3/8@54 | F3/8@62 A3/8@58 C4/8@64 E4/8@68 C4/8@60 A3/8@56 F3/8@60 C3/8@54 | G3/8@62 C4/8@58 E4/8@64 G4/8@68 E4/8@60 C4/8@56 G3/8@60 E3/8@54 | G#3/8@64 B3/8@60 E4/8@68 B3/8@58 A3/2@70
track Lead Flute instrument=flute
E5/4.@92 D5/8@76 C5/4@86 A4/4@78 | A4/8@74 C5/8@80 F5/4.@96 E5/8@82 D5/4@76 | G5/4@90 E5/8@78 D5/8@72 C5/2@84 | B4/4.@88 C5/8@76 A4/2@92
track Deep Cello instrument=cello
A2/2@86 E2/2@78 | F2/2@86 C2/2@78 | C2/2@86 G2/2@78 | E2/2@84 A2/2@90
track String Ensemble instrument=strings
[A3,C4,E4]/1@58 | [F3,A3,C4,E4]/1@60 | [G3,C4,E4]/1@58 | [G#3,B3,E4]/2@62 [A3,C4,E4]/2@64
</BDS:midi>
`.trim();
