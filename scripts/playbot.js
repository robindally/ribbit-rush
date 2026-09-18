/* global window, performance, KeyboardEvent, setTimeout */
// Ribbit Rush review bot. Paste into the browser console (or run via automation) on a dev build
// while a level is running. Requires the dev hook `window.__rr.world` from src/scenes/play.ts.
// It hops up whenever the next row looks safe, logs deaths with their cause and the movers around
// the frog, and returns a summary after `ms` milliseconds. Used by Fable to review milestones.
//
// Usage in the console:  await runPlaybot(28000)

async function runPlaybot(ms = 28000) {
  const w = window.__rr.world;
  const HOME_COLS = [0, 3, 6, 9, 12];
  const wrap = (v, p) => ((v % p) + p) % p;
  const maxW = (l) => Math.max(...l.movers.map((m) => m.width));
  const xAt = (l, m, dt) => wrap(m.offset + (m.speed ?? l.speed) * dt, l.period) - maxW(l);
  const inst = (l, m, dt) => { const b = xAt(l, m, dt); return [b - l.period, b, b + l.period]; };
  const killer = (m) => !['log', 'turtle', 'croc', 'floe'].includes(m.type);
  const roadSafe = (l, fx, horizon) => {
    for (let t = 0; t <= horizon; t += 0.05)
      for (const m of l.movers) if (killer(m)) for (const x of inst(l, m, t)) if (fx + 0.2 < x + m.width && fx + 0.8 > x) return false;
    return true;
  };
  const platUnder = (l, cx, dt) => l.movers.some((m) => !killer(m) && inst(l, m, dt).some((x) => cx >= x && cx < x + m.width));
  const riverSafe = (l, fx) => platUnder(l, fx + 0.5, 0.12) && platUnder(l, fx + 0.5 + l.speed * 0.5, 0.6);
  const safeUp = () => {
    const f = w.frog; const l = w.laneAt(f.row - 1); if (!l) return false;
    if (l.kind === 'road' || l.kind === 'rail') return roadSafe(l, f.x, 0.6);
    if (l.kind === 'river') return riverSafe(l, f.x);
    if (l.kind === 'home') { const i = HOME_COLS.indexOf(Math.round(f.x)); return i >= 0 && (w.homes[i] === null || w.homes[i] === 'fly'); }
    if (l.kind === 'median') return roadSafe(l, f.x, 0.6);
    return true;
  };
  const press = (c) => window.dispatchEvent(new KeyboardEvent('keydown', { code: c, key: c, bubbles: true }));
  const log = []; let dying = false; let lastHop = null; let homesBefore = w.homes.filter((h) => h === 'frog').length;
  const t0 = performance.now();
  while (performance.now() - t0 < ms) {
    await new Promise((r) => setTimeout(r, 30));
    const f = w.frog;
    if (f.state === 'dying' && !dying) {
      dying = true; const l = w.laneAt(f.row);
      log.push({ cause: f.deathCause, row: f.row, x: +f.x.toFixed(2), hopT: +f.hopT.toFixed(2), lastHop,
        movers: l ? l.movers.map((m) => ({ t: m.type, x: +xAt(l, m, 0).toFixed(2), w: m.width })) : null });
    }
    if (f.state !== 'dying') dying = false;
    const hf = w.homes.filter((h) => h === 'frog').length;
    if (hf !== homesBefore) { log.push(`home filled: ${hf} score=${w.score}`); homesBefore = hf; }
    if (f.state !== 'idle') continue;
    const l = w.laneAt(f.row);
    if (l && l.kind === 'river' && (f.x < 0.6 || f.x > 11.4)) {
      const dir = f.x < 6 ? 'ArrowRight' : 'ArrowLeft'; const nx = f.x + (dir === 'ArrowRight' ? 1 : -1);
      if (platUnder(l, nx + 0.5, 0.12)) { lastHop = { dir, fromRow: f.row, x: +f.x.toFixed(2) }; press(dir); continue; }
    }
    if (safeUp()) { lastHop = { dir: 'up', fromRow: f.row, x: +f.x.toFixed(2) }; press('ArrowUp'); }
  }
  return { score: w.score, lives: w.lives, homes: w.homes, level: w.levelNumber, log };
}
window.runPlaybot = runPlaybot;
