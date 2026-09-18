// Score popups: rise 24px and fade over 700ms. See docs/specs/M4-juice.md section 4 and
// ART_BIBLE.md section 8 ("Score popups").
//
// Self-subscribes to `GameEvent` ('score' and 'extraLife') per the milestone rule that fx/ reacts
// to events rather than being called directly by gameplay code.

import { gameEvents } from '../core/events';
import { TILE } from '../game/constants';
import type { Renderer } from '../render/renderer';

const RISE_PX = 24;
const LIFE_S = 0.7;
const MAX_POPUPS = 12;
const FONT_SIZE = 18;

const CREAM = '#FFF7E6';
const INK = '#1B2A1D';

interface Popup {
  x: number;
  y: number;
  text: string;
  age: number;
}

let popups: Popup[] = [];

function spawn(x: number, y: number, text: string): void {
  popups.push({ x, y, text, age: 0 });
  if (popups.length > MAX_POPUPS) popups.shift(); // oldest is dropped
}

function tileToPx(x: number, row: number): { x: number; y: number } {
  return { x: (x + 0.5) * TILE, y: row * TILE + TILE / 2 };
}

gameEvents.on('score', (e) => {
  if (!e.label) return; // a plain, unlabelled score delta has nothing to show
  const p = tileToPx(e.x, e.row);
  spawn(p.x, p.y, e.label);
});

gameEvents.on('extraLife', (e) => {
  const p = tileToPx(e.x, e.row);
  spawn(p.x, p.y, 'EXTRA LIFE');
});

export function update(dt: number): void {
  for (const p of popups) p.age += dt;
  popups = popups.filter((p) => p.age < LIFE_S);
}

export function render(r: Renderer): void {
  for (const p of popups) {
    const t = Math.min(1, p.age / LIFE_S);
    const y = p.y - RISE_PX * t;
    const alpha = 1 - t;
    r.ctx.save();
    r.ctx.globalAlpha = alpha;
    r.text(p.text, p.x, y, {
      size: FONT_SIZE,
      weight: 600,
      align: 'center',
      color: CREAM,
      outline: INK,
    });
    r.ctx.restore();
  }
}

export function getCount(): number {
  return popups.length;
}

/** Test/dev-only: clears every popup. */
export function reset(): void {
  popups = [];
}
