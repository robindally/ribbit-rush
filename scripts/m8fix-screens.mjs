/* global process, console, window, document, MouseEvent */
// Captures the M8 fix-up desktop screenshots: Title and Settings, re-shot after
// docs/specs/M8-report.md's "Fix-up" section - title.ts's button-stack/hero gap and audio-hint
// corner, settings.ts's CONTROLS label colour. Same approach scripts/m8-screens.mjs already used
// (dev-hook-driven navigation via real dispatched pointer events, not window.__rr poking).
//
//   node scripts/m8fix-screens.mjs [--url http://localhost:5174] [--out docs/screens]

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
await page.screenshot({ path: path.join(out, 'm8fix-title.png') });

// --- Settings, reached from the Title's own Settings button ---
const settingsRect = await page.evaluate(() => {
  const c = window.__rr.ui.current.controls.find((c) => c.id === 'settings');
  return c.rect;
});
await clickLogical(settingsRect.x + settingsRect.w / 2, settingsRect.y + settingsRect.h / 2);
await page.waitForTimeout(200);
await page.screenshot({ path: path.join(out, 'm8fix-settings.png') });

await browser.close();
console.log(JSON.stringify({ errors, out }, null, 2));
