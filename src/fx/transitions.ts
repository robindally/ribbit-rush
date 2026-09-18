// Scene transitions: an iris wipe (a circle mask that shrinks to a point, then expands on the
// next scene), or a plain fade under reduce-motion. See docs/specs/M4-juice.md section 7.
//
// Unlike the other fx/ modules, this one isn't triggered by a `GameEvent` - scene navigation
// (Title -> Play, Play -> GameOver, GameOver -> Title) is a `SceneManager` concern, and this
// module has no reference to the scene manager (ARCHITECTURE.md keeps that interface minimal:
// `replace`/`push`/`pop`/`current`, nothing event-driven). Scenes already call into `render/` and
// `render/anim.ts` directly for their own presentation (the "fx subscribes to GameEvent" rule is
// about gameplay code in `game/` never doing so, not about scenes) - so scenes call `play()` here
// at the exact points where a `GameEvent` (death -> gameOver) or a player input already triggers
// the scene change, and render/update this module every frame alongside their own content. See
// docs/specs/M4-report.md "Deviations" for the full reasoning.

import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../game/constants';
import type { Renderer } from '../render/renderer';

const IRIS_DURATION_S = 0.35;
const FADE_DURATION_S = 0.15; // reduce-motion

const BACKDROP = '#14162b';

type Phase = 'idle' | 'closing' | 'opening';

let phase: Phase = 'idle';
let t = 0;
let durationS = IRIS_DURATION_S;
let cx = CANVAS_WIDTH / 2;
let cy = CANVAS_HEIGHT / 2;
let reduceMotion = false;
let onClosed: (() => void) | null = null;

export function setReduceMotion(v: boolean): void {
  reduceMotion = v;
}

/** Read-only accessor for scenes with their own non-fx animations to honour (M8 spec section 6:
 * "reduce motion honoured everywhere") - e.g. `scenes/results.ts`'s time-bonus count-up and
 * pad-lighting stagger, which aren't otherwise routed through any `fx/` module. */
export function isReduceMotion(): boolean {
  return reduceMotion;
}

/**
 * Starts the transition: shrinks the mask to (`focusX`, `focusY`) (defaults to screen centre),
 * calls `onScenesSwapped` the instant the shrink completes (the caller does the actual
 * `scenes.replace(...)` there, hidden behind the fully-closed mask), then expands to reveal the
 * new scene.
 */
export function play(onScenesSwapped: () => void, focusX = cx, focusY = cy): void {
  phase = 'closing';
  t = 0;
  durationS = reduceMotion ? FADE_DURATION_S : IRIS_DURATION_S;
  cx = focusX;
  cy = focusY;
  onClosed = onScenesSwapped;
}

export function isActive(): boolean {
  return phase !== 'idle';
}

export function update(dt: number): void {
  if (phase === 'idle') return;
  t += dt;
  if (t >= durationS) {
    if (phase === 'closing') {
      onClosed?.();
      onClosed = null;
      phase = 'opening';
      t = 0;
    } else {
      phase = 'idle';
      t = 0;
    }
  }
}

function maxRadius(): number {
  const dx = Math.max(cx, CANVAS_WIDTH - cx);
  const dy = Math.max(cy, CANVAS_HEIGHT - cy);
  return Math.hypot(dx, dy);
}

/** Draws the mask for the current phase, full-canvas, on top of whatever the scene already drew
 * this frame. A no-op while idle. */
export function render(r: Renderer): void {
  if (phase === 'idle') return;
  const ctx = r.ctx;
  const progress = Math.min(1, t / durationS);

  if (reduceMotion) {
    // Plain fade: opaque backdrop, alpha ramps to 1 while closing and back to 0 while opening.
    const alpha = phase === 'closing' ? progress : 1 - progress;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = BACKDROP;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.restore();
    return;
  }

  const full = maxRadius();
  const radius = phase === 'closing' ? full * (1 - progress) : full * progress;

  ctx.save();
  ctx.fillStyle = BACKDROP;
  ctx.beginPath();
  ctx.rect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  ctx.moveTo(cx + radius, cy);
  ctx.arc(cx, cy, radius, 0, Math.PI * 2, true); // reverse winding cuts the circle out
  ctx.closePath();
  ctx.fill('evenodd');
  ctx.restore();
}

/** Test/dev-only: resets to idle. */
export function reset(): void {
  phase = 'idle';
  t = 0;
  onClosed = null;
}
