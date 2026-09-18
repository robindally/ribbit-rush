/* global window, performance, setTimeout, AudioNode, AudioDestinationNode, console, process */
// Headless audio probe: inserts an AnalyserNode before the destination and reports peak and RMS
// for the music of each world and each SFX.
//
//   node scripts/audio-probe.mjs [--url http://localhost:5174]
//
// `window` above covers the `page.evaluate(...)` callbacks, which run in the browser, not Node.
import { chromium } from 'playwright';

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const url = arg('url', 'http://localhost:5173');

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 624, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.addInitScript(() => {
  const orig = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (dest, ...rest) {
    if (dest instanceof AudioDestinationNode && !window.__analyser) {
      const ctx = dest.context;
      const an = ctx.createAnalyser(); an.fftSize = 2048;
      window.__analyser = an; window.__ctx = ctx;
      orig.call(an, dest);
      return orig.call(this, an, ...rest);
    }
    if (dest instanceof AudioDestinationNode && window.__analyser) return orig.call(this, window.__analyser, ...rest);
    return orig.call(this, dest, ...rest);
  };
});
await page.goto(url);
await page.waitForTimeout(1200);
await page.keyboard.press('Enter');
await page.waitForFunction(() => window.__rr && window.__rr.world, null, { timeout: 8000 });
await page.waitForTimeout(800);
const result = await page.evaluate(async () => {
  const an = window.__analyser; if (!an) return { error: 'no analyser (nothing connected to destination)' };
  const buf = new Float32Array(an.fftSize);
  const sfx = ['hop', 'landGround', 'splash', 'squish', 'home', 'nearMiss', 'levelClear', 'bonk', 'tick', 'horn'];
  const sample = async (ms, label) => { let peak = 0, sq = 0, n = 0; const end = performance.now() + ms; while (performance.now() < end) { an.getFloatTimeDomainData(buf); for (const v of buf) { const a = Math.abs(v); if (a > peak) peak = a; sq += v * v; n++; } await new Promise(r => setTimeout(r, 40)); } return { label, peak: +peak.toFixed(3), rms: +Math.sqrt(sq / n).toFixed(4) }; };
  const out = [];
  for (const w of [1, 2, 3, 4, 5]) {
    window.__rr.audio.music.play(w);
    await new Promise((r) => setTimeout(r, 900)); // let the crossfade settle before sampling
    out.push(await sample(2500, 'music world ' + w));
  }
  for (const s of sfx) { window.__rr.audio.play(s); out.push(await sample(350, 'sfx ' + s)); }
  return { ctxState: window.__ctx.state, sampleRate: window.__ctx.sampleRate, started: window.__rr.audio.started, stats: window.__rr.audio.stats, out };
});
await browser.close();
console.log(JSON.stringify({ result, errors }, null, 2));
