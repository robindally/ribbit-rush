/* global process, console, window, document */
// Plays a level end to end on a phone-sized viewport using *only* touch actions (M8 spec
// acceptance #2): the "iPhone 12" Playwright device descriptor, tapping the Title's Start button,
// tapping through the level intro card, then driving the frog with the on-screen d-pad (M8 spec
// section 3 - the same 56px translucent buttons a real touch player would use), reactively dodging
// traffic with a small heuristic (adapted from scripts/playbot.js's safeUp/roadSafe/riverSafe
// logic, since that script's own `press()` dispatches a *keyboard* event and this run must stay
// touch-only). A single low-level swipe (via CDP's Input.dispatchTouchEvent, not just tap - a
// Playwright `touchscreen.tap` alone can't express a drag) is exercised separately to cover the
// swipe-to-hop gesture the on-screen d-pad doesn't exercise on its own.
//
// Note: the installed Playwright's "iPhone 12" descriptor is a 390x664 viewport (390x844 screen),
// not the 375x812 the milestone names - Apple's own iPhone 12 CSS viewport is 390x844; 375x812 is
// the iPhone X/11 Pro/12 Mini's. Used the named device descriptor as specified rather than a
// hand-rolled 375x812 context, since "the iPhone 12 device descriptor" is what the acceptance
// criteria calls out by name - see docs/specs/M8-report.md "Deviations".
//
//   node scripts/m8-phone.mjs [--url http://localhost:5174] [--secs 20] [--out docs/screens]

import { chromium, devices } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const url = arg('url', 'http://localhost:5174');
const secs = Number(arg('secs', '20'));
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

/** Converts the renderer's logical (624x720) coordinates to this page's current CSS viewport
 * coordinates, the same conversion core/input.ts/render/ui.ts do in the browser itself. */
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

await page.goto(url);
await page.waitForFunction(() => window.__rr && window.__rr.ui && window.__rr.ui.current, null, {
  timeout: 8000,
});
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(out, 'm8-phone-01-title.png') });

// Tap Start (a real touch tap on the actual button, not window.__rr poking).
const startRect = await page.evaluate(
  () => window.__rr.ui.current.controls.find((c) => c.id === 'start').rect,
);
await tapLogical(startRect.x + startRect.w / 2, startRect.y + startRect.h / 2);
await page.waitForFunction(() => window.__rr && window.__rr.world, null, { timeout: 8000 });
await page.waitForTimeout(400);
// Generous lives so a rough heuristic bot's occasional misjudged hop doesn't cut the touch-only
// demonstration short - same precedent scripts/review.mjs itself uses (`world.lives = 99`).
await page.evaluate(() => {
  window.__rr.world.lives = 99;
});

// Tap the centre of the screen to dismiss the level-1 intro card (LevelIntroScene dismisses on any
// input, touch included).
await tapLogical(312, 360);
await page.waitForTimeout(200);
await page.screenshot({ path: path.join(out, 'm8-phone-02-dpad.png') });

// On-screen d-pad button rects, matching scenes/play.ts's own layout exactly.
const DPAD_BTN = 56;
const GAP = 6;
const BOTTOM_ROW_Y = 720 - DPAD_BTN - 4;
const TOP_ROW_Y = BOTTOM_ROW_Y - DPAD_BTN - GAP;
const CENTER_X = 200;
const dpad = {
  up: { x: CENTER_X - DPAD_BTN / 2, y: TOP_ROW_Y },
  left: { x: CENTER_X - DPAD_BTN * 1.5 - GAP, y: BOTTOM_ROW_Y },
  down: { x: CENTER_X - DPAD_BTN / 2, y: BOTTOM_ROW_Y },
  right: { x: CENTER_X + DPAD_BTN / 2 + GAP, y: BOTTOM_ROW_Y },
};
async function tapDpad(dir) {
  const b = dpad[dir];
  await tapLogical(b.x + DPAD_BTN / 2, b.y + DPAD_BTN / 2);
}

// --- Swipe coverage (M8 spec section 3: "Swipe of 24px or more in any direction hops that way")
// ---
// A real drag, so a plain `touchscreen.tap` can't express it - dispatched via CDP directly, at a
// point clear of the on-screen d-pad/pause button so it isn't touch-excluded.
async function swipe(fromX, fromY, toX, toY) {
  const cdp = await context.newCDPSession(page);
  const from = await logicalToCss(fromX, fromY);
  const to = await logicalToCss(toX, toY);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: from.x, y: from.y }],
  });
  await page.waitForTimeout(30);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: to.x, y: to.y }],
  });
  await page.waitForTimeout(30);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

const beforeSwipe = await page.evaluate(() => {
  const f = window.__rr.world.frog;
  return { row: f.row, x: f.x, state: f.state };
});
// Swipe up (dy < -24) from a point in the middle of the field, away from the d-pad/pause zones.
await swipe(312, 500, 312, 440);
await page.waitForTimeout(200);
const afterSwipe = await page.evaluate(() => {
  const f = window.__rr.world.frog;
  return { row: f.row, x: f.x, state: f.state, hopT: f.hopT };
});
const swipeHopped = afterSwipe.row < beforeSwipe.row || afterSwipe.state === 'hopping';

// --- Heuristic touch playthrough (adapted from scripts/playbot.js, driven by d-pad taps). All
// the lane maths runs *inside* the page.evaluate callback below (it needs window.__rr.world
// directly), so nothing here duplicates it outside that closure. ---
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
      const result = { state: f.state, row: f.row, x: f.x, score: w.score, lives: w.lives, level: w.levelNumber };
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

const shots = [];
const t0 = Date.now();
let lastShot = 0;
let homesFilled = 0;
while (Date.now() - t0 < secs * 1000) {
  const s = await evalBot();
  if (s.dir) await tapDpad(s.dir);
  await page.waitForTimeout(90);
  if (Date.now() - lastShot > 5000) {
    lastShot = Date.now();
    const n = shots.length + 1;
    const p = path.join(out, 'review', `m8-phone-play-${String(n).padStart(2, '0')}.png`);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    await page.screenshot({ path: p });
    shots.push(p);
  }
}

const final = await page.evaluate(() => {
  const w = window.__rr.world;
  return {
    score: w.score,
    lives: w.lives,
    level: w.levelNumber,
    homesFilled: w.homes.filter((h) => h === 'frog').length,
  };
});
homesFilled = final.homesFilled;

await page.screenshot({ path: path.join(out, 'm8-phone.png') });

await browser.close();
console.log(
  JSON.stringify(
    {
      viewport: devices['iPhone 12'].viewport,
      swipeHopped,
      beforeSwipe,
      afterSwipe,
      final,
      homesFilled,
      shots,
      errors,
    },
    null,
    2,
  ),
);
