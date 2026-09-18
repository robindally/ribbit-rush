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

function emit(action: InputAction): void {
  inputEvents.emit(action);
}

function onKeyDown(e: KeyboardEvent): void {
  if (e.repeat) return; // no OS auto-repeat hops

  const dir = KEY_DIR[e.code];
  if (dir) {
    e.preventDefault();
    emit({ type: 'hop', dir });
    return;
  }
  if (e.code === 'Enter' || e.code === 'Space') {
    e.preventDefault();
    emit({ type: 'confirm' });
    return;
  }
  if (e.code === 'Escape' || e.code === 'KeyP') {
    e.preventDefault();
    emit({ type: 'pause' });
    return;
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
