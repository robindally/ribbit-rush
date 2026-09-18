import type { Scene, SceneManager } from '../core/loop';
import type { SaveData } from '../core/save';
import { writeSave } from '../core/save';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../game/constants';
import { getWorldTheme } from '../game/themes';
import type { InputAction } from '../game/types';
import { roundRect } from '../render/draw/background';
import type { Renderer } from '../render/renderer';
import { TitleScene } from './title';

const CREAM = '#FFF7E6';
const INK = '#1B2A1D';
const DANGER = '#FF4D4D';
const GOLD = '#FFC83D';

export class GameOverScene implements Scene {
  constructor(
    private scenes: SceneManager,
    private save: SaveData,
    private score: number,
  ) {
    if (score > this.save.hiScore) {
      this.save.hiScore = score;
    }
    writeSave(this.save);
  }

  update(_dt: number): void {
    /* nothing animates yet - M4 adds transitions */
  }

  render(r: Renderer, _alpha: number): void {
    r.ctx.fillStyle = '#14162b';
    r.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    const theme = getWorldTheme(1);
    const w = CANVAS_WIDTH * 0.78;
    const h = CANVAS_HEIGHT * 0.4;
    const x = (CANVAS_WIDTH - w) / 2;
    const y = (CANVAS_HEIGHT - h) / 2;

    r.ctx.save();
    r.ctx.globalAlpha = 0.96;
    r.ctx.fillStyle = CREAM;
    roundRect(r, x, y, w, h, 24);
    r.ctx.restore();

    r.ctx.save();
    roundRect(r, x, y, w, 10, 10);
    r.ctx.fillStyle = theme.palette.accentB;
    r.ctx.fill();
    r.ctx.restore();

    r.text('GAME OVER', CANVAS_WIDTH / 2, y + h * 0.28, {
      size: 34,
      weight: 700,
      align: 'center',
      color: DANGER,
    });
    r.text(`SCORE ${this.score}`, CANVAS_WIDTH / 2, y + h * 0.48, {
      size: 22,
      weight: 600,
      align: 'center',
      color: INK,
    });
    r.text(`HI-SCORE ${this.save.hiScore}`, CANVAS_WIDTH / 2, y + h * 0.62, {
      size: 18,
      weight: 600,
      align: 'center',
      color: GOLD,
      outline: INK,
    });
    r.text('Press confirm for Title', CANVAS_WIDTH / 2, y + h * 0.84, {
      size: 15,
      weight: 500,
      align: 'center',
      color: INK,
    });
  }

  onAction(a: InputAction): void {
    if (a.type === 'confirm' || a.type === 'back') {
      this.scenes.replace(new TitleScene(this.scenes, this.save));
    }
  }
}
