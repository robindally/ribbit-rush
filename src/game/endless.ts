// Endless mode's crossing generator. Pure and unit-tested (docs/specs/M9-endless-skins.md
// section 1, docs/LEVELS.md "Endless"). A "crossing" is one generated level: the frog starts at
// the bank and any single home landing ends it - `game/world.ts` never checks "every home filled"
// while `World.mode === 'endless'`, so `homes.crocChance`/`flyChance` are both 0 here (a hazard
// with only a few seconds' dwell time before the crossing resets makes little sense, and
// docs/LEVELS.md's own Endless section never mentions home hazards at all - see the M9 report's
// "Deviations").

import type { Rng } from '../core/rng';
import { COLS, HOME_ROW, MEDIAN_ROW, RIVER_ROWS, ROAD_ROWS, START_ROW } from './constants';
import type { LaneDef, LevelDef, MoverType } from './types';

// --- Difficulty spine (docs/LEVELS.md "Endless") ---

/** `d` starts at 1.2 (crossing 1) and rises 0.04 per crossing thereafter. */
export function endlessDifficultyForCrossing(crossingNumber: number): number {
  const n = Math.max(1, Math.floor(crossingNumber));
  return 1.2 + 0.04 * (n - 1);
}

/** World theme cycles 1 to 5 every 5 crossings, for the look (and the music - `game/world.ts`
 * assigns this straight to the generated `LevelDef.world`, so the existing per-world theme/music
 * pipeline just works, no Endless-specific rendering path needed). */
export function endlessWorldForCrossing(crossingNumber: number): 1 | 2 | 3 | 4 | 5 {
  const n = Math.max(1, Math.floor(crossingNumber));
  return (Math.floor((n - 1) / 5) % 5) + 1 as 1 | 2 | 3 | 4 | 5;
}

/** `max(14, 26 - 2 * (d - 1))`. */
export function endlessTimeLimit(d: number): number {
  return Math.max(14, 26 - 2 * (d - 1));
}

/** A deterministic integer seed from today's UTC date (`YYYYMMDD`), so a "Daily" Endless run seeds
 * identically for every player who starts one on the same UTC day (M9 spec section 1: "a toggle on
 * the Endless start card that seeds the RNG from the UTC date, so friends can compare runs"). Takes
 * `now` so it's directly testable without mocking the system clock. */
export function utcDateSeed(now: Date = new Date()): number {
  return now.getUTCFullYear() * 10000 + (now.getUTCMonth() + 1) * 100 + now.getUTCDate();
}

// --- Speed/period caps (docs/LEVELS.md "Endless") ---

const RIVER_SPEED_MIN = 1.0;
const RIVER_SPEED_MAX = 2.8;
const RIVER_SPEED_CAP = 4.5;
const ROAD_SPEED_MIN = 1.2;
const ROAD_SPEED_MAX = 3.4;
const ROAD_SPEED_CAP = 5.0;
// Not given an explicit cap by docs/LEVELS.md's Endless section (only road/river are capped
// there); trains are the one mover type campaign levels already run faster than the road cap
// (world 5's own -7.0 to -9.1, docs/LEVELS.md "World 5") - capped by analogy to that.
const RAIL_SPEED_CAP = 9.0;

/** `period` must be `>= COLS + widest mover` (docs/ARCHITECTURE.md section 6/`game/types.ts`);
 * shrinks with `d` within that floor. Shared by every lane kind below. */
function shrinkingPeriod(rng: Rng, width: number, d: number): number {
  const base = rng.range(COLS + width + 2, COLS + width + 7);
  const shrink = Math.max(0.6, 1 - (d - 1.2) * 0.12);
  return Math.max(COLS + width, base * shrink);
}

function weightedPick<T>(rng: Rng, entries: { item: T; weight: number }[]): T {
  const total = entries.reduce((sum, e) => sum + e.weight, 0);
  let r = rng.next() * total;
  for (const e of entries) {
    if (r < e.weight) return e.item;
    r -= e.weight;
  }
  return entries[entries.length - 1].item;
}

// --- River lanes ---

interface RiverOption {
  type: 'log' | 'turtle' | 'floe';
  width: 2 | 3 | 4;
  diving?: boolean;
}

// docs/LEVELS.md: "choose from {log w4, log w3, log w2, turtle w3, turtle w2, floe w3, floe w2}
// weighted by d (short and diving options get likelier as d grows)".
const RIVER_OPTIONS: RiverOption[] = [
  { type: 'log', width: 4 },
  { type: 'log', width: 3 },
  { type: 'log', width: 2 },
  { type: 'turtle', width: 3, diving: true },
  { type: 'turtle', width: 2, diving: true },
  { type: 'floe', width: 3 },
  { type: 'floe', width: 2 },
];

function riverOptionWeight(opt: RiverOption, d: number): number {
  let w = 1;
  const grown = Math.max(0, d - 1.2);
  if (opt.width === 2) w += grown * 0.8; // short
  if (opt.diving) w += grown * 0.6; // diving
  return w;
}

const RIVER_KILLERS: MoverType[] = ['jetski', 'otter'];
const RIVER_KILLER_D = 1.8;
const RIVER_KILLER_CHANCE = 0.2;

function makeRiverLane(row: number, d: number, rng: Rng): LaneDef {
  const opt = weightedPick(
    rng,
    RIVER_OPTIONS.map((item) => ({ item, weight: riverOptionWeight(item, d) })),
  );
  const period = shrinkingPeriod(rng, opt.width, d);
  const speed = Math.min(RIVER_SPEED_CAP, rng.range(RIVER_SPEED_MIN, RIVER_SPEED_MAX) * d);
  const sign = row % 2 === 0 ? 1 : -1;
  const count = opt.width <= 2 ? 3 : 2;

  const movers: LaneDef['movers'] = Array.from({ length: count }, (_, i) => ({
    type: opt.type,
    width: opt.width,
    offset: (i * period) / count,
    ...(opt.diving ? { dive: { up: 3, down: 2, phase: (i * 3.5) / count } } : {}),
  }));

  if (d > RIVER_KILLER_D && rng.chance(RIVER_KILLER_CHANCE)) {
    const killerType = rng.pick(RIVER_KILLERS);
    const killerSpeed = Math.min(RIVER_SPEED_CAP, rng.range(2.5, 4.2) * Math.min(1.4, d / 1.6));
    movers.push({
      type: killerType,
      width: 1,
      offset: rng.range(0, period),
      speed: sign * killerSpeed,
    });
  }

  return { row, kind: 'river', speed: speed * sign, period, movers };
}

// --- Road lanes ---

const VEHICLE_WIDTH: Record<string, number> = {
  car: 1,
  taxi: 1,
  sports: 1,
  pickup: 1.5,
  van: 1.5,
  truck: 2,
  bus: 2,
  tram: 3,
};

const WORLD_VEHICLES: Record<1 | 2 | 3 | 4 | 5, MoverType[]> = {
  1: ['car', 'taxi', 'sports', 'truck', 'bus'],
  2: ['car', 'taxi', 'sports', 'pickup', 'van', 'bus'],
  3: ['car', 'taxi', 'sports', 'van', 'tram'],
  4: ['car', 'pickup', 'truck', 'van', 'bus'],
  5: ['car', 'van', 'sports', 'truck', 'bus'],
};

function makeRoadLane(row: number, d: number, rng: Rng, worldId: 1 | 2 | 3 | 4 | 5): LaneDef {
  const type = rng.pick(WORLD_VEHICLES[worldId]);
  const width = VEHICLE_WIDTH[type] ?? 1;
  const period = shrinkingPeriod(rng, width, d);
  const speed = Math.min(ROAD_SPEED_CAP, rng.range(ROAD_SPEED_MIN, ROAD_SPEED_MAX) * d);
  const sign = row % 2 === 0 ? -1 : 1;
  const count = width <= 1 ? 3 : 2;
  const movers: LaneDef['movers'] = Array.from({ length: count }, (_, i) => ({
    type,
    width,
    offset: (i * period) / count,
  }));
  return { row, kind: 'road', speed: speed * sign, period, movers };
}

const MOTORBIKE_W = 0.6;
const MOTORBIKE_D = 1.6;

function makeMotorbikeLane(row: number, d: number, rng: Rng): LaneDef {
  const period = shrinkingPeriod(rng, MOTORBIKE_W, d);
  const speed = Math.min(ROAD_SPEED_CAP, rng.range(2.0, 3.4) * d);
  const sign = row % 2 === 0 ? -1 : 1;
  const movers: LaneDef['movers'] = [
    { type: 'motorbike', width: MOTORBIKE_W, offset: 0 },
    { type: 'motorbike', width: MOTORBIKE_W, offset: period / 2 },
  ];
  return { row, kind: 'road', speed: speed * sign, period, movers };
}

const RAIL_D = 2.0;
const RAIL_CHANCE = 0.1;
const TRAIN_W = 6;

function makeRailLane(row: number, d: number, rng: Rng): LaneDef {
  const periodBase = rng.range(30, 40);
  const period = Math.max(COLS + TRAIN_W, periodBase - (d - 1.2) * 3);
  const speed = Math.min(RAIL_SPEED_CAP, rng.range(5, 8) * Math.min(1.3, d / 2));
  const sign = row % 2 === 0 ? -1 : 1;
  return {
    row,
    kind: 'rail',
    speed: speed * sign,
    period,
    movers: [{ type: 'train', width: TRAIN_W, offset: 0 }],
  };
}

// --- Median (row 7): a killer snake once `d` is high enough, otherwise empty ---

const SNAKE_W = 1.5;
const MEDIAN_KILLER_D = 1.8;
const MEDIAN_KILLER_CHANCE = 0.2;

function makeMedianLane(d: number, rng: Rng): LaneDef {
  if (d > MEDIAN_KILLER_D && rng.chance(MEDIAN_KILLER_CHANCE)) {
    const period = shrinkingPeriod(rng, SNAKE_W, d);
    const speed = rng.range(0.5, 1.2) * (rng.chance(0.5) ? 1 : -1);
    return {
      row: MEDIAN_ROW,
      kind: 'median',
      speed,
      period,
      movers: [{ type: 'snake', width: SNAKE_W, offset: rng.range(0, period) }],
    };
  }
  return { row: MEDIAN_ROW, kind: 'median', speed: 0, period: 1, movers: [] };
}

// --- Oil (docs/LEVELS.md: "Oil at d > 1.5, one to three tiles") ---

const OIL_D = 1.5;

function makeOilTiles(d: number, rng: Rng): { col: number; row: number; type: 'oil' }[] | undefined {
  if (d <= OIL_D) return undefined;
  const count = rng.int(1, 3);
  return Array.from({ length: count }, () => ({
    col: rng.int(0, COLS - 1),
    row: rng.pick(ROAD_ROWS as readonly number[]),
    type: 'oil' as const,
  }));
}

// --- Assembly ---

/**
 * Builds one Endless crossing at difficulty `d` for the given world theme, per docs/LEVELS.md
 * "Endless". Pure: every random choice goes through `rng`, so the same `(d, rng-state, worldId)`
 * always produces the same `LevelDef` (see `tests/endless.test.ts`'s daily-seed-determinism case)
 * and no DOM/browser API is touched.
 */
export function makeEndlessCrossing(d: number, rng: Rng, worldId: 1 | 2 | 3 | 4 | 5): LevelDef {
  const diff = Math.max(1.2, d);
  const lanes: LaneDef[] = [];

  for (const row of RIVER_ROWS) lanes.push(makeRiverLane(row, diff, rng));

  const roadRows = [...ROAD_ROWS];
  const motorbikeRow = diff > MOTORBIKE_D ? rng.pick(roadRows) : null;
  const railCandidates = roadRows.filter((r) => r !== motorbikeRow);
  const railRow = diff > RAIL_D && rng.chance(RAIL_CHANCE) ? rng.pick(railCandidates) : null;

  for (const row of roadRows) {
    if (row === railRow) lanes.push(makeRailLane(row, diff, rng));
    else if (row === motorbikeRow) lanes.push(makeMotorbikeLane(row, diff, rng));
    else lanes.push(makeRoadLane(row, diff, rng, worldId));
  }

  lanes.push(makeMedianLane(diff, rng));
  lanes.push({ row: HOME_ROW, kind: 'home', speed: 0, period: 1, movers: [] });
  lanes.push({ row: START_ROW, kind: 'bank', speed: 0, period: 1, movers: [] });
  lanes.sort((a, b) => a.row - b.row);

  const hazardTiles = makeOilTiles(diff, rng);

  return {
    id: `endless-d${diff.toFixed(2)}-w${worldId}`,
    world: worldId,
    index: 1,
    name: 'Endless',
    timeLimit: endlessTimeLimit(diff),
    lanes,
    // Endless never fills homes (M9 spec section 1) - a single landing always ends the crossing
    // immediately, so a croc/fly hazard would rarely if ever get the chance to matter. Not
    // specified by docs/LEVELS.md's Endless section either way - see the M9 report.
    homes: { crocChance: 0, flyChance: 0 },
    ...(hazardTiles ? { hazardTiles } : {}),
  };
}
