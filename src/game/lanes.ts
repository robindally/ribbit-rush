// Lane simulation: mover wrap/period math and the turtle dive cycle. Pure and unit-tested.
// See ARCHITECTURE.md section 6.

import type { DiveDef, FloeState, LaneDef, MoverDef, MoverType } from './types';

/** Floor-mod: always returns a value in [0, period). */
export function wrapValue(v: number, period: number): number {
  return ((v % period) + period) % period;
}

export function laneMaxWidth(lane: LaneDef): number {
  let max = 0;
  for (const m of lane.movers) if (m.width > max) max = m.width;
  return max;
}

/** A mover's own signed speed: `MoverDef.speed` overrides the lane's speed when present (M6: jet
 * skis, otters, snakes riding at a different speed than the platforms sharing their lane). See
 * docs/ARCHITECTURE.md section 6 and docs/LEVELS.md "new mover and lane rules". */
export function moverSpeed(lane: LaneDef, mover: MoverDef): number {
  return mover.speed ?? lane.speed;
}

/**
 * Advances every mover's stored offset by its own speed * dt (see `moverSpeed`), wrapped into
 * [0, period). This mutates `lane.movers[*].offset` in place - callers own a level's LaneDef
 * instances for the duration of an attempt, so this is the lane's "current time" advancing, not
 * aliased shared data. Also resets a floe's crack state the instant it wraps off screen (M6:
 * docs/LEVELS.md "A floe resets to 'solid' once it wraps off screen").
 */
export function stepLane(lane: LaneDef, dt: number): void {
  for (const m of lane.movers) {
    // M10: record the pre-step offset for render interpolation (ARCHITECTURE.md section 4: "each
    // mover keeps prevX") - same "px = x, then advance x" order `fx/particles.ts`'s `update()`
    // already uses, so a caller that runs several fixed steps in one animation frame (a slow frame
    // catching up) ends up with `prevOffset` holding only the value from just before the *last* of
    // those steps, which is exactly what the frame's alpha (the fraction of a step *since* that
    // last step) should interpolate from.
    m.prevOffset = m.offset;
    const speed = moverSpeed(lane, m);
    const raw = m.offset + speed * dt;
    const wrapped = wrapValue(raw, lane.period);
    if (m.floe && raw !== wrapped) resetFloeState(m.floe);
    m.offset = wrapped;
  }
}

/** A mover's current left-edge x, in tiles. Enters from off-screen per the offset - maxWidth rule.
 * `offsetOverride` lets a renderer substitute an interpolated offset (see `moverRenderOffset`)
 * without touching the mover's own simulation state; gameplay code (collision, power-up placement)
 * never passes it, so it always reads the real, current `mover.offset`. */
export function moverX(lane: LaneDef, mover: MoverDef, offsetOverride?: number): number {
  return (offsetOverride ?? mover.offset) - laneMaxWidth(lane);
}

/** The mover's x for each period-wrapped copy that could be visible (k in {-1, 0, 1}). */
export function moverInstances(lane: LaneDef, mover: MoverDef, offsetOverride?: number): number[] {
  const base = moverX(lane, mover, offsetOverride);
  return [base - lane.period, base, base + lane.period];
}

/** Shortest-path lerp between two values that both live in `[0, period)` and may have wrapped
 * between them (e.g. `prev = period - 0.2`, `curr = 0.1` after one lap) - takes whichever direction
 * covers less than half the period, so a mover about to wrap doesn't visibly snap backward across
 * the whole lane for one interpolated frame. */
function lerpWrapped(prev: number, curr: number, period: number, t: number): number {
  let delta = curr - prev;
  if (delta > period / 2) delta -= period;
  else if (delta < -period / 2) delta += period;
  return prev + delta * t;
}

/** M10: a mover's render-time offset, interpolated between its previous and current fixed-step
 * offset by the loop's `alpha` (ARCHITECTURE.md section 4) - what `render/draw/entities.ts`'s
 * `drawLaneMovers` (and the water/lighting layers that track a platform's position) pass as
 * `moverX`/`moverInstances`'s `offsetOverride` instead of drawing at the raw, still-60Hz-stepped
 * `mover.offset`. Falls back to the current offset (no interpolation) when there's no previous
 * value yet - a mover on a level/crossing that just loaded. */
export function moverRenderOffset(lane: LaneDef, mover: MoverDef, alpha: number): number {
  if (mover.prevOffset === undefined) return mover.offset;
  return wrapValue(lerpWrapped(mover.prevOffset, mover.offset, lane.period, alpha), lane.period);
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
  if (mover.floe && mover.floe.state === 'sunk') return false;
  return true;
}

// --- Floe crack/sink (M6: docs/specs/M6-worlds.md section 2, docs/LEVELS.md "new mover and lane
// rules") ---
//
// Unlike turtle dive (a pure function of lane time via `phase`), a floe's crack timer depends on
// how long *this specific frog attempt* has stood on *this specific floe instance* - it can't be
// derived from elapsed time alone, so it's small mutable state on the `MoverDef` itself
// (`MoverDef.floe`), advanced explicitly by whoever is carrying the frog (`game/world.ts`) and
// reset by `stepLane` above the instant the mover wraps off screen.

export const FLOE_CRACK_S = 2; // seconds standing before it starts cracking
export const FLOE_SINK_S = 0.4; // seconds cracking before fully sunk

export function createFloeState(): FloeState {
  return { standingT: 0, state: 'solid' };
}

function resetFloeState(floe: FloeState): void {
  floe.standingT = 0;
  floe.state = 'solid';
}

/**
 * Advances a floe's crack timer by `dt` while the frog is riding it (`riding`); a floe not
 * currently ridden holds its timer exactly where it was (docs/LEVELS.md: "Hopping off and back on
 * does not reset standingT until it wraps") - only `stepLane`'s wrap detection resets it. Pure:
 * returns the next state rather than mutating `floe`, so callers own exactly when the mutation
 * happens (world.ts assigns the result back onto `mover.floe`).
 */
export function stepFloeState(floe: FloeState, dt: number, riding: boolean): FloeState {
  if (!riding || floe.state === 'sunk') return floe;
  const standingT = floe.standingT + dt;
  if (floe.state === 'solid') {
    return standingT >= FLOE_CRACK_S ? { standingT, state: 'cracking' } : { standingT, state: 'solid' };
  }
  // 'cracking'
  return standingT >= FLOE_CRACK_S + FLOE_SINK_S
    ? { standingT, state: 'sunk' }
    : { standingT, state: 'cracking' };
}

// --- Train crossing warning (M6: docs/specs/M6-worlds.md section 2, docs/LEVELS.md "new mover
// and lane rules") ---

export const TRAIN_WARNING_S = 1.5;

/**
 * Seconds until `mover`'s leading edge (in its direction of travel) *next* reaches the boundary
 * where it enters the visible screen `[0, cols)`, computed from its *current* stored offset (which
 * already represents "now") - no elapsed-time parameter needed, unlike `turtleDiveState`. A
 * stationary lane (`speed === 0`) never enters, hence `null`.
 *
 * Naively checking "is the leading edge's x already >= 0" doesn't work here: `offset` cycles
 * through the *whole* period every lap, most of which is off-screen in the gap between exiting one
 * side and re-entering the other (period is normally well past `cols + width`) - a large offset can
 * mean either "just about to enter" or "long since exited, still waiting to wrap," and both have a
 * non-negative leading-edge x. Instead this finds the *next* offset (mod period) at which the
 * leading edge sits exactly on the entry boundary, and converts that angular distance to seconds -
 * a single formula that's correct whether the mover is currently approaching, mid-crossing (a large
 * "next lap" answer, always well outside `TRAIN_WARNING_S`), or already past and waiting to wrap.
 */
export function secondsUntilLeadingEdgeEnters(
  lane: LaneDef,
  mover: MoverDef,
  cols: number,
): number | null {
  const speed = moverSpeed(lane, mover);
  if (speed === 0) return null;
  const maxWidth = laneMaxWidth(lane);

  if (speed > 0) {
    // Entry boundary: x + mover.width = 0, i.e. offset = maxWidth - mover.width (since
    // x = offset - maxWidth). `delta` is how much further offset must advance (mod period).
    const target = wrapValue(maxWidth - mover.width, lane.period);
    const delta = wrapValue(target - mover.offset, lane.period);
    return delta / speed;
  }

  // speed < 0: entry boundary is x = cols, i.e. offset = cols + maxWidth. `delta` is how much
  // further offset must *decrease* (mod period).
  const target = wrapValue(cols + maxWidth, lane.period);
  const delta = wrapValue(mover.offset - target, lane.period);
  return delta / -speed;
}

/** Whether the crossing signal should be flashing for `mover` right now - i.e. its leading edge
 * enters the screen within `TRAIN_WARNING_S`. Shared by the one-shot `trainWarning` GameEvent
 * (world.ts) and the renderer's continuous signal-light flash. */
export function isTrainWarningActive(lane: LaneDef, mover: MoverDef, cols: number): boolean {
  const eta = secondsUntilLeadingEdgeEnters(lane, mover, cols);
  return eta !== null && eta <= TRAIN_WARNING_S;
}
