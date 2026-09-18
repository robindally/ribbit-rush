import type { Scene, SceneManager } from '../core/loop';
import type { SaveData } from '../core/save';
import * as transitions from '../fx/transitions';
import { CANVAS_HEIGHT, CANVAS_WIDTH, TILE } from '../game/constants';
import { getWorldTheme } from '../game/themes';
import type { InputAction, LaneDef } from '../game/types';
import { createBlinkState, frogIdleBreath, tickBlink, type BlinkState } from '../render/anim';
import { drawWaterAnimated } from '../render/draw/water';
import { drawSpriteImage, type Renderer } from '../render/renderer';
import { preloadSpriteAt, spriteAt } from '../render/sprites';
import { PlayScene } from './play';

const LOGO_TEXT = 'RIBBIT RUSH';
const LOGO_FONT_SIZE = 72;
const LOGO_LIME = '#8BEA7B';
const LOGO_GREEN = '#3FA84A';
const LOGO_EDGE = '#2F7A3A';
const LOGO_EXTRUDE_PX = 5;

// Any frog drawn above 1x must be rasterised from the SVG at that size (ART_BIBLE.md section 1),
// so the title pre-warms both sizes it needs: the hero below the logo, and the frog peeking
// behind the first letter. `spriteAt` would otherwise return undefined on the first frame or two
// while rasterisation is in flight.
const HERO_SCALE = 3;
const LOGO_FROG_SCALE = 1.5;

interface LogoLayout {
  canvas: HTMLCanvasElement;
  /** Logical px - already in the same coordinate space as the renderer's ctx. */
  width: number;
  height: number;
  /** Centre-x and top-y of the first glyph, in the canvas's own logical coordinate space, so the
   * hero-behind-the-letter frog (drawn separately, underneath) can be positioned without
   * duplicating this text-layout math. */
  firstGlyphCenterX: number;
  firstGlyphTopY: number;
}

/**
 * Pre-renders the logo treatment (ART_BIBLE.md section 1) once: each letter individually rotated
 * alternately -3/+3 degrees, a lime-to-green vertical gradient, a 5px dark-green extruded bottom
 * edge, and a soft white top-third highlight. Cached so no gradient is created per frame (M3 spec
 * section 7). Built at `width * dpr` x `height * dpr` with `ctx.scale(dpr, dpr)` so it rasterises
 * crisply on high-DPI screens, but the returned `width`/`height` stay in logical px - the caller
 * draws at that logical size, never at the backing canvas's own (device-pixel) dimensions.
 */
function buildLogoCanvas(dpr: number): LogoLayout {
  const measureCtx = document.createElement('canvas').getContext('2d');
  const chars = [...LOGO_TEXT];
  const font = `700 ${LOGO_FONT_SIZE}px Fredoka, sans-serif`;
  let widths: number[];
  if (measureCtx) {
    measureCtx.font = font;
    widths = chars.map((ch) => measureCtx.measureText(ch).width);
  } else {
    widths = chars.map((ch) => (ch === ' ' ? LOGO_FONT_SIZE * 0.32 : LOGO_FONT_SIZE * 0.62));
  }
  const totalWidth = widths.reduce((a, b) => a + b, 0);

  const sidePad = 16;
  const width = totalWidth + sidePad * 2;
  const ascent = LOGO_FONT_SIZE * 0.78;
  const height = ascent + LOGO_EXTRUDE_PX + LOGO_FONT_SIZE * 0.18;

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * dpr));
  canvas.height = Math.max(1, Math.round(height * dpr));
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return { canvas, width, height, firstGlyphCenterX: width / 2, firstGlyphTopY: 0 };
  }
  ctx.scale(dpr, dpr);

  ctx.font = font;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  let cursorX = sidePad;
  const baselineY = height - LOGO_FONT_SIZE * 0.1;

  let firstGlyphCenterX = width / 2;
  let firstGlyphTopY = baselineY - ascent;
  let firstGlyphSeen = false;

  chars.forEach((ch, i) => {
    const charW = widths[i];
    if (ch === ' ') {
      cursorX += charW;
      return;
    }
    if (!firstGlyphSeen) {
      firstGlyphCenterX = cursorX + charW / 2;
      firstGlyphTopY = baselineY - ascent;
      firstGlyphSeen = true;
    }
    const rot = (i % 2 === 0 ? -3 : 3) * (Math.PI / 180);

    ctx.save();
    ctx.translate(cursorX + charW / 2, baselineY);
    ctx.rotate(rot);
    ctx.translate(-charW / 2, 0);

    // 5px dark-green extruded bottom edge, drawn first so it peeks out beneath the top face.
    ctx.fillStyle = LOGO_EDGE;
    ctx.fillText(ch, 0, LOGO_EXTRUDE_PX);

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

  return { canvas, width, height, firstGlyphCenterX, firstGlyphTopY };
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
  private logo: LogoLayout;
  private elapsed = 0;
  private heroBlink: BlinkState = createBlinkState();

  constructor(
    private scenes: SceneManager,
    private save: SaveData,
  ) {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    this.logo = buildLogoCanvas(dpr);
    // Kick rasterisation off now so `spriteAt` below has real bitmaps by the first render call
    // rather than skipping a frame - see render/sprites.ts.
    void preloadSpriteAt('frog-idle', HERO_SCALE);
    void preloadSpriteAt('frog-idle', LOGO_FROG_SCALE);
  }

  update(dt: number): void {
    this.elapsed += dt;
    tickBlink(this.heroBlink, dt);
    transitions.update(dt);
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

    const logoX = (CANVAS_WIDTH - this.logo.width) / 2;
    const logoY = bandY + RIVER_BAND_HEIGHT / 2 - this.logo.height / 2;

    // 1.5x frog behind the first letter, drawn before the logo so only its eyes and the top of
    // its head show above the letter (ART_BIBLE.md section 1).
    const logoFrog = spriteAt('frog-idle', LOGO_FROG_SCALE);
    if (logoFrog) {
      const frogCx = logoX + this.logo.firstGlyphCenterX;
      const frogCy = logoY + this.logo.firstGlyphTopY + logoFrog.height * 0.32;
      drawSpriteImage(r.ctx, logoFrog, frogCx, frogCy);
    }

    // Logo, centred over the river band.
    r.ctx.drawImage(this.logo.canvas, logoX, logoY, this.logo.width, this.logo.height);

    // 3x idle-breathing hero frog, below the logo block - rasterised at 3x, not upscaled from the
    // 1x sprite (ART_BIBLE.md section 1).
    const heroImg = spriteAt('frog-idle', HERO_SCALE);
    if (heroImg) {
      const heroY = logoY + this.logo.height + TILE * 1.7;
      const breath = frogIdleBreath(this.elapsed);
      drawSpriteImage(r.ctx, heroImg, CANVAS_WIDTH / 2, heroY, { sx: breath, sy: breath });
      if (this.heroBlink.blinking) {
        r.ctx.save();
        r.ctx.translate(CANVAS_WIDTH / 2, heroY);
        r.ctx.scale(HERO_SCALE * breath, HERO_SCALE * breath);
        r.ctx.fillStyle = '#58D65E';
        r.ctx.beginPath();
        r.ctx.ellipse(-8.5, -15.5, 5.2, 3.9, 0, 0, Math.PI * 2);
        r.ctx.ellipse(8.5, -15.5, 5.2, 3.9, 0, 0, Math.PI * 2);
        r.ctx.fill();
        r.ctx.restore();
      }
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

    transitions.render(r);
  }

  onAction(_a: InputAction): void {
    if (transitions.isActive()) return; // ignore input mid-wipe
    transitions.play(() => this.scenes.replace(new PlayScene(this.scenes, this.save)));
  }
}
