import { describe, expect, it } from 'vitest';
import {
  bufferHop,
  computeHopTarget,
  consumeHop,
  createFrog,
  createHopBuffer,
} from '../src/game/frog';
import { COLS, HOME_ROW, MEDIAN_ROW, START_ROW } from '../src/game/constants';
import type { Frog } from '../src/game/types';

function frogAt(overrides: Partial<Frog> = {}): Frog {
  return { ...createFrog(), ...overrides };
}

describe('computeHopTarget bounds', () => {
  it('blocks hopping below the start bank', () => {
    const frog = frogAt({ row: START_ROW, x: 6 });
    const result = computeHopTarget(frog, 'down');
    expect(result.blocked).toBe(true);
    expect(result.toRow).toBe(START_ROW);
  });

  it('blocks hopping left of column 0', () => {
    const frog = frogAt({ row: MEDIAN_ROW, x: 0 });
    const result = computeHopTarget(frog, 'left');
    expect(result.blocked).toBe(true);
  });

  it('blocks hopping right of column 12', () => {
    const frog = frogAt({ row: MEDIAN_ROW, x: COLS - 1 });
    const result = computeHopTarget(frog, 'right');
    expect(result.blocked).toBe(true);
  });

  it('allows a hop within bounds', () => {
    const frog = frogAt({ row: MEDIAN_ROW, x: 6 });
    const result = computeHopTarget(frog, 'up');
    expect(result.blocked).toBe(false);
    expect(result.toRow).toBe(MEDIAN_ROW - 1);
  });
});

describe('hedge blocking on the home row', () => {
  it('blocks landing on a non-slot column of row 1', () => {
    const frog = frogAt({ row: HOME_ROW + 1, x: 1 }); // column 1 is not a home slot
    const result = computeHopTarget(frog, 'up');
    expect(result.blocked).toBe(true);
    expect(result.hedge).toBe(true);
  });

  it('allows landing on a home slot column', () => {
    const frog = frogAt({ row: HOME_ROW + 1, x: 3 }); // column 3 is a home slot
    const result = computeHopTarget(frog, 'up');
    expect(result.blocked).toBe(false);
    expect(result.toRow).toBe(HOME_ROW);
    expect(result.toX).toBe(3);
  });
});

describe('snapping on land rows only', () => {
  it('snaps to the nearest column when landing on the median row', () => {
    const frog = frogAt({ row: MEDIAN_ROW + 1, x: 5.7 });
    const result = computeHopTarget(frog, 'up');
    expect(result.toRow).toBe(MEDIAN_ROW);
    expect(result.toX).toBe(6);
  });

  it('keeps continuous x when landing on a river row', () => {
    const frog = frogAt({ row: 3, x: 5.7 });
    const result = computeHopTarget(frog, 'up');
    expect(result.toRow).toBe(2);
    expect(result.toX).toBeCloseTo(5.7);
  });

  it('keeps continuous x moving horizontally within a river row', () => {
    const frog = frogAt({ row: 3, x: 5.7 });
    const result = computeHopTarget(frog, 'right');
    expect(result.toRow).toBe(3);
    expect(result.toX).toBeCloseTo(6.7);
  });
});

describe('one-deep hop buffer', () => {
  it('executes exactly one hop: the most recently buffered direction', () => {
    const buf = createHopBuffer();
    bufferHop(buf, 'up');
    bufferHop(buf, 'left');
    bufferHop(buf, 'right'); // overwrites, buffer stays one-deep

    const first = consumeHop(buf);
    expect(first).toBe('right');

    const second = consumeHop(buf);
    expect(second).toBeNull(); // nothing left buffered
  });

  it('starts empty', () => {
    const buf = createHopBuffer();
    expect(consumeHop(buf)).toBeNull();
  });
});
