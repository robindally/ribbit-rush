// Screen shake (trauma model) and camera punch. See docs/specs/M4-juice.md sections 2 and 9.
//
// Camera punch lives here rather than in a separate file: ARCHITECTURE.md section 2 fixes the
// fx/ file list at particles.ts / shake.ts / popups.ts / hitstop.ts, and punch is the same kind
// of thing as shake - a small transform applied to the play layers, not the HUD - so it shares
// this module's `applyCamera`/`restoreCamera` pair instead of adding a fifth file for a few lines
// of easing math.
//
// Self-subscribes to `GameEvent` for its triggers (death, home, bonk add trauma; home and
// levelClear punch the camera), per the milestone rule that fx/ reacts to events rather than
// being called directly by gameplay code.

import { gameEvents } from '../core/events';

const TRAUMA_DECAY_PER_S = 1.5;
const SHAKE_MAX_OFFSET_PX = 6;
const SHAKE_MAX_ROT_RAD = 0.5 * (Math.PI / 180);

const DEATH_TRAUMA = 0.5;
const HOME_TRAUMA = 0.2;
const BONK_TRAUMA = 0.1;

const HOME_PUNCH_SCALE = 1.02;
const HOME_PUNCH_MS = 120;
const LEVEL_CLEAR_PUNCH_SCALE = 1.04;
const LEVEL_CLEAR_PUNCH_MS = 120; // duration not separately specified; reuses the home punch's

let reduceMotion = false;
let trauma = 0;

// Punch: a single active punch at a time (a newer one simply replaces the current one - punches
// are 120ms, far shorter than the gap between two home landings in normal play).
let punchScale = 1;
let punchDurationS = 0;
let punchElapsedS = -1; // -1 = inactive

export function setReduceMotion(v: boolean): void {
  reduceMotion = v;
}

/** Adds trauma, clamped to 1. Reduce-motion disables shake entirely (spec section 2). */
export function addTrauma(amount: number): void {
  if (reduceMotion) return;
  trauma = Math.min(1, trauma + amount);
}

export function triggerPunch(scale: number, durationMs: number): void {
  punchScale = scale;
  punchDurationS = (reduceMotion ? durationMs / 2 : durationMs) / 1000;
  punchElapsedS = 0;
}

export function update(dt: number): void {
  trauma = Math.max(0, trauma - TRAUMA_DECAY_PER_S * dt);
  if (punchElapsedS >= 0) {
    punchElapsedS += dt;
    if (punchElapsedS >= punchDurationS) punchElapsedS = -1;
  }
}

// Cheap deterministic pseudo-noise: a couple of summed sines at irrational-ish frequency ratios,
// so two streams sampled at the same `t` with different seeds don't visibly correlate, without
// pulling in a real noise library for six pixels of jitter.
function noise1(t: number, seed: number): number {
  return (
    Math.sin(t * 13.7 + seed * 11.3) * 0.6 + Math.sin(t * 27.1 + seed * 5.9) * 0.4
  );
}

export interface CameraTransform {
  x: number;
  y: number;
  rot: number;
  scale: number;
}

/** The current shake offset + punch scale, sampled at simulation time `elapsed`. */
export function getCameraTransform(elapsed: number): CameraTransform {
  const t2 = trauma * trauma;
  const x = trauma > 0 ? noise1(elapsed, 1) * t2 * SHAKE_MAX_OFFSET_PX : 0;
  const y = trauma > 0 ? noise1(elapsed, 7.3) * t2 * SHAKE_MAX_OFFSET_PX : 0;
  const rot = trauma > 0 ? noise1(elapsed, 3.7) * t2 * SHAKE_MAX_ROT_RAD : 0;

  let scale = 1;
  if (punchElapsedS >= 0 && punchDurationS > 0) {
    const t = Math.min(1, punchElapsedS / punchDurationS);
    // Ease-out punch up over the first 40%, ease back down over the remainder - "scale to 1.02
    // for 120ms with ease-out" read as a quick punch-and-settle rather than a step change.
    const peak = 0.4;
    if (t < peak) {
      const et = 1 - Math.pow(1 - t / peak, 2); // ease-out
      scale = 1 + (punchScale - 1) * et;
    } else {
      const et = (t - peak) / (1 - peak);
      scale = punchScale - (punchScale - 1) * et;
    }
  }

  return { x, y, rot, scale };
}

/** Applies the camera transform to `ctx`, centred on the canvas. Callers must pair this with
 * `restoreCamera`. Only wraps the play layers, never the HUD (spec section 2). */
export function applyCamera(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  elapsed: number,
): void {
  const t = getCameraTransform(elapsed);
  ctx.save();
  const cx = canvasWidth / 2;
  const cy = canvasHeight / 2;
  ctx.translate(cx + t.x, cy + t.y);
  ctx.rotate(t.rot);
  ctx.scale(t.scale, t.scale);
  ctx.translate(-cx, -cy);
}

export function restoreCamera(ctx: CanvasRenderingContext2D): void {
  ctx.restore();
}

/** Test/dev-only: resets trauma and punch state. */
export function reset(): void {
  trauma = 0;
  punchElapsedS = -1;
}

gameEvents.on('death', () => addTrauma(DEATH_TRAUMA));
gameEvents.on('home', () => {
  addTrauma(HOME_TRAUMA);
  triggerPunch(HOME_PUNCH_SCALE, HOME_PUNCH_MS);
});
gameEvents.on('bonk', () => addTrauma(BONK_TRAUMA));
gameEvents.on('levelClear', () => triggerPunch(LEVEL_CLEAR_PUNCH_SCALE, LEVEL_CLEAR_PUNCH_MS));
