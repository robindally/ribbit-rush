/* global window, console, process */
// M6 milestone screenshots: each world's first level, plus a dedicated night-lights and rain
// capture (both world 3, the only night+rain world). Uses the dev hooks
// (window.__rr.jumpToLevel, window.__rr.world) added this milestone.
//
//   node scripts/m6-screens.mjs [--url http://localhost:5174] [--out docs/screens]

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const url = arg('url', 'http://localhost:5174');
const out = arg('out', 'docs/screens');
fs.mkdirSync(out, { recursive: true });

const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 624, height: 720 }, deviceScaleFactor: 1 });
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(url);
await page.waitForTimeout(1000);
await page.keyboard.press('Enter');
await page.waitForFunction(() => window.__rr && window.__rr.world, null, { timeout: 8000 });
await page.waitForTimeout(400);

async function jumpAndSettle(level, settleMs) {
  await page.evaluate((n) => window.__rr.jumpToLevel(n), level);
  // Let the level intro card's own 1.2s timer dismiss it, then a little more for traffic to
  // populate the screen naturally.
  await page.waitForTimeout(1300 + settleMs);
}

const worldFirstLevel = { 1: 1, 2: 4, 3: 7, 4: 10, 5: 13 };
for (const w of [1, 2, 3, 4, 5]) {
  await jumpAndSettle(worldFirstLevel[w], 500);
  await page.screenshot({ path: path.join(out, `m6-world${w}.png`) });
  console.warn(`captured m6-world${w}.png (level ${worldFirstLevel[w]})`);
}

// Night lights + rain: world 3, level 7. Wait a bit longer so several vehicles (with headlight
// cones) and rain streaks are on screen at once.
await jumpAndSettle(7, 1200);
await page.screenshot({ path: path.join(out, 'm6-night-lights.png') });
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(out, 'm6-rain.png') });
console.warn('captured m6-night-lights.png and m6-rain.png (level 7)');

await browser.close();
console.log(JSON.stringify({ ok: true, errors }, null, 2));
