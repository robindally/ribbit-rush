import { describe, expect, it } from 'vitest';
import { World } from '../src/game/world';
import { START_LIVES } from '../src/game/scoring';
import { HOME_ROW, MEDIAN_ROW } from '../src/game/constants';
import type { Frog, LaneDef, LevelDef } from '../src/game/types';

/**
 * A hand-built level where every river row is one giant, stationary log covering the whole
 * lane and every road row is empty, so hopping straight up column 6 (a home slot) is always
 * safe. This isolates the scripted-run test from the classic level's real traffic/timing so it
 * only exercises world.ts's own hop/landing/scoring/home wiring.
 */
function safeLane(row: number, kind: LaneDef['kind']): LaneDef {
  if (kind === 'river') {
    return { row, kind, speed: 0, period: 200, movers: [{ type: 'log', width: 100, offset: 100 }] };
  }
  if (kind === 'road') {
    return { row, kind, speed: 0, period: 200, movers: [] };
  }
  return { row, kind, speed: 0, period: 1, movers: [] };
}

function makeSafeLevel(): LevelDef {
  return {
    id: 'test-safe',
    world: 1,
    index: 1,
    name: 'Safe test level',
    timeLimit: 30,
    lanes: [
      safeLane(1, 'home'),
      safeLane(2, 'river'),
      safeLane(3, 'river'),
      safeLane(4, 'river'),
      safeLane(5, 'river'),
      safeLane(6, 'river'),
      safeLane(7, 'median'),
      safeLane(8, 'road'),
      safeLane(9, 'road'),
      safeLane(10, 'road'),
      safeLane(11, 'road'),
      safeLane(12, 'road'),
      safeLane(13, 'bank'),
    ],
    homes: { crocChance: 0, flyChance: 0 },
  };
}

describe('World scripted run', () => {
  it('hopping straight up on a safe timeline reaches a home and increments score', () => {
    const world = new World(makeSafeLevel(), 1, 1);
    expect(world.frog.x).toBe(6); // starts on a home-slot column

    const dt = 1 / 60;
    for (let hop = 0; hop < 12; hop++) {
      world.queueHop('up'); // starts the hop synchronously (frog was idle)
      // Step until the hop resolves (lands, and possibly respawns on a home landing).
      for (let step = 0; step < 60 && world.frog.state !== 'idle'; step++) {
        world.update(dt);
      }
      expect(world.frog.state).toBe('idle');
    }

    expect(world.homes[2]).toBe('frog'); // HOME_COLS[2] === 6
    expect(world.score).toBeGreaterThan(0);
    expect(world.lives).toBe(START_LIVES); // no deaths along the way
    expect(world.gameOver).toBe(false);
  });
});

// --- Hop-time collision rule (ARCHITECTURE.md section 7) ---
//
// These tests build a minimal level with only the one lane under test and drop the frog
// directly into position (rather than hopping it there through several safe rows first), so
// each test isolates exactly the hop being exercised. HOP_S is 0.11s and the fixed step is
// 1/60s, so a hop takes exactly 7 simulation steps to land (hopT crosses 1 on step 7), and
// hopT crosses 0.5 on step 4.

function levelWithLanes(lanes: LaneDef[]): LevelDef {
  return {
    id: 'test-hop-time',
    world: 1,
    index: 1,
    name: 'Hop-time test level',
    timeLimit: 30,
    lanes,
    homes: { crocChance: 0, flyChance: 0 },
  };
}

/** Places the frog idle at the median, ready to hop, without going through any prior hops. */
function placeFrogAtMedian(frog: Frog, x = 6): void {
  frog.x = x;
  frog.row = MEDIAN_ROW;
  frog.fromX = x;
  frog.fromRow = MEDIAN_ROW;
  frog.toX = x;
  frog.toRow = MEDIAN_ROW;
  frog.hopT = 1;
  frog.state = 'idle';
  frog.maxRow = MEDIAN_ROW;
  frog.deathCause = undefined;
}

describe('hop-time collision rule: river rows', () => {
  it('does not drown when the only platform arrives under the frog before landing', () => {
    // The log starts clear of the centre column and drifts left, only covering x=6.5 from
    // about 0.083s into the hop (before the 0.11s hop completes) onward.
    const riverLane: LaneDef = {
      row: 6,
      kind: 'river',
      speed: -1.2,
      period: 200,
      movers: [{ type: 'log', width: 2, offset: 8.6 }],
    };
    const world = new World(levelWithLanes([riverLane]), 1, 1);
    placeFrogAtMedian(world.frog);

    world.queueHop('up'); // idle -> hopping synchronously; row commits to 6 immediately
    expect(world.frog.row).toBe(6);
    expect(world.frog.state).toBe('hopping');

    const dt = 1 / 60;

    // Step 1 (~16.7ms into the hop): the platform has not arrived yet. Checking here (as the
    // old code did, every step regardless of state) would have drowned the frog; the fix must
    // not check at all while airborne.
    world.update(dt);
    expect(world.frog.state).toBe('hopping');
    expect(world.frog.deathCause).toBeUndefined();

    for (let i = 0; i < 5; i++) world.update(dt); // steps 2-6: still hopping, still no check
    expect(world.frog.state).toBe('hopping');

    world.update(dt); // step 7: hopT reaches 1, landing runs the full row resolution
    expect(world.frog.state).toBe('idle'); // lands riding the platform, not dead
    expect(world.frog.row).toBe(6);
    expect(world.frog.deathCause).toBeUndefined();
  });

  it('drowns when no platform is under the centre at landing', () => {
    const riverLane: LaneDef = { row: 6, kind: 'river', speed: 0, period: 50, movers: [] };
    const world = new World(levelWithLanes([riverLane]), 1, 1);
    placeFrogAtMedian(world.frog);

    world.queueHop('up');
    const dt = 1 / 60;
    for (let i = 0; i < 6; i++) {
      world.update(dt);
      expect(world.frog.state).toBe('hopping'); // no platform/drown check runs while airborne
    }

    world.update(dt); // step 7: lands, finds no platform under the centre
    expect(world.frog.state).toBe('dying');
    expect(world.frog.deathCause).toBe('drown');
  });
});

describe('hop-time collision rule: road rows', () => {
  it('does not kill when a vehicle covers the target tile only before hopT reaches 0.5', () => {
    // The car starts overlapping the hitbox [6.2, 6.8] (spans [6,7) at t=0) and has moved
    // clear of it by step 4, where hopT first reaches 0.5, and stays clear through landing.
    const roadLane: LaneDef = {
      row: 8,
      kind: 'road',
      speed: 15,
      period: 100,
      movers: [{ type: 'car', width: 1, offset: 7 }],
    };
    const world = new World(levelWithLanes([roadLane]), 1, 1);
    placeFrogAtMedian(world.frog);

    world.queueHop('down'); // row commits to 8 immediately; x stays 6 (straight hop)
    expect(world.frog.row).toBe(8);

    const dt = 1 / 60;
    for (let i = 0; i < 7; i++) world.update(dt); // run the whole hop to landing

    expect(world.frog.state).toBe('idle');
    expect(world.frog.deathCause).toBeUndefined();
  });

  it('kills with squish when a vehicle covers the target tile once hopT reaches 0.5', () => {
    // A stationary car sits on the hitbox [6.2, 6.8] the whole time (spans [5.7, 6.7)).
    const roadLane: LaneDef = {
      row: 8,
      kind: 'road',
      speed: 0,
      period: 100,
      movers: [{ type: 'car', width: 1, offset: 6.7 }],
    };
    const world = new World(levelWithLanes([roadLane]), 1, 1);
    placeFrogAtMedian(world.frog);

    world.queueHop('down');
    const dt = 1 / 60;
    for (let i = 0; i < 3; i++) {
      world.update(dt);
      expect(world.frog.state).toBe('hopping'); // hopT < 0.5: no vehicle check yet
    }

    world.update(dt); // step 4: hopT crosses 0.5, the vehicle check now runs and hits
    expect(world.frog.state).toBe('dying');
    expect(world.frog.deathCause).toBe('squish');
  });
});

describe('home slot occupancy', () => {
  it('landing on an occupied home slot dies with cause occupied', () => {
    const world = new World(levelWithLanes([]), 1, 1);
    const frog = world.frog;
    frog.x = 3; // HOME_COLS[1] === 3
    frog.row = HOME_ROW + 1;
    frog.fromX = 3;
    frog.fromRow = HOME_ROW + 1;
    frog.toX = 3;
    frog.toRow = HOME_ROW + 1;
    frog.hopT = 1;
    frog.state = 'idle';
    frog.maxRow = HOME_ROW + 1;

    world.homes[1] = 'frog'; // slot already occupied by another frog

    world.queueHop('up');
    expect(world.frog.row).toBe(HOME_ROW);

    const dt = 1 / 60;
    for (let i = 0; i < 7; i++) world.update(dt);

    expect(world.frog.state).toBe('dying');
    expect(world.frog.deathCause).toBe('occupied');
  });
});
