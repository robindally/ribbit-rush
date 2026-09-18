# Spec M6: Worlds

Goal: five distinct worlds with their own palette, time of day, weather, hazards, and the 15
campaign levels from `docs/LEVELS.md`. Read `docs/LEVELS.md` fully (tables and the "new mover and
lane rules" section), `docs/ART_BIBLE.md` sections 3, 4, 6, 7, and `docs/ARCHITECTURE.md`.

## 1. Data model additions (update `game/types.ts` and `docs/ARCHITECTURE.md`)

- `MoverDef.speed?: number` overrides the lane speed for that mover.
- `MoverType` gains `'jetski'`. Killer movers: all vehicle types plus `jetski`, `otter`, `snake`.
  Killers hit on hitbox overlap in any lane kind, even while riding a platform.
- `LevelDef.hazardTiles?: { col: number; row: number; type: 'oil' }[]`.
- `LaneKind 'median'` lanes may carry movers. `'rail'` lanes carry a `train`.
- Floe platform state: `{ standingT: number; state: 'solid' | 'cracking' | 'sunk' }`.

## 2. Mechanics

- **Jet ski, otter, snake.** Killers with their own speed. Snake on the median row is the only
  hazard there; the median stays a `median` lane for snapping purposes.
- **Train.** Width 6, speed from the table. A crossing signal at both ends of the rail lane flashes
  and a `trainWarning` event fires 1.5 s before the train's leading edge enters the screen. The
  rail lane is otherwise safe to stand on.
- **Floe.** Platform. While the frog stands on it, `standingT` accumulates. At 2 s it enters
  `cracking` and sinks over 0.4 s; the frog drowns if still aboard when it reaches `sunk`. A floe
  resets to `solid` once it wraps off screen. Hopping off and back on does not reset `standingT`
  until it wraps.
- **Oil.** Landing on an oil tile slides the frog one more tile in the hop direction with a 90 ms
  tween (no arc), blocked at the grid edge or into a hedge. The slide can land the frog under a
  vehicle; that is the point.
- **Tram.** A width-3 road mover. Draw two rails under any road lane that contains a tram.
- **Fog (world 4).** Visual only. Vehicles and platforms more than 4 tiles from the frog's column
  render at 35% alpha, ramping to 100% within 4 tiles.

## 3. Themes (`game/themes.ts`)

Fill in all five `WorldTheme` entries from the bible table, including `timeOfDay`, `weather`, and
`tint`. The static layer, water, and HUD colours all read from the active theme. Nothing about a
world's look is hard-coded outside `themes.ts` and the draw modules.

## 4. Lighting and weather (`render/draw/lighting.ts`, `render/draw/weather.ts`)

Per bible section 7:

- Dusk: multiply tint, warm band on the water.
- Night: tint, then a `lighter` pass: headlight cones from every vehicle's front (3 tiles, 35% to
  0%), taillight glow, lily pads glow accentB 30%, streetlamps at both ends of the median with a
  2-tile warm pool. Cache each cone gradient by vehicle type.
- Rain: 120 streaks, ripple rings on water and puddles, 3 to 5 puddle ellipses per road row that
  reflect the nearest light colour. Rain is drawn above entities, below the HUD.
- Fog: two drifting translucent bands plus 30 fireflies in accentA drifting and pulsing.
- Snow: 80 flakes with sine wobble.
- All of these respect a `reduceMotion` setting by halving particle counts.

## 5. Sprites (agent-authored, bible section 4)

`jetski` (2x1, body 72 px, faces right, rider, spray drawn in code), `otter` (1x1), `snake`
(2x1, body 72 px S-curve, faces right), `tram` (3x1), `train-engine` (2x1) and `train-car` (2x1)
composed as engine + car + car, `floe-2` (2x1) and `floe-3` (3x1) with three crack paths that are
drawn only in the `cracking` state, `streetlamp` (1x1), `crossing-signal` (1x1, two lights),
`rail` (1x1 tileable), `oil` (1x1 decal, dark iridescent ellipse).

## 6. Levels (`game/level.ts`)

- Replace `makeClassicLevel` with `getLevel(n: 1..15): LevelDef` built from the world base tables
  and per-level modifiers exactly as written in `docs/LEVELS.md`. Keep the data as tables, not
  code, so a designer can read it.
- `LevelDef.world` and `index` drive the intro card and the theme.
- After level 15 the campaign loops at level 13 difficulty with the speed multiplier rising 0.05
  per loop (Endless mode proper is M9).
- Dev only: pressing `L` then a digit or two jumps to that level when `import.meta.env.DEV`.

## 7. Level intro card

Simple version now (M8 polishes): world name, "Level N", and up to four hazard icons for the
new things in this level, shown 1.2 s or until input.

## 8. Tests

- Every level's lanes satisfy `period >= COLS + widest mover`.
- Floe crack timing and reset on wrap.
- Oil slide direction, edge and hedge blocking.
- Train warning fires 1.5 s before entry.
- Snake on the median kills; median snapping still works.
- Killer on a river lane kills a riding frog.

## Acceptance

1. Typecheck, lint, tests, build pass.
2. Screenshots of each world at its first level in `docs/screens/m6-world{1..5}.png`.
3. All 15 levels are completable (use the dev jump; note any that feel unfair in the report with a
   suggested tweak, but do not change the tables without Fable's sign-off).
4. 60 fps in world 3 (rain plus lights) on a laptop.

## Handoff

`docs/specs/M6-report.md`. Do not commit.
