// Loads every SVG in assets/sprites via Vite's `?raw` import, wraps each in an Image via a Blob
// URL, and rasterises it once to an offscreen canvas at TILE * dpr per tile. Sprites are addressed
// by file name without extension. See ARCHITECTURE.md section 11 and docs/specs/M3-art-pass.md
// section 1.
//
// A sprite's *logical* size is derived from its SVG viewBox (in tile units of 48): a 1x1 sprite
// has viewBox="0 0 48 48", a 2-tile-wide sprite has viewBox="0 0 96 48". The rasterised canvas is
// stored at `TILE * dpr` px per tile for crispness on high-DPI screens, but callers (the renderer)
// must draw at the sprite's *logical* width/height, not the backing canvas's pixel size - so each
// entry carries both.

import { TILE } from '../game/constants';

export interface SpriteImage {
  canvas: HTMLCanvasElement;
  /** Logical px, i.e. already in the same coordinate space as the renderer's ctx. */
  width: number;
  height: number;
}

export interface SpriteAtlas {
  get(name: string): SpriteImage | undefined;
}

// Eagerly import every SVG's raw source at build time.
const rawSprites = import.meta.glob('../../assets/sprites/*.svg', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

function nameFromPath(path: string): string {
  const file = path.split('/').pop() ?? path;
  return file.replace(/\.svg$/, '');
}

/** Reads `viewBox="0 0 W H"` and returns the sprite's size in tile units (48px = 1 tile). */
function viewBoxTiles(svgSource: string): { tilesW: number; tilesH: number } {
  const match = svgSource.match(/viewBox="[^"]*?0\s+0\s+([\d.]+)\s+([\d.]+)"/);
  if (!match) return { tilesW: 1, tilesH: 1 };
  const w = parseFloat(match[1]);
  const h = parseFloat(match[2]);
  return { tilesW: w / TILE, tilesH: h / TILE };
}

async function rasterize(svgSource: string, dpr: number, scale = 1): Promise<SpriteImage> {
  const { tilesW, tilesH } = viewBoxTiles(svgSource);
  const logicalW = tilesW * TILE * scale;
  const logicalH = tilesH * TILE * scale;
  const pxW = Math.max(1, Math.round(logicalW * dpr));
  const pxH = Math.max(1, Math.round(logicalH * dpr));

  const blob = new Blob([svgSource], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Failed to rasterize sprite'));
      image.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = pxW;
    canvas.height = pxH;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, pxW, pxH);
    }
    return { canvas, width: logicalW, height: logicalH };
  } finally {
    URL.revokeObjectURL(url);
  }
}

let loaded: SpriteAtlas | null = null;

export async function loadSprites(): Promise<SpriteAtlas> {
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const entries = Object.entries(rawSprites);
  const atlas = new Map<string, SpriteImage>();

  await Promise.all(
    entries.map(async ([path, source]) => {
      const name = nameFromPath(path);
      atlas.set(name, await rasterize(source, dpr));
    }),
  );

  const spriteAtlas: SpriteAtlas = {
    get(name: string) {
      return atlas.get(name);
    },
  };
  loaded = spriteAtlas;
  return spriteAtlas;
}

/**
 * Synchronous access to the atlas `loadSprites` already resolved. Lets render-layer code that
 * doesn't hold a `Renderer` reference (e.g. the static-layer builder in draw/background.ts, which
 * draws sprites onto its own offscreen canvas, not through `Renderer.sprite`) reach sprites
 * without threading the atlas through every scene constructor. Throws if called before boot has
 * awaited `loadSprites()` once - main.ts does this before creating any scene.
 */
export function getSpriteAtlas(): SpriteAtlas {
  if (!loaded) throw new Error('Sprite atlas not loaded yet - call loadSprites() first');
  return loaded;
}

// --- Rasterised-at-scale cache (ART_BIBLE.md section 1, "Hero frog") ---
//
// Any sprite drawn larger than 1x (the title hero frog, the frog peeking behind the logo) must be
// rasterised from the SVG at that size, never upscaled from the 1x atlas entry above - upscaling a
// TILE*dpr-backed canvas by a further 1.5x/3x ctx.scale blurs badly. `spriteAt` rasterises once per
// (name, scale) pair at `TILE * scale * dpr` px per tile and caches it.

let byName: Map<string, string> | null = null;

function rawSource(name: string): string | undefined {
  if (!byName) {
    byName = new Map(Object.entries(rawSprites).map(([path, source]) => [nameFromPath(path), source]));
  }
  return byName.get(name);
}

const scaledCache = new Map<string, SpriteImage>();
const scaledPending = new Map<string, Promise<SpriteImage | undefined>>();

/**
 * Kicks off (and caches) rasterising `name` at `TILE * scale * dpr` px per tile. Call this during
 * scene/boot setup and await it so the first `spriteAt` call of a frame already has the image
 * ready - `spriteAt` itself is synchronous and returns `undefined` on a cache miss rather than
 * blocking a render.
 */
export function preloadSpriteAt(name: string, scale: number): Promise<SpriteImage | undefined> {
  const key = `${name}@${scale}`;
  const cached = scaledCache.get(key);
  if (cached) return Promise.resolve(cached);
  let pending = scaledPending.get(key);
  if (!pending) {
    const source = rawSource(name);
    if (!source) return Promise.resolve(undefined);
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    pending = rasterize(source, dpr, scale).then((img) => {
      scaledCache.set(key, img);
      return img;
    });
    scaledPending.set(key, pending);
  }
  return pending;
}

/**
 * Synchronous read of the `preloadSpriteAt(name, scale)` cache. Returns `undefined` (and kicks off
 * rasterisation for next time) on a cache miss, so a caller that can't await should either accept
 * skipping a draw for a frame or, better, `preloadSpriteAt` the sizes it needs up front.
 */
export function spriteAt(name: string, scale: number): SpriteImage | undefined {
  const key = `${name}@${scale}`;
  const cached = scaledCache.get(key);
  if (cached) return cached;
  void preloadSpriteAt(name, scale);
  return undefined;
}
