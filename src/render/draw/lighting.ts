// Time-of-day lighting: tint, dusk's warm water band, and night's "lighter" pass (headlight
// cones, taillight glow, glowing lily pads, streetlamp pools). Drawn as a full-canvas layer after
// entities and before the HUD (ART_BIBLE.md section 7), inside the shake camera transform (it's
// part of the play-field look, not the HUD). See docs/specs/M6-worlds.md section 4.
//
// "Day: nothing" (bible section 7) reads, against the per-world palette table, as: apply the
// world's own `tint` (if any - world 1 has none, world 5 has one despite being `timeOfDay: 'day'`)
// via a `multiply` layer always, then layer the *extra* per-time-of-day effect (dusk's warm band,
// night's headlights/glow) only for those two time-of-day values. No gradient is ever created
// inside this function - every gradient is built once, lazily, on first use, and repositioned per
// call with `ctx.translate`/`ctx.rotate` (performance rule: "no gradient or pattern objects
// created in the frame loop").

import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  COLS,
  HOME_COLS,
  HOME_ROW,
  MEDIAN_ROW,
  RIVER_ROWS,
  TILE,
} from '../../game/constants';
import { moverInstances, moverSpeed } from '../../game/lanes';
import type { WorldTheme } from '../../game/themes';
import type { LaneDef, MoverType } from '../../game/types';
import type { Renderer } from '../renderer';

const HEADLIGHT = '255, 241, 168'; // #FFF1A8, rgb components for rgba() strings
const TAILLIGHT = '255, 59, 59'; // #FF3B3B

// Movers with no front/rear lights: platforms and the median snake.
const NO_LIGHTS: readonly MoverType[] = ['log', 'turtle', 'croc', 'floe', 'snake', 'otter'];

function hasLights(type: MoverType): boolean {
  return !NO_LIGHTS.includes(type);
}

function applyTintMultiply(r: Renderer, tint: string): void {
  const ctx = r.ctx;
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  ctx.restore();
}

// --- Dusk: warm horizontal band on the water (bible: "waterLight at 20% alpha") ---

let duskBandGradient: CanvasGradient | null = null;
let duskBandColor: string | null = null;

function drawDuskWarmBand(r: Renderer, theme: WorldTheme): void {
  const top = RIVER_ROWS[0] * TILE;
  const bottom = (RIVER_ROWS[RIVER_ROWS.length - 1] + 1) * TILE;
  const ctx = r.ctx;

  if (!duskBandGradient || duskBandColor !== theme.palette.waterLight) {
    duskBandGradient = ctx.createLinearGradient(0, top, 0, bottom);
    duskBandGradient.addColorStop(0, 'rgba(0,0,0,0)');
    duskBandGradient.addColorStop(0.5, theme.palette.waterLight);
    duskBandGradient.addColorStop(1, 'rgba(0,0,0,0)');
    duskBandColor = theme.palette.waterLight;
  }

  ctx.save();
  ctx.globalAlpha = 0.2;
  ctx.fillStyle = duskBandGradient;
  ctx.fillRect(0, top, CANVAS_WIDTH, bottom - top);
  ctx.restore();
}

// --- Night: headlight cones, taillight glow, glowing lily pads, streetlamp pools ---

const CONE_RADIUS_PX = TILE * 3;
const coneGradients = new Map<MoverType, CanvasGradient>();

function getConeGradient(ctx: CanvasRenderingContext2D, type: MoverType): CanvasGradient {
  let g = coneGradients.get(type);
  if (!g) {
    // Local space: centred at the vehicle's own front point, radius = cone length. Repositioned
    // per instance via ctx.translate/ctx.rotate at fill time, not recreated.
    g = ctx.createRadialGradient(0, 0, 0, 0, 0, CONE_RADIUS_PX);
    g.addColorStop(0, `rgba(${HEADLIGHT}, 0.35)`);
    g.addColorStop(1, `rgba(${HEADLIGHT}, 0)`);
    coneGradients.set(type, g);
  }
  return g;
}

let taillightGradient: CanvasGradient | null = null;
function getTaillightGradient(ctx: CanvasRenderingContext2D): CanvasGradient {
  if (!taillightGradient) {
    taillightGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, TILE * 0.6);
    taillightGradient.addColorStop(0, `rgba(${TAILLIGHT}, 0.55)`);
    taillightGradient.addColorStop(1, `rgba(${TAILLIGHT}, 0)`);
  }
  return taillightGradient;
}

let lampPoolGradient: CanvasGradient | null = null;
function getLampPoolGradient(ctx: CanvasRenderingContext2D): CanvasGradient {
  if (!lampPoolGradient) {
    lampPoolGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, TILE * 2);
    lampPoolGradient.addColorStop(0, `rgba(${HEADLIGHT}, 0.3)`);
    lampPoolGradient.addColorStop(1, `rgba(${HEADLIGHT}, 0)`);
  }
  return lampPoolGradient;
}

function drawCone(ctx: CanvasRenderingContext2D, x: number, y: number, angleRad: number, type: MoverType): void {
  const g = getConeGradient(ctx, type);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angleRad);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  const halfSpread = CONE_RADIUS_PX * 0.26;
  ctx.lineTo(CONE_RADIUS_PX, -halfSpread);
  ctx.lineTo(CONE_RADIUS_PX, halfSpread);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawTaillight(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = getTaillightGradient(ctx);
  ctx.beginPath();
  ctx.arc(0, 0, TILE * 0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawVehicleLights(r: Renderer, lane: LaneDef): void {
  const ctx = r.ctx;
  const y = lane.row * TILE + TILE / 2;
  for (const mover of lane.movers) {
    if (!hasLights(mover.type)) continue;
    const speed = moverSpeed(lane, mover);
    if (speed === 0) continue;
    const facingRight = speed > 0;
    for (const x of moverInstances(lane, mover)) {
      const px = x * TILE;
      const w = mover.width * TILE;
      if (px + w < -TILE || px > (COLS + 1) * TILE) continue;
      const frontX = facingRight ? px + w : px;
      const rearX = facingRight ? px : px + w;
      drawCone(ctx, frontX, y, facingRight ? 0 : Math.PI, mover.type);
      drawTaillight(ctx, rearX, y);
    }
  }
}

function drawGlowingLilyPads(r: Renderer, theme: WorldTheme): void {
  const ctx = r.ctx;
  const y = HOME_ROW * TILE + TILE / 2;
  ctx.save();
  ctx.fillStyle = theme.palette.accentB;
  ctx.globalAlpha = 0.3;
  for (const col of HOME_COLS) {
    ctx.beginPath();
    ctx.arc(col * TILE + TILE / 2, y, TILE * 0.42, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawStreetlamps(r: Renderer): void {
  const ctx = r.ctx;
  const y = MEDIAN_ROW * TILE + TILE / 2;
  const xs = [TILE * 0.5, (COLS - 0.5) * TILE];
  for (const x of xs) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = getLampPoolGradient(ctx);
    ctx.beginPath();
    ctx.arc(0, 0, TILE * 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    r.sprite('streetlamp', x, y - TILE * 0.1);
  }
}

/** Full lighting pass for the current theme: tint (any non-'day'-only world, per the header note
 * above), then dusk's warm band or night's lighter pass. `lanes` only matters for night (headlight
 * cones read every road/rail lane's movers). */
export function drawLighting(r: Renderer, theme: WorldTheme, lanes: LaneDef[]): void {
  if (theme.tint) applyTintMultiply(r, theme.tint);
  if (theme.timeOfDay === 'dusk') drawDuskWarmBand(r, theme);
  if (theme.timeOfDay === 'night') {
    const ctx = r.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const lane of lanes) {
      if (lane.kind === 'road' || lane.kind === 'rail') drawVehicleLights(r, lane);
    }
    drawGlowingLilyPads(r, theme);
    drawStreetlamps(r);
    ctx.restore();
  }
}
