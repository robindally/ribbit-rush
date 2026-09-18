import { describe, expect, it } from 'vitest';
import { World } from '../src/game/world';
import { START_LIVES } from '../src/game/scoring';
import type { LaneDef, LevelDef } from '../src/game/types';

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
