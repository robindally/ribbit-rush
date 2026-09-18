// Pause overlay (M8 spec section 1): Resume, Restart level, Settings, Quit to title. Dims the
// play field 60% and freezes it underneath (world.update never runs while Pause is the top scene -
// only the top of the stack is ever updated, per core/loop.ts's SceneManager).

import type { Scene, SceneManager } from '../core/loop';
import * as audio from '../core/audio';
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
import type { PlayScene } from './play';
import { SettingsScene } from './settings';
import { TitleScene } from './title';

export class PauseScene implements Scene {
  private focus = new FocusManager();
  private buttons: Rect[] = [];

  constructor(
    private scenes: SceneManager,
    private under: PlayScene,
    private save: SaveData,
  ) {}

  enter(): void {
    const canvas = document.getElementById('game');
    if (canvas instanceof HTMLCanvasElement)
      this.focus.attach(canvas, { onCancel: () => this.resume() });
    this.registerControls();
    pushActiveFocusManager(this.focus);
  }

  exit(): void {
    this.focus.detach();
    popActiveFocusManager(this.focus);
  }

  private registerControls(): void {
    const w = CANVAS_WIDTH * 0.66;
    const h = CANVAS_HEIGHT * 0.4;
    const x = (CANVAS_WIDTH - w) / 2;
    const y = (CANVAS_HEIGHT - h) / 2;
    const buttonW = w - 56;
    const buttonH = 44;
    const gap = 12;
    const startY = y + h * 0.34;
    this.buttons = [0, 1, 2, 3].map((i) => ({
      x: x + 28,
      y: startY + i * (buttonH + gap),
      w: buttonW,
      h: buttonH,
    }));

    this.focus.clear();
    this.focus.add({
      id: 'resume',
      kind: 'button',
      rect: this.buttons[0],
      onActivate: () => this.resume(),
    });
    this.focus.add({
      id: 'restart',
      kind: 'button',
      rect: this.buttons[1],
      onActivate: () => this.restartLevel(),
    });
    this.focus.add({
      id: 'settings',
      kind: 'button',
      rect: this.buttons[2],
      onActivate: () => this.scenes.push(new SettingsScene(this.scenes, this.save)),
    });
    this.focus.add({
      id: 'quit',
      kind: 'button',
      rect: this.buttons[3],
      onActivate: () => this.quitToTitle(),
    });
  }

  private resume(): void {
    audio.playSfx('uiConfirm');
    this.scenes.pop();
  }

  private restartLevel(): void {
    audio.playSfx('uiConfirm');
    this.under.restartLevel();
    this.scenes.pop();
  }

  private quitToTitle(): void {
    audio.playSfx('uiConfirm');
    transitions.play(() => this.scenes.replace(new TitleScene(this.scenes, this.save)));
  }

  update(dt: number): void {
    /* the play field beneath is frozen (not updated) while paused */
    transitions.update(dt);
  }

  render(r: Renderer, alpha: number): void {
    this.under.render(r, alpha);

    r.ctx.fillStyle = 'rgba(10, 10, 20, 0.6)'; // dim the play field 60% (spec section 1)
    r.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    const theme = getWorldTheme(this.under.currentWorldId());
    const w = CANVAS_WIDTH * 0.66;
    const h = CANVAS_HEIGHT * 0.4;
    const x = (CANVAS_WIDTH - w) / 2;
    const y = (CANVAS_HEIGHT - h) / 2;
    drawCard(r, { x, y, w, h }, theme.palette.accentA);

    r.text('PAUSED', CANVAS_WIDTH / 2, y + h * 0.16, {
      size: 26,
      weight: 700,
      align: 'center',
      color: INK,
    });

    const labels = ['RESUME', 'RESTART LEVEL', 'SETTINGS', 'QUIT TO TITLE'];
    const ids = ['resume', 'restart', 'settings', 'quit'];
    ids.forEach((id, i) => {
      drawButton(
        r,
        this.buttons[i],
        labels[i],
        {
          hover: this.focus.isHovered(id),
          pressed: this.focus.isPressed(id),
          focused: this.focus.isFocused(id),
        },
        { accent: theme.palette.accentA },
      );
    });

    transitions.render(r);
  }

  onAction(a: InputAction): void {
    if (transitions.isActive()) return;
    if (this.focus.handleAction(a)) return;
    if (a.type === 'pause') this.resume();
  }
}
