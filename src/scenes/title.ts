import type { Scene, SceneManager } from '../core/loop';
import type { SaveData } from '../core/save';
import { CANVAS_HEIGHT, CANVAS_WIDTH, TILE } from '../game/constants';
import { getWorldTheme } from '../game/themes';
import type { InputAction, LaneDef } from '../game/types';
import { frogBlink, frogIdleBreath } from '../render/anim';
import { drawWaterAnimated } from '../render/draw/water';
import type { Renderer } from '../render/renderer';
import { PlayScene } from './play';

const LOGO_TEXT = 'RIBBIT RUSH.';
const LOGO_FONT_SIZE = 62;
const LOGO_LIME = '#8BEA7B';
const LOGO_GREEN = '#3FA84A';
const LOGO_EDGE = '#2F7A3A';

/**
 * Pre-renders the logo treatment (ART_BIBLE.md section 1) once: each letter individually rotated
 * alternately -3/+3 degrees, a lime-to-green vertical gradient, a 4px dark-green extruded bottom
 * edge, and a soft white top-third highlight. Cached so no gradient is created per frame (M3 spec
 * section 7).
 */
function buildLogoCanvas(): HTMLCanvasElement {
  const width = 600;
  const height = 130;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.font = `700 ${LOGO_FONT_SIZE}px Fredoka, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  const chars = [...LOGO_TEXT];
  const widths = chars.map((ch) => ctx.measureText(ch).width);
  const totalWidth = widths.reduce((a, b) => a + b, 0);
  let cursorX = (width - totalWidth) / 2;
  const baselineY = height * 0.68;
  const ascent = LOGO_FONT_SIZE * 0.78;

  chars.forEach((ch, i) => {
    const charW = widths[i];
    if (ch === ' ') {
      cursorX += charW;
      return;
    }
    const rot = (i % 2 === 0 ? -3 : 3) * (Math.PI / 180);

    ctx.save();
    ctx.translate(cursorX + charW / 2, baselineY);
    ctx.rotate(rot);
    ctx.translate(-charW / 2, 0);

    // 4px dark-green extruded bottom edge, drawn first so it peeks out beneath the top face.
    ctx.fillStyle = LOGO_EDGE;
    ctx.fillText(ch, 0, 4);

    // Lime-to-green vertical gradient top face.
    const grad = ctx.createLinearGradient(0, -ascent, 0, 0);
    grad.addColorStop(0, LOGO_LIME);
    grad.addColorStop(1, LOGO_GREEN);
    ctx.fillStyle = grad;
    ctx.fillText(ch, 0, 0);

    // Soft white highlight across the top third, confined to the glyph via source-atop.
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.fillRect(-2, -ascent, charW + 4, ascent / 3);
    ctx.globalCompositeOperation = 'source-over';

    ctx.restore();
    cursorX += charW;
  });

  return canvas;
}

// A synthetic river "lane" purely to reuse draw/water.ts's animated streak-band renderer for the
// title's background river strip - not a real gameplay lane.
const RIVER_BAND_ROW = CANVAS_HEIGHT * 0.24 / TILE;
const RIVER_BAND_HEIGHT = TILE * 1.6;
const TITLE_RIVER_LANE: LaneDef = {
  row: RIVER_BAND_ROW,
  kind: 'river',
  speed: 1.6,
  period: 20,
  movers: [],
};

export class TitleScene implements Scene {
  private logoCanvas: HTMLCanvasElement;
  private elapsed = 0;

  constructor(
    private scenes: SceneManager,
    private save: SaveData,
  ) {
    this.logoCanvas = buildLogoCanvas();
  }

  update(dt: number): void {
    this.elapsed += dt;
  }

  render(r: Renderer, _alpha: number): void {
    const theme = getWorldTheme(1);

    r.ctx.fillStyle = '#14162b';
    r.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Animated river band behind the logo.
    const bandY = RIVER_BAND_ROW * TILE;
    r.ctx.fillStyle = theme.palette.water;
    r.ctx.fillRect(0, bandY, CANVAS_WIDTH, RIVER_BAND_HEIGHT);
    drawWaterAnimated(r, TITLE_RIVER_LANE, theme, this.elapsed);
    r.ctx.fillStyle = theme.palette.waterLight;
    r.ctx.globalAlpha = 0.5;
    r.ctx.fillRect(0, bandY, CANVAS_WIDTH, 3);
    r.ctx.fillRect(0, bandY + RIVER_BAND_HEIGHT - 3, CANVAS_WIDTH, 3);
    r.ctx.globalAlpha = 1;

    // Logo, centred over the river band.
    const logoX = (CANVAS_WIDTH - this.logoCanvas.width) / 2;
    const logoY = bandY + RIVER_BAND_HEIGHT / 2 - this.logoCanvas.height / 2;
    r.ctx.drawImage(this.logoCanvas, logoX, logoY);

    // Small hero frog peeking over the first letter of the logo.
    r.sprite('frog-idle', logoX + 22, logoY + 36, { sx: 0.5, sy: 0.5 });

    // Larger 3x idle-breathing hero frog, beside/below the logo block.
    const heroScale = 3;
    const heroY = logoY + this.logoCanvas.height + TILE * 1.7;
    const breath = frogIdleBreath(this.elapsed);
    r.sprite('frog-idle', CANVAS_WIDTH / 2, heroY, {
      sx: heroScale * breath,
      sy: heroScale * breath,
    });
    if (frogBlink(this.elapsed)) {
      r.ctx.save();
      r.ctx.translate(CANVAS_WIDTH / 2, heroY);
      r.ctx.scale(heroScale * breath, heroScale * breath);
      r.ctx.fillStyle = '#58D65E';
      r.ctx.beginPath();
      r.ctx.ellipse(-8.5, -15.5, 5.2, 3.9, 0, 0, Math.PI * 2);
      r.ctx.ellipse(8.5, -15.5, 5.2, 3.9, 0, 0, Math.PI * 2);
      r.ctx.fill();
      r.ctx.restore();
    }

    r.text(`HI-SCORE ${this.save.hiScore}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT * 0.86, {
      size: 20,
      weight: 600,
      align: 'center',
      color: '#FFC83D',
      outline: '#1B2A1D',
    });

    const pulse = 0.6 + 0.4 * Math.abs(Math.sin(this.elapsed * Math.PI * 1.4));
    r.ctx.save();
    r.ctx.globalAlpha = pulse;
    r.text('Press any key or tap to start', CANVAS_WIDTH / 2, CANVAS_HEIGHT * 0.93, {
      size: 18,
      weight: 600,
      align: 'center',
      color: '#FFF7E6',
      outline: '#1B2A1D',
    });
    r.ctx.restore();
  }

  onAction(_a: InputAction): void {
    this.scenes.replace(new PlayScene(this.scenes, this.save));
  }
}
