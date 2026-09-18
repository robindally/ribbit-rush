/* global process, console, window, document, MouseEvent, localStorage */
// Captures the M9 screenshots: a live Endless crossing (with the difficulty badge), the Title's
// skin picker with several skins unlocked, and the Leaderboard's Endless tab. State is forced
// through the dev hook (window.__rr) rather than playing a full campaign run, same precedent
// scripts/m7-screens.mjs/m8-screens.mjs already set.
//
//   node scripts/m9-screens.mjs [--url http://localhost:5174] [--out docs/screens]

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

// Seed a save with several (not all) skins unlocked, a qualifying Endless leaderboard entry, and
// Endless itself unlocked, then reload so the Title's own FocusManager registers against it fresh
// (docs/specs/M9-endless-skins.md section 2: "several unlocked" - a partial, not a swept board, is
// the more representative screenshot).
await page.evaluate(() => {
  const raw = localStorage.getItem('ribbit-rush.v1');
  const save = raw ? JSON.parse(raw) : {};
  save.bestLevel = 10; // clears worlds 1-3: unlocks Tree Frog, Poison Dart, Ninja
  save.hiScore = Math.max(save.hiScore || 0, 2470);
  save.lifetimeHomesFilled = 0; // Toad stays locked
  save.bestNearMissesInRun = 0; // Ghost stays locked
  save.selectedSkin = 'classic';
  save.endlessLeaderboard = [
    { name: 'FAB', crossings: 42, score: 18650, date: '2026-09-15' },
    { name: 'RBN', crossings: 31, score: 12300, date: '2026-09-16' },
    { name: 'AAA', crossings: 12, score: 4100, date: '2026-09-17' },
  ];
  localStorage.setItem('ribbit-rush.v1', JSON.stringify(save));
});
await page.reload();
await page.waitForTimeout(1200);
await page.screenshot({ path: path.join(out, 'm9-skins.png') });

// --- Endless: a crossing in progress at d ~ 3 with the difficulty badge visible ---
await page.evaluate(() => window.__rr.endless.start(3));
await page.waitForFunction(() => window.__rr?.world?.mode === 'endless', null, { timeout: 8000 });
await page.waitForTimeout(300);
// A couple of real hops so the frog isn't sitting on the start bank.
await page.keyboard.press('ArrowUp');
await page.waitForTimeout(200);
await page.keyboard.press('ArrowUp');
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(out, 'm9-endless.png') });

// --- Leaderboard: the Endless tab ---
// Quit to Title the real way (Pause -> Quit to title), same navigation path a player uses.
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
const quitRect = await page.evaluate(() => {
  const c = window.__rr.ui.current.controls.find((c) => c.id === 'quit');
  return c ? c.rect : null;
});
if (quitRect) {
  await clickLogical(quitRect.x + quitRect.w / 2, quitRect.y + quitRect.h / 2);
} else {
  // Fallback: PauseScene's own control id (checked against scenes/pause.ts if 'quit' isn't it).
  const rects = await page.evaluate(() => window.__rr.ui.current.controls.map((c) => c.id));
  errors.push(`pause controls: ${JSON.stringify(rects)}`);
}
await page.waitForTimeout(600);

const leaderboardRect = await page.evaluate(() => {
  const c = window.__rr.ui.current.controls.find((c) => c.id === 'leaderboard');
  return c.rect;
});
await clickLogical(leaderboardRect.x + leaderboardRect.w / 2, leaderboardRect.y + leaderboardRect.h / 2);
await page.waitForTimeout(200);

const endlessTabRect = await page.evaluate(() => {
  const c = window.__rr.ui.current.controls.find((c) => c.id === 'tab-endless');
  return c.rect;
});
await clickLogical(endlessTabRect.x + endlessTabRect.w / 2, endlessTabRect.y + endlessTabRect.h / 2);
await page.waitForTimeout(200);
await page.screenshot({ path: path.join(out, 'm9-endless-leaderboard.png') });

await browser.close();
console.log(JSON.stringify({ errors, out }, null, 2));
