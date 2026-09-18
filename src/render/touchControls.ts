// Below-canvas DOM overlay for the on-screen d-pad + pause button (M8 fix-up spec item 1:
// docs/specs/M8-report.md's "Fix-up" section). When there's at least `FREE_SPACE_THRESHOLD_PX` of
// free vertical space below the play canvas - a tall portrait phone, now that index.html
// top-aligns the canvas instead of centring it (see that file's own comment on `#app`) - the d-pad
// and pause button are drawn there as real DOM buttons instead of overlaid on top of gameplay, so
// they never compete with the HUD's lives icons/timer bar for space. When there isn't enough room
// (landscape phones, desktop - `#app`'s top-align makes essentially no visual difference there,
// since the canvas already fills almost the full viewport height), `active` is false and
// `scenes/play.ts` falls back to its own canvas-drawn overlay (shrunk to 48px and repositioned -
// see that file's `setupTouchButtons`).
//
// Real DOM buttons need none of `core/input.ts`'s coordinate-mapping/touch-exclusion bookkeeping
// (they sit outside the canvas entirely, so the swipe/tap listener - attached only to the canvas
// element, `attachInput(canvas)` in main.ts - never sees these taps at all); the only thing they
// need from the rest of the input system is the same `isTopInputOwner` guard every other raw
// listener uses, so a tap here is ignored while a menu (Pause, Settings, a level-intro card, ...)
// is pushed on top of Play. Since Play stops updating/rendering entirely while covered
// (core/loop.ts's `Scenes` only ever drives the top of the stack), there's no per-frame hook on
// PlayScene itself to hide these buttons when that happens - a small dedicated
// `requestAnimationFrame` poll below checks `isTopInputOwner` independently of the game loop.

import type { Dir } from '../game/types';
import { isTopInputOwner } from '../core/input';

const FREE_SPACE_THRESHOLD_PX = 150;
const BTN_PX = 64;
const GAP_PX = 10;
const PAUSE_GAP_PX = 22;
const MIN_MARGIN_PX = 8;

const STYLE_ID = 'rr-touch-controls-style';

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .rr-touch-wrap {
      position: fixed;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      align-items: center;
      gap: ${PAUSE_GAP_PX}px;
      z-index: 10;
    }
    .rr-dpad {
      position: relative;
      width: ${BTN_PX * 3 + GAP_PX * 2}px;
      height: ${BTN_PX * 2 + GAP_PX}px;
    }
    .rr-tbtn {
      position: absolute;
      width: ${BTN_PX}px;
      height: ${BTN_PX}px;
      border: none;
      border-radius: ${Math.round(BTN_PX * 0.28)}px;
      background: rgba(255, 247, 230, 0.3);
      color: #FFF7E6;
      font: 700 ${Math.round(BTN_PX * 0.42)}px Fredoka, sans-serif;
      line-height: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      touch-action: manipulation;
      -webkit-tap-highlight-color: transparent;
      user-select: none;
      padding: 0;
    }
    .rr-tbtn:active {
      background: rgba(255, 247, 230, 0.55);
      transform: translateY(2px);
    }
    .rr-pause {
      position: static;
    }
  `;
  document.head.appendChild(style);
}

const DPAD_DIRS: { dir: Dir; glyph: string; col: number; row: number }[] = [
  { dir: 'up', glyph: '▲', col: 1, row: 0 },
  { dir: 'left', glyph: '◀', col: 0, row: 1 },
  { dir: 'down', glyph: '▼', col: 1, row: 1 },
  { dir: 'right', glyph: '▶', col: 2, row: 1 },
];

export interface TouchControlsHandlers {
  onHop: (dir: Dir) => void;
  onPause: () => void;
}

/** One instance per `PlayScene` (created in `enter()`, torn down in `exit()` - same lifecycle as
 * the canvas-drawn touch buttons it complements). `owner` is the `PlayScene` instance itself,
 * passed straight through to `isTopInputOwner` exactly like `scenes/play.ts`'s own raw canvas
 * touch listeners already do. */
export class BelowCanvasTouchControls {
  private wrap: HTMLDivElement | null = null;
  private dpadEl: HTMLDivElement | null = null;
  private dpadOn = true;
  /** True once there's enough free space below the canvas to actually be mounted - `scenes/
   * play.ts` reads this every frame to decide whether *it* should draw the on-canvas fallback. */
  private mounted = false;
  private rafId = 0;
  private onResize = (): void => this.layout();

  constructor(
    private canvas: HTMLCanvasElement,
    private owner: unknown,
    private handlers: TouchControlsHandlers,
  ) {}

  get active(): boolean {
    return this.mounted;
  }

  /** Mirrors `SaveSettings.onScreenDpad` (Settings' toggle) - the pause button stays up either
   * way, same as the canvas-drawn version's own always-on pause button. */
  setDpadEnabled(on: boolean): void {
    this.dpadOn = on;
    if (this.dpadEl) this.dpadEl.style.display = on ? '' : 'none';
  }

  mount(): void {
    ensureStyle();
    window.addEventListener('resize', this.onResize);
    this.layout();
    this.pollVisibility();
  }

  unmount(): void {
    window.removeEventListener('resize', this.onResize);
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    this.destroyDom();
  }

  private destroyDom(): void {
    this.wrap?.remove();
    this.wrap = null;
    this.dpadEl = null;
    this.mounted = false;
  }

  private freeSpaceBelowCanvas(): number {
    const rect = this.canvas.getBoundingClientRect();
    return window.innerHeight - rect.bottom;
  }

  private layout(): void {
    const free = this.freeSpaceBelowCanvas();
    if (free < FREE_SPACE_THRESHOLD_PX) {
      this.destroyDom();
      return;
    }
    if (!this.wrap) this.build();
    this.mounted = true;
    this.position(free);
  }

  private build(): void {
    const wrap = document.createElement('div');
    wrap.className = 'rr-touch-wrap';

    const dpad = document.createElement('div');
    dpad.className = 'rr-dpad';
    dpad.style.display = this.dpadOn ? '' : 'none';
    for (const d of DPAD_DIRS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'rr-tbtn';
      btn.style.left = `${d.col * (BTN_PX + GAP_PX)}px`;
      btn.style.top = `${d.row * (BTN_PX + GAP_PX)}px`;
      btn.textContent = d.glyph;
      btn.setAttribute('aria-label', `Hop ${d.dir}`);
      btn.addEventListener('click', () => {
        if (!isTopInputOwner(this.owner)) return;
        this.handlers.onHop(d.dir);
      });
      dpad.appendChild(btn);
    }
    wrap.appendChild(dpad);
    this.dpadEl = dpad;

    const pause = document.createElement('button');
    pause.type = 'button';
    pause.className = 'rr-tbtn rr-pause';
    pause.textContent = '⏸';
    pause.setAttribute('aria-label', 'Pause');
    pause.addEventListener('click', () => {
      if (!isTopInputOwner(this.owner)) return;
      this.handlers.onPause();
    });
    wrap.appendChild(pause);

    document.body.appendChild(wrap);
    this.wrap = wrap;
  }

  private position(free: number): void {
    if (!this.wrap) return;
    const clusterH = BTN_PX * 2 + GAP_PX;
    const rect = this.canvas.getBoundingClientRect();
    const centred = rect.bottom + Math.max(MIN_MARGIN_PX, (free - clusterH) / 2);
    const top = Math.min(centred, window.innerHeight - clusterH - MIN_MARGIN_PX);
    this.wrap.style.top = `${top}px`;
  }

  /** Independent of `core/loop.ts`'s scene-stack-driven update/render (which stops calling
   * PlayScene entirely once something's pushed on top of it) - polls `isTopInputOwner` on its own
   * `requestAnimationFrame` cadence so the DOM buttons hide the instant Pause/Settings/a
   * level-intro card covers Play, and reappear the instant it's uncovered again. */
  private pollVisibility(): void {
    const tick = (): void => {
      if (this.wrap) {
        const want = isTopInputOwner(this.owner) ? '' : 'none';
        if (this.wrap.style.display !== want) this.wrap.style.display = want;
      }
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }
}
