// Shared types used across core/ and game/. See docs/ARCHITECTURE.md sections 5-10.

// --- Input (section 5) ---

export type Dir = 'up' | 'down' | 'left' | 'right';

export type InputAction =
  | { type: 'hop'; dir: Dir }
  | { type: 'confirm' }
  | { type: 'back' }
  | { type: 'pause' }
  | { type: 'any' };

// --- Lanes and movers (section 6) ---

export type MoverType =
  | 'car'
  | 'taxi'
  | 'sports'
  | 'pickup'
  | 'van'
  | 'truck'
  | 'bus'
  | 'motorbike'
  | 'tram'
  | 'train'
  | 'jetski'
  | 'log'
  | 'turtle'
  | 'croc'
  | 'floe'
  | 'snake'
  | 'otter';

/** Turtle dive timings, in seconds. `phase` offsets where in the cycle t=0 starts. */
export interface DiveDef {
  up: number;
  down: number;
  phase: number;
}

/** Floe crack/sink runtime state (M6: docs/specs/M6-worlds.md section 1). Mutable, owned by the
 * `MoverDef` it's attached to - unlike `DiveDef` (a pure function of lane time), this depends on
 * how long *this specific frog attempt* has stood on *this specific floe instance*, so it can't be
 * derived purely from elapsed time. See `game/lanes.ts` (`stepFloeState`) and `game/world.ts`. */
export interface FloeState {
  standingT: number;
  state: 'solid' | 'cracking' | 'sunk';
}

export interface MoverDef {
  offset: number; // tiles, in [0, period)
  width: number; // tiles
  type: MoverType;
  dive?: DiveDef; // turtles only
  /** Overrides the lane's own speed for this mover (M6: jet skis, otters, snakes riding a
   * different speed than the logs/turtles sharing their river lane). */
  speed?: number;
  /** Floes only; mutable runtime state, see `FloeState` above. */
  floe?: FloeState;
}

export type LaneKind = 'road' | 'river' | 'rail' | 'median' | 'bank' | 'home';

// --- Power-ups (M7: docs/specs/M7-powerups-scoring.md section 1) ---

export type PowerupKind = 'shield' | 'freeze' | 'clock' | 'megahop';

export interface LaneDef {
  row: number;
  kind: LaneKind;
  speed: number; // tiles per second, signed
  period: number; // tiles; must be >= COLS + widest mover
  movers: MoverDef[];
}

// --- Frog (section 7) ---

export type FrogState = 'idle' | 'hopping' | 'dying' | 'dead' | 'home';

export type DeathCause =
  | 'squish'
  | 'drown'
  | 'timeout'
  | 'croc'
  | 'hedge'
  | 'snake'
  | 'offscreen'
  | 'occupied';

export interface Frog {
  x: number;
  row: number; // current, x is a float
  fromX: number;
  fromRow: number; // hop start
  toX: number;
  toRow: number; // hop end
  hopT: number; // 0..1
  facing: Dir;
  state: FrogState;
  deathCause?: DeathCause;
  stateT: number; // seconds in current state
  maxRow: number; // furthest row reached this attempt (lowest number)
}

// --- Homes ---

export type HomeSlotState = null | 'frog' | 'croc' | 'fly';

// --- Events (section 9) ---

export type GameEvent =
  | { type: 'hop'; dir: Dir; forward: boolean }
  | { type: 'bonk'; x: number; row: number }
  | { type: 'land'; surface: 'ground' | 'platform'; x: number; row: number }
  | { type: 'death'; cause: DeathCause; x: number; row: number }
  | { type: 'home'; slot: number; timeLeft: number; bonus: boolean }
  | { type: 'levelClear'; level: number }
  | { type: 'nearMiss'; combo: number }
  | { type: 'score'; delta: number; x: number; row: number; label?: string }
  | { type: 'extraLife'; x: number; row: number }
  | { type: 'timerLow' }
  | { type: 'tick' }
  /** Fired when a power-up badge is collected (M7: docs/specs/M7-powerups-scoring.md section 1). */
  | { type: 'powerup'; kind: PowerupKind }
  /** M7: a Bubble Shield cancelled a death - the frog was pushed back to `x`/`row` (its pre-hop
   * tile, or the nearest safe platform if the death was a drown/offscreen). Drives the shield's
   * "pop with a burst" fx and reuses the `powerup` SFX. */
  | { type: 'shieldBroken'; x: number; row: number }
  /** M7: the frog landed on the lady frog's tile and picked her up (now riding its back). */
  | { type: 'ladyFrogPickup'; x: number; row: number }
  | { type: 'gameOver'; score: number }
  /** M6: an oil tile slid the frog one extra tile past its landing spot (docs/LEVELS.md "new
   * mover and lane rules"). `x`/`row` are the frog's post-slide position, `fromX`/`fromRow` its
   * pre-slide landing spot - the renderer tweens between them for the 90ms slide. */
  | { type: 'oilSlide'; x: number; row: number; fromX: number; fromRow: number }
  /** M6: fires once, 1.5s before a rail lane's train leading edge enters the screen
   * (docs/LEVELS.md "new mover and lane rules"). */
  | { type: 'trainWarning'; row: number };

// --- Levels (section 10) ---

export interface LevelDef {
  id: string;
  world: 1 | 2 | 3 | 4 | 5;
  index: number; // 1..3 within the world
  name: string;
  timeLimit: number; // seconds per frog
  lanes: LaneDef[];
  homes: { crocChance: number; flyChance: number };
  /** M6: oil decal tiles - hopping onto one slides the frog one extra tile (docs/LEVELS.md "new
   * mover and lane rules"). */
  hazardTiles?: { col: number; row: number; type: 'oil' }[];
}
