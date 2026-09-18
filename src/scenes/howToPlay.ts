// How to play: one card with the controls and three tips (M8 spec section 1), reachable from the
// Title. Dismissed via its Back button, Escape/B, or any input - same "any input dismisses"
// precedent as `LevelIntroScene`'s card.

import type { Scene, SceneManager } from '../core/loop';
import * as transitions from '../fx/transitions';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../game/constants';
import { getWorldTheme } from '../game/themes';
import type { InputAction } from '../game/types';
import type { Renderer } from '../render/renderer';
import {
  drawButton,
  drawCard,
  FocusManager,
  INK,
  pushActiveFocusManager,
  popActiveFocusManager,
  type Rect,
} from '../render/ui';

const CONTROLS = [
  'Arrows / WASD or swipe to hop',
  'Enter / Space or tap a button to confirm',
  'Escape / P or the pause button to pause',
  'Gamepad: d-pad/stick to move, A confirm, B back, Start pause',
];

const TIPS = [
  'Fill all five lily pads to clear a level - ride logs and turtles, but watch the turtles dive.',
  'Power-ups help: Bubble Shield cancels one death, Freeze Frame stops traffic, Rewind Clock adds time, Mega Hop covers two tiles.',
  'Chain forward hops quickly for a streak multiplier, and squeeze past traffic for a near-miss bonus.',
];

export class HowToPlayScene implements Scene {
  private focus = new FocusManager();
  private backRect: Rect = { x: 0, y: 0, w: 0, h: 0 };

  constructor(private scenes: SceneManager) {}

  enter(): void {
    const canvas = document.getElementById('game');
    if (canvas instanceof HTMLCanvasElement)
      this.focus.attach(canvas, { onCancel: () => this.close() });
    this.registerControls();
    pushActiveFocusManager(this.focus);
  }

  exit(): void {
    this.focus.detach();
    popActiveFocusManager(this.focus);
  }

  private registerControls(): void {
    const w = CANVAS_WIDTH * 0.88;
    const h = CANVAS_HEIGHT * 0.8;
    const x = (CANVAS_WIDTH - w) / 2;
    const y = (CANVAS_HEIGHT - h) / 2;
    this.backRect = { x: x + w / 2 - 90, y: y + h - 62, w: 180, h: 42 };
    this.focus.clear();
    this.focus.add({
      id: 'back',
      kind: 'button',
      rect: this.backRect,
      onActivate: () => this.close(),
    });
  }

  update(dt: number): void {
    transitions.update(dt);
  }

  private close(): void {
    this.scenes.pop();
  }

  render(r: Renderer, _alpha: number): void {
    r.ctx.fillStyle = '#14162b';
    r.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    const theme = getWorldTheme(1);
    const w = CANVAS_WIDTH * 0.88;
    const h = CANVAS_HEIGHT * 0.8;
    const x = (CANVAS_WIDTH - w) / 2;
    const y = (CANVAS_HEIGHT - h) / 2;
    drawCard(r, { x, y, w, h }, theme.palette.accentA);

    r.text('HOW TO PLAY', CANVAS_WIDTH / 2, y + 36, {
      size: 24,
      weight: 700,
      align: 'center',
      color: INK,
    });

    r.text('CONTROLS', x + 28, y + 74, {
      size: 14,
      weight: 700,
      align: 'left',
      color: theme.palette.accentB,
    });
    CONTROLS.forEach((line, i) => {
      r.text(`• ${line}`, x + 28, y + 100 + i * 22, {
        size: 13,
        weight: 500,
        align: 'left',
        color: INK,
      });
    });

    const tipsTop = y + 100 + CONTROLS.length * 22 + 26;
    r.text('TIPS', x + 28, tipsTop, {
      size: 14,
      weight: 700,
      align: 'left',
      color: theme.palette.accentB,
    });
    let ty = tipsTop + 26;
    TIPS.forEach((tip) => {
      const lines = wrap(tip, 58);
      lines.forEach((line, i) => {
        r.text(i === 0 ? `• ${line}` : `  ${line}`, x + 28, ty, {
          size: 13,
          weight: 500,
          align: 'left',
          color: INK,
        });
        ty += 19;
      });
      ty += 6;
    });

    drawButton(
      r,
      this.backRect,
      'BACK',
      {
        hover: this.focus.isHovered('back'),
        pressed: this.focus.isPressed('back'),
        focused: this.focus.isFocused('back'),
      },
      { accent: theme.palette.accentA },
    );

    transitions.render(r);
  }

  onAction(a: InputAction): void {
    if (transitions.isActive()) return;
    if (this.focus.handleAction(a)) return;
    this.close();
  }
}

/** Naive word-wrap for the card's fixed-width text lines (no canvas measureText dependency -
 * good enough for this static copy). */
function wrap(text: string, maxChars: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars) {
      if (line) lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}
