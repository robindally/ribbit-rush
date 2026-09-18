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

export interface MoverDef {
  offset: number; // tiles, in [0, period)
  width: number; // tiles
  type: MoverType;
  dive?: DiveDef; // turtles only
}

export type LaneKind = 'road' | 'river' | 'rail' | 'median' | 'bank' | 'home';

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

// --- Levels (section 10) ---

export interface LevelDef {
  id: string;
  world: 1 | 2 | 3 | 4 | 5;
  index: number; // 1..3 within the world
  name: string;
  timeLimit: number; // seconds per frog
  lanes: LaneDef[];
  homes: { crocChance: number; flyChance: number };
}
