// Flat placeholder road background with dashed lane lines for road rows.

import { COLS, TILE } from '../../game/constants';
import type { Renderer } from '../renderer';

const ROAD = '#4a4e57';
const LANE_LINE = 'rgba(255, 255, 255, 0.35)';

export function drawRoadRow(r: Renderer, row: number): void {
  const ctx = r.ctx;
  const y = row * TILE;
  ctx.fillStyle = ROAD;
  ctx.fillRect(0, y, COLS * TILE, TILE);

  ctx.save();
  ctx.strokeStyle = LANE_LINE;
  ctx.lineWidth = 3;
  ctx.setLineDash([12, 10]);
  ctx.beginPath();
  ctx.moveTo(0, y + TILE / 2);
  ctx.lineTo(COLS * TILE, y + TILE / 2);
  ctx.stroke();
  ctx.restore();
}
