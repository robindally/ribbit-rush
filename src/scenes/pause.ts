import type { Scene, SceneManager } from '../core/loop';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../game/constants';
import type { InputAction } from '../game/types';
import type { Renderer } from '../render/renderer';

export class PauseScene implements Scene {
  constructor(
    private scenes: SceneManager,
    private under: Scene,
  ) {}

  update(_dt: number): void {
    /* frozen while paused */
  }

  render(r: Renderer, alpha: number): void {
    this.under.render(r, alpha);

    r.ctx.fillStyle = 'rgba(10, 10, 20, 0.55)';
    r.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    r.text('PAUSED', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 10, {
      size: 40,
      weight: 700,
      align: 'center',
      color: '#ffffff',
    });
    r.text('Press pause or confirm to resume', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 32, {
      size: 16,
      align: 'center',
      color: '#cccccc',
    });
  }

  onAction(a: InputAction): void {
    if (a.type === 'pause' || a.type === 'confirm') {
      this.scenes.pop();
    }
  }
}
