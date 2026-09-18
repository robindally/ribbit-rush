/* global window, console, process */
// M10 perf pass (docs/specs/M10-release.md section 1): "Performance pass with Chrome devtools CPU
// throttling at 4x: 60 fps in world 3 with rain and 400 particles." Same requestAnimationFrame-
// wrapping technique scripts/m6-perf.mjs/m9-perf.mjs already use, plus a real CDP
// `Emulation.setCPUThrottlingRate` session (the actual devtools throttle, not a simulated slowdown)
// applied to a dev-server tab so `window.__rr` can force world 3 (Neon City, rain - see
// docs/ART_BIBLE.md section 3) and fill the particle pool to the 400 cap via `fx.stress()`.
//
//   node scripts/m10-perf.mjs [--url http://localhost:5174] [--secs 8] [--rate 4] [--level 7]

import { chromium } from 'playwright';

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const url = arg('url', 'http://localhost:5174');
const secs = Number(arg('secs', '8'));
const rate = Number(arg('rate', '4'));
const level = Number(arg('level', '7')); // world 3's first level (docs/LEVELS.md)

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 624, height: 720 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
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
await page.keyboard.press('Enter'); // Title -> Play
await page.waitForFunction(() => window.__rr && window.__rr.world, null, { timeout: 8000 });
await page.evaluate((n) => window.__rr.jumpToLevel(n), level);
await page.waitForTimeout(300);

const theme = await page.evaluate(() => {
  const w = window.__rr.world;
  return { world: w.level.world, name: w.level.name };
});

// Fill the particle pool to the 400 cap (docs/specs/M4-juice.md acceptance #3's own stress hook).
await page.evaluate(() => window.__rr.fx.stress());

// Real CDP CPU throttle - the actual devtools "4x slowdown" the spec names, not a simulated one.
const cdp = await page.context().newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate });

await page.evaluate(() => {
  window.__frameTimes = [];
});
// `fx.stress()` spawns particles with a fixed 5s life (docs/specs/M4-juice.md's own stress helper)
// - re-topping the pool every 0.5s for the whole sample window keeps it pinned near the 400 cap
// throughout the measurement, instead of it draining to ~0 by the time the window ends.
const stepMs = 500;
let elapsedMs = 0;
const particleSamples = [];
while (elapsedMs < secs * 1000) {
  await page.evaluate(() => window.__rr.fx.stress());
  particleSamples.push(await page.evaluate(() => window.__rr.fx.particles));
  await page.waitForTimeout(stepMs);
  elapsedMs += stepMs;
}

const frameTimes = await page.evaluate(() => window.__frameTimes);
const particleCount = Math.min(...particleSamples);

await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
await browser.close();

const n = frameTimes.length;
const avg = frameTimes.reduce((a, b) => a + b, 0) / n;
const sorted = [...frameTimes].sort((a, b) => a - b);
const p95 = sorted[Math.floor(sorted.length * 0.95)];
const max = sorted[sorted.length - 1];
const fps = 1000 / avg;

console.log(
  JSON.stringify(
    {
      theme,
      throttleRate: rate,
      minParticleCountDuringSample: particleCount,
      frames: n,
      secs,
      avgFrameMs: +avg.toFixed(3),
      p95FrameMs: +p95.toFixed(3),
      maxFrameMs: +max.toFixed(3),
      fps: +fps.toFixed(2),
      meets60fps: fps >= 60,
      errors,
    },
    null,
    2,
  ),
);
