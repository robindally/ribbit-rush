import { describe, expect, it } from 'vitest';
import { World } from '../src/game/world';
import { gameEvents } from '../src/core/events';
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

// --- M6: killer movers, any lane kind (docs/specs/M6-worlds.md section 1, "even while riding a
// platform") ---

/** Places the frog idle at an arbitrary row/x without going through any prior hops. */
function placeFrogIdleAt(frog: Frog, x: number, row: number): void {
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

describe('M6 killer movers', () => {
  it('median snapping still works on a lane that now carries a mover', () => {
    const medianLane: LaneDef = {
      row: MEDIAN_ROW,
      kind: 'median',
      speed: 0,
      period: 20,
      movers: [{ type: 'snake', width: 1.5, offset: 19 }], // far away, x = 19 - 1.5 = 17.5 - never
      // overlaps the hop's path, so this only exercises the snap, not the kill (see the next test).
    };
    const riverLane: LaneDef = {
      row: 6,
      kind: 'river',
      speed: 0,
      period: 20,
      movers: [{ type: 'log', width: 10, offset: 10 }], // wide, safe platform under the whole row
    };
    const world = new World(levelWithLanes([medianLane, riverLane]), 1, 1);
    placeFrogIdleAt(world.frog, 6.4, 6); // as if it just drifted on a platform, non-integer x

    world.queueHop('down'); // row 6 -> MEDIAN_ROW (7); toX snaps to round(6.4) = 6
    expect(world.frog.toX).toBe(6);
    expect(world.frog.toRow).toBe(MEDIAN_ROW);

    const dt = 1 / 60;
    for (let i = 0; i < 7; i++) world.update(dt); // run the hop to landing

    expect(world.frog.row).toBe(MEDIAN_ROW);
    expect(world.frog.x).toBe(6);
    expect(world.frog.state).toBe('idle'); // nothing there to kill it
  });

  it('a snake on the median lane kills a frog landing on it', () => {
    const medianLane: LaneDef = {
      row: MEDIAN_ROW,
      kind: 'median',
      speed: 0,
      period: 20,
      movers: [{ type: 'snake', width: 1.5, offset: 7.5 }], // x = 7.5 - 1.5 = 6, spans [6, 7.5)
    };
    const world = new World(levelWithLanes([medianLane]), 1, 1);
    placeFrogIdleAt(world.frog, 6, 8); // row 8, adjacent to the median; integer x, no drift
    world.frog.facing = 'up';

    world.queueHop('up'); // straight up, x unchanged throughout - lands right on the snake
    const dt = 1 / 60;
    for (let i = 0; i < 7; i++) world.update(dt);

    expect(world.frog.state).toBe('dying');
    expect(world.frog.deathCause).toBe('snake');
  });

  it('a killer mover kills a frog riding a platform in the same river lane', () => {
    const lane: LaneDef = {
      row: 4,
      kind: 'river',
      speed: 0,
      period: 20,
      movers: [
        { type: 'log', width: 4, offset: 4 }, // x = 4 - 4 = 0, spans [0, 4) - a real platform
        { type: 'jetski', width: 1, offset: 6, speed: 0 }, // x = 6 - 4 = 2, spans [2, 3)
      ],
    };
    const world = new World(levelWithLanes([lane]), 1, 1);
    // x=2.3 is inside both the log's span [0,4) - it would otherwise be a safe ride - and the
    // jetski's hitbox once the +/-0.2 margin is applied.
    placeFrogIdleAt(world.frog, 2.3, 4);

    world.update(1 / 60);
    expect(world.frog.state).toBe('dying');
    expect(world.frog.deathCause).toBe('squish'); // jetski has no dedicated cause - see world.ts
  });
});

// --- M6: oil slide (docs/LEVELS.md "new mover and lane rules") ---

function levelWithHazards(lanes: LaneDef[], hazardTiles: LevelDef['hazardTiles']): LevelDef {
  return { ...levelWithLanes(lanes), hazardTiles };
}

describe('M6 oil slide', () => {
  it('is blocked into a hedge column - no slide, no death', () => {
    const riverLane: LaneDef = {
      row: 2,
      kind: 'river',
      speed: 0,
      period: 200,
      movers: [{ type: 'log', width: 100, offset: 100 }], // wide safe platform under the whole row
    };
    const level = levelWithHazards([riverLane], [{ col: 1, row: 2, type: 'oil' }]);
    const world = new World(level, 1, 1);
    placeFrogIdleAt(world.frog, 1, 3); // col 1 is not a HOME_COLS slot
    world.frog.facing = 'up';

    world.queueHop('up'); // lands on row 2, col 1 (oil); the slide would target row 1 (home row)
    // col 1, which isn't a home slot - blocked, per the same hedge rule computeHopTarget uses.
    const dt = 1 / 60;
    for (let i = 0; i < 7; i++) world.update(dt);

    expect(world.frog.row).toBe(2);
    expect(world.frog.x).toBe(1);
    expect(world.frog.state).toBe('idle'); // no slide, no death
  });

  it('slides right when hopping right onto an oil tile, landing under whatever is there', () => {
    const roadLane: LaneDef = {
      row: 9,
      kind: 'road',
      speed: 0,
      period: 20,
      movers: [{ type: 'car', width: 1, offset: 8 }], // x = 8 - 1 = 7, spans [7, 8)
    };
    const level = levelWithHazards([roadLane], [{ col: 6, row: 9, type: 'oil' }]);
    const world = new World(level, 1, 1);
    placeFrogIdleAt(world.frog, 5, 9);
    world.frog.facing = 'right';

    world.queueHop('right'); // lands on col 6 (oil), then slides to col 7 - straight into the car
    const dt = 1 / 60;
    for (let i = 0; i < 7; i++) world.update(dt);

    expect(world.frog.x).toBe(7);
    expect(world.frog.state).toBe('dying');
    expect(world.frog.deathCause).toBe('squish');
  });

  it('is blocked at the grid edge - no slide, no move past column 12', () => {
    const roadLane: LaneDef = { row: 9, kind: 'road', speed: 0, period: 20, movers: [] };
    const level = levelWithHazards([roadLane], [{ col: 12, row: 9, type: 'oil' }]);
    const world = new World(level, 1, 1);
    placeFrogIdleAt(world.frog, 11, 9);
    world.frog.facing = 'right';

    world.queueHop('right'); // lands on col 12 (oil), slide right would go to col 13 - blocked
    const dt = 1 / 60;
    for (let i = 0; i < 7; i++) world.update(dt);

    expect(world.frog.x).toBe(12); // stayed put, no death
    expect(world.frog.state).toBe('idle');
  });

  it('emits an oilSlide event with the pre- and post-slide position', () => {
    const roadLane: LaneDef = { row: 9, kind: 'road', speed: 0, period: 20, movers: [] };
    const level = levelWithHazards([roadLane], [{ col: 6, row: 9, type: 'oil' }]);
    const world = new World(level, 1, 1);
    placeFrogIdleAt(world.frog, 5, 9);
    world.frog.facing = 'right';

    const events: { x: number; row: number; fromX: number; fromRow: number }[] = [];
    const onOilSlide = (e: { x: number; row: number; fromX: number; fromRow: number }): void => {
      events.push(e);
    };
    gameEvents.on('oilSlide', onOilSlide);

    world.queueHop('right');
    const dt = 1 / 60;
    for (let i = 0; i < 7; i++) world.update(dt);
    gameEvents.off('oilSlide', onOilSlide);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ fromX: 6, fromRow: 9, x: 7, row: 9 });
  });
});

// --- M6: train crossing warning fires once per approach (docs/LEVELS.md "new mover and lane
// rules") ---

describe('M6 train warning', () => {
  it('fires trainWarning exactly once, 1.5s before the train enters', () => {
    // width 6, speed +6: entry boundary at offset = maxWidth - width = 0. Put offset exactly
    // TRAIN_WARNING_S * speed = 9 tiles before that boundary (mod period 40): offset = 40 - 9 = 31.
    const railLane: LaneDef = {
      row: 8,
      kind: 'rail',
      speed: 6,
      period: 40,
      movers: [{ type: 'train', width: 6, offset: 31 }],
    };
    const world = new World(levelWithLanes([railLane]), 1, 1);

    const fired: number[] = [];
    const onTrainWarning = (e: { row: number }): void => {
      fired.push(e.row);
    };
    gameEvents.on('trainWarning', onTrainWarning);

    const dt = 1 / 60;
    // 1.5s of simulated time steps right up to (and past) the warning boundary.
    for (let i = 0; i < Math.round(1.5 * 60) + 5; i++) world.update(dt);
    gameEvents.off('trainWarning', onTrainWarning);

    expect(fired).toEqual([8]); // fired exactly once, for the rail lane's row
  });
});
