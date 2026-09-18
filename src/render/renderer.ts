// Canvas setup, DPR handling, letterboxing, and small draw helpers. See ARCHITECTURE.md
// section 11.

import { CANVAS_HEIGHT, CANVAS_WIDTH, TILE } from '../game/constants';
import type { SpriteAtlas } from './sprites';

export interface SpriteOpts {
  rot?: number;
  sx?: number;
  sy?: number;
  alpha?: number;
  flipX?: boolean;
  anchor?: 'center' | 'topleft';
}

export interface TextOpts {
  size?: number;
  weight?: number;
  align?: CanvasTextAlign;
  color?: string;
  outline?: string;
}

export interface Renderer {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number; // logical px
  tile: number;
  sprite(name: string, x: number, y: number, opts?: SpriteOpts): void;
  shadow(x: number, y: number, w: number, h: number, scale?: number): void;
  text(s: string, x: number, y: number, opts?: TextOpts): void;
}

export function createRenderer(canvas: HTMLCanvasElement, atlas: SpriteAtlas): Renderer {
  const maybeCtx = canvas.getContext('2d');
  if (!maybeCtx) throw new Error('2D canvas context unavailable');
  // Give closures below a definitely-non-null, explicitly typed binding to capture, since TS
  // control-flow narrowing of `maybeCtx` doesn't extend into nested function bodies.
  const ctx: CanvasRenderingContext2D = maybeCtx;

  function resize(): void {
    const parent = canvas.parentElement;
    const viewportW = parent?.clientWidth ?? window.innerWidth;
    const viewportH = parent?.clientHeight ?? window.innerHeight;
    const dpr = Math.max(1, window.devicePixelRatio || 1);

    const scale = Math.max(0.0001, Math.min(viewportW / CANVAS_WIDTH, viewportH / CANVAS_HEIGHT));

    canvas.style.width = `${Math.floor(CANVAS_WIDTH * scale)}px`;
    canvas.style.height = `${Math.floor(CANVAS_HEIGHT * scale)}px`;
    canvas.width = Math.floor(CANVAS_WIDTH * scale * dpr);
    canvas.height = Math.floor(CANVAS_HEIGHT * scale * dpr);

    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
  }

  resize();
  window.addEventListener('resize', resize);

  function sprite(name: string, x: number, y: number, opts: SpriteOpts = {}): void {
    const img = atlas.get(name);
    if (!img) return;
    const anchor = opts.anchor ?? 'center';
    const sx = opts.sx ?? 1;
    const sy = opts.sy ?? 1;
    // img.width/height are logical px (already scaled from the sprite's SVG viewBox), not the
    // backing canvas's device-pixel size - see render/sprites.ts.
    const w = img.width * sx;
    const h = img.height * sy;

    ctx.save();
    ctx.globalAlpha = opts.alpha ?? 1;
    ctx.translate(x, y);
    if (opts.rot) ctx.rotate(opts.rot);
    if (opts.flipX) ctx.scale(-1, 1);
    const drawX = anchor === 'center' ? -w / 2 : 0;
    const drawY = anchor === 'center' ? -h / 2 : 0;
    ctx.drawImage(img.canvas, drawX, drawY, w, h);
    ctx.restore();
  }

  function shadow(x: number, y: number, w: number, h: number, scale = 1): void {
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.beginPath();
    ctx.ellipse(x, y, (w * scale) / 2, (h * scale) / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function text(s: string, x: number, y: number, opts: TextOpts = {}): void {
    const size = opts.size ?? 20;
    const weight = opts.weight ?? 600;
    ctx.save();
    ctx.font = `${weight} ${size}px Fredoka, sans-serif`;
    ctx.textAlign = opts.align ?? 'left';
    ctx.textBaseline = 'middle';
    if (opts.outline) {
      ctx.lineWidth = Math.max(2, size / 8);
      ctx.strokeStyle = opts.outline;
      ctx.strokeText(s, x, y);
    }
    ctx.fillStyle = opts.color ?? '#ffffff';
    ctx.fillText(s, x, y);
    ctx.restore();
  }

  return {
    ctx,
    get width() {
      return CANVAS_WIDTH;
    },
    get height() {
      return CANVAS_HEIGHT;
    },
    tile: TILE,
    sprite,
    shadow,
    text,
  };
}
