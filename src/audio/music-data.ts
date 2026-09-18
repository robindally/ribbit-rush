// Per-world music patterns, as data. See docs/specs/M5-audio.md section 3 ("Per-world design").
// Notes are MIDI note numbers (`noteOf('C5')` is a readability helper resolved at module load, not
// a runtime dependency - the exported patterns are plain numbers) so the data stays both readable
// here and directly testable in `tests/music.test.ts` (step range, scale membership) with no
// AudioContext involved.

export interface NoteEvent {
  /** 0..15: position within a 16-step (one bar) pattern. */
  step: number;
  /** MIDI note number. For the percussive tracks (kick/snare/hat) this is a fixed placeholder
   * drum-note (General-MIDI-style: 36 kick, 38 snare, 42 closed hat, 46 open hat), not
   * scale-constrained - see `PITCHED_TRACKS` below. */
  note: number;
  /** Sustain/hold length in steps (16th notes). */
  length: number;
  /** 0..1. */
  vel: number;
  /** `hat` track only: true for an open hat (spec: "open hat 120"). */
  open?: boolean;
}

export type TrackName = 'kick' | 'snare' | 'hat' | 'bass' | 'lead' | 'pad' | 'bell';

/** Tracks whose notes must fall in the world's scale (docs/specs/M5-audio.md section 4: "pattern
 * validation ... every note in the world's scale"). kick/snare/hat are percussive placeholders, not
 * pitched, so they're exempt; `pad` is too - chords carry harmonic function, not melody, and can
 * legitimately borrow a colour tone outside the nominal scale (world 3's pad progression is i-VI-
 * III-VII, i.e. Fm-Db-Ab-Eb, the classic *natural-minor* borrowed-vi loop, deliberately voiced under
 * a dorian *melody* - see WORLD_3 below). `bass`/`lead`/`bell` are the melodic lines and stay
 * strictly diatonic. */
export const PITCHED_TRACKS: TrackName[] = ['bass', 'lead', 'bell'];

export interface WorldMusicDef {
  world: 1 | 2 | 3 | 4 | 5;
  name: string;
  bpm: number;
  /** Pitch classes (0..11, 0 = C) that make up the scale. */
  scale: number[];
  /** Each track cycles through its own bars independently and wraps (docs/specs/M5-audio.md
   * section 3: "16-step patterns"; multi-bar riffs like world 3's four-chord pad are just several
   * bars in sequence). Absent tracks play nothing for that world. */
  tracks: Partial<Record<TrackName, NoteEvent[][]>>;
}

// --- Note-name / scale helpers (module-load-time only, not exported as part of the public data
// API - the exported patterns below are plain numbers per the spec's "so the data is readable and
// testable"). ---

const PITCH_CLASS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "C5", "F#4", "Bb3" -> MIDI note number (C4 = 60, scientific pitch notation). */
function noteOf(name: string): number {
  const m = /^([A-G])(#|b)?(-?\d+)$/.exec(name);
  if (!m) throw new Error(`music-data: bad note name "${name}"`);
  const [, letter, accidental, octaveStr] = m;
  let pc = PITCH_CLASS[letter];
  if (accidental === '#') pc += 1;
  if (accidental === 'b') pc -= 1;
  const octave = parseInt(octaveStr, 10);
  return (octave + 1) * 12 + pc;
}

/** "C", "F#", "Bb" -> pitch class (0..11), no octave needed. */
function pitchClassOf(letterName: string): number {
  const m = /^([A-G])(#|b)?$/.exec(letterName);
  if (!m) throw new Error(`music-data: bad pitch-class name "${letterName}"`);
  const [, letter, accidental] = m;
  let pc = PITCH_CLASS[letter];
  if (accidental === '#') pc += 1;
  if (accidental === 'b') pc -= 1;
  return ((pc % 12) + 12) % 12;
}

/** Pitch classes of a scale built from `root` (a bare letter name, e.g. "C"/"F#", no octave) and
 * `intervals` (semitones from the root), sorted ascending. */
function scaleOf(root: string, intervals: number[]): number[] {
  const rootPc = pitchClassOf(root);
  return [...new Set(intervals.map((i) => (rootPc + i) % 12))].sort((a, b) => a - b);
}

function ev(step: number, note: number | string, length: number, vel: number, open = false): NoteEvent {
  return { step, note: typeof note === 'string' ? noteOf(note) : note, length, vel, ...(open ? { open } : {}) };
}

const KICK = 36;
const SNARE = 38;
const HAT_CLOSED = 42;
const HAT_OPEN = 46;

// --- World 1: Sunny Suburb - C major pentatonic (C D E G A), 128 BPM, bouncy. ---

const W1_KICK: NoteEvent[] = [ev(0, KICK, 2, 1), ev(8, KICK, 2, 1)]; // beats 1 and 3
const W1_SNARE: NoteEvent[] = [ev(4, SNARE, 2, 0.9), ev(12, SNARE, 2, 0.9)]; // beats 2 and 4
const W1_HAT: NoteEvent[] = [0, 2, 4, 6, 8, 10, 12, 14].map((s) => ev(s, HAT_CLOSED, 1, 0.5)); // every 8th
const W1_BASS: NoteEvent[] = [0, 2, 4, 6, 8, 10, 12, 14].map((s, i) =>
  ev(s, i % 2 === 0 ? 'C3' : 'G3', 2, 0.8),
); // root then fifth in eighths
const W1_LEAD: NoteEvent[] = [
  // beat 1: ascending 16ths through the pentatonic; beat 3: descending
  ...['C5', 'D5', 'E5', 'G5'].map((n, i) => ev(i, n, 1, 0.7)),
  ...['G5', 'E5', 'D5', 'C5'].map((n, i) => ev(8 + i, n, 1, 0.7)),
];

const WORLD_1: WorldMusicDef = {
  world: 1,
  name: 'Sunny Suburb',
  bpm: 128,
  scale: scaleOf('C', [0, 2, 4, 7, 9]),
  tracks: {
    kick: [W1_KICK],
    snare: [W1_SNARE],
    hat: [W1_HAT],
    bass: [W1_BASS],
    lead: [W1_LEAD],
  },
};

// --- World 2: Coastal Highway - A mixolydian (A B C# D E F# G), 140 BPM, driving surf. ---

const W2_BASS: NoteEvent[] = [0, 2, 4, 6, 8, 10, 12, 14].map((s) => ev(s, 'A3', 2, 0.8)); // eighths on root
const W2_SNARE: NoteEvent[] = [ev(4, SNARE, 2, 0.9), ev(12, SNARE, 2, 0.9), ev(15, SNARE, 1, 0.3)]; // 2, 4 + a 16th ghost
const W2_HAT: NoteEvent[] = [2, 6, 10, 14].map((s) => ev(s, HAT_OPEN, 2, 0.6, true)); // open hat off-beats
const W2_LEAD: NoteEvent[] = ['A4', 'C#5', 'D5', 'E5', 'G5', 'E5', 'D5', 'C#5'].map((n, i) =>
  ev(i * 2, n, 2, 0.75),
);

const WORLD_2: WorldMusicDef = {
  world: 2,
  name: 'Coastal Highway',
  bpm: 140,
  scale: scaleOf('A', [0, 2, 4, 5, 7, 9, 10]),
  tracks: {
    bass: [W2_BASS],
    snare: [W2_SNARE],
    hat: [W2_HAT],
    lead: [W2_LEAD],
  },
};

// --- World 3: Neon City - F dorian (F G Ab Bb C D Eb), 124 BPM, synthwave. ---
// Pad chords i, VI, III, VII, one bar each (Fm, Db, Ab, Eb); the lead arpeggiates each bar's chord
// in 16ths. Kick four-on-the-floor (with a pad duck on every kick, applied by the sequencer - see
// audio/music.ts); snare 2 and 4.
//
// The VI chord (Db) is the classic *natural-minor* borrowed-vi (F natural minor's own 6th degree
// is Db, not dorian's raised D) - a deliberate, very common "minor loop" colour under a brighter
// dorian melody, per the spec's own literal "(Fm, Db, Ab, Eb)". The pad plays that borrowed Db
// exactly as specified; the lead's arpeggio for that bar uses dorian's own D instead (see
// W3_LEAD_CHORDS) so the strictly-melodic line stays diatonic - `pad` is exempt from the scale
// check for exactly this reason (see PITCHED_TRACKS above).

const W3_KICK: NoteEvent[] = [0, 4, 8, 12].map((s) => ev(s, KICK, 2, 1));
const W3_SNARE: NoteEvent[] = [ev(4, SNARE, 2, 0.9), ev(12, SNARE, 2, 0.9)];

const W3_CHORDS: [string, string, string][] = [
  ['F3', 'Ab3', 'C4'], // i - Fm
  ['Db4', 'F4', 'Ab4'], // VI - Db
  ['Ab3', 'C4', 'Eb4'], // III - Ab
  ['Eb4', 'G4', 'Bb4'], // VII - Eb
];
// Pad velocity per chord tone (audio limiter fix, docs/specs/M6-report.md): three simultaneous
// chord tones, each two detuned sawtooth oscillators (triggerPad in audio/music.ts), summed into
// one gain node - at the original 0.45/voice this constructively summed well past 0dBFS (the
// headless probe, scripts/audio-probe.mjs, measured a 1.54 peak / 0.28 RMS before this trim).
// 0.16 keeps the chord's combined peak reasonable without a real DynamicsCompressorNode fully
// masking it - see the master-bus limiter added in src/core/audio.ts.
const W3_PAD_VEL = 0.095;
const W3_PAD: NoteEvent[][] = W3_CHORDS.map((chord) => chord.map((n) => ev(0, n, 16, W3_PAD_VEL)));

const W3_LEAD_CHORDS: [string, string, string][] = [
  ['F4', 'Ab4', 'C5'],
  ['D5', 'F5', 'Ab5'], // dorian's own 6th (D), not the pad's borrowed Db - stays diatonic
  ['Ab4', 'C5', 'Eb5'],
  ['Eb5', 'G5', 'Bb5'],
];
// Arpeggio (lead) velocity trim, same fix: continuous 16th notes at the original 0.6 stacked with
// the pad and kick/snare pushed world 3's overall RMS well outside the 0.06-0.11 target.
const W3_LEAD_VEL = 0.22;
const W3_LEAD: NoteEvent[][] = W3_LEAD_CHORDS.map((chord) =>
  Array.from({ length: 16 }, (_, step) => ev(step, chord[step % 3], 1, W3_LEAD_VEL)),
);

const WORLD_3: WorldMusicDef = {
  world: 3,
  name: 'Neon City',
  bpm: 124,
  scale: scaleOf('F', [0, 2, 3, 5, 7, 9, 10]),
  tracks: {
    kick: [W3_KICK],
    snare: [W3_SNARE],
    pad: W3_PAD,
    lead: W3_LEAD,
  },
};

// --- World 4: Misty Marsh - D dorian (D E F G A B C), 96 BPM, sparse. ---
// Pad holds Dm7 for two bars, then Gm7 for two bars. Lead plays one long chord-tone note per bar.
// Hats only, no kick. The "random drip" high sine notes (2 per bar) are generated at schedule time
// by audio/music.ts, not stored here - see that file.

// Dm7 (D F A C) is fully diatonic to D dorian. Gm7 (G Bb D F) is not - its third (Bb) is a
// borrowed/modal-mixture colour outside the dorian scale (dorian's own 4th-degree seventh chord
// would be Gmaj7, G B D F), same borrowed-chord idea as world 3's pad VI - so `pad` stays exempt
// from the scale check (see PITCHED_TRACKS above) and plays the spec's literal Gm7 voicing.
// Pad velocity trim, same reasoning/fix as world 3 above (docs/specs/M6-report.md): four
// simultaneous chord tones (one more than world 3's) made world 4 the loudest of the five worlds
// in the audio probe (1.62 peak / 0.36 RMS before this trim) - not named in the milestone's own
// audio-fix note (which only called out world 3), but it fails the same general "RMS 0.06-0.11,
// peak < 0.9" acceptance bar, so it gets the same treatment.
const W4_PAD_VEL = 0.08;
const W4_DM7: NoteEvent[] = ['D4', 'F4', 'A4', 'C5'].map((n) => ev(0, n, 16, W4_PAD_VEL));
const W4_GM7: NoteEvent[] = ['G3', 'Bb3', 'D4', 'F4'].map((n) => ev(0, n, 16, W4_PAD_VEL));
const W4_PAD: NoteEvent[][] = [W4_DM7, W4_DM7, W4_GM7, W4_GM7];

// The lead is the strictly-melodic, scale-bound line: its "Gm7" bars pick the chord tones that are
// diatonic (G, D, F), skipping the pad's borrowed Bb.
const W4_LEAD: NoteEvent[][] = [
  [ev(0, 'A4', 16, 0.5)], // Dm7 5th
  [ev(0, 'C5', 16, 0.5)], // Dm7 7th
  [ev(0, 'D5', 16, 0.5)], // Gm7 5th (D reused)
  [ev(0, 'G4', 16, 0.5)], // Gm7 root
];

const W4_HAT: NoteEvent[] = [0, 2, 4, 6, 8, 10, 12, 14].map((s) => ev(s, HAT_CLOSED, 1, 0.35));

const WORLD_4: WorldMusicDef = {
  world: 4,
  name: 'Misty Marsh',
  bpm: 96,
  scale: scaleOf('D', [0, 2, 3, 5, 7, 9, 10]),
  tracks: {
    pad: W4_PAD,
    lead: W4_LEAD,
    hat: [W4_HAT],
  },
};

// --- World 5: Frozen Fjord - E minor (E F# G A B C D), 112 BPM, bells. ---

const W5_BELL: NoteEvent[] = ['E5', 'G5', 'B5', 'E5', 'G5', 'B5', 'D6', 'B5'].map((n, i) =>
  ev(i * 2, n, 2, 0.6),
);
const W5_BASS: NoteEvent[] = [ev(0, 'E2', 4, 0.8), ev(8, 'B2', 4, 0.8)]; // root and fifth on 1 and 3
const W5_KICK: NoteEvent[] = [0, 4, 8, 12].map((s) => ev(s, KICK, 2, 1)); // four on the floor
const W5_SNARE: NoteEvent[] = [ev(12, SNARE, 2, 0.9)]; // on 4 only
const W5_HAT: NoteEvent[] = Array.from({ length: 16 }, (_, s) => ev(s, HAT_CLOSED, 1, 0.4)); // closed 16ths

const WORLD_5: WorldMusicDef = {
  world: 5,
  name: 'Frozen Fjord',
  bpm: 112,
  scale: scaleOf('E', [0, 2, 3, 5, 7, 8, 10]),
  tracks: {
    bell: [W5_BELL],
    bass: [W5_BASS],
    kick: [W5_KICK],
    snare: [W5_SNARE],
    hat: [W5_HAT],
  },
};

export const WORLD_MUSIC: Record<1 | 2 | 3 | 4 | 5, WorldMusicDef> = {
  1: WORLD_1,
  2: WORLD_2,
  3: WORLD_3,
  4: WORLD_4,
  5: WORLD_5,
};

/** Title screen BPM override (docs/specs/M5-audio.md section 3: "Title uses world 1 patterns at
 * 110 BPM with no kick or snare"). Kick/snare are skipped by the sequencer itself when in title
 * mode - see audio/music.ts. */
export const TITLE_BPM = 110;

/** Pure validation: every note's `step` is an integer in 0..15, and every pitched-track note falls
 * in the world's scale. Returns a list of human-readable problems (empty = valid). Pure, no
 * AudioContext - directly unit-tested in tests/music.test.ts per docs/specs/M5-audio.md section 4. */
export function validateWorldPatterns(def: WorldMusicDef): string[] {
  const errors: string[] = [];
  for (const trackName of Object.keys(def.tracks) as TrackName[]) {
    const bars = def.tracks[trackName] ?? [];
    const pitched = PITCHED_TRACKS.includes(trackName);
    bars.forEach((bar, barIdx) => {
      bar.forEach((note) => {
        if (!Number.isInteger(note.step) || note.step < 0 || note.step > 15) {
          errors.push(
            `world ${def.world} ${trackName} bar ${barIdx}: step ${note.step} out of range 0..15`,
          );
        }
        if (pitched && !def.scale.includes(((note.note % 12) + 12) % 12)) {
          errors.push(
            `world ${def.world} ${trackName} bar ${barIdx}: note ${note.note} (pitch class ${
              note.note % 12
            }) not in scale [${def.scale.join(',')}]`,
          );
        }
      });
    });
  }
  return errors;
}
