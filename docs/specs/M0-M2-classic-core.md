# Spec M0 to M2: Classic core

Goal: a complete, fair, playable classic Frogger with placeholder graphics, built on the
architecture in `docs/ARCHITECTURE.md`. Read that file and `docs/PLAN.md` sections 2.1 and 5
before writing code. Do not add art, audio, or juice; later milestones do that on top of this.

Project folder: `E:\Games\frogger` (already contains `docs/` and `PLAN.md`).

## Deliverables

### Scaffold (M0)

- `package.json` with scripts: `dev`, `build`, `preview`, `test` (vitest run), `typecheck`
  (tsc --noEmit), `lint`. Dev dependencies: vite, typescript, vitest, eslint, prettier, and the
  minimal eslint config for TypeScript. Dependency: `@fontsource/fredoka`.
- `tsconfig.json` strict, `moduleResolution: bundler`, target ES2022.
- `vite.config.ts` with `base: './'` so the build works from any static host.
- `index.html`: dark page background (#14162B), the canvas centred, no scrollbars, a
  `<meta name="viewport">` for phones, touch-action none on the canvas.
- `src/main.ts` boots: renderer, sprites (a placeholder set is fine), input, save, scene manager,
  starts the loop with the Title scene.
- `core/loop.ts`, `core/input.ts`, `core/events.ts`, `core/rng.ts`, `core/save.ts` per the
  architecture doc. `core/audio.ts` may be a stub exporting a no-op engine for now.
- `render/renderer.ts` with DPR-aware letterboxed canvas and the helper methods. `render/sprites.ts`
  loading any SVGs in `assets/sprites` (add one placeholder `frog-idle.svg`, a simple green circle,
  so the pipeline is exercised).
- `.gitignore` (node_modules, dist), `.prettierrc`, eslint config.

### Playable road (M1)

- `game/constants.ts`, `game/types.ts`, `game/frog.ts`, `game/lanes.ts`, `game/collision.ts`,
  `game/level.ts` (`makeClassicLevel`), `game/scoring.ts`, `game/world.ts`.
- Frog hops with the 110 ms tween, one-deep input buffer, bounds and hedge blocking, snapping on
  land rows.
- Five road lanes from the classic table below. Vehicles wrap with the period rule. Squish death
  on overlap using the hitbox rule.
- Timer per attempt from `timeLimit`, expiry kills with cause `timeout`.
- Lives (3 to start), extra life at every 20,000 points, Game Over at zero.
- Homes: landing in an empty slot fills it and scores; filling all five clears the level and loads
  `makeClassicLevel(n + 1)`. Landing on an occupied slot is death. Croc-in-slot and fly-in-slot
  are rolled per attempt from `homes.crocChance` and `flyChance` (croc and fly each appear in one
  random empty slot for 4 to 8 s at a time, then clear). Landing on a croc slot is death with cause
  `croc`; landing on a fly slot scores +200.
- Scoring: 10 per hop that reaches a new `maxRow`, 50 per home plus 10 per second remaining,
  1,000 for clearing all five.

### River (M2)

- Five river lanes from the table: logs of widths 2, 3, 4 and turtle groups of 2 and 3.
- Riding: frog on a platform moves with it. Off either edge while riding is death `offscreen`.
- Landing in water with no platform under the centre is death `drown`.
- Turtle dive state machine per the architecture doc; from level 2 one turtle group per lane
  dives. A frog on a turtle that reaches `down` drowns.

### Classic lane table (level 1 values, speeds in tiles/s, positive = right)

| Row | Kind | Speed | Period | Movers |
| --- | --- | --- | --- | --- |
| 2 | river | +1.6 | 16 | log w4 at 0, log w4 at 8 |
| 3 | river | -1.2 | 15 | turtle group w2 at 0, w2 at 5, w2 at 10 (dive on the group at 10 from level 2) |
| 4 | river | +2.4 | 18 | log w3 at 0, log w3 at 9 |
| 5 | river | -1.0 | 14 | log w2 at 0, w2 at 4.5, w2 at 9 |
| 6 | river | +1.4 | 16 | turtle group w3 at 0, w3 at 8 (dive on the group at 8 from level 2) |
| 8 | road | -2.2 | 16 | truck w2 at 0, truck w2 at 8 |
| 9 | road | +1.5 | 15 | car at 0, car at 5, car at 10 |
| 10 | road | -3.0 | 17 | sports at 0, sports at 8.5 |
| 11 | road | +1.2 | 16 | bus w2 at 0, bus w2 at 6, bus w2 at 12 |
| 12 | road | -1.6 | 14 | car at 0, taxi at 4.5, car at 9.5 |

Level n multiplies every speed by `1 + 0.12 * (n - 1)`. `timeLimit` is `max(18, 30 - (n - 1) * 1.5)`.
`crocChance` is `min(0.6, 0.15 * (n - 1))`, `flyChance` 0.35.

### Scenes

- Title: game name "RIBBIT RUSH" in a large font, hi-score, "Press any key or tap to start".
- Play: grid and HUD (score, hi-score, level top; lives and a timer bar bottom).
- Pause: overlay with "Paused", resume on pause key or confirm.
- Game Over: final score, hi-score updated in save, confirm returns to Title.

### Placeholder rendering

Flat colours only: grass #6BCB5A, road #4A4E57 with dashed lane lines, median #C9C2B0, water
#3F9BE0, home row #2F8A48 with lighter slot squares, vehicles as rounded rects in distinct colours,
logs brown rounded rects, turtles green circles (dim while diving), frog a green rounded square with
two white eyes. Draw the hop arc by offsetting the frog upward by `sin(pi * hopT) * 0.4 * TILE`.

## Tests (Vitest, in `tests/`)

- lanes: wrap and period, mover positions at t, platform lookup, vehicle hit detection.
- turtle: dive cycle timings and `isPlatform` per state.
- frog: hop bounds, hedge blocking, snapping on land rows only, buffer executes exactly one hop.
- scoring: forward hop scoring only on new maxRow, home bonus, level clear bonus, extra life at 20k.
- world: a scripted run that hops straight up on a safe timeline reaches a home and increments score.

## Acceptance

1. `npm install`, `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` all pass.
2. `npm run dev` serves the game; a level is clearable by hand with keyboard.
3. Frog never dies on a platform that is visibly under it, and always dies in open water.
4. Vehicles never pop or jump when wrapping.
5. Holding a direction does not auto-repeat hops; one press is one hop, with one buffered.
6. Resizing the window keeps the whole grid visible and sharp.

## Handoff

When done, write `docs/specs/M0-M2-report.md`: what was built, any deviation from the architecture
and why, how to run, and known gaps. Do not commit; Fable commits after review.
