// Movers (vehicles, logs, turtles) and the frog. Flat placeholder shapes only - see
// docs/specs/M0-M2-classic-core.md "Placeholder rendering".

import { COLS, TILE } from '../../game/constants';
import { moverInstances, turtleDiveState } from '../../game/lanes';
import type { Frog, LaneDef, MoverDef } from '../../game/types';
import type { Renderer } from '../renderer';
import { roundRect } from './background';

const VEHICLE_COLORS: Partial<Record<MoverDef['type'], string>> = {
  car: '#e2574c',
  taxi: '#f2c14e',
  sports: '#8e44ad',
  pickup: '#d35400',
  van: '#2e86ab',
  truck: '#556b2f',
  bus: '#f39c12',
  motorbike: '#7f8c8d',
  tram: '#16a085',
  train: '#2c3e50',
};

const LOG_COLOR = '#8a5a30';
const TURTLE_COLOR = '#3d8f52';
const TURTLE_DIM = 'rgba(61, 143, 82, 0.45)';
const CROC_COLOR = '#2f5233';
const FLOE_COLOR = '#dce9ee';

function drawMoverInstance(
  r: Renderer,
  lane: LaneDef,
  mover: MoverDef,
  x: number,
  elapsed: number,
): void {
  const y = lane.row * TILE;
  const h = TILE * 0.72;
  const padY = (TILE - h) / 2;
  const px = x * TILE;
  const w = mover.width * TILE;

  if (px + w < 0 || px > COLS * TILE) return; // off-screen, skip

  if (mover.type === 'log') {
    r.ctx.fillStyle = LOG_COLOR;
    roundRect(r, px + 2, y + padY, w - 4, h, 10);
    return;
  }

  if (mover.type === 'turtle') {
    const dim = !!mover.dive && turtleDiveState(mover.dive, elapsed) === 'down';
    r.ctx.fillStyle = dim ? TURTLE_DIM : TURTLE_COLOR;
    const count = Math.max(1, Math.round(mover.width));
    for (let i = 0; i < count; i++) {
      const cx = px + (i + 0.5) * TILE;
      r.ctx.beginPath();
      r.ctx.arc(cx, y + TILE / 2, TILE * 0.38, 0, Math.PI * 2);
      r.ctx.fill();
    }
    return;
  }

  if (mover.type === 'croc') {
    r.ctx.fillStyle = CROC_COLOR;
    roundRect(r, px + 2, y + padY, w - 4, h, 8);
    return;
  }

  if (mover.type === 'floe') {
    r.ctx.fillStyle = FLOE_COLOR;
    roundRect(r, px + 2, y + padY, w - 4, h, 10);
    return;
  }

  // Vehicles: rounded rects in distinct colours.
  r.ctx.fillStyle = VEHICLE_COLORS[mover.type] ?? '#999999';
  roundRect(r, px + 3, y + padY, w - 6, h, 8);
}

export function drawLaneMovers(r: Renderer, lane: LaneDef, elapsed: number): void {
  for (const mover of lane.movers) {
    for (const x of moverInstances(lane, mover)) {
      drawMoverInstance(r, lane, mover, x, elapsed);
    }
  }
}

/** Draws the frog with a hop arc: lifted by sin(pi * hopT) * 0.4 * TILE while hopping. */
export function drawFrog(r: Renderer, frog: Frog): void {
  const cx = (frog.x + 0.5) * TILE;
  const groundY = frog.row * TILE + TILE / 2;
  const hopLift = frog.state === 'hopping' ? Math.sin(Math.PI * frog.hopT) * 0.4 * TILE : 0;
  const y = groundY - hopLift;

  r.shadow(cx, groundY + TILE * 0.22, TILE * 0.56, TILE * 0.26);

  const size = TILE * 0.62;
  r.ctx.fillStyle = frog.state === 'dying' ? '#9a9a9a' : '#4caf50';
  roundRect(r, cx - size / 2, y - size / 2, size, size, 10);

  r.ctx.fillStyle = '#ffffff';
  const eyeOffset = size * 0.22;
  const eyeY = y - size * 0.22;
  r.ctx.beginPath();
  r.ctx.arc(cx - eyeOffset, eyeY, size * 0.12, 0, Math.PI * 2);
  r.ctx.arc(cx + eyeOffset, eyeY, size * 0.12, 0, Math.PI * 2);
  r.ctx.fill();
}
