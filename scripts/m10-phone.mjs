/* global process, console, window, document */
// M10 phone pass (docs/specs/M10-release.md section 1): "Phone pass on a 375 x 812 viewport and a
// 360 x 640 viewport: HUD readable, touch controls reachable, no scroll or zoom, audio starts on
// first tap." Same real-touch technique docs/specs/M8-report.md's "Fix-up" section established
// (scripts/m8fix-phone.mjs) - taps the actual below-canvas DOM d-pad buttons' own bounding boxes,
// not hand-computed logical coordinates - run twice, once per named viewport.
//
//   node scripts/m10-phone.mjs [--url http://localhost:5174] [--secs 10] [--out docs/screens]

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const url = arg('url', 'http://localhost:5174');
const secs = Number(arg('secs', '10'));
const out = arg('out', 'docs/screens');
fs.mkdirSync(out, { recursive: true });

const VIEWPORTS = [
  { name: '375', width: 375, height: 812 },
  { name: '360', width: 360, height: 640 },
];

async function runOne({ name, width, height }) {
  const errors = [];
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width, height },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
    userAgent:
      'Mozilla/5.0 (Linux; Android 10; Pixel 3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0 Mobile Safari/537.36',
  });
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
  async function tapControl(ariaLabel) {
    const box = await page.locator(`.rr-tbtn[aria-label="${ariaLabel}"]`).boundingBox();
    if (!box) return false;
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    return true;
  }

  await page.goto(url);
  await page.waitForFunction(() => window.__rr && window.__rr.ui && window.__rr.ui.current, null, {
    timeout: 8000,
  });
  await page.waitForTimeout(300);

  // No page scroll or pinch-zoom: the viewport's own scrollable extent must match its visible
  // size (index.html's #app is 100vw/100vh, touch-action:none on the canvas).
  const scrollBefore = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    scrollH: document.documentElement.scrollHeight,
    innerW: window.innerWidth,
    innerH: window.innerHeight,
  }));

  const audioStartedBeforeTap = await page.evaluate(() => window.__rr.audio.started);

  // First tap: the Title's own Start button - also the "audio starts on first tap" gesture
  // (docs/specs/M5-audio.md section 1: the AudioContext is created lazily on the first user
  // gesture).
  const startRect = await page.evaluate(
    () => window.__rr.ui.current.controls.find((c) => c.id === 'start').rect,
  );
  await tapLogical(startRect.x + startRect.w / 2, startRect.y + startRect.h / 2);
  await page.waitForFunction(() => window.__rr && window.__rr.world, null, { timeout: 8000 });
  await page.waitForTimeout(400);

  const audioStartedAfterTap = await page.evaluate(() => window.__rr.audio.started);

  await page.evaluate(() => {
    window.__rr.world.lives = 99;
  });

  // Dismiss the level-1 intro card with a tap.
  await tapLogical(312, 360);
  await page.waitForTimeout(250);

  const overlayUp = await page
    .locator('.rr-touch-wrap')
    .isVisible()
    .catch(() => false);

  // Reachability: every on-screen touch control's bounding box must sit fully within the visible
  // viewport (not clipped by the page edge or behind another element).
  const controlBoxes = {};
  let allControlsReachable = true;
  if (overlayUp) {
    for (const label of ['Hop up', 'Hop down', 'Hop left', 'Hop right', 'Pause']) {
      const box = await page.locator(`.rr-tbtn[aria-label="${label}"]`).boundingBox();
      controlBoxes[label] = box;
      if (!box || box.x < 0 || box.y < 0 || box.x + box.width > width || box.y + box.height > height) {
        allControlsReachable = false;
      }
    }
  }

  // A short heuristic playthrough via the real touch buttons (adapted from scripts/m8fix-phone.mjs)
  // so the screenshot shows a live game, not a static first frame.
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
        const result = { state: f.state };
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

  let hopCount = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < secs * 1000) {
    const s = await evalBot();
    if (s.dir) {
      const ok = overlayUp ? await tapControl(`Hop ${s.dir}`) : false;
      if (ok) hopCount += 1;
    }
    await page.waitForTimeout(90);
  }

  const scrollAfter = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    scrollH: document.documentElement.scrollHeight,
  }));

  const finalScore = await page.evaluate(() => window.__rr.world.score);

  await page.screenshot({ path: path.join(out, `m10-phone-${name}.png`) });
  await browser.close();

  return {
    viewport: { width, height },
    overlayUp,
    allControlsReachable,
    controlBoxes,
    noScroll:
      scrollBefore.scrollW <= width && scrollBefore.scrollH <= height &&
      scrollAfter.scrollW <= width && scrollAfter.scrollH <= height,
    audioStartedBeforeTap,
    audioStartedAfterTap,
    hopCount,
    finalScore,
    errors,
  };
}

const results = {};
for (const vp of VIEWPORTS) {
  results[vp.name] = await runOne(vp);
}
console.log(JSON.stringify(results, null, 2));
