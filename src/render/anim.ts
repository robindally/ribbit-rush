// Pure animation-timing helpers for the frog, turtles, and small vehicle juice. Render-only:
// nothing here reads or writes gameplay state, it only maps time (elapsed / hopT / stateT, all
// already exposed by game/world.ts and game/types.ts) to visual transforms. See
// docs/ART_BIBLE.md section 5 ("Animation rules") and docs/specs/M3-art-pass.md sections 4-5.
//
// Kept separate from game/ so it can change freely without touching tested gameplay logic, and so
// the timing math itself stays easy to read and (if ever wanted) unit test without a canvas.

import type { DiveDef, DeathCause } from '../game/types';

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function wrap(v: number, period: number): number {
  return ((v % period) + period) % period;
}

// --- Frog: hop squash-and-stretch (bible section 5, "Hop") ---

export interface ScaleXY {
  scaleX: number;
  scaleY: number;
}

/** Mid-air scale while `frog.state === 'hopping'` (hopT 0..1 over the 110ms hop). */
export function frogHopScale(hopT: number): ScaleXY {
  const t = clamp(hopT, 0, 1);
  const scaleY = t <= 0.4 ? lerp(1.0, 1.25, t / 0.4) : lerp(1.25, 0.8, (t - 0.4) / 0.6);
  return { scaleX: 1, scaleY };
}

/** Hop arc height, in tiles (0.4 tile at the apex, hopT = 0.5). */
export function frogHopArc(hopT: number): number {
  return Math.sin(Math.PI * clamp(hopT, 0, 1)) * 0.4;
}

/** Ground shadow scale: full size on the ground, shrinks to 70% at the hop's apex. */
export function frogShadowScale(hopT: number): number {
  return lerp(1, 0.7, Math.sin(Math.PI * clamp(hopT, 0, 1)));
}

const LANDING_SQUASH_S = 0.09;

/**
 * Recovery squash for the 90ms right after landing (`frog.state === 'idle'`,
 * `frog.stateT < 0.09`): scale Y 0.8 -> 1.0, scale X 1.3 -> 1.0.
 */
export function frogLandingSquash(stateT: number): ScaleXY {
  const t = clamp(stateT / LANDING_SQUASH_S, 0, 1);
  return { scaleX: lerp(1.3, 1.0, t), scaleY: lerp(0.8, 1.0, t) };
}

export function isLandingSquashActive(stateT: number): boolean {
  return stateT < LANDING_SQUASH_S;
}

// --- Frog: idle breathing and blinking (bible section 5, "Idle") ---

/** Breathe: scale 1 +/- 0.02 at 1Hz. Takes the world's elapsed simulation time. */
export function frogIdleBreath(elapsed: number): number {
  return 1 + 0.02 * Math.sin(elapsed * Math.PI * 2);
}

// The bible specifies a blink "every 3 to 5s" without pinning an exact value or a source of
// randomness, and blink timing has no gameplay effect - a fixed period (the midpoint of that
// range) keeps this deterministic and easy to eyeball in review, rather than wiring a second RNG
// stream through the render layer for a cosmetic-only effect. See docs/specs/M3-report.md.
const BLINK_PERIOD_S = 4;
const BLINK_DURATION_S = 0.1;

/** Whether the frog's eyelids should be drawn closed this instant. */
export function frogBlink(elapsed: number): boolean {
  return wrap(elapsed, BLINK_PERIOD_S) < BLINK_DURATION_S;
}

// --- Frog: death animations (bible section 5, "Death, ...") ---

export interface FrogDeathVisual {
  scaleX: number;
  scaleY: number;
  alpha: number;
  /** Sink offset in tiles, drown only. */
  sinkY: number;
  /** Timeout's pre-squish red blink flag. */
  redFlash: boolean;
  /** True once the squish has fully compressed - the renderer draws tyre marks. */
  tireMarks: boolean;
}

const DEATH_TOTAL_S = 0.9; // must match game/constants.ts's DEATH_S

/** Squish phase fractions of whatever time budget is available (bible: 120ms / 500ms hold / rest
 * fades, out of the full 900ms death). Scaled so the shortened squish after a timeout's blink
 * phase still resolves cleanly within the remaining budget. */
function squishVisual(
  localT: number,
  budgetS: number,
): { scaleX: number; scaleY: number; alpha: number; tireMarks: boolean } {
  const transformEnd = budgetS * (0.12 / DEATH_TOTAL_S);
  const holdEnd = budgetS * (0.62 / DEATH_TOTAL_S);
  if (localT < transformEnd) {
    const t = transformEnd > 0 ? localT / transformEnd : 1;
    return { scaleX: lerp(1, 1.6, t), scaleY: lerp(1, 0.15, t), alpha: 1, tireMarks: false };
  }
  if (localT < holdEnd) {
    return { scaleX: 1.6, scaleY: 0.15, alpha: 1, tireMarks: true };
  }
  const fadeSpan = Math.max(0.0001, budgetS - holdEnd);
  const t = clamp((localT - holdEnd) / fadeSpan, 0, 1);
  return { scaleX: 1.6, scaleY: 0.15, alpha: lerp(1, 0, t), tireMarks: true };
}

/**
 * Full death visual for `frog.state === 'dying'`, dispatched on `deathCause`. `squish`, `croc`,
 * `hedge`, `occupied`, and `snake` all use the squish tween (the bible only calls out squish,
 * drown, and timeout by name; the others are engine-added causes with no dedicated art-bible
 * entry, so they fall back to squish as the closest fit - matching the M0-M2 report's precedent
 * of reusing 'squish' for `occupied` before it got its own DeathCause value).
 */
export function frogDeathVisual(cause: DeathCause | undefined, stateT: number): FrogDeathVisual {
  const t = Math.max(0, stateT);

  if (cause === 'drown' || cause === 'offscreen') {
    // 'offscreen' (riding a platform off the edge) has no dedicated bible entry either; it only
    // happens over water, so the drown tween is the natural fit.
    const dt = clamp(t / 0.4, 0, 1);
    return {
      scaleX: lerp(1, 0.6, dt),
      scaleY: lerp(1, 0.6, dt),
      alpha: lerp(1, 0, dt),
      sinkY: lerp(0, 6 / 48, dt),
      redFlash: false,
      tireMarks: false,
    };
  }

  if (cause === 'timeout') {
    const blinkBudget = 0.3; // three ~100ms red blinks
    if (t < blinkBudget) {
      const cyclePos = t % 0.1;
      return {
        scaleX: 1,
        scaleY: 1,
        alpha: 1,
        sinkY: 0,
        redFlash: cyclePos < 0.05,
        tireMarks: false,
      };
    }
    const s = squishVisual(t - blinkBudget, DEATH_TOTAL_S - blinkBudget);
    return { ...s, sinkY: 0, redFlash: false };
  }

  const s = squishVisual(t, DEATH_TOTAL_S);
  return { ...s, sinkY: 0, redFlash: false };
}

// --- Home landing (bible section 5, "Home landing") ---

const HOME_PULSE_S = 0.2;

/** Icon scale in the home slot just landed in: 1 -> 1.2 -> 1 over 200ms. */
export function homeLandingScale(timeSinceLanding: number): number {
  if (timeSinceLanding < 0 || timeSinceLanding >= HOME_PULSE_S) return 1;
  const half = HOME_PULSE_S / 2;
  return timeSinceLanding < half
    ? lerp(1, 1.2, timeSinceLanding / half)
    : lerp(1.2, 1, (timeSinceLanding - half) / half);
}

// Ring duration isn't specified by the bible ("Lily pad emits a ring") - 450ms reads clearly
// against the 200ms icon pulse without lingering. See docs/specs/M3-report.md.
const HOME_RING_S = 0.45;

export interface RingVisual {
  radiusTiles: number;
  alpha: number;
}

export function homeRingVisual(timeSinceLanding: number): RingVisual | null {
  if (timeSinceLanding < 0 || timeSinceLanding >= HOME_RING_S) return null;
  const t = timeSinceLanding / HOME_RING_S;
  return { radiusTiles: lerp(0.25, 1.05, t), alpha: lerp(0.6, 0, t) };
}

// --- Turtle dive (bible section 5, "Turtle dive") ---

// Duplicated from game/lanes.ts's private DIVE_SINK_S/DIVE_RISE_S rather than exporting them from
// that gameplay file, to keep game/ completely untouched by this render-only concern. Keep in
// sync if the dive timing constants ever move.
const DIVE_SINK_S = 0.5;
const DIVE_RISE_S = 0.5;
const PRE_DIVE_BLINK_WINDOW_S = 0.6;
const PRE_DIVE_BLINK_SUB_S = 0.3;
const PRE_DIVE_BLINK_DIP_S = 0.1;

export interface TurtleVisual {
  visible: boolean;
  scale: number;
  alpha: number;
}

/** Turtle render state from its DiveDef and the world's elapsed time - mirrors, but does not
 * duplicate the *logic* of, `game/lanes.ts`'s `turtleDiveState` (platform-ability), adding only
 * the sub-phase interpolation needed for rendering. */
export function turtleVisual(dive: DiveDef, t: number): TurtleVisual {
  const cycle = dive.up + DIVE_SINK_S + dive.down + DIVE_RISE_S;
  const pos = wrap(t + dive.phase, cycle);

  if (pos < dive.up) {
    const toSink = dive.up - pos;
    if (toSink <= PRE_DIVE_BLINK_WINDOW_S) {
      const into = PRE_DIVE_BLINK_WINDOW_S - toSink;
      const sub = into % PRE_DIVE_BLINK_SUB_S;
      const dipping = sub < PRE_DIVE_BLINK_DIP_S;
      return { visible: true, scale: 1, alpha: dipping ? 0.4 : 1 };
    }
    return { visible: true, scale: 1, alpha: 1 };
  }
  if (pos < dive.up + DIVE_SINK_S) {
    const local = (pos - dive.up) / DIVE_SINK_S;
    return { visible: true, scale: lerp(1, 0.85, local), alpha: lerp(1, 0.45, local) };
  }
  if (pos < dive.up + DIVE_SINK_S + dive.down) {
    return { visible: false, scale: 0.85, alpha: 0 };
  }
  const local = (pos - dive.up - DIVE_SINK_S - dive.down) / DIVE_RISE_S;
  return { visible: true, scale: lerp(0.85, 1, local), alpha: lerp(0.45, 1, local) };
}

// --- Vehicle juice (bible section 5, "Vehicles") ---

/** Constant 4-degree lean into the direction of travel, in radians. */
export function motorbikeLeanRad(travelDirSign: number): number {
  return Math.sign(travelDirSign) * (4 * (Math.PI / 180));
}

/** 1px bounce at 4Hz, in tiles. */
export function busBounceTiles(elapsed: number): number {
  return (Math.sin(elapsed * Math.PI * 2 * 4) * 1) / 48;
}

export { lerp, clamp, wrap };
