# M0-M2 report: Classic core

Implemented by the Sonnet engineer against `docs/ARCHITECTURE.md` and
`docs/specs/M0-M2-classic-core.md`. Not committed - Fable reviews and commits.

## What was built

A complete, fair, playable classic Frogger (placeholder graphics only) on the Vite/TS/Canvas2D
stack described in the architecture doc:

- **Scaffold (M0):** hand-written `package.json`, `tsconfig.json` (strict, `moduleResolution:
  bundler`, ES2022), `vite.config.ts` (`base: './'`), `index.html` (dark page, centred canvas,
  viewport meta, `touch-action: none`), ESLint 9 flat config + Prettier, `.gitignore`.
  `src/main.ts` boots renderer -> sprites -> input -> save -> scene manager -> loop, starting on
  the Title scene. `assets/sprites/frog-idle.svg` is the one placeholder sprite (a green circle)
  that exercises the SVG-> offscreen-canvas pipeline; gameplay itself is drawn as flat shapes
  (see "Placeholder rendering" below), not sprites, per the spec.
- **Core (`src/core/`):** `loop.ts` (fixed 60 Hz step, 0.25 s frame clamp, `Scenes` stack
  implementing `SceneManager`, pauses on `visibilitychange`), `input.ts` (keyboard
  arrows/WASD/Enter/Space/Escape/P, touch swipe >=24px + tap-hops-up, Gamepad API d-pad/stick
  with a 0.5 deadzone and rising-edge detection so nothing auto-repeats), `events.ts` (generic
  typed pub/sub, instantiated as `gameEvents` and `inputEvents`), `rng.ts` (mulberry32 + a small
  `Rng` helper), `save.ts` (versioned `ribbit-rush.v1` localStorage blob, try/catch guarded),
  `audio.ts` (no-op stub per the spec, ready for M5).
- **Game logic (`src/game/`, canvas/audio-free):** `types.ts`, `constants.ts`, `frog.ts` (hop
  bounds/target computation, snapping, hedge blocking, one-deep hop buffer), `lanes.ts`
  (wrap/period math, turtle dive state machine), `collision.ts` (`platformAt`, `vehicleHits`),
  `level.ts` (`makeClassicLevel`, the exact lane table from the spec), `scoring.ts`, `world.ts`
  (owns frog/lanes/timer/homes/score/lives, `update(dt)`, emits `GameEvent`s, no rendering or
  audio).
- **Rendering (`src/render/`):** `renderer.ts` (DPR-aware letterboxed canvas, `sprite`/`shadow`/
  `text` helpers), `sprites.ts` (`import.meta.glob(..., { query: '?raw' })` -> Blob -> Image ->
  offscreen canvas), `draw/background.ts` (bank/median/home row + hedges + slot squares),
  `draw/water.ts`, `draw/road.ts` (dashed lane lines), `draw/entities.ts` (movers, turtles dimmed
  while down, the frog with the `sin(pi * hopT) * 0.4 * TILE` hop arc), `draw/hud.ts`
  (score/hi-score/level top, lives + timer bar bottom).
- **Scenes (`src/scenes/`):** `title.ts`, `play.ts`, `pause.ts`, `gameOver.ts`, matching the
  four scenes the spec calls for.
- **Tests (`tests/`, Vitest):** `lanes.test.ts`, `turtle.test.ts`, `frog.test.ts`,
  `scoring.test.ts`, `world.test.ts` - 40 tests, all pure logic, no canvas/audio. See "Tests" below.

## Deviations from ARCHITECTURE.md, and why

1. **Hop buffer lives in `world.ts`/`frog.ts`, not the Play scene.** Section 5 of the
   architecture doc says "The Play scene keeps a one-deep hop buffer," but section 13 forbids
   canvas/audio in tests, and the M0-M2 spec explicitly lists "buffer executes exactly one hop"
   as a `frog` test. Scene code can't be unit-tested under that rule, so the buffer
   (`createHopBuffer`/`bufferHop`/`consumeHop` in `frog.ts`) is owned by `World` instead, which
   is plain data/logic and directly testable. Functionally identical from the player's
   perspective. See `tests/frog.test.ts` for the buffer tests.
2. **`render/draw/` only has `background.ts`, `water.ts`, `road.ts`, `entities.ts`, `hud.ts`.**
   The architecture's folder layout also lists `fx.ts` and `lighting.ts` under `draw/`, and a
   top-level `fx/` folder (particles, shake, popups, hitstop), plus `game/powerups.ts` and
   `game/themes.ts`. All of those are explicitly later milestones (M4 juice, M6 worlds, M7
   power-ups) and the spec says "Do not add art, audio, or juice." I omitted the files rather
   than stub them, since a `fx.ts` with nothing in it isn't more useful than not having it -
   happy to add empty stubs instead if you'd rather have the full skeleton in place now.
3. **Scenes: only `title.ts`, `play.ts`, `pause.ts`, `gameOver.ts`.** The architecture's folder
   layout also names `levelIntro.ts`, `results.ts`, `settings.ts`, but the M0-M2 spec's "Scenes"
   section only specifies these four, so that's all that's built.
4. **`SceneManager` renders only the top of the stack**, exactly per its interface (`replace`/
   `push`/`pop`/`current`, nothing else). To let Pause show the frozen Play scene beneath its
   dim overlay without adding a method to that interface, `PauseScene` is constructed with a
   reference to the scene it's pausing and calls that scene's own `render()` from inside its
   own - so the interface stays exactly as specified.
5. **`EventBus` (in `core/events.ts`) adds an `onAny` method** beyond the `on`/`off`/`emit` the
   architecture shows for events.ts. This is additive, not a change to `on`/`off`/`emit`'s
   signatures - it's what lets `loop.ts` forward every `InputAction`, regardless of its variant,
   to the active scene's `onAction`, without the loop having to subscribe to each of the five
   action types individually.
6. **`LevelDef.lanes` includes the static home/median/bank rows** (as speed-0, empty-`movers`
   `LaneDef`s with `kind: 'home' | 'median' | 'bank'`), not just the 10 dynamic river/road lanes
   from the spec's table. `LaneKind` already anticipates this. It means `world.laneAt(row)` and
   the renderer can treat every row uniformly instead of special-casing the static ones.

## Assumptions where the spec left specifics open

- **Turtle dive timings.** The spec says a group "dives... from level 2" but doesn't give
  up/down seconds. Used `up: 3s, down: 2s, phase: 0` (`TURTLE_DIVE_UP_S`/`TURTLE_DIVE_DOWN_S` in
  `game/constants.ts`) - enough time up to cross safely, a submerged window that's noticeable but
  not brutal. Easy to retune, it's two constants.
- **Death cause for landing on an already-filled home slot.** The `DeathCause` union
  (`squish | drown | timeout | croc | hedge | snake | offscreen`) has no dedicated value for
  this. Reused `'squish'` as the closest fit rather than extending the union without a spec
  instruction to. Worth a one-line spec update if you want a distinct cause (e.g. `'occupied'`)
  for M3's death-specific FX/SFX.
- **Croc/fly cadence.** The spec says they're "rolled per attempt from `homes.crocChance` and
  `flyChance`" but describes repeated 4-8s occurrences ("at a time"), which reads as a repeating
  process rather than a single roll. Implemented as: once per second (while no croc/fly is
  currently active), roll `chance` via the level's seeded RNG; on a hit, place it in a random
  empty slot for `range(4, 8)` seconds. Both hazards clear on respawn (a fresh attempt gets a
  clean slate; already-`'frog'`-filled slots are untouched).
- **Home-bonus time value.** "50 per home plus 10 per second remaining" - used
  `Math.floor(timeLeft)` seconds so the bonus is a clean integer.

## How to run

```
cd E:\Games\frogger
npm install
npm run dev        # http://localhost:5173
```

Keyboard: arrows or WASD to hop, Enter/Space to confirm, Escape or P to pause. Touch: swipe
>=24px to hop that direction, tap to hop up. Gamepad: d-pad or left stick (0.5 deadzone).

## Command output

### `npm run typecheck`

```
> ribbit-rush@0.1.0 typecheck
> tsc --noEmit

(no output - clean)
```

### `npm run lint`

```
> ribbit-rush@0.1.0 lint
> eslint .

(no output - clean)
```

### `npm test`

```
> ribbit-rush@0.1.0 test
> vitest run

 RUN  v2.1.9 E:/Games/frogger

 ✓ tests/turtle.test.ts (7 tests) 4ms
 ✓ tests/frog.test.ts (11 tests) 5ms
 ✓ tests/lanes.test.ts (10 tests) 6ms
 ✓ tests/scoring.test.ts (11 tests) 4ms
 ✓ tests/world.test.ts (1 test) 4ms

 Test Files  5 passed (5)
      Tests  40 passed (40)
```

### `npm run build`

```
> ribbit-rush@0.1.0 build
> vite build

vite v5.4.21 building for production...
transforming...
✓ 30 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                                        0.93 kB │ gzip: 0.48 kB
dist/assets/fredoka-hebrew-400-normal-CT3eDt6U.woff2    5.06 kB
dist/assets/fredoka-hebrew-400-normal-S03uWvSu.woff     6.48 kB
dist/assets/fredoka-latin-400-normal-17JuUzdy.woff2    16.08 kB
dist/assets/fredoka-latin-400-normal-DbXSrOeS.woff     20.12 kB
dist/assets/index-B8UUVaPl.css                          9.14 kB │ gzip: 6.50 kB
dist/assets/index-CZjCfgi0.js                          21.07 kB │ gzip: 7.96 kB
✓ built in 241ms
```

### `npm run dev` - manual smoke test

Started the dev server and drove it through the Browser pane: Title renders (name, hi-score,
prompt), a key press transitions to Play (grid, HUD, water/road/median/home rendering, movers,
turtles, logs, a fly hazard spawned in a home slot), hopping up scored +10 and moved the frog,
a road-lane collision correctly killed the frog (grey death colour), the death timer respawned
it and decremented a life dot, and Escape correctly pushed the Pause overlay (dimmed, frozen
Play scene beneath, "PAUSED" text). No console errors at any point. Server was stopped
afterward and the port confirmed free.

Note: this Browser-pane tab throttles `requestAnimationFrame` to essentially zero while idle
between tool calls (confirmed directly: a scheduled rAF didn't fire once over 1s of real-time
waiting), so a full 5-home level clear wasn't driven end-to-end through this automation - each
visible state change above happened across separate tool-call boundaries, which is enough to
prove every subsystem (input, collision, scoring, lives, scenes) but not to watch continuous
60fps play. That's a property of the automated tab, not the game; a normal browser tab runs the
loop continuously. Acceptance criterion 2 ("a level is clearable by hand with keyboard") should
be re-checked in a real browser tab during review.

## Known gaps

- Gamepad and touch input are implemented per the architecture but only spot-checked by reading
  the code, not device-tested (no gamepad/touch hardware in this environment).
- No `fx.ts`/`lighting.ts` draw modules, `fx/` folder, `powerups.ts`, `themes.ts`, or the
  `levelIntro`/`results`/`settings` scenes - all explicitly out of scope for M0-M2 (see
  "Deviations" above).
- Rendering is not interpolated by `alpha` (movers/frog are drawn straight from the last fixed
  step). Acceptance criterion 4 ("vehicles never pop or jump when wrapping") holds because the
  wrap math itself has no discontinuity, but 60Hz-stepped-without-interpolation motion is very
  slightly less smooth than the interpolated rendering the architecture's loop section describes.
  Wiring `alpha` through `draw/entities.ts` is a small, isolated follow-up.
- The three open interpretation points above (turtle dive timings, occupied-slot death cause,
  croc/fly cadence) are reasonable defaults, not verified against a reference implementation -
  flag if you want different numbers or a distinct death cause.
