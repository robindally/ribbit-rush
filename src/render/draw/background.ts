// Static rows (start bank, median, home row) plus the offscreen static-layer builder that bakes
// every non-animated background element for a level into one canvas, blitted once per frame. See
// docs/ART_BIBLE.md section 6 ("Environment rendering") and docs/specs/M3-art-pass.md section 3.
// The home row's *occupant* sprites (lily pad / frog / croc / fly) are dynamic - drawn per frame
// by `drawHomeSlots`, not baked into the static layer.

import type { Rng } from '../../core/rng';
import { createRng } from '../../core/rng';
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  COLS,
  HOME_COLS,
  HOME_ROW,
  MEDIAN_ROW,
  START_ROW,
  TILE,
} from '../../game/constants';
import type { WorldTheme } from '../../game/themes';
import type { HomeSlotState } from '../../game/types';
import { homeLandingScale, homeRingVisual } from '../anim';
import type { Renderer } from '../renderer';
import { getSpriteAtlas } from '../sprites';
import { drawRoadStatic } from './road';
import { drawWaterBankStatic } from './water';

const BACKDROP = '#0c0d1a'; // canvas backdrop behind the HUD rows (0 and 14)

function drawGrassBand(
  ctx: CanvasRenderingContext2D,
  theme: WorldTheme,
  y0: number,
  rng: Rng,
): void {
  // grassA/grassB alternate as mowing stripes (ART_BIBLE.md section 3). A single grass row is
  // split into sub-bands so the alternation reads within one tile row.
  const stripes = 4;
  const stripeH = TILE / stripes;
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = i % 2 === 0 ? theme.palette.grassA : theme.palette.grassB;
    ctx.fillRect(0, y0 + i * stripeH, CANVAS_WIDTH, stripeH);
  }
  // 3px lighter tufts scattered by the seeded RNG.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
  const tuftCount = Math.round(COLS * 2.2);
  for (let i = 0; i < tuftCount; i++) {
    const tx = rng.range(4, CANVAS_WIDTH - 4);
    const ty = y0 + rng.range(4, TILE - 4);
    ctx.beginPath();
    ctx.arc(tx, ty, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawMedianStatic(ctx: CanvasRenderingContext2D, theme: WorldTheme): void {
  const y = MEDIAN_ROW * TILE;
  const kerbImg = getSpriteAtlas().get('kerb');
  if (kerbImg) {
    for (let col = 0; col < COLS; col++) {
      ctx.drawImage(kerbImg.canvas, col * TILE, y, TILE, TILE);
    }
  } else {
    ctx.fillStyle = theme.palette.median;
    ctx.fillRect(0, y, CANVAS_WIDTH, TILE);
  }
  // 2px darker kerb line, top and bottom.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
  ctx.fillRect(0, y, CANVAS_WIDTH, 2);
  ctx.fillRect(0, y + TILE - 2, CANVAS_WIDTH, 2);
  // occasional storm drain
  ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
  ctx.beginPath();
  ctx.ellipse(6.5 * TILE, y + TILE / 2, 6, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawHomeRowStatic(ctx: CanvasRenderingContext2D, theme: WorldTheme): void {
  const y = HOME_ROW * TILE;
  // The lily-pad slots sit in open water; hedge fills the columns between them.
  ctx.fillStyle = theme.palette.water;
  ctx.fillRect(0, y, CANVAS_WIDTH, TILE);

  const hedgeImg = getSpriteAtlas().get('hedge');
  for (let col = 0; col < COLS; col++) {
    if ((HOME_COLS as readonly number[]).includes(col)) continue;
    if (hedgeImg) {
      ctx.drawImage(hedgeImg.canvas, col * TILE, y, TILE, TILE);
    } else {
      ctx.fillStyle = '#2F8A48';
      ctx.fillRect(col * TILE, y, TILE, TILE);
    }
  }
  // 6px darker soil strip along the top.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
  ctx.fillRect(0, y, CANVAS_WIDTH, 6);
}

/**
 * Pre-renders every static background element (banks, road, median, home row, river base and
 * bank foam) for one level to an offscreen canvas at device-pixel resolution. Callers blit it
 * once per frame with `ctx.drawImage(layer, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)` instead of
 * re-drawing any of this per frame. `seed` drives the tuft/speckle RNG so the look can vary (and
 * be reproduced) per level.
 */
export function buildStaticLayer(theme: WorldTheme, seed: number): HTMLCanvasElement {
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(CANVAS_WIDTH * dpr));
  canvas.height = Math.max(1, Math.round(CANVAS_HEIGHT * dpr));
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.scale(dpr, dpr);

  const rng = createRng(seed);

  ctx.fillStyle = BACKDROP;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  drawHomeRowStatic(ctx, theme);
  drawWaterBankStatic(ctx, theme);
  drawMedianStatic(ctx, theme);
  drawRoadStatic(ctx, theme, rng);
  drawGrassBand(ctx, theme, START_ROW * TILE, rng);

  return canvas;
}

/** Blits the pre-rendered static layer for the current frame. */
export function drawStaticLayer(r: Renderer, layer: HTMLCanvasElement): void {
  r.ctx.drawImage(layer, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
}

/** Dynamic per-slot content: lily pad when empty, frog-idle/croc/fly sprite when occupied, plus
 * the home-landing pulse and ring (ART_BIBLE.md section 5, "Home landing"). `homeAnims` maps a
 * slot index to seconds-since-landing for a slot that was just filled this attempt. */
export function drawHomeSlots(
  r: Renderer,
  homes: HomeSlotState[],
  homeAnims: ReadonlyMap<number, number>,
): void {
  const y = HOME_ROW * TILE;

  HOME_COLS.forEach((col, i) => {
    const cx = col * TILE + TILE / 2;
    const cy = y + TILE / 2;
    const state = homes[i] ?? null;
    const tSince = homeAnims.get(i);

    if (tSince !== undefined) {
      const ring = homeRingVisual(tSince);
      if (ring) {
        r.ctx.save();
        r.ctx.strokeStyle = '#FFFFFF';
        r.ctx.globalAlpha = ring.alpha;
        r.ctx.lineWidth = 2.5;
        r.ctx.beginPath();
        r.ctx.arc(cx, cy, ring.radiusTiles * TILE, 0, Math.PI * 2);
        r.ctx.stroke();
        r.ctx.restore();
      }
    }

    if (state === 'frog') {
      const scale = tSince !== undefined ? homeLandingScale(tSince) : 1;
      r.sprite('frog-idle', cx, cy, { sx: scale, sy: scale });
    } else if (state === 'croc') {
      // croc-slot.svg (1x1), not croc.svg (2x1 lane mover, reserved for M6) - the 2x1 sprite
      // bled off the canvas edge in the leftmost/rightmost home slots. ART_BIBLE.md section 4.
      r.sprite('croc-slot', cx, cy);
    } else if (state === 'fly') {
      r.sprite('fly', cx, cy);
    } else {
      r.sprite('lilypad', cx, cy);
    }
  });
}

export function roundRect(
  r: Renderer,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
): void {
  const ctx = r.ctx;
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
  ctx.fill();
}
