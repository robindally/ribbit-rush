// Level definitions and the classic generator. See ARCHITECTURE.md section 10 and
// docs/specs/M0-M2-classic-core.md "Classic lane table".

import { HOME_ROW, MEDIAN_ROW, START_ROW, TURTLE_DIVE_DOWN_S, TURTLE_DIVE_UP_S } from './constants';
import type { LaneDef, LevelDef, MoverType } from './types';

interface MoverSeed {
  type: MoverType;
  width: number;
  offset: number;
  /** Whether this mover gets a dive cycle from level 2 onward. */
  diving?: boolean;
}

interface LaneSeed {
  row: number;
  kind: 'river' | 'road';
  speed: number;
  period: number;
  movers: MoverSeed[];
}

// Level 1 values, speeds in tiles/s, positive = right.
const LANE_SEEDS: LaneSeed[] = [
  {
    row: 2,
    kind: 'river',
    speed: 1.6,
    period: 16,
    movers: [
      { type: 'log', width: 4, offset: 0 },
      { type: 'log', width: 4, offset: 8 },
    ],
  },
  {
    row: 3,
    kind: 'river',
    speed: -1.2,
    period: 15,
    movers: [
      { type: 'turtle', width: 2, offset: 0 },
      { type: 'turtle', width: 2, offset: 5 },
      { type: 'turtle', width: 2, offset: 10, diving: true },
    ],
  },
  {
    row: 4,
    kind: 'river',
    speed: 2.4,
    period: 18,
    movers: [
      { type: 'log', width: 3, offset: 0 },
      { type: 'log', width: 3, offset: 9 },
    ],
  },
  {
    row: 5,
    kind: 'river',
    speed: -1.0,
    period: 14,
    movers: [
      { type: 'log', width: 2, offset: 0 },
      { type: 'log', width: 2, offset: 4.5 },
      { type: 'log', width: 2, offset: 9 },
    ],
  },
  {
    row: 6,
    kind: 'river',
    speed: 1.4,
    period: 16,
    movers: [
      { type: 'turtle', width: 3, offset: 0 },
      { type: 'turtle', width: 3, offset: 8, diving: true },
    ],
  },
  {
    row: 8,
    kind: 'road',
    speed: -2.2,
    period: 16,
    movers: [
      { type: 'truck', width: 2, offset: 0 },
      { type: 'truck', width: 2, offset: 8 },
    ],
  },
  {
    row: 9,
    kind: 'road',
    speed: 1.5,
    period: 15,
    movers: [
      { type: 'car', width: 1, offset: 0 },
      { type: 'car', width: 1, offset: 5 },
      { type: 'car', width: 1, offset: 10 },
    ],
  },
  {
    row: 10,
    kind: 'road',
    speed: -3.0,
    period: 17,
    movers: [
      { type: 'sports', width: 1, offset: 0 },
      { type: 'sports', width: 1, offset: 8.5 },
    ],
  },
  {
    row: 11,
    kind: 'road',
    speed: 1.2,
    period: 16,
    movers: [
      { type: 'bus', width: 2, offset: 0 },
      { type: 'bus', width: 2, offset: 6 },
      { type: 'bus', width: 2, offset: 12 },
    ],
  },
  {
    row: 12,
    kind: 'road',
    speed: -1.6,
    period: 14,
    movers: [
      { type: 'car', width: 1, offset: 0 },
      { type: 'taxi', width: 1, offset: 4.5 },
      { type: 'car', width: 1, offset: 9.5 },
    ],
  },
];

/**
 * Builds the fixed classic lane table for level `n` (1-based): speeds scale by
 * `1 + 0.12 * (n - 1)`, the marked turtle group in rows 3 and 6 dives from level 2 onward, and
 * static rows (home, median, start bank) are included as empty, speed-0 lanes so callers can
 * uniformly look up "what's at this row" without special-casing them.
 */
export function makeClassicLevel(n: number): LevelDef {
  const speedMult = 1 + 0.12 * (n - 1);
  const divingEnabled = n >= 2;

  const dynamicLanes: LaneDef[] = LANE_SEEDS.map((seed) => ({
    row: seed.row,
    kind: seed.kind,
    speed: seed.speed * speedMult,
    period: seed.period,
    movers: seed.movers.map((m) => ({
      type: m.type,
      width: m.width,
      offset: m.offset,
      ...(m.diving && divingEnabled
        ? { dive: { up: TURTLE_DIVE_UP_S, down: TURTLE_DIVE_DOWN_S, phase: 0 } }
        : {}),
    })),
  }));

  const staticLanes: LaneDef[] = [
    { row: HOME_ROW, kind: 'home', speed: 0, period: 1, movers: [] },
    { row: MEDIAN_ROW, kind: 'median', speed: 0, period: 1, movers: [] },
    { row: START_ROW, kind: 'bank', speed: 0, period: 1, movers: [] },
  ];

  const lanes = [...dynamicLanes, ...staticLanes].sort((a, b) => a.row - b.row);

  return {
    id: `classic-${n}`,
    world: 1,
    index: ((n - 1) % 3) + 1,
    name: `Level ${n}`,
    timeLimit: Math.max(18, 30 - (n - 1) * 1.5),
    lanes,
    homes: {
      crocChance: Math.min(0.6, 0.15 * (n - 1)),
      flyChance: 0.35,
    },
  };
}
