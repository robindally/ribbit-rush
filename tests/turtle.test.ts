import { describe, expect, it } from 'vitest';
import { isPlatformNow, turtleDiveState } from '../src/game/lanes';
import { platformAt } from '../src/game/collision';
import type { DiveDef, LaneDef, MoverDef } from '../src/game/types';

const dive: DiveDef = { up: 3, down: 2, phase: 0 };
// cycle = 3 (up) + 0.5 (sinking) + 2 (down) + 0.5 (rising) = 6

describe('turtleDiveState', () => {
  it('cycles through up -> sinking -> down -> rising with the given timings', () => {
    expect(turtleDiveState(dive, 0)).toBe('up');
    expect(turtleDiveState(dive, 2.9)).toBe('up');
    expect(turtleDiveState(dive, 3.0)).toBe('sinking');
    expect(turtleDiveState(dive, 3.4)).toBe('sinking');
    expect(turtleDiveState(dive, 3.5)).toBe('down');
    expect(turtleDiveState(dive, 5.4)).toBe('down');
    expect(turtleDiveState(dive, 5.5)).toBe('rising');
    expect(turtleDiveState(dive, 5.9)).toBe('rising');
  });

  it('loops back to up after a full cycle', () => {
    expect(turtleDiveState(dive, 6)).toBe('up');
    expect(turtleDiveState(dive, 6 + 3.5)).toBe('down');
  });

  it('phase offsets where t=0 falls in the cycle', () => {
    const phased: DiveDef = { up: 3, down: 2, phase: 3 };
    // At t=0, cycle position is wrap(0 + 3, 6) = 3 -> sinking
    expect(turtleDiveState(phased, 0)).toBe('sinking');
  });
});

describe('isPlatformNow', () => {
  const turtle: MoverDef = { type: 'turtle', width: 2, offset: 0, dive };

  it('is a platform except while down', () => {
    expect(isPlatformNow(turtle, 0)).toBe(true); // up
    expect(isPlatformNow(turtle, 3.2)).toBe(true); // sinking
    expect(isPlatformNow(turtle, 4)).toBe(false); // down
    expect(isPlatformNow(turtle, 5.7)).toBe(true); // rising
  });

  it('non-platform movers are never platforms, dive or not', () => {
    const car: MoverDef = { type: 'car', width: 1, offset: 0 };
    expect(isPlatformNow(car, 0)).toBe(false);
  });

  it('logs are always platforms (no dive)', () => {
    const log: MoverDef = { type: 'log', width: 3, offset: 0 };
    expect(isPlatformNow(log, 999)).toBe(true);
  });
});

describe('platformAt with a diving turtle', () => {
  it('a frog on a turtle that reaches down finds no platform', () => {
    const lane: LaneDef = {
      row: 3,
      kind: 'river',
      speed: 0,
      period: 20,
      movers: [{ type: 'turtle', width: 2, offset: 2, dive }], // x = 2 - 2 = 0, spans [0,2)
    };
    expect(platformAt(lane, 1, 0)).not.toBeNull(); // up
    expect(platformAt(lane, 1, 4)).toBeNull(); // down
    expect(platformAt(lane, 1, 5.7)).not.toBeNull(); // rising
  });
});
