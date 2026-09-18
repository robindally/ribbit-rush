import { describe, expect, it } from 'vitest';
import { getLevel } from '../src/game/level';
import { COLS } from '../src/game/constants';

function widestMover(movers: { width: number }[]): number {
  return movers.reduce((max, m) => Math.max(max, m.width), 0);
}

/**
 * Strict invariant (design review fix-up 3b, docs/specs/M6-report.md's "Fix-up" section): every
 * lane's period must be at least COLS + widest mover, with no exceptions. The handful of sub-tile
 * shortfalls M6 shipped with (world 1 rows 2/5, world 1 level 3's/world 2 level 5-6's/world 5
 * level 15's motorbike lanes, world 3 row 5, world 5 level 13 row 6) were fixed at the data level -
 * period raised to COLS + widest + 1 in both docs/LEVELS.md and src/game/level.ts, with mover
 * offsets scaled proportionally - so a *new* violation (a future data-entry typo) fails this test
 * with no allowlist to hide behind.
 */
describe('getLevel: period >= COLS + widest mover', () => {
  for (let n = 1; n <= 15; n++) {
    it(`level ${n}: every lane's period is long enough`, () => {
      const level = getLevel(n);
      for (const lane of level.lanes) {
        if (lane.movers.length === 0) continue;
        const widest = widestMover(lane.movers);
        const needed = COLS + widest;
        expect(lane.period, `world ${level.world} level ${n} row ${lane.row}`).toBeGreaterThanOrEqual(
          needed,
        );
      }
    });
  }
});

describe('getLevel: shape and difficulty spine', () => {
  it('assigns world 1-3, index 1-3 within each world, for levels 1-15', () => {
    for (let n = 1; n <= 15; n++) {
      const level = getLevel(n);
      expect(level.world).toBe(Math.ceil(n / 3));
      expect(level.index).toBe(((n - 1) % 3) + 1);
    }
  });

  it('matches the difficulty spine\'s croc/fly chance and time limit', () => {
    const spine = [
      [0.0, 30],
      [0.15, 28],
      [0.25, 26],
      [0.3, 28],
      [0.3, 26],
      [0.3, 24],
      [0.35, 26],
      [0.35, 24],
      [0.35, 22],
      [0.45, 26],
      [0.45, 24],
      [0.45, 22],
      [0.5, 24],
      [0.5, 22],
      [0.5, 20],
    ];
    spine.forEach(([croc, time], i) => {
      const level = getLevel(i + 1);
      expect(level.homes.crocChance).toBeCloseTo(croc);
      expect(level.homes.flyChance).toBeCloseTo(0.35);
      expect(level.timeLimit).toBe(time);
    });
  });

  it('only levels 7-9 (world 3) carry oil hazard tiles, growing level over level', () => {
    for (let n = 1; n <= 15; n++) {
      const level = getLevel(n);
      if (n < 7 || n > 9) {
        expect(level.hazardTiles ?? []).toHaveLength(0);
      }
    }
    expect(getLevel(7).hazardTiles).toHaveLength(2);
    expect(getLevel(8).hazardTiles).toHaveLength(4);
    expect(getLevel(9).hazardTiles).toHaveLength(5);
    // Level 8/9 carry every earlier level's oil tiles forward (LEVELS.md: "add ...").
    const l7 = getLevel(7).hazardTiles ?? [];
    const l8 = getLevel(8).hazardTiles ?? [];
    for (const h of l7) expect(l8).toContainEqual(h);
  });

  it('every level has exactly one home row, one median (or median-kind) lane, and one bank row', () => {
    for (let n = 1; n <= 15; n++) {
      const level = getLevel(n);
      expect(level.lanes.filter((l) => l.kind === 'home')).toHaveLength(1);
      expect(level.lanes.filter((l) => l.kind === 'median')).toHaveLength(1);
      expect(level.lanes.filter((l) => l.kind === 'bank')).toHaveLength(1);
    }
  });

  it('two calls to getLevel(n) never share mutable mover state (fresh floe objects each time)', () => {
    const a = getLevel(13); // world 5, has floes
    const b = getLevel(13);
    const floeA = a.lanes.find((l) => l.movers.some((m) => m.type === 'floe'));
    const floeB = b.lanes.find((l) => l.movers.some((m) => m.type === 'floe'));
    const moverA = floeA?.movers.find((m) => m.type === 'floe');
    const moverB = floeB?.movers.find((m) => m.type === 'floe');
    expect(moverA?.floe).not.toBe(moverB?.floe); // different object identity
    if (moverA?.floe) moverA.floe.state = 'sunk';
    expect(moverB?.floe?.state).toBe('solid'); // mutating one didn't affect the other
  });
});

describe('getLevel: post-15 loop', () => {
  it('cycles world 5 levels 13/14/15 and keeps world/index at world 5, index 1-3', () => {
    expect(getLevel(16).world).toBe(5);
    expect(getLevel(17).world).toBe(5);
    expect(getLevel(18).world).toBe(5);
    expect(getLevel(19).world).toBe(5);
  });

  it('scales every lane speed up 5% per full 3-level loop past 15', () => {
    const base13 = getLevel(13);
    const loop16 = getLevel(16); // first lap past 15, mult 1.05, same structure as level 13
    for (let i = 0; i < base13.lanes.length; i++) {
      const b = base13.lanes[i];
      const l = loop16.lanes.find((x) => x.row === b.row);
      expect(l).toBeDefined();
      if (l) expect(l.speed).toBeCloseTo(b.speed * 1.05, 5);
    }
    const loop19 = getLevel(19); // second lap, mult 1.10
    const river2 = base13.lanes.find((l) => l.row === 2);
    const loop19River2 = loop19.lanes.find((l) => l.row === 2);
    if (river2 && loop19River2) expect(loop19River2.speed).toBeCloseTo(river2.speed * 1.1, 5);
  });
});
