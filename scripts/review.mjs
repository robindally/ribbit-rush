// Headless review harness for Ribbit Rush. Launches Chromium, starts a run on a dev server, injects
// scripts/playbot.js, lets the bot play for N seconds while taking screenshots, and prints a JSON
// summary (score, homes, deaths with causes, console errors). Used by Fable to review milestones
// without depending on a visible browser pane (hidden tabs throttle requestAnimationFrame).
//
//   node scripts/review.mjs [--url http://localhost:5173] [--secs 25] [--shots docs/screens/review] [--every 5]
//   Optional: --level N  (uses the dev level-jump hook once M6 adds it)

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const url = arg('url', 'http://localhost:5173');
const secs = Number(arg('secs', '25'));
const shots = arg('shots', 'docs/screens/review');
const every = Number(arg('every', '5'));
const level = arg('level', '');

fs.mkdirSync(shots, { recursive: true });
const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 624, height: 720 }, deviceScaleFactor: 1 });
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(url);
await page.waitForTimeout(1500);
await page.screenshot({ path: path.join(shots, 'title.png') });
await page.keyboard.press('Enter');
await page.waitForFunction(() => window.__rr && window.__rr.world, null, { timeout: 8000 });
await page.waitForTimeout(600);
if (level) {
  await page.evaluate((n) => { if (window.__rr.jumpToLevel) window.__rr.jumpToLevel(Number(n)); }, level);
  await page.waitForTimeout(600);
}
await page.addScriptTag({ path: 'scripts/playbot.js' });
await page.evaluate(() => { window.__rr.world.lives = 99; });
await page.evaluate((ms) => { window.__botPromise = window.runPlaybot(ms); }, secs * 1000);

const start = Date.now();
let n = 0;
while (Date.now() - start < secs * 1000) {
  await page.waitForTimeout(every * 1000);
  n += 1;
  await page.screenshot({ path: path.join(shots, `play-${String(n).padStart(2, '0')}.png`) });
}
const res = await page.evaluate(() => window.__botPromise);
await page.screenshot({ path: path.join(shots, 'final.png') });
const fx = await page.evaluate(() => (window.__rr.fx ? Object.keys(window.__rr.fx) : null));
await browser.close();

res.log = res.log.map((e) => (typeof e === 'string' ? e : `${e.cause}@row${e.row} x=${e.x} after ${e.lastHop ? e.lastHop.dir + ' from row ' + e.lastHop.fromRow : 'no hop'}`));
console.log(JSON.stringify({ ...res, fx, errors, shots }, null, 2));
