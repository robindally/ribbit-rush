// Title screen (M8 spec section 1 + docs/ART_BIBLE.md sections 1 and 9's composition): the logo
// with the 1.5x frog tucked behind the first R, an animated river band, a road strip carrying a
// slow parade of vehicles, a grass bank at the bottom with the 3x hero sitting on it, and five
// buttons (Start, Endless, Leaderboard, Settings, How to play) driven by the shared UI kit's
// FocusManager - keyboard, gamepad, and pointer (hover/tap) all work the same way every other
// menu does.

import type { Scene, SceneManager } from '../core/loop';
import * as audio from '../core/audio';
import { isEndlessUnlocked, type SaveData } from '../core/save';
import { createRng } from '../core/rng';
import * as music from '../audio/music';
import * as transitions from '../fx/transitions';
import { CANVAS_HEIGHT, CANVAS_WIDTH, TILE } from '../game/constants';
import { stepLane } from '../game/lanes';
import { getWorldTheme } from '../game/themes';
import type { InputAction, LaneDef } from '../game/types';
import { createBlinkState, frogIdleBreath, tickBlink, type BlinkState } from '../render/anim';
import { drawGrassBand } from '../render/draw/background';
import { drawLaneMovers } from '../render/draw/entities';
import { drawAudioHint } from '../render/draw/hud';
import { drawWaterAnimated } from '../render/draw/water';
import { drawSpriteImage, type Renderer } from '../render/renderer';
import { preloadSpriteAt, spriteAt } from '../render/sprites';
import {
  actionHint,
  drawButton,
  FocusManager,
  pushActiveFocusManager,
  popActiveFocusManager,
  setPageVignette,
  type Rect,
} from '../render/ui';
import { HowToPlayScene } from './howToPlay';
import { LeaderboardScene } from './leaderboard';
import { PlayScene } from './play';
import { SettingsScene } from './settings';

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

// M8 fix-up spec item 3: at least this much gap between the hero's lowest point (its feet) and
// the top of the Start button, and at least this much between the hi-score/prompt text and the
// canvas's own bottom edge - both in logical (624x720) px, the same space every other measurement
// in this file's layout already uses.
const HERO_START_GAP_PX = 24;
const SCREEN_BOTTOM_MARGIN_PX = 16;
// frog-idle.svg's 48x48 viewBox has its lowest visible point - the back feet's toe circles, cy
// 45.2/45.4 r 1.6 - at local y ~= 47; local y = 24 is the viewBox's own vertical centre, which is
// where `drawSpriteImage`'s `anchor: 'center'` places `heroCy` below. `frogIdleBreath`'s own idle
// scale oscillation is a further +-2%; folded in here as safety margin rather than recomputed
// every frame, since 2% of the hero's own height is under 3px either way.
const HERO_FEET_OFFSET_PX = HERO_SCALE * TILE * ((47 - 24) / 48) * 1.02;

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

/** Composition layout (M8 spec section 1's title paragraph): logo, river band, road strip, grass
 * bank, then the button stack - computed once in the constructor from the logo's own measured
 * height, since Fredoka's metrics aren't known until `buildLogoCanvas` runs. */
interface TitleLayout {
  logoY: number;
  riverY: number;
  riverH: number;
  roadY: number;
  roadH: number;
  bankY: number;
  bankH: number;
  heroCy: number;
  buttonsY: number;
  buttonW: number;
  buttonH: number;
  buttonGap: number;
  buttonX: number;
  hiScoreY: number;
  hintY: number;
}

function buildLayout(logoHeight: number): TitleLayout {
  const logoY = 12;
  const riverY = logoY + logoHeight + 8;
  const riverH = 34;
  const roadY = riverY + riverH;
  const roadH = TILE;
  const bankY = roadY + roadH;
  const bankH = TILE;
  const buttonW = 320;
  const buttonH = 46;
  const buttonGap = 12;
  const heroCy = bankY + bankH * 0.72;

  // M8 fix-up spec item 3: the button stack (and the hi-score/prompt text below it) moves down
  // using the canvas's own free space at the bottom, rather than sitting a fixed distance below
  // the grass bank - pre-fix-up, that fixed 28px gap put Start's top edge *above* the hero's own
  // feet (heroBottomY below) on the logo/font metrics this actually measures at, i.e. overlapping.
  const heroBottomY = heroCy + HERO_FEET_OFFSET_PX;
  const contentH = 5 * buttonH + 4 * buttonGap; // the five-button stack's own height
  const hiScoreOffset = 26; // hi-score sits this far below the stack
  const hintOffset = 56; // the prompt hint sits this far below the stack
  const hintHalfHeight = 8; // ~half the 15px hint text's own line height

  const desiredButtonsY = heroBottomY + HERO_START_GAP_PX;
  // Never push the whole stack far enough that the hint text would end up closer than
  // SCREEN_BOTTOM_MARGIN_PX to the canvas's bottom edge; never pull it back above the pre-fix-up
  // minimum gap from the bank either (defensive floor - unreachable at today's logo metrics, but
  // keeps this correct if the font/logo height ever changes).
  const maxButtonsY =
    CANVAS_HEIGHT - SCREEN_BOTTOM_MARGIN_PX - hintHalfHeight - hintOffset - contentH;
  const minButtonsY = bankY + bankH + 28;
  const buttonsY = Math.max(minButtonsY, Math.min(desiredButtonsY, maxButtonsY));

  return {
    logoY,
    riverY,
    riverH,
    roadY,
    roadH,
    bankY,
    bankH,
    heroCy,
    buttonsY,
    buttonW,
    buttonH,
    buttonGap,
    buttonX: (CANVAS_WIDTH - buttonW) / 2,
    hiScoreY: buttonsY + contentH + hiScoreOffset,
    hintY: buttonsY + contentH + hintOffset,
  };
}

const TOAST_DURATION_S = 1.6;

export class TitleScene implements Scene {
  private logo: LogoLayout;
  private layout: TitleLayout;
  private elapsed = 0;
  private heroBlink: BlinkState = createBlinkState();
  private focus = new FocusManager();
  private riverLane: LaneDef;
  private roadLane: LaneDef;
  private grassRng = createRng(1337);
  private toastText: string | null = null;
  private toastT = 0;

  constructor(
    private scenes: SceneManager,
    private save: SaveData,
  ) {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    this.logo = buildLogoCanvas(dpr);
    this.layout = buildLayout(this.logo.height);
    // Kick rasterisation off now so `spriteAt` below has real bitmaps by the first render call
    // rather than skipping a frame - see render/sprites.ts.
    void preloadSpriteAt('frog-idle', HERO_SCALE);
    void preloadSpriteAt('frog-idle', LOGO_FROG_SCALE);

    this.riverLane = {
      row: this.layout.riverY / TILE,
      kind: 'river',
      speed: 1.6,
      period: 20,
      movers: [],
    };
    // A slow parade of vehicles on the road strip between the river band and the grass bank
    // (spec section 1) - purely decorative, reusing the real mover-rendering pipeline.
    this.roadLane = {
      row: this.layout.roadY / TILE,
      kind: 'road',
      speed: 1.1,
      period: 18,
      movers: [
        { type: 'car', width: 1, offset: 0 },
        { type: 'taxi', width: 1, offset: 5 },
        { type: 'bus', width: 2, offset: 9.5 },
        { type: 'motorbike', width: 0.6, offset: 14.5 },
      ],
    };
  }

  enter(): void {
    // World 1 patterns at the fixed title tempo, no kick/snare (docs/specs/M5-audio.md section 3).
    music.play(1, { title: true });
    audio.playSfx('croak'); // "title start" (docs/specs/M5-audio.md section 2)

    const canvas = document.getElementById('game');
    if (canvas instanceof HTMLCanvasElement) this.focus.attach(canvas);
    this.registerControls();
    pushActiveFocusManager(this.focus);
    setPageVignette(getWorldTheme(1).palette.accentA);
  }

  exit(): void {
    this.focus.detach();
    popActiveFocusManager(this.focus);
  }

  private registerControls(): void {
    this.focus.clear();
    const { buttonX, buttonW, buttonH, buttonGap, buttonsY } = this.layout;
    const rectAt = (i: number): Rect => ({
      x: buttonX,
      y: buttonsY + i * (buttonH + buttonGap),
      w: buttonW,
      h: buttonH,
    });

    this.focus.add({
      id: 'start',
      kind: 'button',
      rect: rectAt(0),
      onActivate: () => this.startGame(false),
    });

    const unlocked = isEndlessUnlocked(this.save.bestLevel);
    this.focus.add({
      id: 'endless',
      kind: 'button',
      rect: rectAt(1),
      disabled: !unlocked,
      onActivate: () => this.showToast('Endless mode: coming soon!'),
    });

    this.focus.add({
      id: 'leaderboard',
      kind: 'button',
      rect: rectAt(2),
      onActivate: () => this.scenes.push(new LeaderboardScene(this.scenes, this.save)),
    });

    this.focus.add({
      id: 'settings',
      kind: 'button',
      rect: rectAt(3),
      onActivate: () => this.scenes.push(new SettingsScene(this.scenes, this.save)),
    });

    this.focus.add({
      id: 'howto',
      kind: 'button',
      rect: rectAt(4),
      onActivate: () => this.scenes.push(new HowToPlayScene(this.scenes)),
    });
  }

  private showToast(text: string): void {
    this.toastText = text;
    this.toastT = 0;
  }

  private startGame(playSound = true): void {
    if (transitions.isActive()) return;
    if (playSound) audio.playSfx('uiConfirm');
    transitions.play(() => this.scenes.replace(new PlayScene(this.scenes, this.save)));
  }

  update(dt: number): void {
    this.elapsed += dt;
    tickBlink(this.heroBlink, dt);
    stepLane(this.riverLane, dt);
    stepLane(this.roadLane, dt);
    transitions.update(dt);
    if (this.toastText) {
      this.toastT += dt;
      if (this.toastT > TOAST_DURATION_S) this.toastText = null;
    }
  }

  render(r: Renderer, _alpha: number): void {
    const theme = getWorldTheme(1);
    const L = this.layout;

    r.ctx.fillStyle = '#14162b';
    r.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Logo, with the 1.5x frog tucked behind the first R - see the module doc comment and
    // `drawLogoFrogPeek` below for how the "only eyes and the top of its head show" cut is made.
    const logoX = (CANVAS_WIDTH - this.logo.width) / 2;
    const logoY = L.logoY;
    this.drawLogoFrogPeek(r, logoX, logoY);
    r.ctx.drawImage(this.logo.canvas, logoX, logoY, this.logo.width, this.logo.height);

    // River band.
    r.ctx.fillStyle = theme.palette.water;
    r.ctx.fillRect(0, L.riverY, CANVAS_WIDTH, L.riverH);
    drawWaterAnimated(r, this.riverLane, theme, this.elapsed);
    r.ctx.save();
    r.ctx.globalAlpha = 0.5;
    r.ctx.fillStyle = theme.palette.waterLight;
    r.ctx.fillRect(0, L.riverY, CANVAS_WIDTH, 3);
    r.ctx.fillRect(0, L.riverY + L.riverH - 3, CANVAS_WIDTH, 3);
    r.ctx.restore();

    // Road strip: a slow parade of vehicles between the river band and the grass bank (spec
    // section 1), so the title reads as the game rather than a static poster.
    r.ctx.fillStyle = theme.palette.road;
    r.ctx.fillRect(0, L.roadY, CANVAS_WIDTH, L.roadH);
    drawLaneMovers(r, this.roadLane, this.elapsed);

    // Grass bank, with the 3x hero sitting on it.
    drawGrassBand(r.ctx, theme, L.bankY, createRng(7)); // fixed seed: stable tufts, no per-frame flicker

    const heroImg = spriteAt('frog-idle', HERO_SCALE);
    if (heroImg) {
      const breath = frogIdleBreath(this.elapsed);
      drawSpriteImage(r.ctx, heroImg, CANVAS_WIDTH / 2, L.heroCy, { sx: breath, sy: breath });
      if (this.heroBlink.blinking) {
        r.ctx.save();
        r.ctx.translate(CANVAS_WIDTH / 2, L.heroCy);
        r.ctx.scale(HERO_SCALE * breath, HERO_SCALE * breath);
        r.ctx.fillStyle = '#58D65E';
        r.ctx.beginPath();
        r.ctx.ellipse(-8.5, -15.5, 5.2, 3.9, 0, 0, Math.PI * 2);
        r.ctx.ellipse(8.5, -15.5, 5.2, 3.9, 0, 0, Math.PI * 2);
        r.ctx.fill();
        r.ctx.restore();
      }
    }

    this.renderButtons(r);

    r.text(`HI-SCORE ${this.save.hiScore}`, CANVAS_WIDTH / 2, L.hiScoreY, {
      size: 18,
      weight: 600,
      align: 'center',
      color: '#FFC83D',
      outline: '#1B2A1D',
    });

    const pulse = 0.6 + 0.4 * Math.abs(Math.sin(this.elapsed * Math.PI * 1.4));
    r.ctx.save();
    r.ctx.globalAlpha = pulse;
    r.text(`${actionHint('confirm')} or tap Start to play`, CANVAS_WIDTH / 2, L.hintY, {
      size: 15,
      weight: 600,
      align: 'center',
      color: '#FFF7E6',
      outline: '#1B2A1D',
    });
    r.ctx.restore();

    if (this.toastText) this.renderToast(r);

    // M8 fix-up spec item 3: top-right corner, not top-left - top-left is where the logo's peeking
    // frog sits (drawLogoFrogPeek above), which the hint used to overlap.
    drawAudioHint(r, !audio.hasStarted(), { corner: 'top-right' });
    transitions.render(r);
  }

  /** Draws just the top sliver of the 1.5x logo frog (eyes and the top of its head), clipped so
   * the rest of its body never shows beside the R - the logo is drawn *after* this call, so the
   * clipped peek reads as the frog standing behind the letter (ART_BIBLE.md section 1). Clipping
   * to a fixed band (rather than relying on the glyph's own alpha to occlude the rest of the
   * sprite) is deliberate: the R's ink doesn't fully cover the frog's width, so pre-M8 occlusion
   * alone let the body jut out to the sides - see docs/specs/M8-report.md "Deviations". */
  private drawLogoFrogPeek(r: Renderer, logoX: number, logoY: number): void {
    const logoFrog = spriteAt('frog-idle', LOGO_FROG_SCALE);
    if (!logoFrog) return;
    const cx = logoX + this.logo.firstGlyphCenterX;
    const glyphTopY = logoY + this.logo.firstGlyphTopY;
    const peekPx = logoFrog.height * 0.3; // ~eyes + top-of-head, per the spec's own wording
    const spriteTopY = glyphTopY - peekPx;
    const cy = spriteTopY + logoFrog.height / 2;

    r.ctx.save();
    r.ctx.beginPath();
    r.ctx.rect(cx - logoFrog.width / 2 - 2, spriteTopY, logoFrog.width + 4, peekPx);
    r.ctx.clip();
    drawSpriteImage(r.ctx, logoFrog, cx, cy);
    r.ctx.restore();
  }

  private renderButtons(r: Renderer): void {
    const unlocked = isEndlessUnlocked(this.save.bestLevel);
    const labels: { id: string; label: string; opts?: Parameters<typeof drawButton>[4] }[] = [
      { id: 'start', label: 'START' },
      {
        id: 'endless',
        label: 'ENDLESS',
        opts: unlocked ? undefined : { prefix: '\u{1F512}', sublabel: 'Reach level 15' },
      },
      { id: 'leaderboard', label: 'LEADERBOARD' },
      { id: 'settings', label: 'SETTINGS' },
      { id: 'howto', label: 'HOW TO PLAY' },
    ];
    const theme = getWorldTheme(1);
    for (const { id, label, opts } of labels) {
      const c = this.focus.get(id);
      if (!c) continue;
      drawButton(
        r,
        c.rect,
        label,
        {
          hover: this.focus.isHovered(id),
          pressed: this.focus.isPressed(id),
          focused: this.focus.isFocused(id),
          disabled: c.disabled,
        },
        { accent: theme.palette.accentA, ...opts },
      );
    }
  }

  private renderToast(r: Renderer): void {
    const t = this.toastT / TOAST_DURATION_S;
    const alpha = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
    const w = 280;
    const h = 40;
    const x = CANVAS_WIDTH / 2 - w / 2;
    const y = this.layout.buttonsY - h - 14;
    r.ctx.save();
    r.ctx.globalAlpha = alpha;
    r.ctx.fillStyle = 'rgba(27, 42, 29, 0.85)';
    r.ctx.beginPath();
    r.ctx.moveTo(x + 12, y);
    r.ctx.arcTo(x + w, y, x + w, y + h, 12);
    r.ctx.arcTo(x + w, y + h, x, y + h, 12);
    r.ctx.arcTo(x, y + h, x, y, 12);
    r.ctx.arcTo(x, y, x + w, y, 12);
    r.ctx.closePath();
    r.ctx.fill();
    r.text(this.toastText ?? '', CANVAS_WIDTH / 2, y + h / 2, {
      size: 14,
      weight: 600,
      align: 'center',
      color: '#FFF7E6',
    });
    r.ctx.restore();
  }

  onAction(a: InputAction): void {
    if (transitions.isActive()) return; // ignore input mid-wipe
    if (this.focus.handleAction(a)) return;
    // Nothing focused: Enter/Space must still start the game (acceptance's own wording - the
    // reviewer's harness presses Enter on the Title to start).
    if (a.type === 'confirm') this.startGame();
  }
}
