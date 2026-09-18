// Frog state machine: creation, hop bounds/target computation, and the one-deep hop buffer.
// Pure and canvas/audio free so it is directly unit-testable. See ARCHITECTURE.md section 7.
//
// Note on the hop buffer: ARCHITECTURE.md section 5 says "The Play scene keeps a one-deep hop
// buffer," but the M0-M2 spec lists buffer behaviour as a `frog` test, and section 13 forbids
// canvas/audio in tests (which rules out testing scene code directly). We implement the buffer
// here as a small, independently testable value type instead, and `world.ts` (not the scene)
// owns an instance of it. See docs/specs/M0-M2-report.md for the full rationale.

import { COLS, HOME_COLS, HOME_ROW, MEDIAN_ROW, START_ROW } from './constants';
import type { Dir, Frog } from './types';

export function createFrog(): Frog {
  return {
    x: 6,
    row: START_ROW,
    fromX: 6,
    fromRow: START_ROW,
    toX: 6,
    toRow: START_ROW,
    hopT: 1,
    facing: 'up',
    state: 'idle',
    stateT: 0,
    maxRow: START_ROW,
  };
}

export interface HopTarget {
  blocked: boolean;
  /** True only when blocked because row 1 was targeted but the column isn't a home slot. */
  hedge: boolean;
  toX: number;
  toRow: number;
}

const LAND_ROWS = new Set<number>([MEDIAN_ROW, START_ROW, HOME_ROW]);

/**
 * Computes the target x/row for a hop in `dir` from the frog's current position, without
 * mutating `frog`. Hop targets snap to the nearest tile column on land rows (median, start
 * bank, home) and keep the continuous x on river rows. Bounds: can't hop below the start bank,
 * can't hop past column 0 or 12, and can't hop into a hedge column of the home row.
 */
export function computeHopTarget(frog: Frog, dir: Dir): HopTarget {
  let dx = 0;
  let dRow = 0;
  switch (dir) {
    case 'up':
      dRow = -1;
      break;
    case 'down':
      dRow = 1;
      break;
    case 'left':
      dx = -1;
      break;
    case 'right':
      dx = 1;
      break;
  }

  const toRow = frog.row + dRow;
  let toX = frog.x + dx;

  if (toRow > START_ROW || toRow < HOME_ROW) {
    return { blocked: true, hedge: false, toX: frog.x, toRow: frog.row };
  }
  if (toX < 0 || toX > COLS - 1) {
    return { blocked: true, hedge: false, toX: frog.x, toRow: frog.row };
  }

  if (LAND_ROWS.has(toRow)) toX = Math.round(toX);

  if (toRow === HOME_ROW && !(HOME_COLS as readonly number[]).includes(toX)) {
    return { blocked: true, hedge: true, toX: frog.x, toRow: frog.row };
  }

  return { blocked: false, hedge: false, toX, toRow };
}

// --- One-deep hop buffer ---

export interface HopBuffer {
  pending: Dir | null;
}

export function createHopBuffer(): HopBuffer {
  return { pending: null };
}

/** Overwrites any previously buffered hop - the buffer is exactly one deep. */
export function bufferHop(buf: HopBuffer, dir: Dir): void {
  buf.pending = dir;
}

/** Returns and clears the buffered hop, or null if none is pending. */
export function consumeHop(buf: HopBuffer): Dir | null {
  const dir = buf.pending;
  buf.pending = null;
  return dir;
}
