// Pooled particle system: dust, ripples, splash, squish (+ tyre-mark decals), home confetti,
// level-clear fireflies, and bonk sparks. See docs/specs/M4-juice.md section 1 and
// ART_BIBLE.md section 3 ("Palettes") for every colour used below.
//
// Self-subscribes to `GameEvent` for every trigger, per the milestone rule that fx/ reacts to
// events rather than being called directly by gameplay code. Colours are either fixed bible
// tokens (eyeWhite for dust, ink for squish/bonk-adjacent dark specks, gold for bonk sparks) or
// come from the current world's palette, tracked via `setPalette` (called once per fixed step by
// `PlayScene`, since `GameEvent` itself carries no theme/colour data - that's a rendering concern,
// not a gameplay one).
//
// Updated in the fixed step (`update(dt)`, called once per `World.update` tick from PlayScene) and
// rendered with interpolation (`render` takes the frame's `alpha` and lerps each particle's
// previous-vs-current position, the same interpolation ARCHITECTURE.md section 4 describes for
// movers) - unlike movers/frog (which currently render the latest fixed-step state directly, see
// docs/specs/M4-report.md), particles are the one thing in this codebase that actually uses it,
// per this spec's explicit requirement.

import { gameEvents } from '../core/events';
import { CANVAS_WIDTH, HOME_COLS, HOME_ROW, TILE } from '../game/constants';
import type { WorldPalette } from '../game/themes';
import type { Renderer } from '../render/renderer';

export const PARTICLE_POOL_SIZE = 400;

export type ParticleShape = 'circle' | 'rect' | 'ring' | 'streak';
export type AlphaCurve = 'linear' | 'late';

interface Particle {
  active: boolean;
  x: number;
  y: number;
  px: number; // previous fixed-step position (render interpolation)
  py: number;
  vx: number;
  vy: number;
  life: number; // seconds remaining
  maxLife: number;
  size: number;
  /** Rect/streak only: full width/height in px (size is used for circle radius / ring radius). */
  w: number;
  h: number;
  color: string;
  gravity: number;
  shape: ParticleShape;
  alphaCurve: AlphaCurve;
  /** Base opacity before the alpha curve's fade is applied (e.g. dust's "60% alpha"). */
  maxAlpha: number;
  rotation: number;
  angularVelocity: number;
  /** Fireflies only: sine-wobble drift and alpha pulse. */
  wobble: boolean;
  phase: number;
}

function makeInactiveParticle(): Particle {
  return {
    active: false,
    x: 0,
    y: 0,
    px: 0,
    py: 0,
    vx: 0,
    vy: 0,
    life: 0,
    maxLife: 1,
    size: 0,
    w: 0,
    h: 0,
    color: '#FFFFFF',
    gravity: 0,
    shape: 'circle',
    alphaCurve: 'linear',
    maxAlpha: 1,
    rotation: 0,
    angularVelocity: 0,
    wobble: false,
    phase: 0,
  };
}

const pool: Particle[] = Array.from({ length: PARTICLE_POOL_SIZE }, makeInactiveParticle);
let activeCount = 0;

function acquire(): Particle | null {
  if (activeCount >= PARTICLE_POOL_SIZE) return null;
  for (const p of pool) {
    if (!p.active) return p;
  }
  return null;
}

interface SpawnOpts {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  size: number;
  color: string;
  gravity?: number;
  shape?: ParticleShape;
  alphaCurve?: AlphaCurve;
  maxAlpha?: number;
  w?: number;
  h?: number;
  rotation?: number;
  angularVelocity?: number;
  wobble?: boolean;
  phase?: number;
}

function spawn(opts: SpawnOpts): void {
  const p = acquire();
  if (!p) {
    if (import.meta.env.DEV) {
      console.warn(`[fx/particles] pool exhausted at cap ${PARTICLE_POOL_SIZE}; dropping spawn`);
    }
    return;
  }
  p.active = true;
  p.x = opts.x;
  p.y = opts.y;
  p.px = opts.x;
  p.py = opts.y;
  p.vx = opts.vx;
  p.vy = opts.vy;
  p.life = opts.life;
  p.maxLife = opts.life;
  p.size = opts.size;
  p.w = opts.w ?? opts.size;
  p.h = opts.h ?? opts.size;
  p.color = opts.color;
  p.gravity = opts.gravity ?? 0;
  p.shape = opts.shape ?? 'circle';
  p.alphaCurve = opts.alphaCurve ?? 'linear';
  p.maxAlpha = opts.maxAlpha ?? 1;
  p.rotation = opts.rotation ?? 0;
  p.angularVelocity = opts.angularVelocity ?? 0;
  p.wobble = opts.wobble ?? false;
  p.phase = opts.phase ?? 0;
  activeCount += 1;
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randSign(): number {
  return Math.random() < 0.5 ? -1 : 1;
}

// --- Emitters (docs/specs/M4-juice.md section 1) ---

const EYE_WHITE = '#FFFFFF'; // "greyish white" dust, ART_BIBLE.md global palette (eyeWhite)
const INK = '#1B2A1D'; // dark specks / tyre marks, ART_BIBLE.md global palette (ink)
const GOLD = '#FFC83D'; // bonk sparks - no dedicated "star" token, reuses the gold accent

export function dust(x: number, y: number): void {
  for (let i = 0; i < 6; i++) {
    const angle = rand(-Math.PI, 0); // upward-outward half
    const speed = rand(40, 80);
    spawn({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.35,
      size: rand(2, 3.5),
      color: EYE_WHITE,
      gravity: 200,
      shape: 'circle',
      alphaCurve: 'linear',
      maxAlpha: 0.6,
    });
  }
}

export function ripple(x: number, y: number, color: string): void {
  spawn({
    x,
    y,
    vx: 0,
    vy: 0,
    life: 0.6,
    size: TILE * 0.16,
    color,
    shape: 'ring',
    alphaCurve: 'late',
    maxAlpha: 0.8,
  });
}

export function splash(x: number, y: number, color: string): void {
  for (let i = 0; i < 12; i++) {
    const angle = rand(-Math.PI, 0);
    const speed = rand(80, 160);
    spawn({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.5,
      size: rand(2, 3.5),
      color,
      gravity: 500,
      shape: 'circle',
      alphaCurve: 'linear',
    });
  }
  for (let i = 0; i < 8; i++) {
    spawn({
      x: x + rand(-6, 6),
      y,
      vx: rand(-8, 8),
      vy: -30,
      life: 0.8,
      size: 3,
      color,
      shape: 'ring',
      alphaCurve: 'late',
      maxAlpha: 0.7,
    });
  }
}

export function squish(x: number, y: number, laneWidthPx: number): void {
  for (let i = 0; i < 6; i++) {
    const angle = rand(0, Math.PI * 2);
    const speed = rand(20, 50);
    spawn({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.3,
      size: rand(1.5, 2.5),
      color: INK,
      shape: 'circle',
      alphaCurve: 'linear',
    });
  }
  // Decal: two tyre marks, the width of the lane, drawn under the frog for 1.5s. Modelled as two
  // static (no velocity/gravity) long 'streak' particles rather than a separate decal system, so
  // they share the pool and its 400 cap instead of needing their own bookkeeping.
  for (const dy of [-6, 6]) {
    spawn({
      x,
      y: y + dy,
      vx: 0,
      vy: 0,
      life: 1.5,
      size: laneWidthPx,
      w: laneWidthPx,
      h: 2,
      color: INK,
      shape: 'streak',
      alphaCurve: 'late',
      maxAlpha: 0.4,
    });
  }
}

export function homeBurst(x: number, y: number, colorA: string, colorB: string): void {
  for (let i = 0; i < 12; i++) {
    const angle = rand(-Math.PI, 0);
    const speed = rand(100, 200);
    spawn({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.9,
      size: 4,
      w: rand(4, 6),
      h: rand(3, 5),
      color: i % 2 === 0 ? colorA : colorB,
      gravity: 300,
      shape: 'rect',
      alphaCurve: 'linear',
      rotation: rand(0, Math.PI * 2),
      angularVelocity: randSign() * rand(4, 9),
    });
  }
}

export function levelClearFireflies(accentA: string): void {
  const y = HOME_ROW * TILE + TILE / 2;
  for (let i = 0; i < 40; i++) {
    spawn({
      x: rand(0, CANVAS_WIDTH), // spread across the home row's full width
      y,
      vx: 0,
      vy: rand(-24, -12),
      life: 2.5,
      size: rand(1.5, 3),
      color: accentA,
      shape: 'circle',
      alphaCurve: 'late',
      wobble: true,
      phase: rand(0, Math.PI * 2),
    });
  }
}

export function bonk(x: number, y: number): void {
  for (let i = 0; i < 3; i++) {
    const angle = rand(-Math.PI, Math.PI);
    const speed = rand(30, 60);
    spawn({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.25,
      size: 3,
      w: 4,
      h: 4,
      color: GOLD,
      shape: 'rect',
      alphaCurve: 'linear',
      rotation: rand(0, Math.PI * 2),
      angularVelocity: randSign() * rand(6, 12),
    });
  }
}

// --- Palette tracking (colours are a rendering concern; GameEvent carries none) ---

let currentPalette: WorldPalette | null = null;

export function setPalette(palette: WorldPalette): void {
  currentPalette = palette;
}

function tileToPx(x: number, row: number): { x: number; y: number } {
  return { x: (x + 0.5) * TILE, y: row * TILE + TILE / 2 };
}

gameEvents.on('land', (e) => {
  const p = tileToPx(e.x, e.row);
  if (e.surface === 'ground') dust(p.x, p.y);
  else ripple(p.x, p.y, currentPalette?.waterLight ?? EYE_WHITE);
});

gameEvents.on('death', (e) => {
  const p = tileToPx(e.x, e.row);
  if (e.cause === 'drown' || e.cause === 'offscreen') {
    splash(p.x, p.y, currentPalette?.waterLight ?? EYE_WHITE);
  } else {
    squish(p.x, p.y, TILE);
  }
});

gameEvents.on('home', (e) => {
  const col = HOME_COLS[e.slot] ?? 6;
  const p = tileToPx(col, HOME_ROW);
  homeBurst(p.x, p.y, currentPalette?.accentA ?? GOLD, currentPalette?.accentB ?? GOLD);
});

gameEvents.on('levelClear', () => levelClearFireflies(currentPalette?.accentA ?? GOLD));

gameEvents.on('bonk', (e) => {
  const p = tileToPx(e.x, e.row);
  bonk(p.x, p.y);
});

// M10: turtle sink/rise ripple rings (ART_BIBLE.md section 5: "leaving a ripple ring... reverse on
// rise") - reuses the exact same `ripple` emitter the frog's own platform-landing ripple already
// uses, just triggered by the turtle's own dive-state transition instead of a frog landing.
gameEvents.on('turtleDive', (e) => {
  const p = tileToPx(e.x, e.row);
  ripple(p.x, p.y, currentPalette?.waterLight ?? EYE_WHITE);
});

// M7: Bubble Shield "pops with a burst" (docs/specs/M7-powerups-scoring.md section 1) - a double
// ring in the shield's own blue (ART_BIBLE.md section 3: "Bubble Shield #3E9CE6 bubble").
const SHIELD_BLUE = '#3E9CE6';
gameEvents.on('shieldBroken', (e) => {
  const p = tileToPx(e.x, e.row);
  ripple(p.x, p.y, SHIELD_BLUE);
  ripple(p.x, p.y, SHIELD_BLUE);
});

// --- Simulation + render ---

export function update(dt: number): void {
  for (const p of pool) {
    if (!p.active) continue;
    p.px = p.x;
    p.py = p.y;
    p.vy += p.gravity * dt;
    if (p.wobble) {
      const age = p.maxLife - p.life;
      p.vx = Math.sin(age * 3 + p.phase) * 20;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rotation += p.angularVelocity * dt;
    p.life -= dt;
    if (p.life <= 0) {
      p.active = false;
      activeCount -= 1;
    }
  }
  if (import.meta.env.DEV && activeCount > PARTICLE_POOL_SIZE) {
    // Structurally unreachable (the pool has exactly PARTICLE_POOL_SIZE slots) - a dev-mode
    // assertion per docs/specs/M4-juice.md acceptance #2 ("assert the cap in dev").
    console.error(`[fx/particles] assertion failed: activeCount ${activeCount} > cap`);
  }
}

function curveAlpha(curve: AlphaCurve, t: number): number {
  if (curve === 'linear') return 1 - t;
  // 'late': stays fully opaque until 70% through its life, then fades over the tail.
  return t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
}

export function render(r: Renderer, alpha: number): void {
  const ctx = r.ctx;
  for (const p of pool) {
    if (!p.active) continue;
    const t = 1 - p.life / p.maxLife;
    let a = curveAlpha(p.alphaCurve, t) * p.maxAlpha;
    if (p.wobble) a *= 0.5 + 0.5 * Math.sin((p.maxLife - p.life) * 6 + p.phase);
    if (a <= 0) continue;

    const x = p.px + (p.x - p.px) * alpha;
    const y = p.py + (p.y - p.py) * alpha;

    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, a));
    ctx.fillStyle = p.color;

    if (p.shape === 'circle') {
      ctx.beginPath();
      ctx.arc(x, y, p.size, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.shape === 'ring') {
      const radius = p.size + p.size * 2 * t; // grows size -> size*3
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.stroke();
    } else if (p.shape === 'rect') {
      ctx.translate(x, y);
      ctx.rotate(p.rotation);
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    } else {
      // 'streak': a thin horizontal bar (tyre marks); rotation unused today but supported.
      ctx.translate(x, y);
      ctx.rotate(p.rotation);
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    }
    ctx.restore();
  }
}

export function getActiveCount(): number {
  return activeCount;
}

/** Dev-only: fills the pool to capacity for perf/stress testing (docs/specs/M4-juice.md
 * acceptance #3). Not reachable from normal play. */
export function stressFill(): void {
  while (activeCount < PARTICLE_POOL_SIZE) {
    spawn({
      x: rand(0, TILE * 13),
      y: rand(0, TILE * 15),
      vx: rand(-40, 40),
      vy: rand(-40, 40),
      life: 5,
      size: 3,
      color: EYE_WHITE,
      shape: 'circle',
      alphaCurve: 'linear',
    });
  }
}

/** Test/dev-only: deactivates every particle. */
export function reset(): void {
  for (const p of pool) p.active = false;
  activeCount = 0;
}
