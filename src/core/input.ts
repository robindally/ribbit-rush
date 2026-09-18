// Keyboard, touch, and gamepad -> InputAction. See ARCHITECTURE.md section 5.
// All sources emit through the `inputEvents` bus in events.ts. Keyboard repeat and gamepad/stick
// state are edge-detected so holding a direction fires exactly one hop.

import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../game/constants';
import type { Dir, InputAction } from '../game/types';
import { inputEvents } from './events';

const SWIPE_THRESHOLD_PX = 24;
const GAMEPAD_DEADZONE = 0.5;

// --- Last-used input device (M8 spec section 4: "gamepad glyphs in prompts when a pad was the
// last input used"), plus a couple of small device-capability helpers reused by core/save.ts's
// on-screen d-pad default and render/ui.ts's action-hint glyphs. ---

export type InputDevice = 'keyboard' | 'touch' | 'gamepad';

let lastDevice: InputDevice = 'keyboard';

export function getLastInputDevice(): InputDevice {
  return lastDevice;
}

/** Exported so render/ui.ts's pointer (mouse/touch) handling can flag "touch" too - a menu button
 * tapped via a real touchscreen should count the same as a swipe/tap gesture for hint purposes. */
export function noteInputDevice(d: InputDevice): void {
  lastDevice = d;
}

/** Best-effort touch-capability check, guarded for non-browser (Vitest) environments. Shared with
 * `core/save.ts`'s on-screen d-pad default. */
export function isTouchCapable(): boolean {
  try {
    if (typeof navigator === 'undefined') return false;
    return (navigator.maxTouchPoints ?? 0) > 0;
  } catch {
    return false;
  }
}

// --- Key remap (M8 spec section 2: "press the key to bind... Escape cancels") ---
//
// `DEFAULT_KEY_BINDINGS` names the *one* canonical code settings shows/edits per action; the
// legacy `KEY_DIR`/`KEY_FALLBACK_DIR` tables below stay permanently active underneath a custom
// binding rather than being replaced by it - a remap only *adds* a trigger for that action, it
// never removes arrows/WASD/Enter/Space/Escape/P. This is deliberate: it's what keeps "Enter or
// Space with nothing focused must still start the game" (the acceptance's own words - the
// reviewer's harness presses Enter on the Title) true no matter what the player has rebound
// `confirm` to.

export interface KeyBindings {
  up: string;
  down: string;
  left: string;
  right: string;
  confirm: string;
  pause: string;
}

export const DEFAULT_KEY_BINDINGS: KeyBindings = {
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  confirm: 'Enter',
  pause: 'Escape',
};

let activeBindings: Partial<KeyBindings> = {};

/** Applied at boot from the save (`main.ts`) and whenever Settings rebinds a key. */
export function setKeyBindings(b: Partial<KeyBindings>): void {
  activeBindings = { ...b };
}

export function getKeyBindings(): KeyBindings {
  return { ...DEFAULT_KEY_BINDINGS, ...activeBindings };
}

const KEY_DIR: Record<string, Dir> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  KeyW: 'up',
  KeyS: 'down',
  KeyA: 'left',
  KeyD: 'right',
};

// Fallback mapping by `e.key`, used only when `e.code` is empty (some virtual keyboards and
// automation send no code). See ARCHITECTURE.md section 5.
const KEY_FALLBACK_DIR: Record<string, Dir> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  W: 'up',
  s: 'down',
  S: 'down',
  a: 'left',
  A: 'left',
  d: 'right',
  D: 'right',
};

function emit(action: InputAction): void {
  inputEvents.emit(action);
}

/** The subset of `KeyboardEvent` the mapping needs, so the pure mapping is directly testable. */
export interface KeyLike {
  code: string;
  key: string;
}

/**
 * Pure code/key -> InputAction mapping, with no DOM dependency. Matches on `code` first; when
 * `code` is empty, falls back to `key` (ArrowUp/Down/Left/Right, w/a/s/d in either case, Enter,
 * ' ', Escape, p/P). Behaviour is unchanged when `code` is present. Returns null when nothing
 * matches.
 *
 * `custom` (M8: a player's key-remap, `core/save.ts`'s `SaveSettings.keys`) is checked first, by
 * `code` only (that's what a "press the key to bind" listener captures) - a match short-circuits
 * straight to that action without touching the tables below, but a *miss* still falls through to
 * them, so the legacy defaults are never disabled by a remap (see the module doc comment above
 * `KeyBindings` for why that matters). Omitting `custom` (or passing `{}`) reproduces the exact
 * pre-M8 behaviour this function's own tests pin.
 */
export function mapKeyToAction(e: KeyLike, custom?: Partial<KeyBindings>): InputAction | null {
  if (e.code && custom) {
    if (custom.up === e.code) return { type: 'hop', dir: 'up' };
    if (custom.down === e.code) return { type: 'hop', dir: 'down' };
    if (custom.left === e.code) return { type: 'hop', dir: 'left' };
    if (custom.right === e.code) return { type: 'hop', dir: 'right' };
    if (custom.confirm === e.code) return { type: 'confirm' };
    if (custom.pause === e.code) return { type: 'pause' };
  }

  if (e.code) {
    const dir = KEY_DIR[e.code];
    if (dir) return { type: 'hop', dir };
    if (e.code === 'Enter' || e.code === 'Space') return { type: 'confirm' };
    if (e.code === 'Escape' || e.code === 'KeyP') return { type: 'pause' };
    return null;
  }

  // `code` is empty: fall back to `key`.
  const dir = KEY_FALLBACK_DIR[e.key];
  if (dir) return { type: 'hop', dir };
  if (e.key === 'Enter' || e.key === ' ') return { type: 'confirm' };
  if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') return { type: 'pause' };
  return null;
}

/* v8 ignore start -- DOM event wiring; ARCHITECTURE.md section 13: "No canvas or audio in tests" -
 * the pure mapping this calls (`mapKeyToAction`) is exhaustively tested in tests/input.test.ts. */
function onKeyDown(e: KeyboardEvent): void {
  if (e.repeat) return; // no OS auto-repeat hops

  const action = mapKeyToAction(e, activeBindings);
  if (action) {
    noteInputDevice('keyboard');
    e.preventDefault();
    emit(action);
  }
}
/* v8 ignore stop */

interface TouchStart {
  x: number;
  y: number;
  t: number;
}

let touchStart: TouchStart | null = null;
/** Set on `touchstart` when the gesture began inside a registered UI exclusion zone (a menu's
 * on-canvas button/slider, or Play's on-screen d-pad/pause button) - see `pushTouchExclusion`
 * below. The matching `touchend` then skips swipe/tap recognition entirely, so a single physical
 * tap on a button never *also* fires a swipe-gesture hop. */
let touchExcluded = false;
let attachedTarget: HTMLElement | null = null;

/** Converts a touch's client coordinates to the renderer's logical (624x720) coordinate space,
 * the same conversion `scenes/title.ts`/`scenes/gameOver.ts` already did ad hoc for their own
 * raw-touch hit tests - centralised here now that more than one caller needs it. Returns null
 * before the canvas has a layout (zero-size rect). */
/* v8 ignore start -- needs a real element layout (getBoundingClientRect); DOM-only. */
function logicalFromClient(clientX: number, clientY: number): { x: number; y: number } | null {
  if (!attachedTarget) return null;
  const rect = attachedTarget.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  return {
    x: ((clientX - rect.left) / rect.width) * CANVAS_WIDTH,
    y: ((clientY - rect.top) / rect.height) * CANVAS_HEIGHT,
  };
}
/* v8 ignore stop */

// --- Touch exclusion stack (M8: on-canvas UI kit buttons/sliders and the on-screen d-pad) ---
//
// A stack, not a single slot, so it naturally tracks the scene stack: a menu scene pushes its own
// exclusion zone in `enter()`/`attach()` and pops it in `exit()`/`detach()`, and since a scene
// beneath an overlay (e.g. Play under Pause) never re-registers on the overlay's pop, whatever is
// left on top of the stack after a pop is automatically whichever scene is now receiving input
// again - exactly the same push/pop lifecycle `core/loop.ts`'s own `Scenes` stack already has.

export type PointHitTest = (x: number, y: number) => boolean;

const exclusionStack: PointHitTest[] = [];

export function pushTouchExclusion(fn: PointHitTest): void {
  exclusionStack.push(fn);
}

export function popTouchExclusion(fn: PointHitTest): void {
  const i = exclusionStack.lastIndexOf(fn);
  if (i >= 0) exclusionStack.splice(i, 1);
}

function isPointExcluded(x: number, y: number): boolean {
  const top = exclusionStack[exclusionStack.length - 1];
  return top ? top(x, y) : false;
}

// --- Input-owner stack (M8) ---
//
// `core/loop.ts`'s `Scenes` stack already makes sure a dispatched `InputAction` only ever reaches
// `scenes.current()` - but a raw DOM listener attached straight to the canvas/window (`FocusManager`'s
// pointer handling, `scenes/play.ts`'s on-screen d-pad/pause button, `scenes/levelIntro.ts`'s
// frozen-card overlay) bypasses that dispatch entirely, and a *covered* scene (e.g. `PlayScene`
// under a pushed `PauseScene`) never gets an `exit()` to un-register it - `Scenes.push` only ever
// adds the new scene, it doesn't touch what's underneath. Without this, two overlapping raw
// listeners (the covered scene's and the covering scene's) both fire for the same physical click,
// and if their logical control rects happen to overlap on screen (easy, since most cards are
// centred), the *covered* scene's button can activate too - e.g. clicking a Settings row pushed
// from Pause could also land inside Pause's own "Resume" rect underneath and pop Settings right
// back off. A push/pop stack (same shape as the touch-exclusion one above) fixes this: every raw
// listener owner registers a token when it starts listening and only acts while its token is the
// *top* of the stack, even though every owner's listeners stay attached the whole time.
const inputOwnerStack: unknown[] = [];

export function pushInputOwner(token: unknown): void {
  inputOwnerStack.push(token);
}

export function popInputOwner(token: unknown): void {
  const i = inputOwnerStack.lastIndexOf(token);
  if (i >= 0) inputOwnerStack.splice(i, 1);
}

export function isTopInputOwner(token: unknown): boolean {
  return inputOwnerStack.length > 0 && inputOwnerStack[inputOwnerStack.length - 1] === token;
}

/* v8 ignore start -- real TouchEvent/DOM wiring; the swipe/tap recognition math itself (threshold,
 * direction) is simple enough to read directly and isn't split out into a pure helper today. */
function onTouchStart(e: TouchEvent): void {
  const t = e.changedTouches[0];
  if (!t) return;
  noteInputDevice('touch');
  const p = logicalFromClient(t.clientX, t.clientY);
  if (p && isPointExcluded(p.x, p.y)) {
    touchExcluded = true;
    touchStart = null;
    return;
  }
  touchExcluded = false;
  touchStart = { x: t.clientX, y: t.clientY, t: performance.now() };
}

function onTouchEnd(e: TouchEvent): void {
  const start = touchStart;
  touchStart = null;
  if (touchExcluded) {
    touchExcluded = false;
    return;
  }
  const t = e.changedTouches[0];
  if (!start || !t) return;

  const dx = t.clientX - start.x;
  const dy = t.clientY - start.y;
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);

  if (Math.max(adx, ady) >= SWIPE_THRESHOLD_PX) {
    const dir: Dir = adx > ady ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
    emit({ type: 'hop', dir });
  } else {
    // A tap hops up.
    emit({ type: 'hop', dir: 'up' });
  }
}
/* v8 ignore stop */

/* v8 ignore start -- attaches real DOM listeners; nothing pure left to unit-test here. */
export function attachInput(target: HTMLElement = window.document.body): void {
  attachedTarget = target;
  window.addEventListener('keydown', onKeyDown);
  target.addEventListener('touchstart', onTouchStart, { passive: true });
  target.addEventListener('touchend', onTouchEnd, { passive: true });
}
/* v8 ignore stop */

// --- Gamepad (polled once per animation frame from the loop) ---
//
// The mapping itself (standard-layout button/axis state -> InputAction) is split into small pure
// functions with no `Gamepad`/`navigator` dependency, so it's directly unit-testable without a
// real or emulated controller - see tests/gamepad.test.ts and docs/specs/M8-report.md ("gamepad
// verification": no physical or virtual pad was available in this environment, so the mapping is
// unit-tested here instead, per the spec's own fallback). `pollGamepad` below is the only
// DOM-coupled part - it just reads `navigator.getGamepads()` each frame and feeds each pad's raw
// state through this same pure pipeline.

const DPAD_BUTTONS: { index: number; dir: Dir }[] = [
  { index: 12, dir: 'up' },
  { index: 13, dir: 'down' },
  { index: 14, dir: 'left' },
  { index: 15, dir: 'right' },
];

/** Minimal shape `readGamepadFrame` needs from a real `Gamepad` - lets tests pass a plain object
 * instead of a browser `Gamepad` instance. */
export interface GamepadLike {
  buttons: readonly { pressed: boolean }[];
  axes: readonly number[];
}

/** Left-stick position -> a single cardinal direction once past the deadzone (whichever axis has
 * the larger magnitude wins ties toward horizontal, matching the touch swipe recognizer's own
 * `adx > ady` tie-break in `onTouchEnd`). Null inside the deadzone. */
export function stickDir(x: number, y: number): Dir | null {
  const adx = Math.abs(x);
  const ady = Math.abs(y);
  if (adx < GAMEPAD_DEADZONE && ady < GAMEPAD_DEADZONE) return null;
  return adx > ady ? (x > 0 ? 'right' : 'left') : y > 0 ? 'down' : 'up';
}

/** One frame's worth of held state (level, not edge) - d-pad buttons and the left stick merged
 * into a single direction set, plus the three face/start buttons this game maps
 * (`A` confirm, `B` back, `Start`/`Select` pause - `docs/specs/M8-ui-input.md` section 4). */
export interface GamepadFrame {
  dirs: ReadonlySet<Dir>;
  confirm: boolean;
  back: boolean;
  pause: boolean;
}

export function readGamepadFrame(pad: GamepadLike): GamepadFrame {
  const dirs = new Set<Dir>();
  for (const { index, dir } of DPAD_BUTTONS) {
    if (pad.buttons[index]?.pressed) dirs.add(dir);
  }
  const stick = stickDir(pad.axes[0] ?? 0, pad.axes[1] ?? 0);
  if (stick) dirs.add(stick);
  return {
    dirs,
    confirm: !!pad.buttons[0]?.pressed,
    back: !!pad.buttons[1]?.pressed,
    pause: !!(pad.buttons[9]?.pressed || pad.buttons[8]?.pressed),
  };
}

/** Rising-edge diff between two consecutive frames -> the `InputAction`s a poll should emit this
 * tick. `prev === null` (first frame ever seen for this pad) never emits a direction/button that
 * happens to already be held down - only a *change* to pressed counts, exactly like a real button
 * press. Pure and order-stable (directions in `DPAD_BUTTONS` order, then confirm/back/pause). */
const ALL_DIRS: readonly Dir[] = ['up', 'down', 'left', 'right'];

export function diffGamepadFrames(prev: GamepadFrame | null, current: GamepadFrame): InputAction[] {
  const actions: InputAction[] = [];
  const prevDirs = prev?.dirs ?? new Set<Dir>();
  for (const dir of ALL_DIRS) {
    if (current.dirs.has(dir) && !prevDirs.has(dir)) actions.push({ type: 'hop', dir });
  }
  if (current.confirm && !prev?.confirm) actions.push({ type: 'confirm' });
  if (current.back && !prev?.back) actions.push({ type: 'back' });
  if (current.pause && !prev?.pause) actions.push({ type: 'pause' });
  return actions;
}

const padFrames = new Map<number, GamepadFrame>();

/* v8 ignore start -- reads real `navigator.getGamepads()`; the pipeline it feeds
 * (`readGamepadFrame`/`diffGamepadFrames`) is exhaustively unit-tested in tests/gamepad.test.ts
 * per docs/specs/M8-report.md's own "Gamepad verification" fallback (no physical/virtual pad is
 * available in this environment either). */
export function pollGamepad(): void {
  const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
  for (const pad of pads) {
    if (!pad) continue;
    const prev = padFrames.get(pad.index) ?? null;
    const current = readGamepadFrame(pad);
    const actions = diffGamepadFrames(prev, current);
    for (const action of actions) {
      noteInputDevice('gamepad'); // rising edge only - a pad just sitting connected shouldn't count
      emit(action);
    }
    padFrames.set(pad.index, current);
  }
}
/* v8 ignore stop */
