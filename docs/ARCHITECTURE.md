# Ribbit Rush: Architecture

Owner: Fable. Agents implement against these interfaces. Change an interface only when a spec says to.

## 1. Stack

- TypeScript (strict), Vite, no framework, single `<canvas>`, Canvas 2D, Web Audio API,
  localStorage. Vitest for logic tests. ESLint + Prettier. Node 24.
- Do not use the Vite scaffolder (the folder is not empty). Write `package.json`, `tsconfig.json`,
  `vite.config.ts`, `index.html` by hand.
- Fonts: `@fontsource/fredoka`.

## 2. Folder layout

```
frogger/
  index.html
  package.json
  vite.config.ts
  tsconfig.json
  assets/sprites/*.svg        Fable-authored and agent-authored SVG sprites
  src/
    main.ts                   boots the game
    core/
      loop.ts                 fixed-step loop and scene manager
      input.ts                keyboard, touch, gamepad -> actions
      audio.ts                Web Audio engine (SFX synth, music sequencer)
      save.ts                 versioned localStorage
      rng.ts                  seeded RNG (mulberry32)
      events.ts               typed event emitter
    game/
      constants.ts            grid, timing, scoring constants
      types.ts                shared types (below)
      frog.ts                 frog state machine
      lanes.ts                lane simulation, movers, wrap, platforms
      collision.ts            pure collision helpers
      level.ts                level definitions and the classic generator
      scoring.ts              score, lives, multipliers
      powerups.ts             (M7)
      themes.ts               world palettes and weather (M6)
      world.ts                one running level: owns frog, lanes, timer, homes
    render/
      renderer.ts             canvas setup, DPR, letterbox, helpers
      sprites.ts              SVG -> offscreen canvas atlas
      draw/*.ts               background, water, road, entities, fx, lighting, hud
    scenes/
      title.ts, levelIntro.ts, play.ts, pause.ts, gameOver.ts, results.ts, settings.ts
    fx/
      particles.ts, shake.ts, popups.ts, hitstop.ts
  tests/                      Vitest, pure logic only
  docs/                       this folder
```

## 3. Coordinates and grid

- `TILE = 48` logical px. Canvas logical size 624 x 720 (13 x 15 tiles). The renderer scales the
  canvas to fit the viewport preserving aspect, centred, with the backing store at device pixel
  ratio. Portrait-first.
- `COLS = 13`. Rows, top to bottom:

| Row | Meaning |
| --- | --- |
| 0 | HUD top |
| 1 | Home row (5 slots) |
| 2 to 6 | River lanes (5) |
| 7 | Median |
| 8 to 12 | Road lanes (5) |
| 13 | Start bank |
| 14 | HUD bottom |

- `HOME_COLS = [0, 3, 6, 9, 12]`. Columns between slots are hedge. Hopping into a hedge column is
  blocked (no move, a small bonk).
- Frog start: col 6, row 13.
- Positions are in tile units. `x` is a float (left edge of the sprite), `row` is an integer.
  A lane with `speed > 0` moves right.

## 4. Fixed-step loop

- Simulation step `DT = 1/60`. Accumulate real time, clamp a frame to 0.25 s max, run whole steps,
  then render with `alpha = accumulator / DT` for interpolation of movers (each mover keeps `prevX`).
- `hitstop.ts` can pause simulation for N ms while rendering continues.
- `timeScale` (default 1) multiplies dt for slow motion.

```ts
export interface Scene {
  enter?(): void;
  exit?(): void;
  update(dt: number): void;
  render(r: Renderer, alpha: number): void;
  onAction?(a: InputAction): void;
}
export interface SceneManager {
  replace(s: Scene): void;
  push(s: Scene): void;
  pop(): void;
  current(): Scene;
}
```

## 5. Input

```ts
export type Dir = 'up' | 'down' | 'left' | 'right';
export type InputAction =
  | { type: 'hop'; dir: Dir }
  | { type: 'confirm' }
  | { type: 'back' }
  | { type: 'pause' }
  | { type: 'any' };
```

Keyboard: arrows and WASD hop, Enter/Space confirm, Escape/P pause. Match on `e.code`, and fall
back to `e.key` when `code` is empty (some virtual keyboards and automation send no code). Touch: swipe of 24 px or
more in a direction hops, a tap hops up. Gamepad: d-pad and left stick with a 0.5 deadzone and
edge detection. All sources emit `InputAction` through `events.ts`. The Play scene keeps a
one-deep hop buffer.

## 6. Lanes and movers

```ts
export type MoverType =
  | 'car' | 'taxi' | 'sports' | 'pickup' | 'van' | 'truck' | 'bus' | 'motorbike' | 'tram' | 'train'
  | 'log' | 'turtle' | 'croc' | 'floe' | 'snake' | 'otter';

export interface DiveDef { up: number; down: number; phase: number }   // seconds

export interface MoverDef {
  offset: number;        // tiles, in [0, period)
  width: number;         // tiles
  type: MoverType;
  dive?: DiveDef;        // turtles only
  speed?: number;        // overrides the lane speed for this mover (M6: jet skis, otters, snakes)
}

export type LaneKind = 'road' | 'river' | 'rail' | 'median' | 'bank' | 'home';

export interface LaneDef {
  row: number;
  kind: LaneKind;
  speed: number;         // tiles per second, signed
  period: number;        // tiles; must be >= COLS + widest mover
  movers: MoverDef[];
}
```

- A mover's position at time t is `x = wrap(offset + speed * t, period) - maxWidth`, so it enters
  from off-screen. Render and collide at `x + k * period` for k in {-1, 0, 1} where visible.
- Platforms (`log`, `turtle`, `croc`, `floe`) carry the frog: while the frog is idle on a platform,
  `frog.x += speed * dt`.
- Turtle dive state machine: `up` (up s) -> `sinking` (0.5 s) -> `down` (down s) -> `rising`
  (0.5 s). A turtle is a platform unless its state is `down`. Phase offsets the cycle start.
- Lanes are pure: `stepLane(lane, dt)` mutates positions; `platformAt(lane, xCenter)` and
  `vehicleHits(lane, hitbox)` are pure helpers in `collision.ts` and are unit tested.

## 7. Frog

```ts
export type FrogState = 'idle' | 'hopping' | 'dying' | 'dead' | 'home';
export type DeathCause =
  | 'squish' | 'drown' | 'timeout' | 'croc' | 'hedge' | 'snake' | 'offscreen' | 'occupied';

export interface Frog {
  x: number; row: number;            // current, x is a float
  fromX: number; fromRow: number;    // hop start
  toX: number; toRow: number;        // hop end
  hopT: number;                      // 0..1
  facing: Dir;
  state: FrogState;
  deathCause?: DeathCause;
  stateT: number;                    // seconds in current state
  maxRow: number;                    // furthest row reached this attempt (lowest number)
}
```

- Hop duration `HOP_S = 0.11`. Hop targets snap to the nearest tile column on land rows (median,
  banks, home) and keep the continuous x on river rows.
- Bounds: cannot hop below row 13, cannot hop left of x=0 or right of x=12, cannot hop into a
  hedge column of row 1.
- Hitbox for vehicles: `[x + 0.2, x + 0.8]`. Platform test uses centre `x + 0.5`.
- **Hop-time collision rule.** `row` commits to the target at hop start, but while `state ===
  'hopping'`: no platform or drown check at all; vehicle checks run against the target row only
  once `hopT >= 0.5`. On landing (`hopT` reaches 1) run the full row resolution. While idle,
  every step checks vehicles (road) or platform (river). This keeps deaths matching what the
  player sees.
- Death sequence lasts `DEATH_S = 0.9`, then respawn at start with a fresh timer, or Game Over.

## 8. World (one running level)

`world.ts` owns: `frog`, `lanes`, `timer`, `homes: (null | 'frog' | 'croc' | 'fly')[]`,
`score` hooks, and the level definition. It exposes `update(dt)` and emits events. It contains no
rendering and no audio, which keeps it testable.

## 9. Events

```ts
export type GameEvent =
  | { type: 'hop'; dir: Dir; forward: boolean }
  | { type: 'bonk' }
  | { type: 'land'; surface: 'ground' | 'platform' }
  | { type: 'death'; cause: DeathCause; x: number; row: number }
  | { type: 'home'; slot: number; timeLeft: number; bonus: boolean }
  | { type: 'levelClear'; level: number }
  | { type: 'nearMiss'; combo: number }
  | { type: 'score'; delta: number; x: number; row: number; label?: string }
  | { type: 'extraLife' }
  | { type: 'timerLow' }
  | { type: 'powerup'; kind: string }
  | { type: 'gameOver'; score: number };
```

`events.ts` exports a typed `on`, `off`, `emit`. Audio, FX, and popups subscribe. Gameplay never
calls audio or FX directly.

## 10. Levels

```ts
export interface LevelDef {
  id: string;
  world: 1 | 2 | 3 | 4 | 5;
  index: number;              // 1..3 within the world
  name: string;
  timeLimit: number;          // seconds per frog
  lanes: LaneDef[];
  homes: { crocChance: number; flyChance: number };
}
```

`level.ts` exports `makeClassicLevel(n: number): LevelDef` for the core milestones: a fixed lane
table with speed multiplied by `1 + 0.12 * (n - 1)`, turtle diving from level 2, and croc chance
rising with n. World tables replace this in M6.

## 11. Renderer and sprites

```ts
export interface Renderer {
  ctx: CanvasRenderingContext2D;
  width: number; height: number;                 // logical px
  tile: number;
  sprite(name: string, x: number, y: number, opts?: {
    rot?: number; sx?: number; sy?: number; alpha?: number; flipX?: boolean; anchor?: 'center' | 'topleft';
  }): void;
  shadow(x: number, y: number, w: number, h: number, scale?: number): void;
  text(s: string, x: number, y: number, opts?: { size?: number; weight?: number; align?: CanvasTextAlign; color?: string; outline?: string }): void;
}
```

`sprites.ts` imports every SVG in `assets/sprites` with Vite `?raw`, wraps each in an `Image`
via a Blob URL, and draws it to an offscreen canvas at `TILE * dpr` per tile. Sprites are addressed
by file name without extension. Rendering order inside Play: background, water, road, movers
(river rows first, then road rows), frog, particles, lighting, HUD.

## 12. Save

`save.ts` stores a single JSON blob under `ribbit-rush.v1`: `{ hiScore, leaderboard: {name,
score, world, level}[], settings: { master, music, sfx, reduceMotion, keys }, unlocks: string[] }`.
Reads are guarded with try/catch and defaults.

## 13. Testing rules

- Pure logic in `game/` and `core/rng.ts` has Vitest coverage: wrap maths, platform lookup,
  vehicle hits, turtle dive cycle, hop bounds and hedge blocking, scoring and extra lives, timer.
- No canvas or audio in tests.

## 14. Performance rules

- One canvas. Pre-rasterised sprites. No gradient or pattern objects created per frame (cache them).
- Particle cap 400, pooled. Movers pooled per lane.
- `requestAnimationFrame` only. Pause the loop when the tab is hidden.
