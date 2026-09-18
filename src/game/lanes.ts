// Lane simulation: mover wrap/period math and the turtle dive cycle. Pure and unit-tested.
// See ARCHITECTURE.md section 6.

import type { DiveDef, LaneDef, MoverDef, MoverType } from './types';

/** Floor-mod: always returns a value in [0, period). */
export function wrapValue(v: number, period: number): number {
  return ((v % period) + period) % period;
}

export function laneMaxWidth(lane: LaneDef): number {
  let max = 0;
  for (const m of lane.movers) if (m.width > max) max = m.width;
  return max;
}

/**
 * Advances every mover's stored offset by `speed * dt`, wrapped into [0, period). This mutates
 * `lane.movers[*].offset` in place - callers own a level's LaneDef instances for the duration of
 * an attempt, so this is the lane's "current time" advancing, not aliased shared data.
 */
export function stepLane(lane: LaneDef, dt: number): void {
  for (const m of lane.movers) {
    m.offset = wrapValue(m.offset + lane.speed * dt, lane.period);
  }
}

/** A mover's current left-edge x, in tiles. Enters from off-screen per the offset - maxWidth rule. */
export function moverX(lane: LaneDef, mover: MoverDef): number {
  return mover.offset - laneMaxWidth(lane);
}

/** The mover's x for each period-wrapped copy that could be visible (k in {-1, 0, 1}). */
export function moverInstances(lane: LaneDef, mover: MoverDef): number[] {
  const base = moverX(lane, mover);
  return [base - lane.period, base, base + lane.period];
}

export const PLATFORM_TYPES: readonly MoverType[] = ['log', 'turtle', 'croc', 'floe'];

export function isPlatformType(type: MoverType): boolean {
  return PLATFORM_TYPES.includes(type);
}

export type DiveState = 'up' | 'sinking' | 'down' | 'rising';

const DIVE_SINK_S = 0.5;
const DIVE_RISE_S = 0.5;

/**
 * Turtle dive state machine: up (up s) -> sinking (0.5s) -> down (down s) -> rising (0.5s),
 * looping. `phase` offsets where in the cycle t=0 falls. A turtle is a platform unless its
 * state is 'down'.
 */
export function turtleDiveState(dive: DiveDef, t: number): DiveState {
  const cycle = dive.up + DIVE_SINK_S + dive.down + DIVE_RISE_S;
  const pos = wrapValue(t + dive.phase, cycle);
  if (pos < dive.up) return 'up';
  if (pos < dive.up + DIVE_SINK_S) return 'sinking';
  if (pos < dive.up + DIVE_SINK_S + dive.down) return 'down';
  return 'rising';
}

/** Whether a mover currently acts as a rideable platform, given the current lane time `t`. */
export function isPlatformNow(mover: MoverDef, t: number): boolean {
  if (!isPlatformType(mover.type)) return false;
  if (mover.dive && turtleDiveState(mover.dive, t) === 'down') return false;
  return true;
}
