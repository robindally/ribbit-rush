// Weather layers: rain, fog, snow. Drawn as a full-canvas layer after entities and before the HUD
// (ART_BIBLE.md section 7), same placement as `lighting.ts`. Each weather owns a small
// self-contained particle array (not the shared `fx/particles.ts` pool - these are continuous
// ambient decoration, not GameEvent-triggered juice) sized per the bible's own counts, halved
// under `reduceMotion` per docs/specs/M6-worlds.md section 4 ("All of these respect a
// reduceMotion setting by halving particle counts"). Ripples reuse `fx/particles.ripple` directly
// (render code calling fx/ directly for presentation is the established precedent - see
// docs/specs/M4-report.md on `fx/transitions.ts`).

import * as particles from '../../fx/particles';
import { CANVAS_HEIGHT, CANVAS_WIDTH, ROAD_ROWS, TILE } from '../../game/constants';
import { createRng, type Rng } from '../../core/rng';
import type { Weather, WorldTheme } from '../../game/themes';
import type { Renderer } from '../renderer';

let reduceMotion = false;
export function setReduceMotion(v: boolean): void {
  reduceMotion = v;
}

function count(base: number): number {
  return reduceMotion ? Math.round(base / 2) : base;
}

// --- Fog per-entity visibility falloff (docs/specs/M6-worlds.md section 2: world 4's fog is
// "visual only" - vehicles/platforms beyond 4 tiles of the frog's column fade to 35%, ramping to
// 100% within 4 tiles). Exported for render/draw/entities.ts to apply per mover. ---

const FOG_FULL_ALPHA_TILES = 4;
const FOG_FAR_ALPHA = 0.35;
const FOG_RAMP_TILES = 1; // smooth 1-tile ramp from the 4-tile boundary rather than a hard cut

export function fogEntityAlpha(weather: Weather, moverCenterCol: number, frogCol: number): number {
  if (weather !== 'fog') return 1;
  const dist = Math.abs(moverCenterCol - frogCol);
  if (dist <= FOG_FULL_ALPHA_TILES) return 1;
  if (dist >= FOG_FULL_ALPHA_TILES + FOG_RAMP_TILES) return FOG_FAR_ALPHA;
  const t = (dist - FOG_FULL_ALPHA_TILES) / FOG_RAMP_TILES;
  return 1 + (FOG_FAR_ALPHA - 1) * t;
}

// --- Rain (bible section 7): 120 streaks 12px long, down-left at 900px/s, 25% alpha. Ring ripples
// on water and road puddles; puddles are 3-5 static ellipses per road row reflecting the nearest
// light colour. ---

const RAIN_COUNT = 120;
const RAIN_SPEED_PX_S = 900;
const RAIN_LENGTH_PX = 12;
const RAIN_ANGLE = Math.atan2(1, -0.6); // "down-left"

interface RainDrop {
  x: number;
  y: number;
}
let rainDrops: RainDrop[] | null = null;
let rainRippleTimer = 0;

function ensureRain(rng: Rng): RainDrop[] {
  if (!rainDrops) {
    rainDrops = Array.from({ length: RAIN_COUNT }, () => ({
      x: rng.range(0, CANVAS_WIDTH),
      y: rng.range(0, CANVAS_HEIGHT),
    }));
  }
  return rainDrops;
}

interface Puddle {
  x: number;
  y: number;
  rx: number;
  ry: number;
}
let puddles: Puddle[] | null = null;

function ensurePuddles(rng: Rng): Puddle[] {
  if (!puddles) {
    puddles = [];
    for (const row of ROAD_ROWS) {
      const n = rng.int(3, 5);
      for (let i = 0; i < n; i++) {
        puddles.push({
          x: rng.range(TILE, CANVAS_WIDTH - TILE),
          y: row * TILE + rng.range(TILE * 0.3, TILE * 0.7),
          rx: rng.range(10, 20),
          ry: rng.range(4, 8),
        });
      }
    }
  }
  return puddles;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** 50/50 mix of two hex colours - used to blend a puddle's light reflection into the road colour
 * so puddles read as wet asphalt, not a solid disc of the reflected colour (fix-up 2, M6 review). */
function mixHex(a: string, b: string, t = 0.5): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `rgb(${r}, ${g}, ${bl})`;
}

const rainRng = createRng(20260918);

function updateRain(dt: number): void {
  const drops = ensureRain(rainRng);
  const activeN = count(RAIN_COUNT);
  const dx = Math.cos(RAIN_ANGLE) * RAIN_SPEED_PX_S * dt;
  const dy = Math.sin(RAIN_ANGLE) * RAIN_SPEED_PX_S * dt;
  for (let i = 0; i < activeN; i++) {
    const d = drops[i];
    d.x += dx;
    d.y += dy;
    if (d.y > CANVAS_HEIGHT || d.x < -RAIN_LENGTH_PX) {
      d.x = rainRng.range(0, CANVAS_WIDTH * 1.3);
      d.y = -RAIN_LENGTH_PX;
    }
  }

  rainRippleTimer -= dt;
  if (rainRippleTimer <= 0) {
    rainRippleTimer = reduceMotion ? 0.7 : 0.35;
    const pds = ensurePuddles(rainRng);
    if (rainRng.chance(0.5)) {
      const p = rainRng.pick(pds);
      particles.ripple(p.x, p.y, '#BFE3FA');
    } else {
      particles.ripple(
        rainRng.range(0, CANVAS_WIDTH),
        rainRng.range(2 * TILE, 6 * TILE + TILE),
        '#BFE3FA',
      );
    }
  }
}

function drawRain(r: Renderer, theme: WorldTheme): void {
  const ctx = r.ctx;
  const pds = ensurePuddles(rainRng);
  ctx.save();
  ctx.globalAlpha = 0.5;
  // Wet asphalt, not a solid disc: blend the reflected light colour 50/50 with the road colour
  // (fix-up 2, M6 review - see docs/specs/M6-report.md's "Fix-up" section).
  ctx.fillStyle = mixHex(theme.palette.road, theme.palette.accentB);
  for (const p of pds) {
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, p.rx, p.ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  const drops = ensureRain(rainRng);
  const activeN = count(RAIN_COUNT);
  ctx.save();
  ctx.strokeStyle = 'rgba(220, 235, 255, 0.25)';
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  const dx = Math.cos(RAIN_ANGLE) * RAIN_LENGTH_PX;
  const dy = Math.sin(RAIN_ANGLE) * RAIN_LENGTH_PX;
  for (let i = 0; i < activeN; i++) {
    const d = drops[i];
    ctx.moveTo(d.x, d.y);
    ctx.lineTo(d.x - dx, d.y - dy);
  }
  ctx.stroke();
  ctx.restore();
}

// --- Fog (bible section 7): two drifting translucent bands (fog tint) + 30 fireflies (accentA)
// that drift and pulse. ---

const FIREFLY_COUNT = 30;
interface Firefly {
  x: number;
  y: number;
  phase: number;
  driftSeed: number;
}
let fireflies: Firefly[] | null = null;
const fogRng = createRng(20260919);

function ensureFireflies(): Firefly[] {
  if (!fireflies) {
    fireflies = Array.from({ length: FIREFLY_COUNT }, () => ({
      x: fogRng.range(0, CANVAS_WIDTH),
      y: fogRng.range(TILE, CANVAS_HEIGHT - TILE),
      phase: fogRng.range(0, Math.PI * 2),
      driftSeed: fogRng.range(0, 100),
    }));
  }
  return fireflies;
}

let fogElapsed = 0;

function updateFog(dt: number): void {
  fogElapsed += dt;
}

function drawFog(r: Renderer, theme: WorldTheme): void {
  const ctx = r.ctx;
  ctx.save();
  ctx.fillStyle = theme.tint ?? 'rgba(222,236,226,0.32)';
  const bandH = CANVAS_HEIGHT * 0.28;
  const y1 = ((fogElapsed * 14) % (CANVAS_HEIGHT + bandH)) - bandH;
  const y2 = ((fogElapsed * -10 + CANVAS_HEIGHT) % (CANVAS_HEIGHT + bandH)) - bandH;
  ctx.fillRect(0, y1, CANVAS_WIDTH, bandH);
  ctx.fillRect(0, y2, CANVAS_WIDTH, bandH);
  ctx.restore();

  const flies = ensureFireflies();
  const activeN = count(FIREFLY_COUNT);
  ctx.save();
  ctx.fillStyle = theme.palette.accentA;
  for (let i = 0; i < activeN; i++) {
    const f = flies[i];
    const x = f.x + Math.sin(fogElapsed * 0.6 + f.driftSeed) * 14;
    const y = f.y + Math.cos(fogElapsed * 0.5 + f.driftSeed) * 10;
    const alpha = 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(fogElapsed * 2.2 + f.phase));
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(x, y, 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// --- Snow (bible section 7): 80 flakes 2-4px drifting down at 40px/s with a sine wobble. ---

const SNOW_COUNT = 80;
interface Flake {
  x: number;
  y: number;
  size: number;
  wobbleSeed: number;
}
let flakes: Flake[] | null = null;
const snowRng = createRng(20260920);

function ensureSnow(): Flake[] {
  if (!flakes) {
    flakes = Array.from({ length: SNOW_COUNT }, () => ({
      x: snowRng.range(0, CANVAS_WIDTH),
      y: snowRng.range(0, CANVAS_HEIGHT),
      size: snowRng.range(2, 4),
      wobbleSeed: snowRng.range(0, 100),
    }));
  }
  return flakes;
}

let snowElapsed = 0;

function updateSnow(dt: number): void {
  snowElapsed += dt;
  const flakesArr = ensureSnow();
  const activeN = count(SNOW_COUNT);
  for (let i = 0; i < activeN; i++) {
    const f = flakesArr[i];
    f.y += 40 * dt;
    if (f.y > CANVAS_HEIGHT) {
      f.y = -4;
      f.x = snowRng.range(0, CANVAS_WIDTH);
    }
  }
}

function drawSnow(r: Renderer, theme: WorldTheme): void {
  const ctx = r.ctx;
  const flakesArr = ensureSnow();
  const activeN = count(SNOW_COUNT);
  ctx.save();
  ctx.fillStyle = theme.palette.grassA;
  ctx.globalAlpha = 0.9;
  for (let i = 0; i < activeN; i++) {
    const f = flakesArr[i];
    const x = f.x + Math.sin(snowElapsed * 1.4 + f.wobbleSeed) * 8;
    ctx.beginPath();
    ctx.arc(x, f.y, f.size / 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Advances whichever weather is active. Call once per fixed simulation step. */
export function updateWeather(weather: Weather, dt: number): void {
  if (weather === 'rain') updateRain(dt);
  else if (weather === 'fog') updateFog(dt);
  else if (weather === 'snow') updateSnow(dt);
}

/** Draws the active weather layer, or nothing for `'clear'`. */
export function drawWeather(r: Renderer, theme: WorldTheme): void {
  if (theme.weather === 'rain') drawRain(r, theme);
  else if (theme.weather === 'fog') drawFog(r, theme);
  else if (theme.weather === 'snow') drawSnow(r, theme);
}

/** Test/dev-only: drops every lazily-built particle array so a later call reseeds cleanly (mirrors
 * the `fx/*.ts` reset() convention). Also used between screenshot scenarios. */
export function reset(): void {
  rainDrops = null;
  puddles = null;
  fireflies = null;
  flakes = null;
  fogElapsed = 0;
  snowElapsed = 0;
  rainRippleTimer = 0;
}
