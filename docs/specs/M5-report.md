# M5 report: Audio

Implemented by the Sonnet engineer against `docs/specs/M5-audio.md`, `docs/ARCHITECTURE.md`
section 9 (events) and section 2 (folders), and `docs/specs/M4-report.md` (event shapes, the `tick`
event, and the `fx/` self-subscribing pattern this milestone follows for audio). Not committed -
Fable reviews and commits.

## What was built

Every deliverable in the spec: a Web Audio engine with 20 synthesised SFX and the master/music/sfx
gain graph (`src/core/audio.ts`), a lookahead music sequencer with crossfade, intensity, and a
death-duck (`src/audio/music.ts`), and per-world pattern data for all five worlds plus a title mode
(`src/audio/music-data.ts`). No audio files anywhere - every sound is oscillators, filtered noise,
and gain envelopes.

### 1. `src/core/audio.ts` - engine and SFX

- The AudioContext is created lazily on the first `pointerdown`/`keydown`/`touchstart` (`init()`
  installs the listeners at boot; `resume()` builds the graph exactly once and resumes a suspended
  context on later calls, e.g. after the tab was backgrounded). `hasStarted()` drives the HUD hint
  (see below) and is `false` in every environment with no real user input, including Vitest and a
  plain page load before any interaction.
- Graph: `master` gain -> destination; `musicFilter` (lowpass) -> `music` gain -> `master`; `sfx`
  gain -> `master`. Every SFX voice is `busGain -> StereoPannerNode -> sfxGain`, one pair of nodes
  per voice, `pan = (col - 6) / 6 * 0.6` from the triggering event's `x` (centred/0 when an event
  carries no position - see "Deviations" #3).
- Voice cap: a 16-slot `activeVoices` array; a 17th voice fades the oldest out over 8ms
  (`setTargetAtTime`, not a hard stop) and disconnects it once silent.
- All 20 SFX recipes from the spec table are implemented as small oscillator/noise/filter/gain
  graphs (`SFX_BUILDERS`), every gain change via `setTargetAtTime` or linear/exponential ramps -
  no `.value =` assignments on a live gain, so nothing clicks.
- Volumes (`master`/`music`/`sfx`, 0-100) and `muted` live in `SaveSettings` (see "Deviations" #1),
  read at `init()` and written back (`writeSave`) on every change. `M` (`KeyM`, with a `key`
  fallback) toggles mute via a raw `keydown` listener, since mute isn't a gameplay `InputAction`
  (ARCHITECTURE.md section 5 fixes that union) any more than the gesture-unlock listeners are.
- Self-subscribes to every relevant `GameEvent` (`hop`, `bonk`, `land`, `death`, `home`,
  `levelClear`, `nearMiss`, `score`, `extraLife`, `tick`, `powerup`) exactly like `fx/*.ts` does -
  gameplay never imports or calls this module. A few purely presentational sounds have no
  `GameEvent` (menu confirm, the title's start-up croak), so scenes call `playSfx` directly for
  those, the same precedent M4 set for `fx/transitions.ts`.
- Ambient `horn`: `enableAmbientHorn()`/`disableAmbientHorn()`, called by `PlayScene.enter`/`exit`,
  run a self-rescheduling `setTimeout` every 6-12s while active, panned to a random column (see
  "Deviations" #4 for why it isn't tied to an actual road lane).
- Dev hook: `devHook()` returns `sfxNames`, `play(name)`, `setVolumes`/`setMasterVolume`/
  `setMusicVolume`/`setSfxVolume`, `toggleMute`, and **live getters** `muted`, `started`, `stats`,
  `activeVoices` - see "Auditioning from the console" below for why these had to stay getters
  rather than being spread into a plain object.

### 2. `src/audio/music.ts` - sequencer

- Lookahead scheduler: a 25ms `setInterval` schedules every note whose time falls within 100ms of
  `ctx.currentTime` (`LOOKAHEAD_S`/`SCHEDULER_INTERVAL_MS`), the standard Web-Audio pattern for a
  seamless loop with no setTimeout drift.
- `play(world, { title? })`, `stop()`, `setIntensity(0..1)` exactly per the spec's API. `play` works
  for all five worlds today (verified directly - see "How this was verified"); only world 1 is
  reachable through real gameplay pre-M6.
- Crossfade: each `play()` call starts a new "generation" (its own bus gain node into
  `audio.getMusicFilter()`, its own step clock/tempo so an outgoing track doesn't retime mid-fade)
  and ramps the previous generation's bus to 0 over 800ms while the new one ramps to 1 - a true
  overlap, not a fade-out-then-fade-in.
- `setIntensity(1)` raises tempo 8% and opens the shared `musicFilter` from 1200Hz to 8000Hz
  (`setTargetAtTime`). `music.ts` self-subscribes to `timerLow` (`setIntensity(1)`) and `death`
  (closes the filter to 400Hz for 1s, then resets intensity to 0 for the next attempt) - the
  milestone's own instruction ("subscribe to timerLow and tick; on death close the filter for 1s")
  maps to: `music.ts` owns the filter-frequency behaviour (timerLow/death), `audio.ts` owns the
  `tick` *sound* (the tick SFX itself, via its own GameEvent subscription).
- Title mode (`play(1, { title: true })`): fixed 110 BPM, kick/snare tracks skipped in
  `scheduleStep`. `TitleScene.enter()` calls this; `PlayScene.enter()`/`update()` call
  `play(world.level.world)` (the latter only fires when the level's world actually changes, which
  never happens pre-M6, but is the exact mechanism M6 will rely on).
- A `play()`/`stop()` requested before the AudioContext exists (e.g. the title screen's very first
  music, requested at boot before any gesture) is queued (`pendingPlay`) and flushed the instant
  `audio.onUnlock()` fires.
- Per-track synths (`triggerKick`/`Snare`/`Hat`/`Bass`/`Lead`/`Pad`/`Bell`) follow the spec's
  section-3 recipes (sine kick sweep, noise+sine snare, highpass-noise hats with a longer open
  variant, triangle/lowpass bass, two detuned squares for the lead's "pulse", two detuned sawtooths
  for the pad, sine + fast-decaying octave partial for the bell).
- World 3's "pad gain ducking 30% on each kick": generic, not world-hardcoded - every currently-
  sustaining pad note's gain gets a quick `setTargetAtTime` dip-and-recover whenever a kick fires
  in the same generation, so it only has an audible effect on a world that actually has both a
  kick and a pad track at once (world 3, today).
- World 4's "random drip" notes: generated at schedule time (two random steps chosen fresh at the
  start of each bar), not stored as pattern data - see "Deviations" #5.
- Pure, AudioContext-free exports for tests: `stepDurationS(bpm)` and `midiToFreq(midi)`.

### 3. `src/audio/music-data.ts` - patterns

- `WORLD_MUSIC[1..5]`: each world's `bpm`, `scale` (pitch classes 0-11), and per-track pattern
  arrays (`{ step, note, length, vel, open? }`, MIDI note numbers), authored with small local
  helpers (`noteOf('C5')`, `scaleOf('C', [0,2,4,7,9])`) that resolve at module load time - the
  exported data itself is plain numbers, matching the spec's "so the data is readable and
  testable."
- `validateWorldPatterns(def)`: pure, returns a list of problems (empty = valid) - every note's
  `step` is an integer 0-15, and every note on a melodic track (`bass`/`lead`/`bell`) is in the
  world's scale. All five worlds pass; `tests/music.test.ts` also exercises the validator against
  two deliberately-broken patterns to confirm it actually catches problems.
- `pad` is *not* scale-checked - see "Deviations" #6.

## Auditioning from the console

`window.__rr.audio`:
- `sfxNames` - all 20 recipe names.
- `play(name)` - triggers one SFX immediately, e.g. `window.__rr.audio.play('levelClear')`.
- `setVolumes({ master, music, sfx })` (each 0-100, any subset), `toggleMute`.
- `stats` - `{ byName: { hop: 3, ... }, total: N }`, live (see below).
- `activeVoices`, `started`.
- `music` - `play(world, title?)`, `stop()`, `setIntensity(0..1)`, and getters `playing`,
  `world`, `intensity`.

These are **live getters**, not a one-time snapshot - `window.__rr.audio.stats` reflects the
current count every time it's read. This mattered enough to be worth calling out: the first
version of the boot-time wiring did `{ ...audio.devHook(), music: music.devHook() }`, and spreading
an object with `get stats() {...}` accessors evaluates each getter once and bakes the result into a
plain property forever. Caught by checking `started` in the browser before vs. after the first
click and seeing it never flip from `false` - fixed in `src/main.ts` by attaching `music`'s hook as
a plain property on the object `devHook()` returns, instead of spreading either object.

## SFX and events mapping

| SFX | Trigger | Position source |
| --- | --- | --- |
| hop | `hop` event | none (event carries no position - centred) |
| landGround | `land` event, `surface: 'ground'` | `e.x` |
| landPlatform | `land` event, `surface: 'platform'` | `e.x` |
| bonk | `bonk` event | `e.x` |
| splash | `death`, cause `drown`/`offscreen` | `e.x` |
| squish | `death`, cause `squish`/`croc`/`hedge`/`snake`/`occupied` | `e.x` |
| timeout | `death`, cause `timeout` (ends with the squish tail) | `e.x` |
| croak | scene call: `TitleScene.enter()` ("title start") | none |
| home | `home` event, `bonus: false` | none |
| fly | `home` event, `bonus: true` | none |
| levelClear | `levelClear` event | none |
| nearMiss | `nearMiss` event, pitched up one semitone per `e.combo` | none (event carries no position) |
| streakUp | `score` event, `label` matches `x2`/`x3`/`x4` | none |
| extraLife | `extraLife` event | `e.x` |
| tick | `tick` event | none |
| horn | ambient timer, `PlayScene.enter`/`exit` toggle it | random column |
| powerup | `powerup` event, `kind !== 'freeze'` (M7) | none |
| freeze | `powerup` event, `kind === 'freeze'` (M7) | none |
| uiMove | not wired to anything yet - see "Known gaps" | - |
| uiConfirm | scene calls: Title start, Pause resume, GameOver confirm | none |

## Deviations from the specs, and why

1. **`SaveSettings` gained `muted: boolean`, and `master`/`music`/`sfx` defaults changed from
   `1`/`1`/`1` to `80`/`70`/`100`.** `ARCHITECTURE.md` section 12 only fixed the settings *shape*
   (`{ master, music, sfx, reduceMotion, keys }`), not a scale or defaults, and nothing in the
   codebase read these fields before this milestone (grepped to confirm). `docs/specs/M5-audio.md`
   explicitly specifies "0 to 100 ... default 80/70/100" and "`M` toggles mute" persisted alongside
   the volumes, so the old `1`/`1`/`1` values (clearly meant as a 0-1 gain scale, from before any
   spec fixed the actual scale) were updated to match.
2. **`src/audio/` is a new top-level folder**, alongside `src/core/audio.ts`. `ARCHITECTURE.md`
   section 2 only lists `core/audio.ts` in its folder tree (predating this milestone), but
   `docs/specs/M5-audio.md` explicitly directs "`src/audio/music.ts` ... `src/audio/music-data.ts`",
   splitting the sequencer/data out from the engine/SFX file. Same situation M4 already
   documented for `fx/transitions.ts` (a file the architecture doc's fixed list didn't anticipate,
   added anyway because the milestone spec called for it).
3. **`hop`, `nearMiss`, `tick`, `levelClear`, `powerup` play centre-panned (`pan = 0`).** These
   `GameEvent` variants carry no `x`/`row` (`ARCHITECTURE.md` section 9's own shapes: `{ type:
   'hop'; dir; forward }`, `{ type: 'nearMiss'; combo }`, `{ type: 'tick' }`, etc.), so there's
   nothing to pan from. Not worth widening those event shapes for a panning nicety this milestone
   didn't ask for.
4. **Ambient `horn` is a global timer panned to a random column, not tied to an actual road lane's
   position.** The spec says "random road lane every 6 to 12s, panned"; wiring a real per-lane
   trigger would mean threading lane state from `game/lanes.ts` into a new event (the same kind of
   plumbing M4's report flagged and deferred for the turtle-dive ripple case), which felt like more
   than an ambience flourish justified. `PlayScene.enter`/`exit` gate it on/off so it's silent
   outside actual gameplay (title/pause/game-over).
5. **World 4's "random drip" notes aren't stored in `music-data.ts`.** They're explicitly
   *random* per the spec's own wording ("random 'drip' sine notes"), which doesn't fit the
   "write each pattern as arrays" model the rest of section 3 describes - fixed data can't be
   random. `music.ts`'s scheduler picks two fresh random steps at the start of every bar instead
   (`scheduleDrip`), for world 4 only.
6. **`pad` is exempt from the "every note in the world's scale" pattern validation** (`bass`/
   `lead`/`bell` are checked; `kick`/`snare`/`hat` are exempt as fixed drum placeholders, per the
   spec's own note-number requirement even for percussion). World 3's pad progression is
   explicitly `i, VI, III, VII (Fm, Db, Ab, Eb)` over an *F dorian* scale (F G Ab Bb C **D** Eb) -
   that VI chord (Db) is the classic natural-minor borrowed-vi, a semitone below dorian's own raised
   6th (D). World 4's pad similarly holds a literal Gm7 (G **Bb** D F) over *D dorian* (D E F G A
   **B** C), where dorian's own iv7 would be Gmaj7, not Gm7. Both are exactly as the spec's
   prose names them, and both are ordinary, idiomatic modal-mixture harmony (a very common
   "brighter dorian melody over a borrowed minor-key chord loop" technique) - not a typo. Chords
   carry harmonic colour, not melody, so `pad` isn't held to strict scale membership; the actually-
   melodic lines (`lead`, in particular, which arpeggiates those same bars) use the scale's own
   diatonic tones instead of the pad's borrowed ones (e.g. world 3's lead plays dorian's D, not the
   pad's Db, for that bar - see the comments in `music-data.ts`).
7. **`AudioEngine` factory interface removed; `core/audio.ts` is a self-subscribing singleton
   module** (`init`, `playSfx`, `setMasterVolume`, ...), not an instantiable object returned from
   `createAudioEngine()`. The M0-M2 stub used a factory, but nothing besides `main.ts` ever called
   it, and the milestone's own model for this ("the fx modules are the model for how to subscribe")
   is exactly the plain-module-with-singleton-state pattern every `fx/*.ts` file already uses.
   Matching it kept `music.ts` (which is unambiguously a singleton - only one sequencer exists)
   consistent with its sibling.

## Known gaps

- **`uiMove` has no trigger yet.** The spec's own trigger for it is "menu navigation," and there is
  no navigable menu in the game yet (the settings screen is explicitly M8). The recipe is
  implemented and audition-able (`window.__rr.audio.play('uiMove')`); M8 just needs to call
  `playSfx('uiMove')` from its menu's up/down handlers.
- **`results` (from the SFX table's `croak` row: "title start, results") has no scene yet** - same
  reason, results is M8 territory per `ARCHITECTURE.md` section 2's scene list. `croak` fires
  correctly on every *other* title entrance (e.g. Game Over -> confirm -> Title); only the very
  first title screen at boot has no sound, and that's a genuine autoplay-policy limit (no
  AudioContext exists before the first gesture), not a gap this milestone could close.
- **Reviewer's "dev key to jump levels" (acceptance #3) doesn't exist.** `level.ts`'s
  `makeClassicLevel` always produces `world: 1` - worlds 2-5 have no level data until M6, so there's
  nothing to jump *to* via real gameplay. Substituted with `window.__rr.audio.music.play(2..5)` /
  `.play(1)` from the console to audition each world's music and its crossfade directly - verified
  working for all five worlds plus title mode (see below). `PlayScene.update` also already checks
  for a level's world changing and re-calls `music.play`, so the real mechanism is in place for M6
  to use without touching `audio`/`music` again.
- **Pan for events with no position (`hop`, `nearMiss`, `tick`, `levelClear`, `powerup`) is fixed
  centre** - see "Deviations" #3.
- **No fade/duck when the tab is backgrounded** beyond what `core/loop.ts` already does (pausing
  the fixed step); the AudioContext itself is left running (browsers auto-suspend it eventually).
  Not asked for by this spec.

## How this was verified

`npm run typecheck`, `npm run lint`, `npm test` (8 files, **82 tests** - 68 carried over from M0-M4
plus 14 new in `tests/music.test.ts`: step-duration/BPM, MIDI-to-frequency including octave
doubling, and pattern validation for all five worlds plus two deliberately-invalid patterns), and
`npm run build` all pass clean. `npm run lint` has one pre-existing warning in `scripts/review.mjs`
(a `console.log` the harness needs for its JSON output; `no-console` allows `warn`/`error` only) -
unrelated to this milestone, not a new one (the file also had 14 `no-undef` *errors* before this
change, from `process`/`window`/`console` never being declared as globals for a Node/Playwright
script; fixed with the same `/* global ... */` convention `scripts/playbot.js` already uses, no
logic changes).

Runtime verification used a dev server on port 5174 (`npm run dev -- --port 5174`, stopped before
finishing - confirmed nothing is listening on it anymore), never touching the reviewer's own server
on 5173:

1. **Interactive Browser pane**: confirmed the "tap for sound" hint renders top-left and
   disappears the instant a real click fires `resume()` (`window.__rr.audio.started` flips
   `false` -> `true`), confirmed `window.__rr.audio.sfxNames` lists all 20 names, and triggered
   every one via `window.__rr.audio.play(name)` with zero console errors. Continuous gameplay
   through this pane hit the same `requestAnimationFrame`-throttling issue `docs/specs/M4-report.md`
   already documented (the tab stalls `world.elapsed` between tool calls), so real playthrough
   verification moved to headless Playwright, same as M4.
2. **Headless Playwright** (temporary scripts at the project root, deleted afterward - Node's
   module resolution needs `playwright` in the tree that has it, same constraint M4's report
   documented; `package.json`/`package-lock.json` are unchanged, confirmed via `git status`):
   - `node scripts/review.mjs --url http://localhost:5174 --secs 20` (the actual reviewer harness,
     unmodified logic) ran a full playthrough with zero console errors: score 550, one home filled,
     one squish death.
   - A longer 25s run plus a forced `timeLeft = 4.5` (to reach `timerLow`/`tick`/timeout without
     waiting out a full level) produced, with zero errors throughout: `window.__rr.audio.started`
     `false` before the first `Enter` keypress and `true` after it (confirms the lazy-unlock gesture
     requirement); real gameplay firing `hop` (31), `landGround` (21), `landPlatform` (10), `squish`
     (4, matching 4 real deaths), `streakUp` (6), `nearMiss` (1), `home` (2), `horn` (ambient,
     several), `uiConfirm` (title-start), and `tick` (1, from the forced low timer) - i.e. every
     event that actually fired during play produced exactly one SFX voice, confirming "every event
     fires a voice" per the acceptance note. `window.__rr.audio.activeVoices` was 0 at the end (no
     leaked/stuck voices).
   - `window.__rr.audio.music.setIntensity(1)` and the read-back getter, `setVolumes({...})` +
     confirming the write landed in `localStorage['ribbit-rush.v1'].settings`, `toggleMute()`, and
     pressing `KeyM` twice (toggling `window.__rr.audio.muted` true then false) - all correct, zero
     errors.
   - A fresh `localStorage.clear()` + reload confirmed first-write defaults are exactly
     `master: 80, music: 70, sfx: 100, muted: false`.
   - `window.__rr.audio.music.play(2)` through `.play(5)`, then back to `.play(1)`, then
     `.play(1, true)` (title mode) - each produces `music.playing === true` / `music.world`
     matching the request within the 800ms crossfade window, zero errors, for every one of the
     five worlds plus title mode.
3. **Listening**: not done. This environment has no audio output device reachable from either the
   headless Playwright runs or the interactive Browser pane, and headless Chromium itself produces
   no audible output regardless (per this milestone's own instructions). Everything above verifies
   *that* a voice starts (graph wiring, envelopes that don't throw, no double-frees, correct event
   -> SFX mapping) but not how it actually sounds. Fable (or the reviewer, on a machine with audio
   output) should do a real listen-through as the first check - see below.

## What the reviewer should listen for first

1. Load the title screen - a small 🔈 "Tap for sound" hint should sit in the top-left corner and
   disappear the moment you press a key or click; world 1's music should start immediately after,
   at the slightly slower title tempo with no drums.
2. Press start - the music should crossfade to the full world-1 arrangement (kick/snare come in)
   without a gap or click.
3. Hop around: a short rising-then-falling "boop" per hop, a soft thud landing on ground vs. a
   slightly different thud on a log/turtle, a "bonk" walking into a hedge, a splash on drowning, a
   squish on a car hit.
4. Let the timer run under 5 seconds: the music should audibly brighten/speed up slightly
   (`setIntensity`'s filter-opening + tempo bump) and a tick should play once per second.
5. Die: the music should audibly muffle (lowpass duck) for about a second, then return to normal
   as a fresh attempt starts.
6. Fill a home slot: a triangle arpeggio (a brighter version if it was a fly-occupied slot); clear
   all five for the full fanfare.
7. `M` should mute everything instantly (music included) and unmute back to the same levels.
