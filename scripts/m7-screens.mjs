/* global window, console, process */
// M7 milestone screenshots: each power-up's effect, the lady frog riding the frog's back, and the
// leaderboard screen. Uses the M7 dev hooks (window.__rr.powerups.*) added this milestone plus the
// M6 window.__rr.jumpToLevel.
//
//   node scripts/m7-screens.mjs [--url http://localhost:5174] [--out docs/screens]

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

await page.goto(url);
await page.waitForTimeout(1000);

// --- Leaderboard, from the Title screen (M7 spec section 4: "a key") ---
await page.keyboard.press('l');
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(out, 'm7-leaderboard.png') });
console.warn('captured m7-leaderboard.png');
await page.keyboard.press('Enter'); // dismiss the leaderboard back to Title
await page.waitForTimeout(300);

// --- Start the game, jump to level 3 (power-ups unlock at level 2, lady frog at level 3) ---
//
// Two things must each fully settle before a dev-hook-forced power-up reads cleanly in a
// screenshot: the Title -> Play iris transition (0.35s closing + 0.35s opening - and critically,
// LevelIntroScene's update()/render() don't drive fx/transitions.ts at all, so if the level-1
// intro card claims the scene stack mid-transition, the iris's remaining "opening" animation
// freezes and only resumes - visibly, on top of real gameplay - once the card itself pops back to
// PlayScene) and the level-1 intro card's own 1.2s timer. Waiting generously for *both* here,
// before ever touching window.__rr.jumpToLevel, means the level-3 jump below only ever has its
// own fresh card to wait out, with no leftover transition to bleed through afterward.
await page.keyboard.press('Enter');
await page.waitForFunction(() => window.__rr && window.__rr.world && window.__rr.powerups, null, {
  timeout: 8000,
});
await page.waitForTimeout(2200);
await page.evaluate(() => window.__rr.jumpToLevel(3));
await page.waitForTimeout(1700); // let the level-3 intro card's own 1.2s timer dismiss, plus settle

async function shot(name, force, reset) {
  await page.evaluate(force);
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(out, name) });
  console.warn(`captured ${name}`);
  if (reset) await page.evaluate(reset);
}

await shot(
  'm7-shield.png',
  () => window.__rr.powerups.activate('shield'),
  () => {
    window.__rr.world.shieldActive = false;
  },
);

await shot(
  'm7-freeze.png',
  () => window.__rr.powerups.activate('freeze'),
  () => {
    window.__rr.world.freezeElapsed = null;
  },
);

await shot(
  'm7-megahop.png',
  () => window.__rr.powerups.activate('megahop'),
  () => {
    window.__rr.world.megaHopActive = false;
  },
);

await shot('m7-ladyfrog.png', () => window.__rr.powerups.carryLadyFrog(), null);

await browser.close();
console.log(JSON.stringify({ ok: true, errors }, null, 2));
