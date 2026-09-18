// Keyboard, touch, and gamepad -> InputAction. See ARCHITECTURE.md section 5.
// All sources emit through the `inputEvents` bus in events.ts. Keyboard repeat and gamepad/stick
// state are edge-detected so holding a direction fires exactly one hop.

import type { Dir, InputAction } from '../game/types';
import { inputEvents } from './events';

const SWIPE_THRESHOLD_PX = 24;
const GAMEPAD_DEADZONE = 0.5;

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
 */
export function mapKeyToAction(e: KeyLike): InputAction | null {
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

function onKeyDown(e: KeyboardEvent): void {
  if (e.repeat) return; // no OS auto-repeat hops

  const action = mapKeyToAction(e);
  if (action) {
    e.preventDefault();
    emit(action);
  }
}

interface TouchStart {
  x: number;
  y: number;
  t: number;
}

let touchStart: TouchStart | null = null;

function onTouchStart(e: TouchEvent): void {
  const t = e.changedTouches[0];
  if (!t) return;
  touchStart = { x: t.clientX, y: t.clientY, t: performance.now() };
}

function onTouchEnd(e: TouchEvent): void {
  const start = touchStart;
  touchStart = null;
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

export function attachInput(target: HTMLElement = window.document.body): void {
  window.addEventListener('keydown', onKeyDown);
  target.addEventListener('touchstart', onTouchStart, { passive: true });
  target.addEventListener('touchend', onTouchEnd, { passive: true });
}

// --- Gamepad (polled once per animation frame from the loop) ---

const DPAD_BUTTONS: { index: number; dir: Dir }[] = [
  { index: 12, dir: 'up' },
  { index: 13, dir: 'down' },
  { index: 14, dir: 'left' },
  { index: 15, dir: 'right' },
];

const padPressed = new Map<number, Set<Dir>>();

function stickDir(x: number, y: number): Dir | null {
  const adx = Math.abs(x);
  const ady = Math.abs(y);
  if (adx < GAMEPAD_DEADZONE && ady < GAMEPAD_DEADZONE) return null;
  return adx > ady ? (x > 0 ? 'right' : 'left') : y > 0 ? 'down' : 'up';
}

export function pollGamepad(): void {
  const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
  for (const pad of pads) {
    if (!pad) continue;
    let prev = padPressed.get(pad.index);
    if (!prev) {
      prev = new Set();
      padPressed.set(pad.index, prev);
    }

    const current = new Set<Dir>();
    for (const { index, dir } of DPAD_BUTTONS) {
      if (pad.buttons[index]?.pressed) current.add(dir);
    }
    const stick = stickDir(pad.axes[0] ?? 0, pad.axes[1] ?? 0);
    if (stick) current.add(stick);

    for (const dir of current) {
      if (!prev.has(dir)) emit({ type: 'hop', dir }); // rising edge only
    }
    padPressed.set(pad.index, current);

    // Confirm (A / bottom face button) and pause (Start) edge detection.
    const aPressed = !!pad.buttons[0]?.pressed;
    const startPressed = !!(pad.buttons[9]?.pressed || pad.buttons[8]?.pressed);
    const flags = padFlags.get(pad.index) ?? { confirm: false, pause: false };
    if (aPressed && !flags.confirm) emit({ type: 'confirm' });
    if (startPressed && !flags.pause) emit({ type: 'pause' });
    flags.confirm = aPressed;
    flags.pause = startPressed;
    padFlags.set(pad.index, flags);
  }
}

const padFlags = new Map<number, { confirm: boolean; pause: boolean }>();
