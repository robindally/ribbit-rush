// Static rows: start bank (grass), median, and the home row with its five lily-pad slots and
// hedge columns. Flat placeholder colours only - see docs/specs/M0-M2-classic-core.md.

import { COLS, HOME_COLS, HOME_ROW, MEDIAN_ROW, TILE } from '../../game/constants';
import type { HomeSlotState } from '../../game/types';
import type { Renderer } from '../renderer';

const GRASS = '#6bcb5a';
const MEDIAN_COLOR = '#c9c2b0';
const HOME_BG = '#2f8a48';
const HOME_SLOT_EMPTY = '#5fc97f';
const HOME_SLOT_FROG = '#3fae63';
const HOME_SLOT_CROC = '#3a5a30';
const HOME_SLOT_DOT = '#2a2a2a';

function rowY(row: number): number {
  return row * TILE;
}

export function drawBank(r: Renderer, row: number): void {
  r.ctx.fillStyle = GRASS;
  r.ctx.fillRect(0, rowY(row), COLS * TILE, TILE);
}

export function drawMedian(r: Renderer): void {
  r.ctx.fillStyle = MEDIAN_COLOR;
  r.ctx.fillRect(0, rowY(MEDIAN_ROW), COLS * TILE, TILE);
}

export function drawHomeRow(r: Renderer, homes: HomeSlotState[]): void {
  const y = rowY(HOME_ROW);
  r.ctx.fillStyle = HOME_BG;
  r.ctx.fillRect(0, y, COLS * TILE, TILE);

  // Hedge columns: every column that isn't a home slot.
  r.ctx.fillStyle = GRASS;
  for (let col = 0; col < COLS; col++) {
    if ((HOME_COLS as readonly number[]).includes(col)) continue;
    r.ctx.fillRect(col * TILE, y, TILE, TILE);
  }

  // Slot squares.
  const pad = TILE * 0.12;
  HOME_COLS.forEach((col, i) => {
    const state = homes[i] ?? null;
    const x = col * TILE + pad;
    const sy = y + pad;
    const size = TILE - pad * 2;

    if (state === 'croc') r.ctx.fillStyle = HOME_SLOT_CROC;
    else if (state === 'frog') r.ctx.fillStyle = HOME_SLOT_FROG;
    else r.ctx.fillStyle = HOME_SLOT_EMPTY;
    roundRect(r, x, sy, size, size, 6);

    if (state === 'fly') {
      r.ctx.fillStyle = HOME_SLOT_DOT;
      r.ctx.beginPath();
      r.ctx.arc(col * TILE + TILE / 2, y + TILE / 2, TILE * 0.14, 0, Math.PI * 2);
      r.ctx.fill();
    } else if (state === 'frog') {
      r.ctx.fillStyle = '#ffffff';
      const eyeY = y + TILE / 2 - 4;
      r.ctx.beginPath();
      r.ctx.arc(col * TILE + TILE / 2 - 5, eyeY, 3, 0, Math.PI * 2);
      r.ctx.arc(col * TILE + TILE / 2 + 5, eyeY, 3, 0, Math.PI * 2);
      r.ctx.fill();
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
