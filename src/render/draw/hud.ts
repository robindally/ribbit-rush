// HUD: score / world+level / hi-score on top, lives and a timer bar on the bottom. See
// docs/ART_BIBLE.md section 8 ("Typography and UI") and docs/specs/M3-art-pass.md section 6.

import { CANVAS_WIDTH, HUD_BOTTOM_ROW, TILE } from '../../game/constants';
import type { Renderer } from '../renderer';
import { roundRect } from './background';

const CREAM = '#FFF7E6';
const INK = '#1B2A1D';
const FROG_BODY = '#58D65E';
const GOLD = '#FFC83D';
const DANGER = '#FF4D4D';

export interface HudState {
  score: number;
  hiScore: number;
  level: number;
  worldName: string;
  lives: number;
  timeLeft: number;
  timeLimit: number;
  elapsed: number;
  /** Current streak multiplier (docs/specs/M4-juice.md section 6), 1-4. */
  multiplier: number;
  /** Seconds since `multiplier` last changed, driving the badge's pulse-on-change. */
  multiplierPulseT: number;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function lerpColor(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `rgb(${r}, ${g}, ${bl})`;
}

/** frogBody above 40% remaining, ramps to gold by 20%, ramps to danger by 0%. */
function timerColor(pct: number): string {
  if (pct > 0.4) return FROG_BODY;
  if (pct > 0.2) return lerpColor(GOLD, FROG_BODY, (pct - 0.2) / 0.2);
  return lerpColor(DANGER, GOLD, Math.max(0, pct) / 0.2);
}

export function drawHud(r: Renderer, hud: HudState): void {
  const topY = TILE * 0.55;
  r.text(`SCORE ${hud.score}`, 12, topY, {
    size: 18,
    weight: 700,
    align: 'left',
    color: CREAM,
    outline: INK,
  });
  r.text(`${hud.worldName.toUpperCase()} - L${hud.level}`, CANVAS_WIDTH / 2, topY, {
    size: 16,
    weight: 600,
    align: 'center',
    color: CREAM,
    outline: INK,
  });
  r.text(`HI ${hud.hiScore}`, CANVAS_WIDTH - 12, topY, {
    size: 18,
    weight: 700,
    align: 'right',
    color: CREAM,
    outline: INK,
  });

  // Streak multiplier badge, beside the score: pulses briefly when it changes, fades to a quiet
  // 25% when it's back to x1 (docs/specs/M4-juice.md section 6).
  const MULTIPLIER_PULSE_S = 0.25;
  const pulseScale =
    hud.multiplierPulseT < MULTIPLIER_PULSE_S
      ? 1 + 0.35 * (1 - hud.multiplierPulseT / MULTIPLIER_PULSE_S)
      : 1;
  const badgeAlpha = hud.multiplier > 1 ? 1 : 0;
  r.ctx.save();
  r.ctx.globalAlpha = badgeAlpha;
  r.ctx.translate(150, topY);
  r.ctx.scale(pulseScale, pulseScale);
  r.ctx.fillStyle = GOLD;
  r.ctx.beginPath();
  r.ctx.arc(0, 0, 15, 0, Math.PI * 2);
  r.ctx.fill();
  r.text(`x${hud.multiplier}`, 0, 0, { size: 16, weight: 700, align: 'center', color: INK });
  r.ctx.restore();

  const bottomY = HUD_BOTTOM_ROW * TILE;

  // Lives, as small frog-idle icons bottom-left: at most 5 icons; beyond that, 5 icons + "xN"
  // (the dev hook and extra-life pickups can both push lives well past 5).
  const liveScale = 0.42;
  const liveSpacing = TILE * 0.5;
  const MAX_LIFE_ICONS = 5;
  const iconCount = Math.min(hud.lives, MAX_LIFE_ICONS);
  for (let i = 0; i < iconCount; i++) {
    r.sprite('frog-idle', 16 + i * liveSpacing + (TILE * liveScale) / 2, bottomY + TILE / 2, {
      sx: liveScale,
      sy: liveScale,
    });
  }
  if (hud.lives > MAX_LIFE_ICONS) {
    r.text(`x${hud.lives}`, 16 + iconCount * liveSpacing + 4, bottomY + TILE / 2, {
      size: 17,
      weight: 700,
      align: 'left',
      color: CREAM,
      outline: INK,
    });
  }

  // Timer bar bottom-right: 6 tiles wide, 10px tall, rounded, colour ramp, pulses under 5s.
  const barW = TILE * 6;
  const barH = 10;
  const barX = CANVAS_WIDTH - barW - 12;
  const barY = bottomY + TILE / 2 - barH / 2;
  const pct = Math.max(0, Math.min(1, hud.timeLeft / Math.max(0.001, hud.timeLimit)));

  let alpha = 1;
  if (hud.timeLeft < 5 && hud.timeLeft > 0) {
    alpha = 0.7 + 0.3 * Math.sin(hud.elapsed * Math.PI * 2 * 4);
  }

  r.ctx.save();
  r.ctx.fillStyle = 'rgba(255, 247, 230, 0.25)';
  roundRect(r, barX, barY, barW, barH, barH / 2);
  r.ctx.globalAlpha = alpha;
  r.ctx.fillStyle = timerColor(pct);
  roundRect(r, barX, barY, Math.max(barH, barW * pct), barH, barH / 2);
  r.ctx.restore();
}

/** A small "tap for sound" hint in the HUD's top corner, shown until the first user gesture
 * creates the AudioContext (docs/specs/M5-audio.md section 1). Called by any scene that wants it
 * (title, play) - not tied to `drawHud` itself since Title doesn't otherwise draw a HUD.
 *
 * Defaults to the top-left, `play.ts`'s own HUD corner (unchanged pre-M8-fix-up behaviour); Title
 * passes `corner: 'top-right'` instead (M8 fix-up spec item 3) since top-left is where the logo's
 * peeking frog sits (see `title.ts`'s `drawLogoFrogPeek`) and the two used to overlap. */
export function drawAudioHint(
  r: Renderer,
  visible: boolean,
  opts: { corner?: 'top-left' | 'top-right' } = {},
): void {
  if (!visible) return;
  const rightAligned = opts.corner === 'top-right';
  r.text('\u{1F507} Tap for sound', rightAligned ? CANVAS_WIDTH - 12 : 12, 12, {
    size: 12,
    weight: 600,
    align: rightAligned ? 'right' : 'left',
    color: CREAM,
    outline: INK,
  });
}
