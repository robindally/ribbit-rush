import type { Scene, SceneManager } from '../core/loop';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../game/constants';
import { getWorldTheme } from '../game/themes';
import type { InputAction } from '../game/types';
import { roundRect } from '../render/draw/background';
import type { Renderer } from '../render/renderer';

const CREAM = '#FFF7E6';
const INK = '#1B2A1D';

/** Rounded cream card with a world-accent top stripe, per ART_BIBLE.md section 8 ("Cards"). */
function drawCard(
  r: Renderer,
  x: number,
  y: number,
  w: number,
  h: number,
  accent: string,
  title: string,
  subtitle: string,
): void {
  r.ctx.save();
  r.ctx.globalAlpha = 0.96;
  r.ctx.fillStyle = CREAM;
  roundRect(r, x, y, w, h, 24);
  r.ctx.restore();

  r.ctx.save();
  r.ctx.beginPath();
  roundRect(r, x, y, w, 10, 10);
  r.ctx.fillStyle = accent;
  r.ctx.fill();
  r.ctx.restore();

  r.text(title, x + w / 2, y + h * 0.38, {
    size: 36,
    weight: 700,
    align: 'center',
    color: INK,
  });
  r.text(subtitle, x + w / 2, y + h * 0.64, {
    size: 16,
    weight: 500,
    align: 'center',
    color: INK,
  });
}

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

    const theme = getWorldTheme(1);
    const w = CANVAS_WIDTH * 0.7;
    const h = CANVAS_HEIGHT * 0.24;
    drawCard(
      r,
      (CANVAS_WIDTH - w) / 2,
      (CANVAS_HEIGHT - h) / 2,
      w,
      h,
      theme.palette.accentA,
      'PAUSED',
      'Press pause or confirm to resume',
    );
  }

  onAction(a: InputAction): void {
    if (a.type === 'pause' || a.type === 'confirm') {
      this.scenes.pop();
    }
  }
}
