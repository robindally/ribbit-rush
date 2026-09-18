// Flat placeholder water background for river rows. No sine bands or foam yet - that's M3.

import { COLS, TILE } from '../../game/constants';
import type { Renderer } from '../renderer';

const WATER = '#3f9be0';

export function drawWaterRow(r: Renderer, row: number): void {
  r.ctx.fillStyle = WATER;
  r.ctx.fillRect(0, row * TILE, COLS * TILE, TILE);
}
