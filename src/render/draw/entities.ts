// Movers (vehicles, logs, turtles, and M6's floes/tram/train/jetski/otter/snake) and the frog,
// sprite-based. See ARCHITECTURE.md section 11, docs/ART_BIBLE.md sections 4-5,
// docs/specs/M3-art-pass.md sections 1 and 4-5, and docs/specs/M6-worlds.md sections 2 and 5.

import { COLS, MEGA_HOP_ARC_TILES, TILE } from '../../game/constants';
import { isTrainWarningActive, moverInstances, moverSpeed } from '../../game/lanes';
import type { Weather } from '../../game/themes';
import type { Dir, Frog, LaneDef, MoverDef } from '../../game/types';
import {
  busBounceTiles,
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
import { fogEntityAlpha } from './weather';

// Frog faces up in its SVG (ARCHITECTURE.md section 11 / ART_BIBLE.md section 2); rotate for the
// other three facings.
const DIR_ROT: Record<Dir, number> = {
  up: 0,
  right: Math.PI / 2,
  down: Math.PI,
  left: -Math.PI / 2,
};

const FROG_BODY = '#58D65E';
const FLOE_CRACK_COLOR = '#9FB9CF';

function drawLog(r: Renderer, px: number, cy: number, widthTiles: number, alpha: number): void {
  const w = Math.max(2, Math.round(widthTiles));
  r.sprite('log-end', px + TILE / 2, cy, { alpha });
  for (let i = 1; i < w - 1; i++) {
    r.sprite('log-mid', px + i * TILE + TILE / 2, cy, { alpha });
  }
  r.sprite('log-end', px + (w - 1) * TILE + TILE / 2, cy, { flipX: true, alpha });
}

function drawTurtleGroup(
  r: Renderer,
  px: number,
  cy: number,
  mover: MoverDef,
  lane: LaneDef,
  elapsed: number,
  alpha: number,
): void {
  const count = Math.max(1, Math.round(mover.width));
  // turtle.svg faces left (ARCHITECTURE.md section 11); flip for right-moving (positive speed)
  // lanes.
  const flip = moverSpeed(lane, mover) > 0;
  const visual = mover.dive ? turtleVisual(mover.dive, elapsed) : { visible: true, scale: 1, alpha: 1 };
  if (!visual.visible) return;
  for (let i = 0; i < count; i++) {
    const cx = px + (i + 0.5) * TILE;
    r.sprite('turtle', cx, cy, {
      flipX: flip,
      sx: visual.scale,
      sy: visual.scale,
      alpha: visual.alpha * alpha,
    });
  }
}

/** Three jagged crack lines, drawn only while `state === 'cracking'` (docs/specs/M6-worlds.md
 * section 5: "floe-2 and floe-3... with three crack paths that are drawn only in the cracking
 * state") - drawn in code rather than baked into the sprite art, so a single rasterised sprite
 * still serves every crack state; see docs/specs/M6-report.md "Deviations". */
function drawFloeCracks(r: Renderer, cx: number, cy: number, widthTiles: number, alpha: number): void {
  const w = widthTiles * TILE;
  const h = TILE * 0.7;
  const ctx = r.ctx;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = FLOE_CRACK_COLOR;
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  const paths = [
    [
      [cx - w * 0.3, cy - h * 0.3],
      [cx - w * 0.05, cy],
      [cx - w * 0.22, cy + h * 0.32],
    ],
    [
      [cx + w * 0.05, cy - h * 0.28],
      [cx + w * 0.02, cy + h * 0.06],
      [cx + w * 0.3, cy + h * 0.3],
    ],
    [
      [cx - w * 0.1, cy - h * 0.05],
      [cx + w * 0.15, cy - h * 0.18],
    ],
  ];
  for (const path of paths) {
    ctx.beginPath();
    ctx.moveTo(path[0][0], path[0][1]);
    for (let i = 1; i < path.length; i++) ctx.lineTo(path[i][0], path[i][1]);
    ctx.stroke();
  }
  ctx.restore();
}

function drawFloe(r: Renderer, px: number, cy: number, mover: MoverDef, alpha: number): void {
  const width = Math.max(2, Math.round(mover.width));
  const name = width >= 3 ? 'floe-3' : 'floe-2';
  const cx = px + (width * TILE) / 2;
  const state = mover.floe?.state ?? 'solid';
  const drawAlpha = state === 'sunk' ? alpha * 0.4 : alpha;
  r.sprite(name, cx, cy, { alpha: drawAlpha });
  if (state === 'cracking') drawFloeCracks(r, cx, cy, width, alpha);
}

/** `train` (width 6) composes as engine + car + car, each a 2-tile sprite (docs/specs/
 * M6-worlds.md section 5). */
function drawTrain(r: Renderer, px: number, cy: number, flip: boolean, alpha: number): void {
  const segW = 2 * TILE;
  const order = flip ? ['train-car', 'train-car', 'train-engine'] : ['train-engine', 'train-car', 'train-car'];
  order.forEach((name, i) => {
    const cx = px + i * segW + segW / 2;
    r.sprite(name, cx, cy, { flipX: flip, alpha });
  });
}

function drawVehicle(
  r: Renderer,
  cx: number,
  cy: number,
  lane: LaneDef,
  mover: MoverDef,
  elapsed: number,
  alpha: number,
): void {
  // Vehicles face right in their SVGs; flip for lanes/movers moving left (negative speed).
  const flip = moverSpeed(lane, mover) < 0;
  let rot = 0;
  let y = cy;
  if (mover.type === 'motorbike') rot = motorbikeLeanRad(1);
  if (mover.type === 'bus') y += busBounceTiles(elapsed) * TILE;
  r.sprite(mover.type, cx, y, { flipX: flip, rot, alpha });
}

export function drawLaneMovers(
  r: Renderer,
  lane: LaneDef,
  elapsed: number,
  weather?: Weather,
  fogFrogCol?: number,
): void {
  for (const mover of lane.movers) {
    for (const x of moverInstances(lane, mover)) {
      const px = x * TILE;
      const w = mover.width * TILE;
      if (px + w < 0 || px > COLS * TILE) continue; // off-screen, skip

      const cy = lane.row * TILE + TILE / 2;
      const alpha =
        weather && fogFrogCol !== undefined ? fogEntityAlpha(weather, x + mover.width / 2, fogFrogCol) : 1;

      if (mover.type === 'log') {
        drawLog(r, px, cy, mover.width, alpha);
      } else if (mover.type === 'turtle') {
        drawTurtleGroup(r, px, cy, mover, lane, elapsed, alpha);
      } else if (mover.type === 'floe') {
        drawFloe(r, px, cy, mover, alpha);
      } else if (mover.type === 'train') {
        drawTrain(r, px, cy, moverSpeed(lane, mover) < 0, alpha);
      } else {
        drawVehicle(r, px + w / 2, cy, lane, mover, elapsed, alpha);
      }
    }
  }
}

/** Crossing signal posts at both ends of every `rail` lane, flashing while the train's 1.5s
 * warning window is active (docs/LEVELS.md "new mover and lane rules"). Drawn every frame
 * regardless of time-of-day (unlike `render/draw/lighting.ts`'s night-only glow). */
export function drawRailSignals(r: Renderer, lanes: LaneDef[], elapsed: number): void {
  for (const lane of lanes) {
    if (lane.kind !== 'rail') continue;
    const train = lane.movers.find((m) => m.type === 'train');
    if (!train) continue;
    const active = isTrainWarningActive(lane, train, COLS);
    const cy = lane.row * TILE + TILE / 2;
    const flashOn = active && Math.floor(elapsed * 4) % 2 === 0;
    for (const cx of [TILE * 0.35, (COLS - 0.35) * TILE]) {
      r.sprite('crossing-signal', cx, cy - TILE * 0.05);
      if (flashOn) {
        r.ctx.save();
        r.ctx.fillStyle = '#FF3B3B';
        r.ctx.globalAlpha = 0.85;
        r.ctx.beginPath();
        r.ctx.arc(cx, cy - TILE * 0.32, 4, 0, Math.PI * 2);
        r.ctx.fill();
        r.ctx.restore();
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
 * (drives idle breathing, which has no gameplay effect). `blinking` comes from the caller's own
 * `BlinkState` (ticked once per fixed update step - see render/anim.ts), since the randomised,
 * re-rolled blink timer needs state that outlives a single render call. */
export function drawFrog(r: Renderer, frog: Frog, elapsed: number, blinking: boolean): void {
  const cx = (frog.x + 0.5) * TILE;
  const groundY = frog.row * TILE + TILE / 2;

  if (frog.state === 'dying' || frog.state === 'dead') {
    drawFrogDeath(r, frog, cx, groundY);
    return;
  }

  const hopping = frog.state === 'hopping';
  // A Mega Hop (M7: docs/specs/M7-powerups-scoring.md section 1) is detectable purely from the
  // frog's own committed hop target - a forward hop that covers 2 rows instead of 1 - with no
  // extra World/Frog state needed: `computeMegaHopTarget` is the only thing that ever produces a
  // 2-row jump.
  const isMegaHop = hopping && Math.abs(frog.toRow - frog.fromRow) === 2;
  const arcTiles = hopping ? frogHopArc(frog.hopT, isMegaHop ? MEGA_HOP_ARC_TILES : undefined) : 0;
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

  if (!hopping && blinking) {
    drawBlinkOverlay(r, cx, y, rot, scale);
  }
}
