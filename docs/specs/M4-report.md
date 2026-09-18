# M4 report: Juice

Implemented by the Sonnet engineer against `docs/specs/M4-juice.md`, `docs/ARCHITECTURE.md`
sections 4/7/9, `docs/ART_BIBLE.md` sections 3/5/8, `docs/PLAN.md` section 2.3, and
`docs/specs/M3-report.md` (render pipeline, `anim.ts`, the theme system). Not committed - Fable
reviews and commits.

## What was built

Every item in `PLAN.md` section 2.3 is now visible: squash-and-stretch was already in from M3;
this milestone adds dust, ripples, splash+bubbles, squish specks/tyre marks, screen shake,
hit-stop, slow motion, floating score popups, confetti + fireflies, the iris scene wipe, camera
punch, near-miss, and the streak multiplier.

### 1. `src/fx/` (new directory, five files)

Everything here is a module-level singleton that self-subscribes to `gameEvents` at import time -
gameplay in `src/game/` never imports or calls into `fx/`, matching the milestone rule.

- **`particles.ts`.** A fixed 400-slot pool (`PARTICLE_POOL_SIZE`), each slot the literal shape the
  spec lists (`x, y, vx, vy, life, maxLife, size, color, gravity, shape, alphaCurve`) plus a few
  additive fields the spec's own bullets need: `w`/`h` (confetti rects and the tyre-mark streaks
  aren't square), `rotation`/`angularVelocity` (confetti "spin"), `maxAlpha` (dust's "60% alpha"
  before the curve's own fade), and `wobble`/`phase` (firefly sine-drift + alpha pulse). `acquire()`
  scans for a free slot and returns `null` when the pool is full - spawning then either logs a dev
  warning and drops the particle (structurally, the cap can never be exceeded) or, for the stress
  helper, is simply never called past 400. A dev-only per-frame check (`import.meta.env.DEV`)
  additionally asserts `activeCount <= 400` every `update()`, per acceptance #2. All seven emitters
  from spec section 1 are implemented (`dust`, `ripple`, `splash`, `squish`, `homeBurst`,
  `levelClearFireflies`, `bonk`) and wired to the `GameEvent`s listed under "Deviations" below.
  Colours are bible tokens only: `eyeWhite` (dust - see "greyish white" below), `ink` (squish
  specks and the tyre-mark decal), `gold` (bonk sparks - see below), and the current world's
  `waterLight`/`accentA`/`accentB` for everything water- or confetti-related, tracked via
  `setPalette()` (called once per fixed step by `PlayScene`, since `GameEvent` itself carries no
  theme data - that's a rendering concern, not a gameplay one). Rendered with interpolation: each
  particle keeps `px`/`py` (previous fixed-step position) and `render(r, alpha)` lerps between them
  - the one place in this codebase that actually uses the frame's `alpha` (movers and the frog
    still render the latest fixed-step state directly; see "Deviations" below).
- **`shake.ts`.** Trauma model exactly per spec: decays 1.5/s, offset `trauma^2 * 6px` in x/y from
  two independent cheap sine-sum pseudo-noise streams, plus a `trauma^2 * 0.5deg` rotation. Death
  +0.5, home +0.2, bonk +0.1. `applyCamera`/`restoreCamera` wrap a canvas transform around the play
  layers only. **Camera punch (spec section 9) lives in this file too**, not a sixth `fx/` file -
  see "Deviations".
- **`hitstop.ts`.** A hard pause (death, 80ms) and a slow-motion scale (level clear, 0.3x for
  400ms), both halved under reduce-motion. `tick(realMs)` is called once per animation frame by
  `core/loop.ts` (see below); `isPaused()`/`getTimeScale()` are what the loop consults.
- **`popups.ts`.** Rises 24px, fades over 700ms, Fredoka 600 18px cream/ink-outline (reuses
  `Renderer.text`'s existing outline support), capped at 12 with the oldest dropped. Subscribes to
  `score` (using the event's `label`, added at every emission site - see below) and `extraLife`.
- **`transitions.ts`.** The iris wipe: a circle mask that shrinks to a focus point (the frog, or
  screen centre) over 350ms, swaps the scene behind the fully-closed mask, then expands over the
  new scene; reduce-motion swaps this for a 150ms fade. Not `GameEvent`-driven - see "Deviations".

### 2. `src/core/loop.ts` - hit-stop/slow-motion integration

`ARCHITECTURE.md` section 4 already described this ("`hitstop.ts` can pause simulation for N ms
while rendering continues"; "`timeScale` multiplies dt for slow motion") as the loop's own
anticipated behaviour, so the fixed-step loop now consults `fx/hitstop.ts` once per animation
frame: a hard pause skips the fixed-step block entirely for that frame (the accumulator doesn't
advance either, so the same interpolated frame keeps rendering - that **is** the freeze); a slow-mo
scale instead multiplies the `dt` handed to `scene.update()` on every fixed step, without changing
how many steps run per real second.

### 3. Near-miss (`src/game/world.ts`)

`World` now arms a `{ row, x, expiresAt }` watch on every `onLanded()` whose *vacated* row
(`frog.fromRow`) was a road lane, and checks it every simulation step in `update()` via the same
`vehicleHits` helper collision already uses. A hit clears the watch and calls `triggerNearMiss()`:
`advanceNearMissCombo` (pure, exported) chains combos within 2s of the previous one, `nearMissCount`
(run stat, for a future game-over screen) increments, and `score` is `50 * combo * streakMultiplier`
with label `` `CLOSE CALL! +${delta}` `` (see "Deviations" for why the multiplier is folded in here).
The watch is cleared on death and on respawn so a stale tile from a previous attempt/row can never
fire late.

### 4. Streak multiplier (`src/game/scoring.ts`, wired from `src/game/world.ts`)

`StreakState`/`advanceStreak` is a pure state machine (see the doc comment in `scoring.ts` for the
full rule set) advanced once per hop *landing* in `onLanded()`, using `frog.facing` (still the
just-completed hop's direction) to classify it forward/backward/side and `world.elapsed` as the
clock. `streakMultiplier(streak) = min(4, 1 + floor(streak / 3))`. The multiplier is applied to hop
points, home points, and near-miss points (not the fly or level-clear bonuses, per spec section 6),
and a `score` popup with label `` `x${multiplier}` `` (delta 0, bypassing `addScore`'s extra-life
bookkeeping) fires the instant the multiplier rises. The HUD (`render/draw/hud.ts`) shows it as a
gold badge beside SCORE: a quick pulse on change, settled at 25% alpha at x1, full alpha otherwise.

### 5. Event shape changes (`src/game/types.ts`)

`bonk`, `land`, and `extraLife` gained `x`/`row` (they carried none before, but every M4 emitter
needs a spawn position, and `land` itself wasn't even being emitted before this milestone), and a
`tick` variant was added per spec section 8. See "Deviations" for the reasoning on each.

### 6. Dev hook (`src/scenes/play.ts`)

`window.__rr` keeps `world`/`scenes` unchanged and gains `fx: { particles, popups, stress() }` -
`particles`/`popups` are live getters (`fx.getActiveCount()` / `fx.getCount()`), `stress()` fills
the particle pool to 400 for perf testing (see below). `PlayScene` also now wraps the play layers
(static layer, water, movers, frog, particles, popups) in `shake.applyCamera`/`restoreCamera`
before drawing the HUD, and renders `transitions` last, full-screen, unaffected by shake.

## Particle count under stress

`window.__rr.fx.stress()` fills the pool to exactly **400** and holds there - `acquire()` returning
`null` past that point is the only way the count could exceed the cap, and nothing in `particles.ts`
bypasses it. Verified via a temporary headless Playwright script (see "How this was verified" below):

```json
{ "stress": 400 }
```

## Frame time with 400 particles alive

Same method as `docs/specs/M3-report.md`: `window.__rr.fx.stress()` to fill the pool, then
`PlayScene.update`/`render` timed with `performance.now()` for 4s of real play at normal speed
(traffic, water, and 400 decaying-but-pool-still-mostly-full particles all rendering every frame):

```
elapsed: 4005.6 ms, 241 frames -> 60.17 fps
update(): avg 0.029 ms, p95 0.10 ms, max 0.20 ms (241 samples)
render(): avg 0.30 ms,  p95 0.50 ms, max 0.70 ms (241 samples)
particles remaining at end of the 4s window: 394 (natural pool decay, not a leak)
```

60Hz holds comfortably - `render()` (now including all 400 particles plus everything M3 already
drew) still costs under 2% of the 16.67ms frame budget.

## How this was verified

The interactive Browser pane throttles `requestAnimationFrame` to near-zero once idle between tool
calls (`document.hidden` reports `false` but `requestAnimationFrame` callbacks simply stop firing) -
the exact issue `docs/specs/M3-report.md` documented for continuous-play testing. Driving gameplay
through it produced a frog stuck mid-hop for real seconds at a time (confirmed live: `world.elapsed`
advanced during the brief post-interaction window, then flatlined, and a `requestAnimationFrame`
probe registered zero callbacks over a full second of wall time). Screenshots, the stress test, and
the frame-time measurement instead used a temporary headless Playwright script against the real dev
server on port 5174 (the reviewer's own server on 5173 was left untouched) - `npm install --no-save
playwright` (removed again afterward; `package.json`/`package-lock.json` are unchanged, confirmed
via `git status`), the script itself lived briefly at the project root as `.tmp-m4-capture.cjs`
(deleted afterward, never committed) since Node's module resolution needs it inside the tree that
has `node_modules/playwright`. It used `window.__rr` to force specific scenarios (a stationary car
on a lane, an empty river lane, etc. - the same technique `tests/nearmiss.test.ts` uses, just against
the live game instead of a hand-built `LevelDef`) rather than relying on random traffic to eventually
produce each screenshot. The dev server was stopped (`taskkill` on the listening PID) before
finishing; `netstat` confirms nothing is listening on 5174 anymore.

## Deviations from the specs, and why

1. **Camera punch (spec section 9) lives in `fx/shake.ts`, not a sixth `fx/` file.**
   `ARCHITECTURE.md` section 2 fixes the `fx/` file list at `particles.ts`/`shake.ts`/`popups.ts`/
   `hitstop.ts`. Punch is a few lines of easing math sharing the exact same "small transform on the
   play layers" concern as shake, so it shares `shake.ts`'s `applyCamera`/`restoreCamera` pair
   instead of adding a file the architecture doc doesn't list.
2. **`transitions.ts` is a fifth `fx/` file, added anyway, and it doesn't self-subscribe to
   `GameEvent`.** Spec section 7 ("Iris wipe between scenes") and PLAN.md 2.3 ("Smooth scene
   transitions") are real M4 deliverables with nowhere else to live - they're presentation, not
   gameplay, and `ARCHITECTURE.md`'s fixed list predates this milestone's scope. Unlike the other
   four files, it has no reference to `SceneManager` (that interface is deliberately minimal:
   `replace`/`push`/`pop`/`current`, nothing event-driven) and scene navigation isn't itself a
   `GameEvent`. Scenes already call `render/anim.ts` and `render/draw/*` directly for their own
   presentation - "fx subscribes to GameEvent" is a rule about `game/` never doing so, not about
   scenes - so `title.ts`, `play.ts`, and `gameOver.ts` call `transitions.play()` at the exact
   points where a `GameEvent` (`gameOver`) or a player input already triggers a scene change, and
   every scene ticks `transitions.update`/`renders transitions.render` each frame so the module's
   singleton state (which outlives any one scene instance) keeps animating across the swap.
   `PauseScene` deliberately does **not** get an iris (push/pop is a dim overlay, not a scene swap,
   and its own `update()` is already documented as "frozen while paused").
3. **`GameEvent` gained fields (`bonk`/`land`/`extraLife` now carry `x`/`row`) and a variant
   (`tick`).** Every M4 emitter needs a spawn position and `bonk`/`land`/`extraLife` had none before
   (and `land` was declared in `types.ts` but never actually emitted anywhere pre-M4 - grepped to
   confirm). `tick` is exactly what spec section 8 asks for, for M5's audio to subscribe to later;
   it and `timerLow` currently have zero subscribers (audio is still the M5 no-op stub), which is
   expected and not a bug.
4. **Near-miss score is `50 * combo * streakMultiplier`, not just `50 * combo`.** Spec section 5's
   own formula (`delta = 50 * combo`) predates section 6 ("Applies to hop points, home points, and
   near-miss points"); section 6 is the more specific, later rule, and the popup label is built from
   the same `delta` so what's displayed always matches what's actually scored.
5. **Home score's popup label is the real delta (e.g. `+130`), not a fixed `+50`.** `homeScore()` is
   `50 + 10 * floor(timeLeft)`, so it's essentially never exactly 50; the spec's label list ("+10",
   "+50", ...) reads as format examples (hop vs. home vs. fly vs. level-clear), consistent with hop's
   own "+10" already being dynamic once a multiplier applies (e.g. "+20" at x2). Every popup label is
   built from the literal score delta being applied at that call site.
6. **Dust colour is `eyeWhite` (#FFFFFF) at 60% base alpha, not a new "greyish white" hex.** No
   bible token is literally grey-white; white at 60% alpha over a road/median tile reads as the
   described pale grey without inventing a colour outside the bible.
7. **Bonk sparks are `gold` (#FFC83D), not a dedicated "star" colour.** The `Particle.shape` union
   the spec gives is `'circle' | 'rect' | 'ring' | 'streak'` - no `'star'` - so bonk's "3 tiny stars"
   render as small spinning gold rects. Gold is an existing global bible token ("bonuses, clock");
   nothing in the bible names a colour for this specific effect.
8. **Squish/splash emitter choice mirrors `render/anim.ts`'s existing death-tween dispatch, not a
   new mapping.** `frogDeathVisual` already splits every `DeathCause` into the squish tween
   (`squish`, `croc`, `hedge`, `occupied`, `snake`, and `timeout` after its blink phase) or the
   drown tween (`drown`, `offscreen`); `particles.ts`'s `death` handler uses the identical split so
   the particle effect always matches the sprite animation playing at the same moment.
9. **`homeBurst` fires on every `home` event (each slot filled), not only on `levelClear`.**
   The spec gives `homeBurst(x, y, a, b)` no explicit trigger sentence (unlike dust/ripple/splash/
   squish, which each have one); PLAN.md 2.3 pairs "micro-punch on reaching home" with a burst-style
   celebration per landing, and `levelClearFireflies()` is the separate, explicitly-named
   level-complete effect, so the two read as distinct: a small burst per frog home, a bigger flourish
   once the level clears.
10. **Camera punch's ease curve is a judgment call.** "Scale to 1.02 for 120ms with ease-out" doesn't
    say whether it settles at 1.02 or returns to 1.0. Implemented as ease-out up over the first 40%
    of the 120ms, ease back down over the rest - a quick, symmetric "punch" rather than a step change
    that would otherwise need a second, unspecified transition back to 1.0.
11. **A handful of otherwise-unspecified numbers**, each picked to read clearly rather than derived
    from the spec: the ripple ring's starting radius (`TILE * 0.16`), the level-clear punch duration
    (reuses home's 120ms - only its *scale*, 1.04, is specified), and the `'late'` alpha curve's
    knee (opaque until 70% of life, fades over the remaining 30%).
12. **Particle interpolation is real; mover/frog interpolation still isn't.** Spec section 1
    explicitly asks for particles to be "rendered with interpolation," so `particles.render` is the
    one call site in this codebase that uses the frame's `alpha` for anything. Movers and the frog
    still render the latest fixed-step position directly (`PlayScene.render`'s `alpha` parameter was
    unused, prefixed `_alpha`, before this milestone) - that gap predates M4 and fixing it wasn't in
    scope; renaming the parameter and threading it through `particles.render`/`popups` render was.

## Known gaps

- **Turtle sink/rise and rain-drop ripples** (spec section 1's `ripple` bullet: "log landing, turtle
  sink and rise, rain drops on water") - only the log-landing trigger (via the `land` event,
  `surface: 'platform'`) is wired. Turtle dive is a continuous per-mover animation state
  (`render/anim.ts`'s `turtleVisual`), not a discrete `GameEvent`, and rain doesn't exist yet (world
  1 is `weather: 'clear'`; rain lands with M6). Wiring the turtle case cleanly would need per-turtle
  dive-state-transition tracking threaded from `game/lanes.ts` into a new event, which felt like
  more plumbing than the milestone's juice checklist asked for - worth a follow-up once M6's weather
  system needs the rain case anyway.
- **`reduceMotion` is read once at boot**, per spec section 10 ("M8 builds the UI; for now read it
  from save and default false"). `hitstop`/`shake`/`transitions` all expose `setReduceMotion()`, so
  M8 only needs to call it again on a settings change - no other wiring required.
- **Near-miss count and streak are tracked (`world.nearMissCount`, `world.streak`) but not yet shown
  anywhere.** `ART_BIBLE.md` section 9 lists "near-miss count, streak best" on the game-over screen,
  which is `docs/specs/M8-ui-input.md` territory; the data they need already exists on `World`.
- **Audio hooks fire correctly with no listener** (`tick`, `timerLow`, `bonk`, `land`, etc.) - `M5`
  wires up the SFX synth against these; nothing here needed to change for that.
- Everything M3's own "Known gaps" already listed and this milestone didn't touch (dusk/night/rain/
  fog/snow rendering, gamepad/touch exercise) is still open, unchanged.

## Command output

`npm run typecheck`, `npm run lint`, `npm test` (7 files, **68 tests** - 51 carried over from M0-M3
plus 17 new: 9 streak-state tests in `tests/scoring.test.ts`, 4 pure `advanceNearMissCombo` tests
and 4 `World`-integration near-miss-window tests in the new `tests/nearmiss.test.ts`), and
`npm run build` all pass clean.

## Screenshots

`docs/screens/m4-dust.png`, `m4-splash.png`, `m4-squish.png`, `m4-nearmiss.png` - captured at native
624x720 via the headless Playwright script described above, each forcing the relevant scenario
through `window.__rr` rather than waiting on random traffic:

- **m4-dust**: hop from the start bank onto the median - a "+10" popup and the ground-landing dust
  puff, mid-fade.
- **m4-squish**: a stationary car placed on the frog's road tile - the flattened squash tween, the
  dark tyre-mark decal streak, and the squish specks.
- **m4-splash**: the frog placed on open water with no platform - the sinking/fading drown tween
  with bubble rings visibly rising around it.
- **m4-nearmiss**: a car timed to cross the tile the frog just vacated - the "CLOSE CALL! +50" popup
  rising above the frog.
