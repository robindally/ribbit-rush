/* global window, console, process */
// M10 memory soak (docs/specs/M10-release.md section 1): "play 10 minutes; heap must be flat (no
// growth from particles, popups, or audio nodes)." Drives real, continuous gameplay for the whole
// window via scripts/playbot.js (the same autonomous bot scripts/review.mjs already uses),
// forcing a real GC via CDP's `HeapProfiler.collectGarbage` before each once-a-minute
// `performance.memory.usedJSHeapSize` sample, so the samples aren't just measuring GC timing luck.
// `world.lives = 99` (same trick scripts/review.mjs uses) keeps the bot playing continuously
// instead of hitting Game Over and going idle, so particles/popups/audio nodes stay under
// sustained churn for the entire 10 minutes rather than only the first life.
//
//   node scripts/m10-memory-soak.mjs [--url http://localhost:5174] [--mins 10] [--every 60]

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const url = arg('url', 'http://localhost:5174');
const mins = Number(arg('mins', '10'));
const everySecs = Number(arg('every', '60'));

const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 624, height: 720 }, deviceScaleFactor: 1 });
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(String(e)));

const cdp = await page.context().newCDPSession(page);
await cdp.send('HeapProfiler.enable');

await page.goto(url);
await page.waitForTimeout(1000);
await page.keyboard.press('Enter'); // Title -> Play
await page.waitForFunction(() => window.__rr && window.__rr.world, null, { timeout: 8000 });
await page.waitForTimeout(600);
await page.evaluate(() => {
  window.__rr.world.lives = 99; // survive indefinitely - see module doc comment above
});

await page.addScriptTag({ path: 'scripts/playbot.js' });
const totalMs = mins * 60 * 1000;
await page.evaluate((ms) => {
  window.__botPromise = window.runPlaybot(ms);
}, totalMs);

async function sample() {
  await cdp.send('HeapProfiler.collectGarbage');
  // CDP's own heap-usage query, not the page-exposed `performance.memory` (recent Chromium rounds
  // that to a coarse ~10MB bucket for anti-fingerprinting reasons, which is too coarse to see a
  // real trend across a 10-minute run) - `Runtime.getHeapUsage` gives the real, precise byte count.
  const { usedSize } = await cdp.send('Runtime.getHeapUsage');
  const heap = usedSize;
  // Defensive: `window.__rr.world`/`fx` are only ever set by PlayScene's own constructor (see
  // src/scenes/play.ts) - if the bot ever lets a real Game Over slip through despite the repeated
  // `lives = 99` reset below (e.g. a death mid-respawn racing the next sample), a later scene
  // (Title, Game Over) doesn't clear or replace `window.__rr`, so `world`/`fx` just go stale rather
  // than disappear - but read defensively anyway so one odd tick can't crash a 10-minute run.
  const state = await page.evaluate(() => {
    const rr = window.__rr || {};
    const w = rr.world;
    if (w && !w.gameOver) w.lives = 99; // keep the bot playing continuously the whole soak
    return {
      fx: rr.fx ? { particles: rr.fx.particles, popups: rr.fx.popups } : null,
      world: w
        ? { score: w.score, level: w.levelNumber, lives: w.lives, gameOver: w.gameOver }
        : null,
    };
  });
  return { heap, fx: state.fx, world: state.world };
}

const samples = [];
const start = Date.now();
samples.push({ tSec: 0, ...(await sample()) });
const totalSecs = mins * 60;
while (Date.now() - start < totalMs) {
  await page.waitForTimeout(Math.min(everySecs * 1000, totalMs - (Date.now() - start)));
  const tSec = Math.round((Date.now() - start) / 1000);
  samples.push({ tSec, ...(await sample()) });
  console.error(`[m10-memory-soak] t=${tSec}s ${JSON.stringify(samples[samples.length - 1])}`);
}

await page.evaluate(() => window.__botPromise).catch(() => null);

await browser.close();

const heaps = samples.map((s) => s.heap).filter((h) => h !== null);
const firstStable = heaps.length > 1 ? heaps[1] : heaps[0]; // skip sample 0 (still warming up)
const last = heaps[heaps.length - 1];
const deltaBytes = last - firstStable;
const deltaPct = firstStable ? (deltaBytes / firstStable) * 100 : 0;

const out = {
  url,
  mins,
  everySecs,
  totalSecs,
  samples,
  heapBytes: heaps,
  firstStableHeapBytes: firstStable,
  lastHeapBytes: last,
  deltaBytes,
  deltaPct: +deltaPct.toFixed(2),
  flat: Math.abs(deltaPct) < 15, // generous - a real leak over 10 real minutes of play is not subtle
  errors,
};

fs.mkdirSync('docs/screens', { recursive: true });
fs.writeFileSync(path.join('docs', 'm10-memory-soak.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
