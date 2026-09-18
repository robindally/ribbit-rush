// Hit-stop and slow motion. See docs/specs/M4-juice.md section 3 and ARCHITECTURE.md section 4
// ("`hitstop.ts` can pause simulation for N ms while rendering continues" / "`timeScale`
// (default 1) multiplies dt for slow motion" - this module is that anticipated state, consulted
// once per real animation frame by `core/loop.ts`).
//
// Self-subscribes to `GameEvent` (death triggers a hard pause, levelClear triggers slow motion)
// per the milestone rule that everything in `src/fx/` reacts to events rather than being called
// directly by gameplay code.

import { gameEvents } from '../core/events';

const DEATH_HITSTOP_MS = 80;
const LEVEL_CLEAR_SLOWMO_SCALE = 0.3;
const LEVEL_CLEAR_SLOWMO_MS = 400;

let reduceMotion = false;
let pausedForMs = 0;
let slowMoScale = 1;
let slowMoForMs = 0;

export function setReduceMotion(v: boolean): void {
  reduceMotion = v;
}

/** Pauses the fixed-step simulation for `ms` of real time (reduce-motion halves it). Overlapping
 * triggers extend rather than shorten the remaining pause. */
export function triggerHitstop(ms: number): void {
  const scaled = reduceMotion ? ms / 2 : ms;
  pausedForMs = Math.max(pausedForMs, scaled);
}

/** Slows the simulation to `scale` for `ms` of real time (reduce-motion halves the duration, not
 * the scale itself - the point is a shorter dip, not a shallower one). */
export function triggerSlowMo(scale: number, ms: number): void {
  const scaled = reduceMotion ? ms / 2 : ms;
  slowMoScale = scale;
  slowMoForMs = Math.max(slowMoForMs, scaled);
}

/** Advances both timers by `realMs` of wall-clock time. Call once per animation frame, before
 * consulting `isPaused`/`getTimeScale` for that frame's fixed-step budget. */
export function tick(realMs: number): void {
  if (pausedForMs > 0) {
    pausedForMs = Math.max(0, pausedForMs - realMs);
  }
  if (slowMoForMs > 0) {
    slowMoForMs = Math.max(0, slowMoForMs - realMs);
    if (slowMoForMs <= 0) slowMoScale = 1;
  }
}

export function isPaused(): boolean {
  return pausedForMs > 0;
}

/** The multiplier the fixed step should apply to `dt` this frame. 1 when nothing is active. Only
 * meaningful when `isPaused()` is false - a hard pause skips stepping the simulation entirely. */
export function getTimeScale(): number {
  return slowMoForMs > 0 ? slowMoScale : 1;
}

/** Test/dev-only: clears both timers so tests don't leak state into each other via this module's
 * singleton. */
export function reset(): void {
  pausedForMs = 0;
  slowMoScale = 1;
  slowMoForMs = 0;
}

gameEvents.on('death', () => triggerHitstop(DEATH_HITSTOP_MS));
gameEvents.on('levelClear', () => triggerSlowMo(LEVEL_CLEAR_SLOWMO_SCALE, LEVEL_CLEAR_SLOWMO_MS));
