import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng';
import { COLS } from '../src/game/constants';
import {
  endlessDifficultyForCrossing,
  endlessTimeLimit,
  endlessWorldForCrossing,
  makeEndlessCrossing,
  utcDateSeed,
} from '../src/game/endless';
import { laneMaxWidth } from '../src/game/lanes';
import type { LaneKind, MoverType } from '../src/game/types';

const VALID_LANE_KINDS: LaneKind[] = ['road', 'river', 'rail', 'median', 'bank', 'home'];
const VALID_MOVER_TYPES: MoverType[] = [
  'car',
  'taxi',
  'sports',
  'pickup',
  'van',
  'truck',
  'bus',
  'motorbike',
  'tram',
  'train',
  'jetski',
  'log',
  'turtle',
  'croc',
  'floe',
  'snake',
  'otter',
];

const DIFFICULTIES = [1.2, 2, 3, 4];

describe('makeEndlessCrossing: validity', () => {
  for (const d of DIFFICULTIES) {
    for (const worldId of [1, 2, 3, 4, 5] as const) {
      it(`d=${d} world=${worldId}: every lane is well-formed`, () => {
        const rng = createRng(1000 + d * 10 + worldId);
        const level = makeEndlessCrossing(d, rng, worldId);

        expect(level.world).toBe(worldId);
        expect(level.timeLimit).toBeCloseTo(endlessTimeLimit(d));
        expect(level.homes).toEqual({ crocChance: 0, flyChance: 0 });

        for (const lane of level.lanes) {
          expect(VALID_LANE_KINDS).toContain(lane.kind);
          for (const m of lane.movers) expect(VALID_MOVER_TYPES).toContain(m.type);

          // Period rule (docs/ARCHITECTURE.md section 6 / game/types.ts): period >= COLS + widest
          // mover - checked for every lane that actually carries movers (an empty median/home/bank
          // lane's period is a fixed 1, which is fine since there's nothing to wrap).
          if (lane.movers.length > 0) {
            expect(lane.period).toBeGreaterThanOrEqual(COLS + laneMaxWidth(lane));
          }

          // Speed caps (docs/LEVELS.md "Endless"): river <= 4.5, road <= 5.0 (rail excluded - no
          // explicit cap given, see game/endless.ts's own doc comment on RAIL_SPEED_CAP).
          if (lane.kind === 'river') {
            expect(Math.abs(lane.speed)).toBeLessThanOrEqual(4.5 + 1e-9);
          } else if (lane.kind === 'road') {
            expect(Math.abs(lane.speed)).toBeLessThanOrEqual(5.0 + 1e-9);
            for (const m of lane.movers) {
              if (m.speed !== undefined) expect(Math.abs(m.speed)).toBeLessThanOrEqual(5.0 + 1e-9);
            }
          }
        }

        // Exactly one lane per row 2-6 (river), 8-12 (road/rail), one median (7), one home (1),
        // one bank (13) - 13 lanes total, matching the campaign's own row layout.
        const rows = level.lanes.map((l) => l.row).sort((a, b) => a - b);
        expect(rows).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
      });
    }
  }

  it('oil hazard tiles only appear once d > 1.5, and never more than 3', () => {
    const lowD = makeEndlessCrossing(1.2, createRng(1), 1);
    expect(lowD.hazardTiles).toBeUndefined();

    for (let seed = 0; seed < 20; seed++) {
      const level = makeEndlessCrossing(3, createRng(seed), 1);
      expect(level.hazardTiles).toBeDefined();
      expect(level.hazardTiles!.length).toBeGreaterThanOrEqual(1);
      expect(level.hazardTiles!.length).toBeLessThanOrEqual(3);
      for (const h of level.hazardTiles!) expect(h.type).toBe('oil');
    }
  });
});

describe('endless theme cycling', () => {
  it('cycles world 1-5 every 5 crossings', () => {
    const expected: Record<number, number> = {
      1: 1,
      5: 1,
      6: 2,
      10: 2,
      11: 3,
      15: 3,
      16: 4,
      20: 4,
      21: 5,
      25: 5,
      26: 1, // wraps
      30: 1,
    };
    for (const [crossing, world] of Object.entries(expected)) {
      expect(endlessWorldForCrossing(Number(crossing))).toBe(world);
    }
  });
});

describe('endless difficulty spine', () => {
  it('starts at 1.2 and rises 0.04 per crossing', () => {
    expect(endlessDifficultyForCrossing(1)).toBeCloseTo(1.2);
    expect(endlessDifficultyForCrossing(2)).toBeCloseTo(1.24);
    expect(endlessDifficultyForCrossing(11)).toBeCloseTo(1.6);
  });
});

describe('endless time limit', () => {
  it('is max(14, 26 - 2*(d-1))', () => {
    expect(endlessTimeLimit(1.2)).toBeCloseTo(25.6);
    expect(endlessTimeLimit(2)).toBeCloseTo(24);
    expect(endlessTimeLimit(10)).toBe(14); // floors at 14
  });
});

describe('daily seed determinism', () => {
  it('the same UTC date always produces the same seed', () => {
    const a = utcDateSeed(new Date('2026-09-18T00:00:01Z'));
    const b = utcDateSeed(new Date('2026-09-18T23:59:59Z'));
    const c = utcDateSeed(new Date('2026-09-19T00:00:01Z'));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('the same seed produces the same sequence of crossings (same date, same lanes)', () => {
    const seed = utcDateSeed(new Date('2026-09-18T12:00:00Z'));

    function runCrossings(): unknown[] {
      const rng = createRng(seed);
      const results: unknown[] = [];
      for (let crossing = 1; crossing <= 4; crossing++) {
        const d = endlessDifficultyForCrossing(crossing);
        const worldId = endlessWorldForCrossing(crossing);
        results.push(makeEndlessCrossing(d, rng, worldId));
      }
      return results;
    }

    const runA = runCrossings();
    const runB = runCrossings();
    expect(runA).toEqual(runB);
  });
});
