// Leaderboard screen: top 10 scores, reachable from the Title (M7 spec section 4), restyled onto
// the shared UI kit for M8. Dismissed by its Back button, Escape/B, or any other input (same
// "any input" precedent every other read-only card in this codebase already uses).

import type { Scene, SceneManager } from '../core/loop';
import type { SaveData } from '../core/save';
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

const GOLD = '#FFC83D';

const ROW_SLOTS = 10; // matches core/save.ts's LEADERBOARD_MAX

export class LeaderboardScene implements Scene {
  private focus = new FocusManager();
  private backRect: Rect = { x: 0, y: 0, w: 0, h: 0 };

  constructor(
    private scenes: SceneManager,
    private save: SaveData,
  ) {}

  enter(): void {
    const w = CANVAS_WIDTH * 0.86;
    const h = CANVAS_HEIGHT * 0.78;
    const x = (CANVAS_WIDTH - w) / 2;
    const y = (CANVAS_HEIGHT - h) / 2;
    this.backRect = { x: x + w / 2 - 90, y: y + h - 58, w: 180, h: 40 };

    this.focus.clear();
    this.focus.add({
      id: 'back',
      kind: 'button',
      rect: this.backRect,
      onActivate: () => this.close(),
    });
    const canvas = document.getElementById('game');
    if (canvas instanceof HTMLCanvasElement)
      this.focus.attach(canvas, { onCancel: () => this.close() });
    pushActiveFocusManager(this.focus);
  }

  exit(): void {
    this.focus.detach();
    popActiveFocusManager(this.focus);
  }

  private close(): void {
    this.scenes.pop();
  }

  update(dt: number): void {
    transitions.update(dt);
  }

  render(r: Renderer, _alpha: number): void {
    r.ctx.fillStyle = '#14162b';
    r.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    const theme = getWorldTheme(1);
    const w = CANVAS_WIDTH * 0.86;
    const h = CANVAS_HEIGHT * 0.78;
    const x = (CANVAS_WIDTH - w) / 2;
    const y = (CANVAS_HEIGHT - h) / 2;
    drawCard(r, { x, y, w, h }, theme.palette.accentA);

    r.text('LEADERBOARD', CANVAS_WIDTH / 2, y + h * 0.08, {
      size: 24,
      weight: 700,
      align: 'center',
      color: INK,
    });

    const entries = this.save.leaderboard.slice(0, ROW_SLOTS);
    if (entries.length === 0) {
      r.text('No scores yet - be the first!', CANVAS_WIDTH / 2, y + h * 0.4, {
        size: 15,
        weight: 500,
        align: 'center',
        color: INK,
      });
    } else {
      const top = y + h * 0.15;
      const bottom = y + h * 0.82;
      const rowH = (bottom - top) / ROW_SLOTS;
      entries.forEach((e, i) => {
        const ry = top + i * rowH + rowH / 2;
        const color = i === 0 ? GOLD : INK;
        r.text(`${i + 1}.`, x + w * 0.07, ry, { size: 14, weight: 700, align: 'left', color });
        r.text(e.name, x + w * 0.17, ry, { size: 14, weight: 700, align: 'left', color });
        r.text(String(e.score), x + w * 0.42, ry, {
          size: 14,
          weight: 600,
          align: 'left',
          color: INK,
        });
        r.text(`W${e.world}-L${e.level}`, x + w * 0.68, ry, {
          size: 12,
          weight: 500,
          align: 'left',
          color: INK,
        });
        r.text(e.date, x + w * 0.93, ry, { size: 11, weight: 500, align: 'right', color: INK });
      });
    }

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
