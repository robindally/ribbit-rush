// Movers (vehicles, logs, turtles) and the frog, sprite-based. See ARCHITECTURE.md section 11,
// docs/ART_BIBLE.md sections 4-5, and docs/specs/M3-art-pass.md sections 1 and 4-5.

import { COLS, TILE } from '../../game/constants';
import { moverInstances } from '../../game/lanes';
import type { Dir, Frog, LaneDef, MoverDef } from '../../game/types';
import {
  busBounceTiles,
  frogBlink,
  frogDeathVisual,
  frogHopArc,
  frogHopScale,
  frogIdleBreath,
  frogLandingSquash,
  frogShadowScale,
  isLandingSquashActive,
  motorbikeLeanRad,
  turtleVisual,
  type ScaleXY,
} from '../anim';
import type { Renderer } from '../renderer';

// Frog faces up in its SVG (ARCHITECTURE.md section 11 / ART_BIBLE.md section 2); rotate for the
// other three facings.
const DIR_ROT: Record<Dir, number> = {
  up: 0,
  right: Math.PI / 2,
  down: Math.PI,
  left: -Math.PI / 2,
};

const FROG_BODY = '#58D65E';

function drawLog(r: Renderer, px: number, cy: number, widthTiles: number): void {
  const w = Math.max(2, Math.round(widthTiles));
  r.sprite('log-end', px + TILE / 2, cy);
  for (let i = 1; i < w - 1; i++) {
    r.sprite('log-mid', px + i * TILE + TILE / 2, cy);
  }
  r.sprite('log-end', px + (w - 1) * TILE + TILE / 2, cy, { flipX: true });
}

function drawTurtleGroup(
  r: Renderer,
  px: number,
  cy: number,
  mover: MoverDef,
  lane: LaneDef,
  elapsed: number,
): void {
  const count = Math.max(1, Math.round(mover.width));
  // turtle.svg faces left (ARCHITECTURE.md section 11); flip for right-moving (positive speed)
  // lanes.
  const flip = lane.speed > 0;
  const visual = mover.dive ? turtleVisual(mover.dive, elapsed) : { visible: true, scale: 1, alpha: 1 };
  if (!visual.visible) return;
  for (let i = 0; i < count; i++) {
    const cx = px + (i + 0.5) * TILE;
    r.sprite('turtle', cx, cy, {
      flipX: flip,
      sx: visual.scale,
      sy: visual.scale,
      alpha: visual.alpha,
    });
  }
}

function drawVehicle(r: Renderer, cx: number, cy: number, lane: LaneDef, mover: MoverDef, elapsed: number): void {
  // Vehicles face right in their SVGs; flip for lanes moving left (negative speed).
  const flip = lane.speed < 0;
  let rot = 0;
  let y = cy;
  if (mover.type === 'motorbike') rot = motorbikeLeanRad(1);
  if (mover.type === 'bus') y += busBounceTiles(elapsed) * TILE;
  r.sprite(mover.type, cx, y, { flipX: flip, rot });
}

export function drawLaneMovers(r: Renderer, lane: LaneDef, elapsed: number): void {
  for (const mover of lane.movers) {
    for (const x of moverInstances(lane, mover)) {
      const px = x * TILE;
      const w = mover.width * TILE;
      if (px + w < 0 || px > COLS * TILE) continue; // off-screen, skip

      const cy = lane.row * TILE + TILE / 2;

      if (mover.type === 'log') {
        drawLog(r, px, cy, mover.width);
      } else if (mover.type === 'turtle') {
        drawTurtleGroup(r, px, cy, mover, lane, elapsed);
      } else {
        drawVehicle(r, px + w / 2, cy, lane, mover, elapsed);
      }
    }
  }
}

function drawBlinkOverlay(r: Renderer, cx: number, y: number, rot: number, scale: ScaleXY): void {
  const ctx = r.ctx;
  ctx.save();
  ctx.translate(cx, y);
  if (rot) ctx.rotate(rot);
  ctx.scale(scale.scaleX, scale.scaleY);
  ctx.fillStyle = FROG_BODY;
  ctx.beginPath();
  ctx.ellipse(-8.5, -15.5, 5.2, 3.9, 0, 0, Math.PI * 2);
  ctx.ellipse(8.5, -15.5, 5.2, 3.9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawFrogDeath(r: Renderer, frog: Frog, cx: number, groundY: number): void {
  const v = frogDeathVisual(frog.deathCause, frog.stateT);
  const y = groundY + v.sinkY * TILE;
  const rot = DIR_ROT[frog.facing];

  r.shadow(cx, groundY + TILE * 0.22, TILE * 0.56, TILE * 0.26, 0.6);
  r.sprite('frog-idle', cx, y, { rot, sx: v.scaleX, sy: v.scaleY, alpha: v.alpha });

  if (v.redFlash) {
    r.ctx.save();
    r.ctx.globalAlpha = 0.45;
    r.ctx.fillStyle = '#FF4D4D';
    r.ctx.beginPath();
    r.ctx.ellipse(cx, y, TILE * 0.32, TILE * 0.32, 0, 0, Math.PI * 2);
    r.ctx.fill();
    r.ctx.restore();
  }

  if (v.tireMarks) {
    r.ctx.save();
    r.ctx.strokeStyle = 'rgba(27, 42, 29, 0.5)';
    r.ctx.lineWidth = 4;
    r.ctx.lineCap = 'round';
    r.ctx.beginPath();
    r.ctx.moveTo(cx - TILE * 0.4, y - TILE * 0.18);
    r.ctx.lineTo(cx + TILE * 0.4, y - TILE * 0.18);
    r.ctx.moveTo(cx - TILE * 0.4, y + TILE * 0.18);
    r.ctx.lineTo(cx + TILE * 0.4, y + TILE * 0.18);
    r.ctx.stroke();
    r.ctx.restore();
  }
}

/** Draws the frog: hop arc + squash-and-stretch, idle breathing/blink, or a death tween,
 * dispatched from `frog.state`/`frog.stateT`/`frog.hopT` - all already part of the tested Frog
 * type, so none of this needs new gameplay-side state. `elapsed` is the world's simulation clock
 * (drives idle breathing/blink, which have no gameplay effect). */
export function drawFrog(r: Renderer, frog: Frog, elapsed: number): void {
  const cx = (frog.x + 0.5) * TILE;
  const groundY = frog.row * TILE + TILE / 2;

  if (frog.state === 'dying' || frog.state === 'dead') {
    drawFrogDeath(r, frog, cx, groundY);
    return;
  }

  const hopping = frog.state === 'hopping';
  const arcTiles = hopping ? frogHopArc(frog.hopT) : 0;
  const y = groundY - arcTiles * TILE;
  const shadowScale = hopping ? frogShadowScale(frog.hopT) : 1;

  r.shadow(cx, groundY + TILE * 0.22, TILE * 0.56, TILE * 0.26, shadowScale);

  let scale: ScaleXY;
  if (hopping) {
    scale = frogHopScale(frog.hopT);
  } else if (isLandingSquashActive(frog.stateT)) {
    scale = frogLandingSquash(frog.stateT);
  } else {
    const breath = frogIdleBreath(elapsed);
    scale = { scaleX: breath, scaleY: breath };
  }

  const rot = DIR_ROT[frog.facing];
  const useJumpFrame = hopping && frog.hopT >= 0.15 && frog.hopT <= 0.85;
  r.sprite(useJumpFrame ? 'frog-jump' : 'frog-idle', cx, y, {
    rot,
    sx: scale.scaleX,
    sy: scale.scaleY,
  });

  if (!hopping && frogBlink(elapsed)) {
    drawBlinkOverlay(r, cx, y, rot, scale);
  }
}
