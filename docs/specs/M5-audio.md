# Spec M5: Audio

Goal: every event has a sound, each world has its own music, and none of it needs an audio file.
All synthesis is Web Audio. Implement `src/core/audio.ts` (engine and SFX), `src/audio/music.ts`
(sequencer), and `src/audio/music-data.ts` (patterns). Subscribe to `GameEvent` per
`docs/ARCHITECTURE.md` section 9. Gameplay never calls audio directly.

## 1. Engine

- Create the `AudioContext` lazily on the first user gesture (pointerdown, keydown, touchstart).
  Until then, show a small "tap for sound" hint in the HUD corner.
- Graph: `master` gain -> destination. `music` gain and `sfx` gain -> `master`. A `musicFilter`
  (lowpass) between the sequencer and `music` gain.
- Volumes from save settings (0 to 100 each for master, music, sfx). `M` toggles mute. Persist.
- All gain changes use `setTargetAtTime` or linear ramps. No clicks.
- Panning: a `StereoPannerNode` per SFX voice, pan = `(col - 6) / 6 * 0.6`.
- Voice cap: 16 simultaneous SFX; drop the oldest.

## 2. SFX recipes

Durations in ms, frequencies in Hz. "noise" means a white-noise buffer through a filter.

| Name | Recipe | Event |
| --- | --- | --- |
| hop | sine 520 to 260 over 90, gain A2 D90 | hop |
| landGround | noise 40, lowpass 800, quiet | land ground |
| landPlatform | triangle 180 for 60 plus noise 30 lowpass 1200 | land platform |
| bonk | square 110 to 70 over 80 | bonk |
| splash | noise 350 bandpass sweep 2000 to 400, plus sine 120 thump 100 | death drown, offscreen |
| squish | noise 120 lowpass 600, plus sawtooth 80 to 40 over 150 | death squish, croc, hedge |
| timeout | three square beeps 440 for 80 with 60 gaps, then squish | death timeout |
| croak | sawtooth 140 with 25 Hz amplitude modulation, 220, lowpass 900 | title start, results |
| home | triangle arpeggio C5 E5 G5 C6, 60 each | home |
| fly | home plus a sine 1400 blip 50 | home with bonus |
| levelClear | fanfare C5 E5 G5 C6 then E5 G5 C6 E6, 100 each, triangle plus square, then a 600 chord C E G | levelClear |
| nearMiss | noise whoosh 200 bandpass 600 to 3000, plus sine ding 1200 for 80, up one semitone per combo | nearMiss |
| streakUp | two sine notes 660 then 880, 60 each | score with label x2, x3, x4 |
| extraLife | five-note rising triangle arpeggio C E G C E, 70 each | extraLife |
| tick | square 1000 for 30 | tick |
| horn | two square waves 300 and 305 for 250 through lowpass 1500 | ambient, random road lane every 6 to 12 s, panned |
| powerup | sine sweep 400 to 1200 over 100 plus three quick high sines | powerup (M7) |
| freeze | noise 400 highpass 3000 plus sine shimmer 2400 | powerup freeze (M7) |
| uiMove | sine 600 for 40 | menu navigation |
| uiConfirm | sine 600 then 900, 50 each | confirm |

## 3. Music sequencer

- 16-step patterns, per-world tempo, scheduled ahead with a 100 ms lookahead on a 25 ms timer so
  loops are seamless.
- Tracks: `kick` (sine 150 to 50 over 120), `snare` (noise 150 bandpass 1800 plus sine 180 for 60),
  `hat` (noise 30 highpass 6000; open hat 120), `bass` (triangle or sawtooth through lowpass 600),
  `lead` (pulse with 4 cents detune, lowpass 2500, short decay), `pad` (two sawtooths detuned 8
  cents, lowpass 900, attack 400, only where listed), `bell` (sine with a fast-decaying octave
  partial, world 5).
- `music.play(world)`, `music.stop()`, `music.setIntensity(0..1)`: intensity 1 raises tempo 8% and
  opens `musicFilter` from 1200 to 8000 Hz. Set to 1 when the timer is under 5 s. On death close
  the filter to 400 Hz for 1 s.
- Title uses world 1 patterns at 110 BPM with no kick or snare.

### Per-world design

| World | Scale | BPM | Feel |
| --- | --- | --- | --- |
| 1 Sunny Suburb | C major pentatonic (C D E G A) | 128 | Bouncy. Kick on 1 and 3, snare 2 and 4, bass on root then fifth in eighths, lead arpeggio up and down the pentatonic in 16ths on beats 1 and 3, hats every 8th. |
| 2 Coastal Highway | A mixolydian (A B C# D E F# G) | 140 | Driving surf. Bass eighths on root, lead riff A C# D E G E D C# in 8ths, snare 2 and 4 with a 16th ghost note, open hat on the off-beats. |
| 3 Neon City | F dorian (F G Ab Bb C D Eb) | 124 | Synthwave. Pad chords i, VI, III, VII one bar each (Fm, Db, Ab, Eb), 16th arpeggios of each chord on the lead, kick four on the floor with the pad gain ducking 30% on each kick, snare 2 and 4. |
| 4 Misty Marsh | D dorian (D E F G A B C) | 96 | Sparse. Pad on Dm7 and Gm7 two bars each, lead plays one long note every bar on chord tones, random "drip" sine notes (2 per bar, high, quiet), hats only, no kick. |
| 5 Frozen Fjord | E minor (E F# G A B C D) | 112 | Bells. Bell lead plays E G B E G B D B in 8ths, bass root and fifth on 1 and 3, kick four on the floor, snare on 4 only, closed hats in 16ths. |

Write each pattern as arrays of `{ step, note, length, vel }` in `music-data.ts` using MIDI note
numbers, so the data is readable and testable.

## 4. Tests

Pure functions: step timing for a given BPM, note-to-frequency, pattern validation (all steps in
0..15, all notes in the world's scale). No AudioContext in tests.

## Acceptance

1. Typecheck, lint, tests, build pass.
2. Play through level 1 with sound: every row in section 2 that has an event in the game so far
   is audible; nothing clicks or pops.
3. Music loops without a gap for 2 minutes. Switching worlds (use a dev key to jump levels) crossfades over 800 ms.
4. Volume settings persist across reload; `M` mutes.

## Handoff

`docs/specs/M5-report.md`. Do not commit.
