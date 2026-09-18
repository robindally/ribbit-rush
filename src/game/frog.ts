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
 * Shared bounds/snap/hedge resolver for a `(dRow, dx)` offset from `pos`. `computeHopTarget`
 * (below) is a thin `Dir`-based wrapper over this; `computeMegaHopTarget` (M7: docs/specs/
 * M7-powerups-scoring.md section 1, "the next forward hop covers 2 tiles") reuses it directly
 * with `dRow: -2` so the 2-tile jump obeys exactly the same grid-edge/hedge blocking and
 * land-row column snapping as a normal hop, with no duplicated logic.
 */
function resolveTarget(pos: { x: number; row: number }, dRow: number, dx: number): HopTarget {
  const toRow = pos.row + dRow;
  let toX = pos.x + dx;

  if (toRow > START_ROW || toRow < HOME_ROW) {
    return { blocked: true, hedge: false, toX: pos.x, toRow: pos.row };
  }
  if (toX < 0 || toX > COLS - 1) {
    return { blocked: true, hedge: false, toX: pos.x, toRow: pos.row };
  }

  if (LAND_ROWS.has(toRow)) toX = Math.round(toX);

  if (toRow === HOME_ROW && !(HOME_COLS as readonly number[]).includes(toX)) {
    return { blocked: true, hedge: true, toX: pos.x, toRow: pos.row };
  }

  return { blocked: false, hedge: false, toX, toRow };
}

/**
 * Computes the target x/row for a hop in `dir` from `pos`, without mutating anything. Hop targets
 * snap to the nearest tile column on land rows (median, start bank, home) and keep the continuous
 * x on river rows. Bounds: can't hop below the start bank, can't hop past column 0 or 12, and
 * can't hop into a hedge column of the home row.
 *
 * Takes `{ x, row }` rather than a full `Frog` (any `Frog` still satisfies this structurally) so
 * `game/world.ts` can reuse the exact same bounds/hedge logic for the M6 oil-slide mechanic
 * (docs/LEVELS.md "new mover and lane rules": sliding one extra tile in the hop direction,
 * "blocked at the grid edge or into a hedge") without duplicating it.
 */
export function computeHopTarget(pos: { x: number; row: number }, dir: Dir): HopTarget {
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
  return resolveTarget(pos, dRow, dx);
}

/**
 * Mega Hop's forward-only 2-tile target (M7: docs/specs/M7-powerups-scoring.md section 1). Only
 * ever called for a forward ('up') hop - side/backward hops don't consume Mega Hop at all (see
 * `game/world.ts`), so there's no equivalent for other directions. Blocked exactly like a normal
 * hop (grid edge, hedge column) - `game/world.ts` leaves Mega Hop armed (not consumed) when this
 * comes back blocked, so the player can try again once closer to a valid landing.
 */
export function computeMegaHopTarget(pos: { x: number; row: number }): HopTarget {
  return resolveTarget(pos, -2, 0);
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
