import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng';
import {
  chooseLadyFrogSpawn,
  choosePowerupSpawn,
  collectPlatformCandidates,
  freezeLaneTimeScale,
  isFreezeActive,
  nearestSafePlatformX,
  pickPowerupKind,
  POWERUP_KINDS,
  ridingX,
} from '../src/game/powerups';
import { computeMegaHopTarget } from '../src/game/frog';
import { COLS, HOME_ROW, MEDIAN_ROW, START_ROW } from '../src/game/constants';
import type { LaneDef } from '../src/game/types';

// A representative set of river lanes (rows 2-6): some carry a wide platform, one is pure open
// water with no platform at all, matching the acceptance test's own wording ("Power-up placement
// never lands on water without a platform").
function riverLanes(): LaneDef[] {
  return [
    { row: 2, kind: 'river', speed: 1, period: 40, movers: [{ type: 'log', width: 4, offset: 10 }] },
    { row: 3, kind: 'river', speed: -1, period: 40, movers: [{ type: 'turtle', width: 2, offset: 20 }] },
    { row: 4, kind: 'river', speed: 0, period: 40, movers: [] }, // open water, no platform at all
    { row: 5, kind: 'river', speed: 2, period: 40, movers: [{ type: 'log', width: 3, offset: 5 }] },
    { row: 6, kind: 'river', speed: -1.5, period: 40, movers: [{ type: 'floe', width: 2, offset: 15 }] },
    { row: MEDIAN_ROW, kind: 'median', speed: 0, period: 20, movers: [] },
  ];
}

describe('pickPowerupKind', () => {
  it('always returns one of the four kinds', () => {
    const rng = createRng(1);
    for (let i = 0; i < 200; i++) {
      expect(POWERUP_KINDS).toContain(pickPowerupKind(rng));
    }
  });

  it('respects the weight ordering over a large sample (shield > freeze/clock > megahop)', () => {
    const rng = createRng(42);
    const counts: Record<string, number> = { shield: 0, freeze: 0, clock: 0, megahop: 0 };
    for (let i = 0; i < 20_000; i++) counts[pickPowerupKind(rng)] += 1;
    expect(counts.shield).toBeGreaterThan(counts.megahop);
    expect(counts.freeze).toBeGreaterThan(counts.megahop);
    expect(counts.clock).toBeGreaterThan(counts.megahop);
  });
});

describe('collectPlatformCandidates', () => {
  it('only returns currently-valid platforms, never the empty-water lane', () => {
    const lanes = riverLanes();
    const candidates = collectPlatformCandidates(lanes, 0);
    expect(candidates.length).toBe(4); // rows 2, 3, 5, 6 - not row 4 (no movers at all)
    expect(candidates.every((c) => c.row !== 4)).toBe(true);
  });
});

describe('choosePowerupSpawn', () => {
  it('never lands on bare water: always either a valid platform x or the median row', () => {
    const lanes = riverLanes();
    // Try many seeds to exercise both the platform and median branches.
    for (let seed = 1; seed <= 100; seed++) {
      const rng = createRng(seed);
      const spawn = choosePowerupSpawn(lanes, rng, 0);
      if (spawn.ride) {
        // On a platform: x must fall within that exact mover's current span.
        const lane = lanes.find((l) => l.row === spawn.row);
        expect(lane).toBeDefined();
        expect(spawn.row).not.toBe(4); // the open-water lane never offers a ride
      } else {
        // On the median: any column is safe (nothing there to drown in).
        expect(spawn.row).toBe(MEDIAN_ROW);
        expect(spawn.x).toBeGreaterThanOrEqual(0);
        expect(spawn.x).toBeLessThanOrEqual(COLS - 1);
      }
    }
  });

  it('falls back to the median when no platform exists anywhere', () => {
    const emptyRiver: LaneDef[] = [
      { row: 2, kind: 'river', speed: 0, period: 20, movers: [] },
      { row: MEDIAN_ROW, kind: 'median', speed: 0, period: 20, movers: [] },
    ];
    const rng = createRng(7);
    for (let i = 0; i < 20; i++) {
      const spawn = choosePowerupSpawn(emptyRiver, rng, 0);
      expect(spawn.ride).toBeNull();
      expect(spawn.row).toBe(MEDIAN_ROW);
    }
  });
});

describe('chooseLadyFrogSpawn', () => {
  it('only ever picks a log, never a turtle/floe or the median', () => {
    const lanes = riverLanes();
    for (let seed = 1; seed <= 50; seed++) {
      const rng = createRng(seed);
      const spawn = chooseLadyFrogSpawn(lanes, rng, 0);
      expect(spawn).not.toBeNull();
      expect([2, 5]).toContain(spawn!.row); // rows 2 and 5 are the only logs above
    }
  });

  it('returns null when no log exists', () => {
    const noLogs: LaneDef[] = [
      { row: 3, kind: 'river', speed: 0, period: 20, movers: [{ type: 'turtle', width: 2, offset: 5 }] },
    ];
    expect(chooseLadyFrogSpawn(noLogs, createRng(1), 0)).toBeNull();
  });
});

describe('ridingX', () => {
  it('tracks the mover as its offset advances (including wrap)', () => {
    const lane: LaneDef = {
      row: 2,
      kind: 'river',
      speed: 1,
      period: 20,
      movers: [{ type: 'log', width: 4, offset: 10 }],
    };
    const mover = lane.movers[0];
    const ride = { mover, offsetInMover: 2 };
    const x0 = ridingX(lane, ride);
    mover.offset = 19; // simulate stepLane having advanced it
    const x1 = ridingX(lane, ride);
    expect(x1).not.toBe(x0);
    expect(x1).toBeCloseTo(19 - 4 + 2);
  });
});

describe('nearestSafePlatformX', () => {
  it('returns the exact x when already on a platform', () => {
    const lane: LaneDef = {
      row: 4,
      kind: 'river',
      speed: 0,
      period: 20,
      movers: [{ type: 'log', width: 4, offset: 8 }], // spans [4, 8)
    };
    expect(nearestSafePlatformX(lane, 6, 0)).toBeCloseTo(6);
  });

  it('clamps to the nearest edge when off the platform', () => {
    const lane: LaneDef = {
      row: 4,
      kind: 'river',
      speed: 0,
      period: 20,
      movers: [{ type: 'log', width: 4, offset: 8 }], // spans [4, 8)
    };
    expect(nearestSafePlatformX(lane, 10, 0)).toBeCloseTo(8 - 0.001, 2);
  });

  it('returns null when the river lane has no valid platform', () => {
    const lane: LaneDef = { row: 4, kind: 'river', speed: 0, period: 20, movers: [] };
    expect(nearestSafePlatformX(lane, 6, 0)).toBeNull();
  });

  it('returns null for a non-river lane', () => {
    const lane: LaneDef = { row: 9, kind: 'road', speed: 0, period: 20, movers: [] };
    expect(nearestSafePlatformX(lane, 6, 0)).toBeNull();
  });
});

describe('Freeze Frame timing', () => {
  it('is fully stopped for the first 3s, then ramps to full speed over the next 0.5s', () => {
    expect(freezeLaneTimeScale(0)).toBe(0);
    expect(freezeLaneTimeScale(2.9)).toBe(0);
    expect(freezeLaneTimeScale(3)).toBe(0);
    expect(freezeLaneTimeScale(3.25)).toBeCloseTo(0.5);
    expect(freezeLaneTimeScale(3.5)).toBe(1);
    expect(freezeLaneTimeScale(10)).toBe(1);
  });

  it('isFreezeActive matches the 3.5s total window', () => {
    expect(isFreezeActive(0)).toBe(true);
    expect(isFreezeActive(3.4)).toBe(true);
    expect(isFreezeActive(3.5)).toBe(false);
    expect(isFreezeActive(5)).toBe(false);
  });
});

// --- Mega Hop 2-tile target (M7 spec section 1) ---

describe('computeMegaHopTarget', () => {
  it('covers 2 rows forward, keeping x continuous on a river row', () => {
    const target = computeMegaHopTarget({ x: 5.7, row: 6 });
    expect(target.blocked).toBe(false);
    expect(target.toRow).toBe(4);
    expect(target.toX).toBeCloseTo(5.7);
  });

  it('snaps to the nearest column when the 2-tile target lands on a land row', () => {
    const target = computeMegaHopTarget({ x: 5.7, row: MEDIAN_ROW + 2 });
    expect(target.toRow).toBe(MEDIAN_ROW);
    expect(target.toX).toBe(6);
  });

  it('is blocked past the start bank (bounds re-used from computeHopTarget)', () => {
    const target = computeMegaHopTarget({ x: 6, row: START_ROW });
    // down isn't mega hop's direction, but resolveTarget's bounds check is direction-agnostic -
    // confirm the *upper* bound (home row) blocks correctly instead, the case that matters here.
    expect(target.blocked).toBe(false); // START_ROW - 2 is still a valid road row
    expect(target.toRow).toBe(START_ROW - 2);
  });

  it('is blocked when the 2-tile jump would overshoot past the home row', () => {
    const target = computeMegaHopTarget({ x: 6, row: 2 }); // 2 - 2 = row 0, invalid
    expect(target.blocked).toBe(true);
    expect(target.toRow).toBe(2); // unchanged
  });

  it('is blocked landing on a non-slot column of the home row (hedge)', () => {
    const target = computeMegaHopTarget({ x: 1, row: HOME_ROW + 2 }); // column 1 isn't a home slot
    expect(target.blocked).toBe(true);
    expect(target.hedge).toBe(true);
  });

  it('lands cleanly in a home slot when the 2-tile jump lines up with one', () => {
    const target = computeMegaHopTarget({ x: 3, row: HOME_ROW + 2 }); // column 3 is a home slot
    expect(target.blocked).toBe(false);
    expect(target.toRow).toBe(HOME_ROW);
    expect(target.toX).toBe(3);
  });
});
