/* global window, console, process */
// M6 frame-time check: world 3 (Neon City) with rain + night lighting running, the milestone's
// heaviest render path (rain streaks/ripples/puddles, headlight cones, glowing lily pads,
// streetlamp pools, plus the usual movers/particles). Wraps requestAnimationFrame from outside the
// page (no dependency on any internal class name) and reports the real callback cadence over a few
// seconds of live play.
//
//   node scripts/m6-perf.mjs [--url http://localhost:5174] [--secs 5]

import { chromium } from 'playwright';

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const url = arg('url', 'http://localhost:5174');
const secs = Number(arg('secs', '5'));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 624, height: 720 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

await page.addInitScript(() => {
  window.__frameTimes = [];
  const orig = window.requestAnimationFrame.bind(window);
  let last = null;
  window.requestAnimationFrame = (cb) =>
    orig((t) => {
      if (last !== null) window.__frameTimes.push(t - last);
      last = t;
      cb(t);
    });
});

await page.goto(url);
await page.waitForTimeout(1000);
await page.keyboard.press('Enter');
await page.waitForFunction(() => window.__rr && window.__rr.world, null, { timeout: 8000 });
await page.waitForTimeout(400);
await page.evaluate(() => window.__rr.jumpToLevel(7)); // world 3, night + rain
await page.waitForTimeout(1800); // past the level-intro card, traffic/rain fully populated

await page.evaluate(() => {
  window.__frameTimes = [];
});
await page.waitForTimeout(secs * 1000);

const frameTimes = await page.evaluate(() => window.__frameTimes);
await browser.close();

const n = frameTimes.length;
const avg = frameTimes.reduce((a, b) => a + b, 0) / n;
const sorted = [...frameTimes].sort((a, b) => a - b);
const p95 = sorted[Math.floor(sorted.length * 0.95)];
const max = sorted[sorted.length - 1];
const fps = 1000 / avg;

console.log(
  JSON.stringify(
    { frames: n, secs, avgFrameMs: +avg.toFixed(3), p95FrameMs: +p95.toFixed(3), maxFrameMs: +max.toFixed(3), fps: +fps.toFixed(2), errors },
    null,
    2,
  ),
);
