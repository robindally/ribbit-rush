import { describe, expect, it } from 'vitest';
import { gameEvents } from '../src/core/events';
import { advanceNearMissCombo, World } from '../src/game/world';
import type { NearMissState } from '../src/game/world';
import { MEDIAN_ROW } from '../src/game/constants';
import type { Frog, LaneDef, LevelDef } from '../src/game/types';

// --- Combo counting (docs/specs/M4-juice.md section 5) - pure, no World needed ---

describe('advanceNearMissCombo', () => {
  it('starts a chain at combo 1 when there is no previous near-miss', () => {
    const s = advanceNearMissCombo(null, 10);
    expect(s).toEqual({ combo: 1, at: 10 });
  });

  it('chains consecutive near-misses within 2s of each other', () => {
    let s: NearMissState | null = advanceNearMissCombo(null, 0);
    s = advanceNearMissCombo(s, 1.5);
    expect(s.combo).toBe(2);
    s = advanceNearMissCombo(s, 1.5 + 1.9);
    expect(s.combo).toBe(3);
  });

  it('restarts the combo at 1 when the gap exceeds 2s', () => {
    let s: NearMissState | null = advanceNearMissCombo(null, 0);
    s = advanceNearMissCombo(s, 1.0);
    expect(s.combo).toBe(2);
    s = advanceNearMissCombo(s, 1.0 + 2.01); // > 2s since the last near-miss
    expect(s.combo).toBe(1);
  });

  it('a gap of exactly 2s still chains ("within 2s")', () => {
    let s: NearMissState | null = advanceNearMissCombo(null, 0);
    s = advanceNearMissCombo(s, 2);
    expect(s.combo).toBe(2);
  });
});

// --- Near-miss window (game/world.ts) - integration via a real World, matching the hop-time
// collision rule tests' style in tests/world.test.ts. ---

function levelWithLanes(lanes: LaneDef[]): LevelDef {
  return {
    id: 'test-nearmiss',
    world: 1,
    index: 1,
    name: 'Near-miss test level',
    timeLimit: 30,
    lanes,
    homes: { crocChance: 0, flyChance: 0 },
  };
}

/** Places the frog idle on a road row at column `x`, ready to hop up onto a safe median. */
function placeFrogOnRoad(frog: Frog, row: number, x = 6): void {
  frog.x = x;
  frog.row = row;
  frog.fromX = x;
  frog.fromRow = row;
  frog.toX = x;
  frog.toRow = row;
  frog.hopT = 1;
  frog.state = 'idle';
  frog.maxRow = row;
  frog.deathCause = undefined;
}

const ROAD_ROW = MEDIAN_ROW + 1;
const dt = 1 / 60;

describe('near-miss window', () => {
  it('emits nearMiss when a vehicle covers the vacated road tile within 150ms of landing', () => {
    // A stationary car already sits on the vacated tile's hitbox [6.2, 6.8] - the watch should
    // catch it on the very first step after landing.
    const roadLane: LaneDef = {
      row: ROAD_ROW,
      kind: 'road',
      speed: 0,
      period: 100,
      movers: [{ type: 'car', width: 1, offset: 6.7 }],
    };
    const medianLane: LaneDef = { row: MEDIAN_ROW, kind: 'median', speed: 0, period: 1, movers: [] };
    const world = new World(levelWithLanes([roadLane, medianLane]), 1, 1);
    placeFrogOnRoad(world.frog, ROAD_ROW);

    const combos: number[] = [];
    const onNearMiss = (e: { combo: number }): void => {
      combos.push(e.combo);
    };
    gameEvents.on('nearMiss', onNearMiss);

    world.queueHop('up'); // leaves the road row, lands on the safe median
    for (let i = 0; i < 7; i++) world.update(dt); // 7 steps: HOP_S (0.11s) / (1/60s) per step
    // The watch is armed at the end of the landing step, then checked on subsequent steps - run
    // a few more, comfortably inside the 150ms (9-step) window.
    for (let i = 0; i < 3; i++) world.update(dt);

    expect(world.frog.state).toBe('idle'); // the hop itself was safe
    expect(world.nearMissCount).toBe(1);
    expect(combos).toEqual([1]);

    gameEvents.off('nearMiss', onNearMiss);
  });

  it('does not trigger when no vehicle crosses the vacated tile within the window', () => {
    const roadLane: LaneDef = { row: ROAD_ROW, kind: 'road', speed: 0, period: 100, movers: [] };
    const medianLane: LaneDef = { row: MEDIAN_ROW, kind: 'median', speed: 0, period: 1, movers: [] };
    const world = new World(levelWithLanes([roadLane, medianLane]), 1, 1);
    placeFrogOnRoad(world.frog, ROAD_ROW);

    world.queueHop('up');
    for (let i = 0; i < 7; i++) world.update(dt);
    // Keep running well past the 150ms watch window with nothing in the lane.
    for (let i = 0; i < 30; i++) world.update(dt);

    expect(world.nearMissCount).toBe(0);
  });

  it('does not trigger once the vehicle arrives after the 150ms window has closed', () => {
    // The car starts clear of the vacated tile and only reaches it well after the watch expires
    // (150ms = 9 simulation steps at 1/60s).
    const roadLane: LaneDef = {
      row: ROAD_ROW,
      kind: 'road',
      speed: 6, // tiles/s
      period: 100,
      // moverX = offset - maxWidth = 0 - 1 = -1 (just off-screen); reaches x=6 at t = 7/6 ≈
      // 1.17s, well after the 150ms watch window closes.
      movers: [{ type: 'car', width: 1, offset: 0 }],
    };
    const medianLane: LaneDef = { row: MEDIAN_ROW, kind: 'median', speed: 0, period: 1, movers: [] };
    const world = new World(levelWithLanes([roadLane, medianLane]), 1, 1);
    placeFrogOnRoad(world.frog, ROAD_ROW);

    world.queueHop('up');
    for (let i = 0; i < 7; i++) world.update(dt); // lands
    for (let i = 0; i < 9; i++) world.update(dt); // watch window (150ms) elapses, no hit yet
    for (let i = 0; i < 60; i++) world.update(dt); // the car arrives long after the watch closed

    expect(world.nearMissCount).toBe(0);
  });

  it('does not arm the watch for a hop that did not start on a road row', () => {
    const medianLane: LaneDef = { row: MEDIAN_ROW, kind: 'median', speed: 0, period: 1, movers: [] };
    const riverLane: LaneDef = {
      row: MEDIAN_ROW - 1,
      kind: 'river',
      speed: 0,
      period: 100,
      movers: [{ type: 'log', width: 100, offset: 50 }],
    };
    const world = new World(levelWithLanes([medianLane, riverLane]), 1, 1);
    placeFrogOnRoad(world.frog, MEDIAN_ROW); // median, not road

    world.queueHop('up');
    for (let i = 0; i < 7; i++) world.update(dt);
    for (let i = 0; i < 20; i++) world.update(dt);

    expect(world.nearMissCount).toBe(0);
  });
});
