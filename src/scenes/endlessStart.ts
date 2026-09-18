// Endless start card (M9 spec section 1): "Endless start card with a Daily seed toggle (UTC date
// seed) and a Random option." Pushed from the Title's (now-unlocked) Endless button.

import type { Scene, SceneManager } from '../core/loop';
import * as audio from '../core/audio';
import type { SaveData } from '../core/save';
import * as transitions from '../fx/transitions';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../game/constants';
import { utcDateSeed } from '../game/endless';
import { getWorldTheme } from '../game/themes';
import type { InputAction } from '../game/types';
import type { Renderer } from '../render/renderer';
import {
  drawButton,
  drawCard,
  drawToggle,
  FocusManager,
  INK,
  pushActiveFocusManager,
  popActiveFocusManager,
  type Rect,
} from '../render/ui';
import { PlayScene } from './play';

const START_DIFFICULTY = 1.2;

export class EndlessStartScene implements Scene {
  private focus = new FocusManager();
  private cardRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private toggleRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private startRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private backRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  /** On = seed from today's UTC date (so friends comparing runs land on the same lanes); off = a
   * fresh random seed every time. */
  private daily = true;

  constructor(
    private scenes: SceneManager,
    private save: SaveData,
  ) {}

  enter(): void {
    const w = CANVAS_WIDTH * 0.78;
    const h = CANVAS_HEIGHT * 0.5;
    const x = (CANVAS_WIDTH - w) / 2;
    const y = (CANVAS_HEIGHT - h) / 2;
    this.cardRect = { x, y, w, h };
    this.toggleRect = { x: x + w / 2 - 28, y: y + h * 0.44, w: 56, h: 28 };
    this.startRect = { x: x + w / 2 - 90, y: y + h * 0.62, w: 180, h: 44 };
    this.backRect = { x: x + w / 2 - 70, y: y + h - 54, w: 140, h: 36 };

    this.focus.clear();
    this.focus.add({
      id: 'daily',
      kind: 'toggle',
      rect: this.toggleRect,
      value: this.daily ? 1 : 0,
      onChange: (v) => {
        this.daily = v > 0;
      },
    });
    this.focus.add({
      id: 'start',
      kind: 'button',
      rect: this.startRect,
      onActivate: () => this.start(),
    });
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

  private start(): void {
    if (transitions.isActive()) return;
    const seed = this.daily ? utcDateSeed() : Date.now();
    audio.playSfx('uiConfirm');
    transitions.play(() =>
      this.scenes.replace(
        new PlayScene(this.scenes, this.save, { startDifficulty: START_DIFFICULTY, seed }),
      ),
    );
  }

  update(dt: number): void {
    transitions.update(dt);
  }

  render(r: Renderer, _alpha: number): void {
    r.ctx.fillStyle = '#14162b';
    r.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    const theme = getWorldTheme(1);
    const { x, y, w, h } = this.cardRect;
    drawCard(r, this.cardRect, theme.palette.accentA);

    r.text('ENDLESS MODE', CANVAS_WIDTH / 2, y + h * 0.14, {
      size: 26,
      weight: 700,
      align: 'center',
      color: INK,
    });
    r.text('Cross as many roads and rivers as you can. Every crossing raises the', CANVAS_WIDTH / 2, y + h * 0.24, {
      size: 12,
      weight: 500,
      align: 'center',
      color: INK,
    });
    r.text('difficulty and, every five crossings, the world.', CANVAS_WIDTH / 2, y + h * 0.29, {
      size: 12,
      weight: 500,
      align: 'center',
      color: INK,
    });

    r.text('DAILY SEED', x + w / 2 - 42, y + h * 0.44 + 14, {
      size: 13,
      weight: 700,
      align: 'right',
      color: INK,
    });
    drawToggle(
      r,
      this.toggleRect,
      this.daily,
      { hover: this.focus.isHovered('daily'), focused: this.focus.isFocused('daily') },
      theme.palette.accentA,
    );
    r.text(
      this.daily ? `Today: ${utcDateSeed()} (UTC)` : 'Random seed on start',
      CANVAS_WIDTH / 2,
      y + h * 0.44 + 34,
      { size: 11, weight: 500, align: 'center', color: INK },
    );

    drawButton(
      r,
      this.startRect,
      'START',
      {
        hover: this.focus.isHovered('start'),
        pressed: this.focus.isPressed('start'),
        focused: this.focus.isFocused('start'),
      },
      { accent: theme.palette.accentA },
    );
    drawButton(
      r,
      this.backRect,
      'BACK',
      {
        hover: this.focus.isHovered('back'),
        pressed: this.focus.isPressed('back'),
        focused: this.focus.isFocused('back'),
      },
      { accent: theme.palette.accentA, size: 14 },
    );

    transitions.render(r);
  }

  onAction(a: InputAction): void {
    if (transitions.isActive()) return;
    if (this.focus.handleAction(a)) return;
    this.close();
  }
}
