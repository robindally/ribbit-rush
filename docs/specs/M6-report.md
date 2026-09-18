# M6 report: Worlds

Implemented by the Sonnet engineer against `docs/specs/M6-worlds.md`, `docs/LEVELS.md`,
`docs/ART_BIBLE.md` sections 3/4/6/7, `docs/ARCHITECTURE.md` sections 6/7/10, and
`docs/specs/M3-report.md`/`M4-report.md`/`M5-report.md` (render pipeline, `themes.ts`, the fx
modules, the audio hooks). Not committed - Fable reviews and commits.

## What was built

Every deliverable in the spec: the M6 data model (killer movers in any lane kind, floes, oil,
trains, jet skis/otters/snakes), all 15 campaign levels transcribed from `docs/LEVELS.md`, the
post-15 Endless-adjacent loop, full lighting/weather rendering for all five worlds, twelve new
sprites plus a motorbike touch-up, the level intro card, the dev level-jump hook, and the audio
safety limiter + world 3/4 gain trim.

### 1. Data model (`src/game/types.ts`, `docs/ARCHITECTURE.md` sections 6/7/9/10)

- `MoverType` gained `'jetski'` (`'otter'`/`'snake'` were already present).
- `MoverDef.speed?: number` overrides the lane's own speed for one mover (jet skis, otters,
  snakes riding a different speed than the logs/turtles sharing their lane) - `game/lanes.ts`'s
  `moverSpeed(lane, mover)` is the single place that resolves it, used everywhere a mover's
  velocity matters (stepping, platform-ride speed, headlight-cone facing, killer/train timing).
- `MoverDef.floe?: FloeState` (`{ standingT: number; state: 'solid' | 'cracking' | 'sunk' }`) -
  mutable runtime state, unlike the time-pure `DiveDef`, since a floe's crack timer depends on how
  long *this frog attempt* has stood on *this floe instance*.
- `LevelDef.hazardTiles?: { col; row; type: 'oil' }[]`.
- `GameEvent` gained `oilSlide` (`x`/`row`/`fromX`/`fromRow`, for the renderer's 90 ms tween) and
  `trainWarning` (`row`).
- `docs/ARCHITECTURE.md` sections 6, 7, 9, and 10 updated to match (it had already been partially
  pre-updated for M6 - `MoverDef.speed` and the `snake`/`otter` types were already there, but
  `'jetski'` and the floe/oil/killer/train-warning behaviour notes weren't).

### 2. Mechanics (`src/game/collision.ts`, `src/game/lanes.ts`, `src/game/world.ts`)

- **Killer movers, any lane kind.** `collision.ts` adds `KILLER_TYPES` (every vehicle type plus
  `jetski`/`otter`/`snake`), `isKillerType`, `killerHitType`/`killerHits` - a lane-kind-agnostic
  hitbox check, unlike the existing road-only `vehicleHits` (left untouched; its own tests still
  pin its old road-only behaviour). `world.ts`'s `resolveRowHazard` runs the killer check *before*
  the river platform/drown check, on both the landing resolution and the continuous idle check, and
  the mid-air `hopT >= 0.5` check now also uses `killerHitType` instead of `vehicleHits` - so a
  killer sharing a river lane with a log/turtle still kills a riding frog, and it can even land the
  kill a hair early mid-hop, matching how vehicles already behaved. `snake` maps to the (previously
  unreachable) `DeathCause: 'snake'`; every other killer with no dedicated cause (jetski, otter)
  falls back to `'squish'` - see "Deviations" below.
- **Train + crossing warning.** `lanes.ts`'s `secondsUntilLeadingEdgeEnters(lane, mover, cols)` is a
  pure function of the mover's *current* stored offset (no elapsed-time parameter, unlike turtle
  dive) that finds the next moment the leading edge reaches the screen-entry boundary, correctly
  distinguishing "approaching" from "just exited, waiting to wrap" via modular arithmetic (see
  "A bug I found and fixed" below). `isTrainWarningActive` wraps it at `TRAIN_WARNING_S = 1.5`.
  `World.updateTrainWarnings()` fires `trainWarning` once per approach (edge-detected via a
  per-row `Set`, cleared when the level changes). `render/draw/entities.ts`'s `drawRailSignals`
  reads the same pure function every frame to flash the `crossing-signal` sprite's lamps.
- **Floe.** `lanes.ts`'s `stepFloeState(floe, dt, riding)` is the pure solid→cracking→sunk
  machine (`FLOE_CRACK_S = 2`, `FLOE_SINK_S = 0.4`); `stepLane` detects a wrap (the raw
  pre-`wrapValue` offset landing outside `[0, period)`) and resets the floe to `solid` right there.
  `world.ts`'s `resolveRowEffects` advances it while the frog idles on one, drowning the frog the
  instant it reaches `sunk`.
- **Oil.** `World.applyOilSlide()` reuses `frog.ts`'s `computeHopTarget` - relaxed from taking a
  full `Frog` to taking `{ x, row }` (any `Frog` still satisfies it structurally) - to slide the
  frog one further tile in the just-completed hop's own direction, with the same bounds/hedge
  blocking a real hop gets. The post-slide tile is hazard-checked too ("the slide can land the frog
  under a vehicle; that is the point"). Emits `oilSlide`; `PlayScene` doesn't currently consume it
  for a visual tween - see "Known gaps".
- **Tram/train rendering.** `train` composes as `train-engine` + `train-car` + `train-car` (flipped
  order for leftward lanes); any road lane carrying a tram, and the world 5 `rail` lane itself, get
  two rails-and-sleepers (`rail.svg`, tiled) baked into the per-level static layer.
- **Fog.** `render/draw/weather.ts`'s `fogEntityAlpha(weather, moverCol, frogCol)` is a pure
  function (1.0 within 4 tiles, ramping to 0.35 over a 1-tile band, flat 0.35 beyond) that
  `entities.ts`'s `drawLaneMovers` multiplies into every sprite's draw alpha when the active
  theme's weather is `'fog'`.

### 3. Levels (`src/game/level.ts`)

`makeClassicLevel` is gone; `getLevel(n: number): LevelDef` builds all 15 campaign levels from
`docs/LEVELS.md`'s tables. Each world's three levels are written out as their own `LaneSeed[]`
tables (a small `ln()`/`mv()` DSL, not hand-rolled objects) rather than a patch-cascade, so every
level is directly comparable row-by-row against its `docs/LEVELS.md` bullet - but every lane speed
`docs/LEVELS.md` doesn't explicitly restate for that level is written as `<base value> * <that
level's speed mult>` (a literal multiplication expression, not a pre-computed decimal), so the
arithmetic is guaranteed correct by the engine, not by hand. Explicitly-stated new/replaced-lane
numbers (a motorbike lane's own stated speed/period, a killer's own stated speed) are written
literally. `DIFFICULTY_SPINE` holds the croc chance/fly chance/time limit per level from the
"Difficulty spine" table. Levels 7-9 also carry `hazardTiles`, cumulative per `docs/LEVELS.md`'s
"add ..." wording. Past level 15, `getLevel` cycles world 5's levels 13/14/15 with every lane speed
(and killer/platform `speed` override) scaled up 5% per full 3-level loop, per spec section 6.
`World.jumpToLevel(n)` / `window.__rr.jumpToLevel(n)` (DEV) jump straight to any level; the dev-only
"press `L` then up to two digits" shortcut lives in `PlayScene` (`src/scenes/play.ts`).

### 4. Themes (`src/game/themes.ts`)

No changes needed - `WORLD_THEMES` already had every world's `timeOfDay`/`weather`/`tint` filled
in from M3 (world 1 was the only one *exercised*, but the data was already complete per the M3
spec's "the structure must be data-driven now"). Verified all five against the bible table again;
matches exactly.

### 5. Lighting and weather (`src/render/draw/lighting.ts`, `src/render/draw/weather.ts`, both new)

- **Lighting.** `drawLighting(r, theme, lanes)`: applies `theme.tint` via `multiply` whenever it's
  set (world 1 has none - literal "Day: nothing"; world 5 is `timeOfDay: 'day'` but still carries a
  tint for its snow atmosphere, per the bible's own per-world table - see "Bible rules I found
  ambiguous"), then layers dusk's warm water-band gradient or night's "lighter" pass (headlight
  cones, taillight glow, glowing lily pads, streetlamp pools) depending on `timeOfDay`. Every
  gradient (dusk band, headlight cone - cached **by vehicle type** per the spec, taillight glow,
  streetlamp pool) is built once, lazily, in module-level `Map`/singleton caches, and repositioned
  per instance with `ctx.translate`/`ctx.rotate` - never recreated per frame.
- **Weather.** `updateWeather(weather, dt)` / `drawWeather(r, theme)`: rain (120 streaks, ripples via
  the existing `fx/particles.ripple` - render code calling `fx/` directly for presentation is the
  established M4 precedent - puddles, static per-level via a seeded RNG), fog (two drifting tint
  bands, 30 fireflies), snow (80 flakes with sine wobble). All three respect `reduceMotion` (halves
  counts, via `setReduceMotion`, wired from `main.ts` alongside the other fx modules).

### 6. New sprites (`assets/sprites/`)

`jetski.svg`, `otter.svg`, `snake.svg`, `tram.svg`, `train-engine.svg`, `train-car.svg`,
`floe-2.svg`, `floe-3.svg`, `streetlamp.svg`, `crossing-signal.svg`, `rail.svg`, `oil.svg` - twelve
files, every hex value a bible token verbatim or a stated shade of one (see "Deviations" for the
one open question: jet ski has no bible-table entry at all). Floe crack lines are drawn in code
(`entities.ts`'s `drawFloeCracks`) over the static sprite, only while `state === 'cracking'`, so one
rasterised sprite serves every crack state.

### 7. Motorbike touch-up (`assets/sprites/motorbike.svg`)

Per spec section 5: the two shoulder ellipses now sit at the helmet's own y (12), to its left
(x=18.5/22.3, helmet at x=27) - no rotation, not stacked diagonally down toward the tank as the
pre-M6 file had them.

### 8. Level intro card (`src/scenes/levelIntro.ts`, new)

World name, "LEVEL N", up to four hazard icons for that level's `docs/LEVELS.md` "New thing"
column, 1.2 s or until any input. Renders the frozen `PlayScene` underneath (same pattern as
`PauseScene`) plus a dim overlay and a cream/accent-stripe card. `PlayScene` pushes it once on
`enter()` and again any time `world.levelNumber` changes mid-scene (level clear or a dev jump),
detected right after `world.update()` in the same tick.

### 9. Audio limiter and world 3/4 trim (`src/core/audio.ts`, `src/audio/music-data.ts`)

A `DynamicsCompressorNode` (threshold -6 dB, knee 6, ratio 12, attack 0.003, release 0.1) now sits
between `master` and `context.destination`. World 3's pad velocity (0.45 → 0.095 per chord tone)
and lead/arpeggio velocity (0.6 → 0.22) were trimmed, plus - not named in the milestone note, but
failing the same general bar, see "Deviations" - world 4's pad velocity (0.45 → 0.08 per chord
tone, four simultaneous tones vs. world 3's three). See "Audio before and after" below for the
full measurements.

## Audio before and after

Measured with `scripts/audio-probe.mjs` (extended to loop all five worlds, not just 1/3/5, and to
take a `--url` flag) against a dev server on port 5174:

```
node scripts/audio-probe.mjs --url http://localhost:5174
```

| World | Peak before | RMS before | Peak after | RMS after |
| --- | --- | --- | --- | --- |
| 1 Sunny Suburb | 0.774 | 0.0652 | 0.77-0.87 | 0.077-0.085 |
| 2 Coastal Highway | 0.573 | 0.0794 | 0.72 | 0.096-0.098 |
| 3 Neon City | 1.542 | 0.2839 | 0.87-0.88 | 0.096-0.098 |
| 4 Misty Marsh | 1.616 | 0.3564 | 0.35-0.37 | 0.089 |
| 5 Frozen Fjord | 0.787 | 0.0586 | 0.80-0.87 | 0.074-0.083 |

All five worlds now land inside peak < 0.9 and RMS 0.06-0.11 across repeated runs (small
run-to-run drift, ~±0.05-0.1, comes from the probe's own coarse 40 ms-interval peak sampling, not
audio instability - confirmed by re-running world 1, whose pattern data has no randomness at all,
and seeing the same drift). No console errors in any run.

**The compressor alone was not enough.** Before any gain trim, adding just the limiter took world
3 from 1.542/0.2839 to 1.075/0.3163 peak/RMS and world 4 from 1.616/0.3564 to 1.057/0.3394 - both
still over budget, because a fast-but-nonzero-attack compressor can't fully catch a single-sample
constructive-interference spike from several simultaneous detuned oscillators (world 3's pad is 3
chord tones × 2 detuned saws = 6 oscillators; world 4's is 4 × 2 = 8), and RMS is dominated by the
*sustained* chord, which the compressor's release (0.1 s) only partially tames between hits. The
gain trim on top of the limiter is what actually got both worlds under budget.

## Frame time, world 3, rain + lights

```
node scripts/m6-perf.mjs --url http://localhost:5174 --secs 5
```

At level 7 (world 3's first level - night, rain, headlight cones, glowing lily pads, streetlamp
pools, tram rails, oil decals, all on screen with real traffic):

```
{ "frames": 301, "secs": 5, "avgFrameMs": 16.666, "p95FrameMs": 16.8, "maxFrameMs": 16.8, "fps": 60 }
```

A solid 60 fps with no dropped frames over 5 s and zero console errors, measured by wrapping
`requestAnimationFrame` from outside the page (no dependency on any internal class name, so it
works regardless of which scene is current) rather than patching a specific scene's
`update`/`render` as M3/M4's reports did - simpler, and answers the same question ("is the loop
holding 60 Hz").

## Screenshots

`docs/screens/m6-world1.png` through `m6-world5.png` (each world's first level, level 1/4/7/10/13),
`m6-night-lights.png` and `m6-rain.png` (both level 7, the only night+rain world - headlight cones,
taillight glow, glowing lily pads, streetlamp pools, rain streaks and puddles all visible together),
plus `m6-level-intro.png` (the level intro card) captured for the record. All via
`node scripts/m6-screens.mjs --url http://localhost:5174` and
`node scripts/m6-intro-card.mjs --url http://localhost:5174` against a dev server on port 5174 -
the reviewer's own 5173 was never touched, and the 5174 server was stopped before finishing
(confirmed via `netstat`).

## Playthrough check

`node scripts/m6-playthrough.mjs --url http://localhost:5174 --secs 14` ran the existing
`scripts/playbot.js` heuristic bot on all 15 levels via `window.__rr.jumpToLevel`, 14 s each,
`lives = 99` so it doesn't get cut short by a game over. Zero console errors across every level (no
crashes from any M6 mechanic - killers-on-platforms, floes, oil, the rail lane). The bot made
forward progress (at least one home filled) on 11 of 15 levels within the window; levels 3, 9, 10,
and 15 saw it die repeatedly without filling a home.

**Caveat on reading this data:** the bot's own `killer()`/`roadSafe()`/`riverSafe()` heuristics (in
`scripts/playbot.js`, unmodified this milestone) don't know about oil slides or floe cracking at
all - it can walk into what looks like a safe tile and get pushed by an oil slide into a vehicle, or
sit on a floe until it sinks, purely because the bot has no model for either mechanic. So a level
where the bot struggles isn't automatically "unfair" for a human, who sees the oil decal and the
floe's crack animation. I did not smoke-test a human playthrough of all 15 levels (would need a
real play session, not a headless run) - see "Known gaps".

**One level worth a second look, with a suggested tweak (table not changed):** level 10 (world 4's
*first* level, nominally the easiest of the three) had the bot fail to fill a single home, same as
the genuinely-hardest levels 3/9/15. World 4 introduces its median snake right at level 10 with no
easier lead-in (unlike, say, world 1's motorbike lane, which arrives at level 3 after two levels to
get comfortable), and fog's visual fade doesn't help a bot reading raw data but *does* reduce a real
player's advance warning of the median row's occupant. If this reads as unfair in a real playtest,
a possible tweak would be widening the median lane's `period` slightly (giving a longer safe window
between snake passes) specifically at level 10, or moving the snake's introduction to level 11
instead and easing world 4 in with just fog+wildlife-free traffic at level 10 - but per the spec,
I have not touched `docs/LEVELS.md` or the level tables themselves.

## Deviations from the specs, and why

1. **A bug I found and fixed in my own first draft of `secondsUntilLeadingEdgeEnters`.** My first
   version checked "is `x + width >= 0`" to mean "already visible/entered." That's wrong for a
   mover that's the *only* (or widest) mover in its lane: with `width === laneMaxWidth`, `x + width`
   simplifies to `offset` directly, which is `>= 0` for the mover's *entire* period except a single
   instant right after it wraps - meaning the naive check reported "already entered" for the whole
   multi-second gap where the train has fully exited on one side and is still travelling, invisible,
   toward re-entering the other. Rewritten to find the next `offset` (mod period) where the leading
   edge sits exactly on the entry boundary and convert that angular distance to seconds - correct
   whether currently approaching, mid-crossing (a large "next lap" answer, always outside the 1.5 s
   window), or already past and waiting to wrap. Caught by my own unit tests before this ever
   reached `World`; see `tests/lanes.test.ts`.
2. **Jetski/otter/snake widths not given everywhere `docs/LEVELS.md` introduces them.** Explicit
   widths appear for the median snake (`w1.5`) and are used as the standard snake width throughout
   (matching bible section 4's "Snake (1.5x1)"); otter uses bible's explicit "Otter (1x1)". Jet ski
   has no width in either doc and no bible-table entry at all (the vehicle table stops at `train`) -
   used width 1 (a fair, dodgeable hitbox at the jet ski's high stated speeds) and its own body
   colour reuses the `sports` car's teal, the closest existing "sporty water-adjacent" token,
   documented in `assets/sprites/jetski.svg`'s own comment.
3. **Jetski/otter kill with `DeathCause: 'squish'`, not a new cause.** The architecture doc's
   `DeathCause` union is fixed; only `snake` already existed as an M6-relevant value. Grouped with
   vehicles as "a solid hit," matching the M0-M2/M3 precedent of falling back to `squish` for any
   undocumented cause (the same reasoning `render/anim.ts`'s `frogDeathVisual` already documents).
4. **Level 9's "every turtle group dives... phases spread 0, 1.5, 3" for five groups, three phase
   values.** Read as a cyclic assignment across all five groups (row 3's three plus row 6's two) in
   row-then-offset order: 0, 1.5, 3, 0, 1.5. Documented at the point of use in `level.ts`.
5. **Speed-mult interpretation: base-table (carried-over) lane speeds scale by the level's mult;
   explicitly-restated new/replaced-lane numbers are literal, and further un-restated levels carry
   the *literal* value forward rather than re-multiplying it.** `docs/LEVELS.md`'s per-level bullets
   sometimes give an exact new number (a motorbike lane's speed/period) and sometimes don't (a
   lane's width/offset change with no new speed given). Read the former as already-final,
   hand-tuned numbers (no further scaling - there's no "base" to scale, since they're new at that
   level) and the latter as inheriting the base row's value times that level's mult. This is a
   genuine judgment call on an underspecified point; see `src/game/level.ts`'s header comment for
   the full reasoning and every level's data for the worked-out numbers.
6. **`docs/LEVELS.md`/`ARCHITECTURE.md`'s own `period >= COLS + widest mover` rule doesn't hold for
   several lanes exactly as the level tables are written** - world 1's rows 2 and 5 (already true
   since before this milestone, in the pre-existing classic level table these tables are transcribed
   from), world 1 level 3's/world 2 level 5-6's/world 5 level 15's motorbike lanes (period
   12-13 vs. a 13.6 requirement), world 3's row 5 (all three levels), and world 5's row 6 (level 13
   only - level 14 fixes it by shrinking the row to width 3). I verified by hand (and the render/
   collision math confirms) that every shortfall is a sub-1.6-tile sliver: the practical effect is
   at most a fraction of a tile of the *same* mover simultaneously visible at both screen edges for
   an instant, reading as one copy exiting while the next enters - not a visible glitch, and not
   something I'll fix by changing the level data without sign-off. `tests/level.test.ts` asserts the
   invariant for every level with an explicit, cited allowlist of these exact cases (and a tolerance
   cap), so a *new* violation (a future typo) still fails loudly.
7. **World 4's pad also got trimmed, not just world 3's.** The milestone's own audio-fix note names
   only world 3, but my probe run found world 4 clipping *harder* (1.616 peak / 0.3564 RMS vs. world
   3's 1.542/0.2839) - it holds a four-tone chord (Dm7/Gm7) vs. world 3's three-tone chord, so more
   simultaneous detuned oscillators. Fixed it with the same technique (trim the pad's per-voice
   velocity) since it fails the same general "RMS 0.06-0.11, peak < 0.9" bar the milestone states.
8. **Rain ripples and puddles reuse `fx/particles.ripple` directly from `render/draw/weather.ts`**,
   not a parallel particle system - `fx/` code being called directly by render/presentation code (as
   opposed to reacting to `GameEvent`s) is the established M4 precedent (`fx/transitions.ts`).
9. **Floe crack lines are drawn in code, not baked into `floe-2.svg`/`floe-3.svg`.** The spec's
   sprite section describes the crack paths as part of the sprite files; since the sprite pipeline
   rasterises one bitmap per named sprite (no state variants), a single sprite can't itself show
   "cracks only while cracking." Drawn as three canvas strokes over the base sprite, gated on
   `mover.floe.state === 'cracking'`, in `render/draw/entities.ts`.
10. **Crossing signal posts + rail-and-sleeper texture are baked into the per-level static layer**
    (`buildStaticLayer` now takes the whole `LevelDef`, not just a seed, so `road.ts` can read which
    lanes are `rail`-kind or carry a tram); only the flashing red lamp overlay is drawn dynamically
    per frame (`entities.ts`'s `drawRailSignals`), since that's the only part that actually changes
    moment to moment.
11. **`scripts/audio-probe.mjs` gained a `--url` flag and now loops all five worlds** (was
    hardcoded to `localhost:5173` and only sampled worlds 1/3/5) - needed both to point it at a
    non-reviewer dev server and to verify all five worlds, not just the three the milestone
    happened to mention. Also fixed a pre-existing lint error in it (`Float32Array` redeclared in
    its `/* global */` comment, already a core JS global) while touching the file.
12. **Four new one-off scripts** (`scripts/m6-screens.mjs`, `m6-perf.mjs`, `m6-playthrough.mjs`,
    `m6-intro-card.mjs`), not deleted after use, following `review.mjs`/`audio-probe.mjs`'s own
    conventions (`--url`/`--secs` flags, `page.on('console'/'pageerror')` error capture) rather than
    throwaway temp files, so the reviewer (or a future milestone) can re-run any of them directly.

## Bible rules I found ambiguous

1. **"Day: nothing" (bible section 7) vs. world 5 having a `tint` value despite being
   `timeOfDay: 'day'`.** Read as: the per-world palette table's `tint` column is a general ambient
   overlay applied via `multiply` whenever present, regardless of exact time-of-day category; "Day:
   nothing" describes the *absence of any extra effect layer* beyond that base tint (world 1's own
   tint is genuinely `none`, so it really does get nothing). This is the only reading that makes
   world 5's tint value in the bible's own table meaningful at all.
2. **Streetlamp/crossing-signal exact screen position.** "At both ends of the median"/"at both ends
   of the rail lane" doesn't give exact pixel placement. Placed at the first/last column centres
   (0.5 and COLS-0.5 tiles) rather than half off-canvas at columns -0.5/COLS+0.5, so they're fully
   visible rather than clipped.
3. **Jet ski hitbox width** - see "Deviations" #2 above; no bible or `docs/LEVELS.md` value given.
4. **Ice floe visual reads a little more like a drifting ice-cap/cloud shape than jagged pack ice**
   at the sizes shown - "irregular rounded polygon" is honoured literally, but it's a soft
   organic blob rather than sharp ice. A quick pass with sharper facets would sell "ice" more
   strongly; flagged for Fable's screenshot review rather than iterated further given the milestone's
   scope.

## Known gaps

- **`oilSlide` GameEvent has no visual consumer yet.** The gameplay slide is instant (correct for
  collision purposes - the post-slide tile is hazard-checked the same tick); the event carries
  everything a renderer would need for the spec's "90 ms tween (no arc)," but `PlayScene` doesn't
  currently subscribe to it, so an oil slide reads as an instant teleport rather than a quick slide
  on screen. Worth a follow-up; low risk since it's presentation-only (gameplay resolution is
  already correct and tested).
- **No real human playthrough of all 15 levels** - the playthrough check (see above) is an
  automated heuristic-bot smoke test (catches crashes/errors, gives a rough survivability signal),
  not a fairness judgment; the bot has no model for oil or floes at all. Fable (or the reviewer)
  should spend a few minutes on levels 3, 9, 10, and 15 in particular.
- **Ice floe art reads soft/cloud-like** - see "Bible rules I found ambiguous" #4.
- **`docs/ARCHITECTURE.md` section 9's `GameEvent` code block was already stale before this
  milestone** (missing `bonk`/`land`/`extraLife`'s `x`/`row` fields and the `tick` variant, from
  M4/M5). Added M6's two new variants with a note rather than fully re-syncing the whole block,
  which is unrelated pre-existing drift.
- Everything M3/M4/M5's own "Known gaps" already listed and this milestone didn't touch (results
  scene, settings UI, `uiMove` trigger, gamepad/touch exercise) is still open, unchanged.

## Command output

`npm run typecheck`, `npm run lint` (0 errors, 6 pre-existing-style `no-console` warnings in
one-off `.mjs` scripts - same pattern M5's report already documented for `review.mjs`), `npm test`
(9 files, **127 tests** - 82 carried over from M0-M5 plus 45 new: floe/train/killer pure-logic
tests in `tests/lanes.test.ts`, oil/killer/train-warning `World` integration tests in
`tests/world.test.ts`, and the full `tests/level.test.ts` suite for `getLevel`), and `npm run
build` all pass clean. No git commit made, per instructions.
