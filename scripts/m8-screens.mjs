/* global process, console, window, document, MouseEvent */
// Captures the M8 desktop screenshots: title, settings, results, and game-over. Settings/Results/
// GameOver are reached by forcing state through the dev hook (window.__rr) rather than playing a
// full run, the same precedent scripts/m7-screens.mjs already set for shield/freeze/megahop.
//
//   node scripts/m8-screens.mjs [--url http://localhost:5174] [--out docs/screens]

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
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(String(e)));

function clickLogical(lx, ly) {
  return page.evaluate(
    ([x, y]) => {
      const canvas = document.getElementById('game');
      const rect = canvas.getBoundingClientRect();
      const clientX = rect.left + (x / 624) * rect.width;
      const clientY = rect.top + (y / 720) * rect.height;
      const opts = { bubbles: true, clientX, clientY, cancelable: true };
      canvas.dispatchEvent(new MouseEvent('mousedown', opts));
      canvas.dispatchEvent(new MouseEvent('mouseup', opts));
    },
    [lx, ly],
  );
}

await page.goto(url);
await page.waitForTimeout(1200);
await page.screenshot({ path: path.join(out, 'm8-title.png') });

// --- Settings, reached from the Title's own Settings button ---
const settingsRect = await page.evaluate(() => {
  const c = window.__rr.ui.current.controls.find((c) => c.id === 'settings');
  return c.rect;
});
await clickLogical(settingsRect.x + settingsRect.w / 2, settingsRect.y + settingsRect.h / 2);
await page.waitForTimeout(200);
await page.screenshot({ path: path.join(out, 'm8-settings.png') });

// Back to the Title, then start a real run so window.__rr.world exists for the Results/GameOver
// forces below.
const backRect = await page.evaluate(() => window.__rr.ui.current.controls.find((c) => c.id === 'back').rect);
await clickLogical(backRect.x + backRect.w / 2, backRect.y + backRect.h / 2);
await page.waitForTimeout(150);

const startRect = await page.evaluate(() => {
  const c = window.__rr.ui.current.controls.find((c) => c.id === 'start');
  return c.rect;
});
await clickLogical(startRect.x + startRect.w / 2, startRect.y + startRect.h / 2);
await page.waitForFunction(() => window.__rr && window.__rr.world, null, { timeout: 8000 });
await page.waitForTimeout(500);
await page.evaluate(() => window.__rr.world.jumpToLevel(3)); // world 1, so no world-change reveal needed
await page.waitForTimeout(200);
await page.keyboard.press('Enter'); // dismiss the level-3 intro card
await page.waitForTimeout(150);

// --- Results (level clear): force the last empty home slot to fill via a real World method ---
await page.evaluate(() => {
  const world = window.__rr.world;
  world.lives = 99;
  world.homes = ['frog', 'frog', null, 'frog', 'frog']; // col 6 (index 2) open
  world.frog.row = 1;
  world.frog.x = 6;
  world.frog.fromRow = 2;
  world.frog.fromX = 6;
  world.frog.toRow = 1;
  world.frog.toX = 6;
  world.frog.hopT = 1;
  world.frog.state = 'idle';
  world.frog.facing = 'up';
  world.timeLeft = 18.6;
  world['resolveHomeLanding']();
});
await page.waitForFunction(
  () => window.__rr.scenes.current().constructor.name === 'ResultsScene',
  null,
  { timeout: 4000 },
);
await page.waitForTimeout(1600); // past the count-up, into the world-change reveal (level 3->4 crosses world 1->2)
await page.screenshot({ path: path.join(out, 'm8-results.png') });

// Skip through Results and the following level intro card so gameplay is live again.
await page.keyboard.press('Enter');
await page.waitForTimeout(80);
await page.keyboard.press('Enter');
await page.waitForTimeout(150);
await page.keyboard.press('Enter'); // dismiss the next level's intro card too, just in case
await page.waitForTimeout(150);

// --- Game Over: force lives to 0 via a real death ---
await page.evaluate(() => {
  const world = window.__rr.world;
  world.lives = 1;
  world['die']('squish');
});
await page.waitForFunction(
  () => window.__rr.scenes.current().constructor.name === 'GameOverScene',
  null,
  { timeout: 4000 },
);
await page.waitForTimeout(200);
await page.screenshot({ path: path.join(out, 'm8-gameover.png') });

await browser.close();
console.log(JSON.stringify({ errors, out }, null, 2));
