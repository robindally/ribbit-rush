// Leaderboard screen: top 10 scores, reachable from the Title (M7 spec section 4). Dismissed on
// any input, same precedent as `scenes/levelIntro.ts`'s card - M8 adds the proper button/screen.

import type { Scene, SceneManager } from '../core/loop';
import * as audio from '../core/audio';
import type { SaveData } from '../core/save';
import * as transitions from '../fx/transitions';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../game/constants';
import { getWorldTheme } from '../game/themes';
import type { InputAction } from '../game/types';
import { roundRect } from '../render/draw/background';
import type { Renderer } from '../render/renderer';

const CREAM = '#FFF7E6';
const INK = '#1B2A1D';
const GOLD = '#FFC83D';

const ROW_SLOTS = 10; // matches core/save.ts's LEADERBOARD_MAX

export class LeaderboardScene implements Scene {
  constructor(
    private scenes: SceneManager,
    private save: SaveData,
  ) {}

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

    r.ctx.save();
    r.ctx.globalAlpha = 0.96;
    r.ctx.fillStyle = CREAM;
    roundRect(r, x, y, w, h, 24);
    r.ctx.restore();

    r.ctx.save();
    roundRect(r, x, y, w, 10, 10);
    r.ctx.fillStyle = theme.palette.accentA;
    r.ctx.fill();
    r.ctx.restore();

    r.text('LEADERBOARD', CANVAS_WIDTH / 2, y + h * 0.08, {
      size: 24,
      weight: 700,
      align: 'center',
      color: INK,
    });

    const entries = this.save.leaderboard.slice(0, ROW_SLOTS);
    if (entries.length === 0) {
      r.text('No scores yet - be the first!', CANVAS_WIDTH / 2, y + h * 0.45, {
        size: 15,
        weight: 500,
        align: 'center',
        color: INK,
      });
    } else {
      const top = y + h * 0.16;
      const bottom = y + h * 0.88;
      const rowH = (bottom - top) / ROW_SLOTS;
      entries.forEach((e, i) => {
        const ry = top + i * rowH + rowH / 2;
        const color = i === 0 ? GOLD : INK;
        r.text(`${i + 1}.`, x + w * 0.07, ry, { size: 14, weight: 700, align: 'left', color });
        r.text(e.name, x + w * 0.17, ry, { size: 14, weight: 700, align: 'left', color });
        r.text(String(e.score), x + w * 0.42, ry, { size: 14, weight: 600, align: 'left', color: INK });
        r.text(`W${e.world}-L${e.level}`, x + w * 0.68, ry, {
          size: 12,
          weight: 500,
          align: 'left',
          color: INK,
        });
        r.text(e.date, x + w * 0.93, ry, { size: 11, weight: 500, align: 'right', color: INK });
      });
    }

    r.text('Press any key or tap to return', CANVAS_WIDTH / 2, y + h * 0.95, {
      size: 13,
      weight: 500,
      align: 'center',
      color: INK,
    });

    transitions.render(r);
  }

  onAction(_a: InputAction): void {
    if (transitions.isActive()) return;
    audio.playSfx('uiConfirm');
    this.scenes.pop();
  }
}
