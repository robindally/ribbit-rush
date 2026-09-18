// Road: static fill, noise speckle, dashed lane lines, kerb lines, the world 5 rail lane's two
// rails + sleepers, tram rails under any road lane carrying a tram, and oil decal tiles. Nothing
// here changes per frame, so it's drawn once into the static layer by background.ts's
// `buildStaticLayer` (rebuilt on a level change, since which lanes/hazards apply is per-level).
// See docs/ART_BIBLE.md section 6 ("Road", "Rail lane (world 5)") and docs/specs/M6-worlds.md
// section 2 ("Tram... draw two rails under any road lane that contains a tram").

import type { Rng } from '../../core/rng';
import { CANVAS_WIDTH, COLS, ROAD_ROWS, TILE } from '../../game/constants';
import type { WorldTheme } from '../../game/themes';
import type { LaneDef, LevelDef } from '../../game/types';
import { getSpriteAtlas } from '../sprites';

/** Tiles `rail.svg` (bible section 6: "Rail lane (world 5): Two rails in #6B7280 with sleepers")
 * across the full row width. Shared by the world 5 `rail` lane itself and by any `road` lane that
 * carries a tram (M6 spec section 2: "draw two rails under any road lane that contains a tram"). */
function drawRailPair(ctx: CanvasRenderingContext2D, row: number): void {
  const y = row * TILE;
  const railImg = getSpriteAtlas().get('rail');
  if (!railImg) return;
  for (let col = 0; col < COLS; col++) {
    ctx.drawImage(railImg.canvas, col * TILE, y, TILE, TILE);
  }
}

/** `oil.svg` decal (bible section 4: "oil, 1x1 decal, dark iridescent ellipse"). */
function drawOilTile(ctx: CanvasRenderingContext2D, col: number, row: number): void {
  const oilImg = getSpriteAtlas().get('oil');
  if (!oilImg) return;
  ctx.drawImage(oilImg.canvas, col * TILE, row * TILE, TILE, TILE);
}

export function drawRoadStatic(
  ctx: CanvasRenderingContext2D,
  theme: WorldTheme,
  rng: Rng,
  lanes: LaneDef[] = [],
  hazardTiles: LevelDef['hazardTiles'] = [],
): void {
  const top = ROAD_ROWS[0] * TILE;
  const bottom = (ROAD_ROWS[ROAD_ROWS.length - 1] + 1) * TILE;

  ctx.fillStyle = theme.palette.road;
  ctx.fillRect(0, top, CANVAS_WIDTH, bottom - top);

  // 2px noise speckle at 6% alpha.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.06)';
  const speckleCount = Math.round((CANVAS_WIDTH / TILE) * ROAD_ROWS.length * 6);
  for (let i = 0; i < speckleCount; i++) {
    const sx = rng.range(0, CANVAS_WIDTH);
    const sy = rng.range(top, bottom);
    ctx.beginPath();
    ctx.arc(sx, sy, 1, 0, Math.PI * 2);
    ctx.fill();
  }

  // Dashed lane line between each pair of adjacent road lanes.
  ctx.save();
  ctx.strokeStyle = theme.palette.laneLine;
  ctx.lineWidth = 2;
  ctx.setLineDash([12, 12]);
  for (let i = 0; i < ROAD_ROWS.length - 1; i++) {
    const y = (ROAD_ROWS[i] + 1) * TILE;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(CANVAS_WIDTH, y);
    ctx.stroke();
  }
  ctx.restore();

  // Kerb line, 3px in median colour, at both outer road edges.
  ctx.fillStyle = theme.palette.median;
  ctx.fillRect(0, top - 1.5, CANVAS_WIDTH, 3);
  ctx.fillRect(0, bottom - 1.5, CANVAS_WIDTH, 3);

  // World 5's rail lane, and any road lane carrying a tram (M6 spec section 2).
  for (const lane of lanes) {
    if (lane.row < ROAD_ROWS[0] || lane.row > ROAD_ROWS[ROAD_ROWS.length - 1]) continue;
    const isRail = lane.kind === 'rail';
    const hasTram = lane.kind === 'road' && lane.movers.some((m) => m.type === 'tram');
    if (isRail || hasTram) drawRailPair(ctx, lane.row);
  }

  for (const h of hazardTiles ?? []) {
    if (h.type === 'oil') drawOilTile(ctx, h.col, h.row);
  }
}
