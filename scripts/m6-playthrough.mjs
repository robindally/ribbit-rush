/* global window, console, process */
// M6 acceptance #3: "All 15 levels are completable (use the dev jump; note any that feel unfair
// in the report with a suggested tweak, but do not change the tables without sign-off)." Runs the
// existing playbot (scripts/playbot.js) on each level in turn and reports survival stats plus any
// console errors, so a human doesn't have to babysit all 15 by hand.
//
//   node scripts/m6-playthrough.mjs [--url http://localhost:5174] [--secs 12]

import { chromium } from 'playwright';

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const url = arg('url', 'http://localhost:5174');
const secs = Number(arg('secs', '12'));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 624, height: 720 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(url);
await page.waitForTimeout(1000);
await page.keyboard.press('Enter');
await page.waitForFunction(() => window.__rr && window.__rr.world, null, { timeout: 8000 });
await page.waitForTimeout(400);
await page.addScriptTag({ path: 'scripts/playbot.js' });

const results = [];
for (let n = 1; n <= 15; n++) {
  await page.evaluate((lvl) => {
    window.__rr.jumpToLevel(lvl);
    window.__rr.world.lives = 99;
    window.__rr.world.score = 0;
  }, n);
  await page.waitForTimeout(1300); // past the intro card
  const res = await page.evaluate((ms) => window.runPlaybot(ms), secs * 1000);
  const deaths = res.log.filter((e) => typeof e === 'object' && e.cause);
  const homesFilled = res.homes.filter((h) => h === 'frog').length;
  results.push({
    level: n,
    reachedLevel: res.level, // > n means it cleared and moved on
    score: res.score,
    homesFilled,
    deaths: deaths.length,
    causes: [...new Set(deaths.map((d) => d.cause))],
  });
}

await browser.close();
console.log(JSON.stringify({ results, errors }, null, 2));
