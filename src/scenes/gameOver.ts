import type { Scene, SceneManager } from '../core/loop';
import type { SaveData } from '../core/save';
import { writeSave } from '../core/save';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../game/constants';
import type { InputAction } from '../game/types';
import type { Renderer } from '../render/renderer';
import { TitleScene } from './title';

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
    /* nothing animates yet */
  }

  render(r: Renderer, _alpha: number): void {
    r.ctx.fillStyle = '#14162b';
    r.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    r.text('GAME OVER', CANVAS_WIDTH / 2, CANVAS_HEIGHT * 0.4, {
      size: 40,
      weight: 700,
      align: 'center',
      color: '#e2574c',
    });
    r.text(`SCORE ${this.score}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT * 0.5, {
      size: 22,
      align: 'center',
      color: '#ffffff',
    });
    r.text(`HI-SCORE ${this.save.hiScore}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT * 0.56, {
      size: 18,
      align: 'center',
      color: '#ffd166',
    });
    r.text('Press confirm for Title', CANVAS_WIDTH / 2, CANVAS_HEIGHT * 0.68, {
      size: 16,
      align: 'center',
      color: '#cccccc',
    });
  }

  onAction(a: InputAction): void {
    if (a.type === 'confirm' || a.type === 'back') {
      this.scenes.replace(new TitleScene(this.scenes, this.save));
    }
  }
}
