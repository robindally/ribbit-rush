// HUD: score / hi-score / level on top, lives and a timer bar on the bottom.

import { CANVAS_WIDTH, HUD_BOTTOM_ROW, TILE } from '../../game/constants';
import type { Renderer } from '../renderer';

export interface HudState {
  score: number;
  hiScore: number;
  level: number;
  lives: number;
  timeLeft: number;
  timeLimit: number;
}

export function drawHud(r: Renderer, hud: HudState): void {
  const topY = TILE * 0.55;
  r.text(`SCORE ${hud.score}`, 12, topY, { size: 18, align: 'left', color: '#ffffff' });
  r.text(`HI ${hud.hiScore}`, CANVAS_WIDTH / 2, topY, {
    size: 18,
    align: 'center',
    color: '#ffd166',
  });
  r.text(`LV ${hud.level}`, CANVAS_WIDTH - 12, topY, {
    size: 18,
    align: 'right',
    color: '#ffffff',
  });

  const bottomY = HUD_BOTTOM_ROW * TILE;

  // Lives, as small frog dots bottom-left.
  const liveSize = 10;
  for (let i = 0; i < hud.lives; i++) {
    r.ctx.fillStyle = '#4caf50';
    r.ctx.beginPath();
    r.ctx.arc(16 + i * (liveSize + 6), bottomY + TILE / 2, liveSize / 2, 0, Math.PI * 2);
    r.ctx.fill();
  }

  // Timer bar bottom-right.
  const barW = TILE * 4;
  const barH = 10;
  const barX = CANVAS_WIDTH - barW - 12;
  const barY = bottomY + TILE / 2 - barH / 2;
  const pct = Math.max(0, Math.min(1, hud.timeLeft / Math.max(0.001, hud.timeLimit)));

  r.ctx.fillStyle = 'rgba(255,255,255,0.2)';
  r.ctx.fillRect(barX, barY, barW, barH);
  r.ctx.fillStyle = pct < 0.25 ? '#e2574c' : '#4caf50';
  r.ctx.fillRect(barX, barY, barW * pct, barH);
}
