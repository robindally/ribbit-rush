# Spec M4: Juice

Goal: every action has feedback. Implement the checklist in `docs/PLAN.md` section 2.3 and the
animation rules in `docs/ART_BIBLE.md` section 5 that M3 left out (particles, shake, hit-stop,
popups, transitions), plus the near-miss and streak systems. Read `docs/ARCHITECTURE.md` sections
4 and 9: everything here subscribes to `GameEvent` and lives in `src/fx/`. Gameplay in `src/game/`
only gains the near-miss and streak logic.

## 1. Particles (`fx/particles.ts`)

- Pooled, cap 400, updated in the fixed step, rendered with interpolation.
- Particle: `{ x, y, vx, vy, life, maxLife, size, color, gravity, shape: 'circle' | 'rect' | 'ring' | 'streak', alphaCurve: 'linear' | 'late' }`. Rings grow from `size` to `size * 3` and fade.
- Emitters, each a function that pushes particles:
  - `dust(x, y)`: 6 circles, greyish white 60% alpha, upward-outward 40 to 80 px/s, gravity 200, life 0.35 s. On every ground landing.
  - `ripple(x, y, color)`: 1 ring, 2 px stroke, life 0.6 s. On log landing, turtle sink and rise, rain drops on water.
  - `splash(x, y)`: 12 `waterLight` droplets up and out 80 to 160 px/s, gravity 500, life 0.5 s; plus 8 bubbles (rings 3 px) rising 30 px/s, life 0.8 s.
  - `squish(x, y)`: 6 dark specks 20 to 50 px/s, life 0.3 s. Plus a decal: two tyre marks (dark 40% alpha, 2 px wide, the width of the lane) drawn under the frog for 1.5 s.
  - `homeBurst(x, y, a, b)`: 12 confetti rects in accentA and accentB, out 100 to 200 px/s, gravity 300, spin, life 0.9 s.
  - `levelClearFireflies()`: 40 small circles in accentA drifting up from the home row with sine wobble, life 2.5 s, pulsing alpha.
  - `bonk(x, y)`: 3 tiny stars, life 0.25 s.

## 2. Shake (`fx/shake.ts`)

Trauma model: `trauma` in [0, 1], decays at 1.5 per second. Offset = `trauma^2 * 6 px` in x and y
driven by two noise streams, plus a 0.5 degree rotation. Death adds 0.5, home adds 0.2, bonk adds
0.1. Applied as a canvas transform to the play layers, not the HUD. Reduce-motion setting disables it.

## 3. Hit-stop and slow motion (`fx/hitstop.ts`)

- Death: 80 ms hit-stop (simulation paused, render continues).
- Final home of a level: `timeScale` 0.3 for 400 ms, then the level-clear flow.
- Reduce-motion halves both.

## 4. Popups (`fx/popups.ts`)

Score popups per bible section 8: text rises 24 px, fades over 700 ms. Labels: "+10", "+50",
"+200 FLY", "CLOSE CALL! +50", "x2", "x3", "x4", "EXTRA LIFE", "+1000". Font Fredoka 600, size 18,
cream with 3 px ink outline. Max 12 on screen; oldest is dropped.

## 5. Near-miss (`game/world.ts`)

After a hop that started on a road row completes, watch the tile the frog just left for 150 ms.
If a vehicle's rect overlaps that tile in that window, emit `nearMiss` with `combo` = the number
of consecutive near-misses within 2 s of each other (starting at 1) and `score` with
`delta = 50 * combo` and label "CLOSE CALL! +N". Count near-misses in the run stats.

## 6. Streak multiplier (`game/scoring.ts`)

- Consecutive forward hops landed less than 350 ms apart build `streak`. A backward hop, a side hop
  that is not followed by a forward hop within 350 ms, an idle gap over 600 ms, or a death resets it.
- `multiplier = min(4, 1 + floor(streak / 3))`. Applies to hop points, home points, and near-miss points.
- Emit `score` popups "x2", "x3", "x4" when the multiplier rises. HUD shows the multiplier as a
  badge beside the score that pulses when it changes and fades when it is x1.

## 7. Transitions

Iris wipe between scenes: a circle mask that shrinks to the frog (or screen centre) over 350 ms,
then expands on the next scene. Reduce-motion uses a 150 ms fade.

## 8. Timer low

Under 5 s: timer bar pulses (already in M3), and a `timerLow` event fires once, then a `tick`
event each second for audio.

## 9. Camera punch

On home: scale the play layers to 1.02 for 120 ms with ease-out. On level clear: 1.04.

## 10. Settings

Add `reduceMotion` to settings (M8 builds the UI; for now read it from save and default false).

## Acceptance

1. Typecheck, lint, tests, build pass. Tests: near-miss window, combo counting, streak and
   multiplier rules.
2. Every emitter fires on its event and the particle count never exceeds 400 (assert in dev).
3. 60 fps holds with 400 particles alive.
4. A short screen recording or a sequence of 4 screenshots in `docs/screens/m4-*.png` showing dust, splash, squish decal, and a near-miss popup.

## Handoff

`docs/specs/M4-report.md`. Do not commit.
