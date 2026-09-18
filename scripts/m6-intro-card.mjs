/* global window, console, process */
// Captures the level intro card (docs/specs/M6-worlds.md section 7) right after a level starts,
// and separately exercises the dev "L then digits" level-jump keyboard shortcut end to end.
//
//   node scripts/m6-intro-card.mjs [--url http://localhost:5174]

import { chromium } from 'playwright';
import path from 'node:path';

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const url = arg('url', 'http://localhost:5174');
const out = arg('out', 'docs/screens');

const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 624, height: 720 }, deviceScaleFactor: 1 });
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(url);
await page.waitForTimeout(1000);
await page.keyboard.press('Enter');
await page.waitForFunction(() => window.__rr && window.__rr.world, null, { timeout: 8000 });
await page.waitForTimeout(150); // catch the level-1 intro card before its 1.2s auto-dismiss
await page.screenshot({ path: path.join(out, 'm6-level-intro.png') });

// Exercise the "L then digits" dev shortcut end to end (not just window.__rr.jumpToLevel).
await page.waitForTimeout(1300);
await page.keyboard.press('KeyL');
await page.keyboard.press('Digit1');
await page.keyboard.press('Digit3'); // "13" commits immediately at 2 digits -> world 5, level 13
await page.waitForTimeout(300);
const levelAfterKeyJump = await page.evaluate(() => window.__rr.world.levelNumber);
const worldAfterKeyJump = await page.evaluate(() => window.__rr.world.level.world);

await browser.close();
console.log(JSON.stringify({ levelAfterKeyJump, worldAfterKeyJump, errors }, null, 2));
