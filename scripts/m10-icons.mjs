/* global document, Blob, URL, Image, console */
// M10 release: renders public/icon-512.png and public/icon-192.png from assets/sprites/frog-idle.svg
// on the world 1 grass colour (docs/ART_BIBLE.md section 3: Sunny Suburb grassA #74D06B) with
// rounded corners (section 2's own "corner radius of 25% of the shorter side" rule for boxes), via
// Playwright - docs/specs/M10-release.md section 2: "a 512px PNG of the frog on the world 1
// palette generated from the sprite... plus icon-192.png."
//
//   node scripts/m10-icons.mjs

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const frogSvg = fs.readFileSync(path.join(root, 'assets/sprites/frog-idle.svg'), 'utf8');
const GRASS_A = '#74D06B'; // ART_BIBLE.md section 3, world 1 "Sunny Suburb" grassA

const outDir = path.join(root, 'public');
fs.mkdirSync(outDir, { recursive: true });

const html = `<!doctype html><html><head><style>
  html,body{margin:0;padding:0;background:transparent;}
  canvas{display:block;}
</style></head><body><canvas id="c"></canvas></body></html>`;

async function renderIcon(size, outFile) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(html);
  await page.evaluate(
    async ({ size, GRASS_A, frogSvg }) => {
      const canvas = document.getElementById('c');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');

      // Rounded-square background, ART_BIBLE.md section 2's "corner radius of 25% of the shorter
      // side" (a square icon's shorter side is its own full size).
      const r = size * 0.25;
      ctx.beginPath();
      ctx.moveTo(r, 0);
      ctx.arcTo(size, 0, size, size, r);
      ctx.arcTo(size, size, 0, size, r);
      ctx.arcTo(0, size, 0, 0, r);
      ctx.arcTo(0, 0, size, 0, r);
      ctx.closePath();
      ctx.fillStyle = GRASS_A;
      ctx.fill();
      ctx.clip(); // keep the frog itself from drawing outside the rounded corners too

      // Rasterise the real frog-idle.svg (not a re-drawn approximation) via a Blob URL, scaled to
      // fill most of the icon with a little breathing room.
      const blob = new Blob([frogSvg], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const img = await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = url;
      });
      const pad = size * 0.09;
      const drawSize = size - pad * 2;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, pad, pad, drawSize, drawSize);
      URL.revokeObjectURL(url);
    },
    { size, GRASS_A, frogSvg },
  );

  await page.locator('#c').screenshot({ path: outFile, omitBackground: true });
  await browser.close();
}

await renderIcon(512, path.join(outDir, 'icon-512.png'));
await renderIcon(192, path.join(outDir, 'icon-192.png'));

console.log(JSON.stringify({ wrote: ['public/icon-512.png', 'public/icon-192.png'] }, null, 2));
