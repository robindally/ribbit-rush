/* global process, console, window, document */
// Captures the M8 fix-up phone screenshot: the "iPhone 12" Playwright device descriptor (390x664
// viewport - see docs/specs/M8-report.md "Deviations" #6 on why that's not literally 375x812), in
// play with the below-canvas d-pad/pause overlay visible (docs/specs/M8-report.md "Fix-up" section
// item 1 - render/touchControls.ts), after at least one real touch hop through that overlay.
//
// Unlike the pre-fix-up scripts/m8-phone.mjs, the d-pad here is a real DOM overlay below the
// canvas (index.html's #app now top-aligns the canvas instead of centring it, so free space
// collects entirely below it - well over the 150px threshold at this viewport), not canvas-drawn
// buttons at fixed logical coordinates - so this taps the actual button elements' own bounding
// boxes via Playwright's touchscreen, not a hand-computed logical-coordinate rect table.
//
//   node scripts/m8fix-phone.mjs [--url http://localhost:5174] [--secs 12] [--out docs/screens]

import { chromium, devices } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const url = arg('url', 'http://localhost:5174');
const secs = Number(arg('secs', '12'));
const out = arg('out', 'docs/screens');
fs.mkdirSync(out, { recursive: true });

const errors = [];
const browser = await chromium.launch();
const context = await browser.newContext({ ...devices['iPhone 12'] });
const page = await context.newPage();
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(String(e)));

async function logicalToCss(lx, ly) {
  return page.evaluate(
    ([x, y]) => {
      const canvas = document.getElementById('game');
      const rect = canvas.getBoundingClientRect();
      return { x: rect.left + (x / 624) * rect.width, y: rect.top + (y / 720) * rect.height };
    },
    [lx, ly],
  );
}

async function tapLogical(lx, ly) {
  const { x, y } = await logicalToCss(lx, ly);
  await page.touchscreen.tap(x, y);
}

/** Taps a below-canvas DOM control (`.rr-tbtn[aria-label="..."]`) by its own real bounding box -
 * these are genuine DOM buttons outside the canvas (render/touchControls.ts), not logical-space
 * canvas rects, so there's no coordinate conversion to do. */
async function tapControl(ariaLabel) {
  const box = await page.locator(`.rr-tbtn[aria-label="${ariaLabel}"]`).boundingBox();
  if (!box) throw new Error(`below-canvas control not found or not visible: ${ariaLabel}`);
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
}

await page.goto(url);
await page.waitForFunction(() => window.__rr && window.__rr.ui && window.__rr.ui.current, null, {
  timeout: 8000,
});
await page.waitForTimeout(300);

// Tap Start (a real touch tap on the actual button, not window.__rr poking).
const startRect = await page.evaluate(
  () => window.__rr.ui.current.controls.find((c) => c.id === 'start').rect,
);
await tapLogical(startRect.x + startRect.w / 2, startRect.y + startRect.h / 2);
await page.waitForFunction(() => window.__rr && window.__rr.world, null, { timeout: 8000 });
await page.waitForTimeout(400);
await page.evaluate(() => {
  window.__rr.world.lives = 99;
});

// Tap the centre of the screen to dismiss the level-1 intro card.
await tapLogical(312, 360);
await page.waitForTimeout(200);

// Confirm the below-canvas overlay is actually up before relying on it (fails loudly rather than
// silently falling back to a screenshot with nothing interesting in it).
const overlayUp = await page
  .locator('.rr-touch-wrap')
  .isVisible()
  .catch(() => false);
if (!overlayUp) {
  throw new Error('below-canvas touch overlay did not mount at the iPhone 12 viewport');
}

const beforeHop = await page.evaluate(() => {
  const f = window.__rr.world.frog;
  return { row: f.row, x: f.x };
});

// --- Heuristic touch playthrough (adapted from scripts/m8-phone.mjs/playbot.js), driven by taps
// on the real below-canvas d-pad buttons ---
const HOME_COLS = [0, 3, 6, 9, 12];
const evalBot = () =>
  page.evaluate(
    ({ HOME_COLS }) => {
      const w = window.__rr.world;
      const wrap = (v, p) => ((v % p) + p) % p;
      const maxW = (l) => Math.max(...l.movers.map((m) => m.width));
      const xAt = (l, m, dt) => wrap(m.offset + (m.speed ?? l.speed) * dt, l.period) - maxW(l);
      const inst = (l, m, dt) => {
        const b = xAt(l, m, dt);
        return [b - l.period, b, b + l.period];
      };
      const killer = (m) => !['log', 'turtle', 'croc', 'floe'].includes(m.type);
      const roadSafe = (l, fx, horizon) => {
        for (let t = 0; t <= horizon; t += 0.05)
          for (const m of l.movers)
            if (killer(m))
              for (const x of inst(l, m, t)) if (fx + 0.2 < x + m.width && fx + 0.8 > x) return false;
        return true;
      };
      const platUnder = (l, cx, dt) =>
        l.movers.some((m) => !killer(m) && inst(l, m, dt).some((x) => cx >= x && cx < x + m.width));
      const riverSafe = (l, fx) => platUnder(l, fx + 0.5, 0.12) && platUnder(l, fx + 0.5 + l.speed * 0.5, 0.6);
      const f = w.frog;
      const result = { state: f.state, row: f.row, x: f.x, score: w.score, lives: w.lives };
      if (f.state !== 'idle') return result;
      const l = w.laneAt(f.row);
      if (l && l.kind === 'river' && (f.x < 0.6 || f.x > 11.4)) {
        const dir = f.x < 6 ? 'right' : 'left';
        const nx = f.x + (dir === 'right' ? 1 : -1);
        if (platUnder(l, nx + 0.5, 0.12)) return { ...result, dir };
      }
      const above = w.laneAt(f.row - 1);
      let safe = true;
      if (above) {
        if (above.kind === 'road' || above.kind === 'rail' || above.kind === 'median') safe = roadSafe(above, f.x, 0.6);
        else if (above.kind === 'river') safe = riverSafe(above, f.x);
        else if (above.kind === 'home') {
          const i = HOME_COLS.indexOf(Math.round(f.x));
          safe = i >= 0 && (w.homes[i] === null || w.homes[i] === 'fly');
        }
      }
      if (safe) return { ...result, dir: 'up' };
      return result;
    },
    { HOME_COLS },
  );

const t0 = Date.now();
let hopCount = 0;
while (Date.now() - t0 < secs * 1000) {
  const s = await evalBot();
  if (s.dir) {
    await tapControl(`Hop ${s.dir}`);
    hopCount += 1;
  }
  await page.waitForTimeout(90);
}

const afterHop = await page.evaluate(() => {
  const f = window.__rr.world.frog;
  return { row: f.row, x: f.x, score: window.__rr.world.score, lives: window.__rr.world.lives };
});

await page.screenshot({ path: path.join(out, 'm8fix-phone.png') });

await browser.close();
console.log(
  JSON.stringify(
    {
      viewport: devices['iPhone 12'].viewport,
      overlayUp,
      hopCount,
      beforeHop,
      afterHop,
      errors,
    },
    null,
    2,
  ),
);
