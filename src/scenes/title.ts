import type { Scene, SceneManager } from '../core/loop';
import type { SaveData } from '../core/save';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../game/constants';
import type { InputAction } from '../game/types';
import type { Renderer } from '../render/renderer';
import { PlayScene } from './play';

export class TitleScene implements Scene {
  constructor(
    private scenes: SceneManager,
    private save: SaveData,
  ) {}

  update(_dt: number): void {
    /* nothing animates yet */
  }

  render(r: Renderer, _alpha: number): void {
    r.ctx.fillStyle = '#14162b';
    r.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    r.text('RIBBIT RUSH', CANVAS_WIDTH / 2, CANVAS_HEIGHT * 0.38, {
      size: 48,
      weight: 700,
      align: 'center',
      color: '#6bcb5a',
      outline: '#0c0d1a',
    });
    r.text(`HI-SCORE ${this.save.hiScore}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT * 0.5, {
      size: 22,
      align: 'center',
      color: '#ffd166',
    });
    r.text('Press any key or tap to start', CANVAS_WIDTH / 2, CANVAS_HEIGHT * 0.62, {
      size: 18,
      align: 'center',
      color: '#ffffff',
    });
  }

  onAction(_a: InputAction): void {
    this.scenes.replace(new PlayScene(this.scenes, this.save));
  }
}
