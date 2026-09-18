// Road: static fill, noise speckle, dashed lane lines, and kerb lines at the road block's outer
// edges. Nothing here changes per frame (no rain puddles etc. in M3 - world 1 is clear weather),
// so it's drawn once into the static layer by background.ts's `buildStaticLayer`. See
// docs/ART_BIBLE.md section 6 ("Road") and docs/specs/M3-art-pass.md section 3.

import type { Rng } from '../../core/rng';
import { CANVAS_WIDTH, ROAD_ROWS, TILE } from '../../game/constants';
import type { WorldTheme } from '../../game/themes';

export function drawRoadStatic(ctx: CanvasRenderingContext2D, theme: WorldTheme, rng: Rng): void {
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
}
