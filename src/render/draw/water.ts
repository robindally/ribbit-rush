// River water: a static base fill + bank foam (baked into the static layer once per level), and
// the per-frame animated streak bands, specular dashes, and platform contact shadows described in
// docs/ART_BIBLE.md section 3 ("Water") and section 6 ("River"). See
// docs/specs/M3-art-pass.md section 3.

import { CANVAS_WIDTH, COLS, RIVER_ROWS, TILE } from '../../game/constants';
import { moverInstances } from '../../game/lanes';
import type { WorldTheme } from '../../game/themes';
import type { LaneDef } from '../../game/types';
import { turtleVisual } from '../anim';
import type { Renderer } from '../renderer';

/** Base water fill for every river row, plus a 4px waterLight foam line at the two bank edges. */
export function drawWaterBankStatic(ctx: CanvasRenderingContext2D, theme: WorldTheme): void {
  const top = RIVER_ROWS[0] * TILE;
  const bottom = (RIVER_ROWS[RIVER_ROWS.length - 1] + 1) * TILE;

  ctx.fillStyle = theme.palette.water;
  ctx.fillRect(0, top, CANVAS_WIDTH, bottom - top);

  ctx.fillStyle = theme.palette.waterLight;
  ctx.fillRect(0, top, CANVAS_WIDTH, 4);
  ctx.fillRect(0, bottom - 4, CANVAS_WIDTH, 4);
}

const BANDS_PER_ROW = 3;

/** Three lighter streak bands per river row, offset by sine, scrolling with the lane's speed and
 * direction, plus a drifting 6px specular dash line at 1.5x lane speed. Drawn every frame - not
 * cacheable, the whole point is that it moves. */
export function drawWaterAnimated(
  r: Renderer,
  lane: LaneDef,
  theme: WorldTheme,
  elapsed: number,
): void {
  const y = lane.row * TILE;
  const dirSign = lane.speed >= 0 ? 1 : -1;
  const speedPxS = Math.abs(lane.speed) * TILE;
  const ctx = r.ctx;

  ctx.save();
  ctx.strokeStyle = theme.palette.waterLight;
  ctx.globalAlpha = 0.24;
  ctx.lineWidth = 3;
  for (let i = 0; i < BANDS_PER_ROW; i++) {
    const bandY = y + (i + 1) * (TILE / (BANDS_PER_ROW + 1)) + Math.sin(elapsed * 1.3 + i * 2.1) * 2;
    ctx.setLineDash([26, 16]);
    ctx.lineDashOffset = -dirSign * elapsed * speedPxS + i * 9;
    ctx.beginPath();
    ctx.moveTo(0, bandY);
    ctx.lineTo(COLS * TILE, bandY);
    ctx.stroke();
  }
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = '#FFFFFF';
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 30]);
  ctx.lineDashOffset = -dirSign * elapsed * speedPxS * 1.5;
  ctx.beginPath();
  const specY = y + TILE * 0.68;
  ctx.moveTo(0, specY);
  ctx.lineTo(COLS * TILE, specY);
  ctx.stroke();
  ctx.restore();
}

/** A 2px waterDeep contact shadow under every visible, currently-surfaced platform in this river
 * lane (a diving turtle that's fully under draws none). */
export function drawPlatformContactShadows(
  r: Renderer,
  lane: LaneDef,
  theme: WorldTheme,
  elapsed: number,
): void {
  const y = lane.row * TILE;
  const ctx = r.ctx;
  ctx.fillStyle = theme.palette.waterDeep;
  ctx.globalAlpha = 0.5;
  for (const mover of lane.movers) {
    if (mover.dive && !turtleVisual(mover.dive, elapsed).visible) continue;
    for (const x of moverInstances(lane, mover)) {
      const px = x * TILE;
      const w = mover.width * TILE;
      if (px + w < 0 || px > COLS * TILE) continue;
      ctx.fillRect(px + 2, y + TILE - 6, w - 4, 2);
    }
  }
  ctx.globalAlpha = 1;
}
