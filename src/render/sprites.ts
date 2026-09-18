// Loads every SVG in assets/sprites via Vite's `?raw` import, wraps each in an Image via a Blob
// URL, and rasterises it once to an offscreen canvas at TILE * dpr. Sprites are addressed by
// file name without extension. See ARCHITECTURE.md section 11.

import { TILE } from '../game/constants';

export interface SpriteAtlas {
  get(name: string): HTMLCanvasElement | undefined;
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

async function rasterize(svgSource: string, dpr: number): Promise<HTMLCanvasElement> {
  const size = Math.max(1, Math.round(TILE * dpr));
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
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.drawImage(img, 0, 0, size, size);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function loadSprites(): Promise<SpriteAtlas> {
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const entries = Object.entries(rawSprites);
  const atlas = new Map<string, HTMLCanvasElement>();

  await Promise.all(
    entries.map(async ([path, source]) => {
      const name = nameFromPath(path);
      atlas.set(name, await rasterize(source, dpr));
    }),
  );

  return {
    get(name: string) {
      return atlas.get(name);
    },
  };
}
