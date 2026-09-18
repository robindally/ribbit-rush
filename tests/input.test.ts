import { describe, expect, it } from 'vitest';
import {
  DEFAULT_KEY_BINDINGS,
  getKeyBindings,
  getLastInputDevice,
  isTopInputOwner,
  isTouchCapable,
  mapKeyToAction,
  noteInputDevice,
  popInputOwner,
  pushInputOwner,
  setKeyBindings,
} from '../src/core/input';

describe('mapKeyToAction: code -> key fallback', () => {
  it('maps a hop from key when code is empty (virtual keyboards/automation send no code)', () => {
    expect(mapKeyToAction({ code: '', key: 'ArrowUp' })).toEqual({ type: 'hop', dir: 'up' });
    expect(mapKeyToAction({ code: '', key: 'ArrowDown' })).toEqual({ type: 'hop', dir: 'down' });
    expect(mapKeyToAction({ code: '', key: 'ArrowLeft' })).toEqual({ type: 'hop', dir: 'left' });
    expect(mapKeyToAction({ code: '', key: 'ArrowRight' })).toEqual({ type: 'hop', dir: 'right' });
  });

  it('maps wasd via key fallback in either case', () => {
    expect(mapKeyToAction({ code: '', key: 'w' })).toEqual({ type: 'hop', dir: 'up' });
    expect(mapKeyToAction({ code: '', key: 'W' })).toEqual({ type: 'hop', dir: 'up' });
    expect(mapKeyToAction({ code: '', key: 'a' })).toEqual({ type: 'hop', dir: 'left' });
    expect(mapKeyToAction({ code: '', key: 's' })).toEqual({ type: 'hop', dir: 'down' });
    expect(mapKeyToAction({ code: '', key: 'D' })).toEqual({ type: 'hop', dir: 'right' });
  });

  it('maps confirm and pause via key fallback', () => {
    expect(mapKeyToAction({ code: '', key: 'Enter' })).toEqual({ type: 'confirm' });
    expect(mapKeyToAction({ code: '', key: ' ' })).toEqual({ type: 'confirm' });
    expect(mapKeyToAction({ code: '', key: 'Escape' })).toEqual({ type: 'pause' });
    expect(mapKeyToAction({ code: '', key: 'p' })).toEqual({ type: 'pause' });
    expect(mapKeyToAction({ code: '', key: 'P' })).toEqual({ type: 'pause' });
  });

  it('returns null for an unmapped key when code is empty', () => {
    expect(mapKeyToAction({ code: '', key: 'Tab' })).toBeNull();
  });

  it('does not change behaviour when code is present, even if unrecognised', () => {
    // key alone would map to a hop, but a present (if unrecognised) code must win and refuse it.
    expect(mapKeyToAction({ code: 'Unidentified', key: 'ArrowUp' })).toBeNull();
  });

  it('maps normally from code when code is present (unchanged behaviour)', () => {
    expect(mapKeyToAction({ code: 'ArrowUp', key: 'ArrowUp' })).toEqual({ type: 'hop', dir: 'up' });
    expect(mapKeyToAction({ code: 'KeyD', key: 'd' })).toEqual({ type: 'hop', dir: 'right' });
    expect(mapKeyToAction({ code: 'Enter', key: 'Enter' })).toEqual({ type: 'confirm' });
    expect(mapKeyToAction({ code: 'KeyP', key: 'p' })).toEqual({ type: 'pause' });
  });
});

// M8 spec section 2: "Key remap for the four hop directions, confirm, and pause." A custom
// binding is layered on top of (never a replacement for) the built-in tables above - see
// core/input.ts's own doc comment on `KeyBindings` for why: it's what keeps the acceptance's
// "Enter or Space with nothing focused must still start the game" true no matter what the player
// has rebound `confirm` to.
describe('mapKeyToAction: custom key bindings (M8 remap)', () => {
  it('maps a rebound code to its action even though it matches nothing in the default tables', () => {
    const custom = { up: 'KeyJ' };
    expect(mapKeyToAction({ code: 'KeyJ', key: 'j' }, custom)).toEqual({ type: 'hop', dir: 'up' });
  });

  it('covers all six rebindable actions', () => {
    const custom = {
      up: 'KeyI',
      down: 'KeyK',
      left: 'KeyJ',
      right: 'KeyL',
      confirm: 'KeyF',
      pause: 'KeyEsc',
    };
    expect(mapKeyToAction({ code: 'KeyI', key: 'i' }, custom)).toEqual({ type: 'hop', dir: 'up' });
    expect(mapKeyToAction({ code: 'KeyK', key: 'k' }, custom)).toEqual({ type: 'hop', dir: 'down' });
    expect(mapKeyToAction({ code: 'KeyJ', key: 'j' }, custom)).toEqual({ type: 'hop', dir: 'left' });
    expect(mapKeyToAction({ code: 'KeyL', key: 'l' }, custom)).toEqual({ type: 'hop', dir: 'right' });
    expect(mapKeyToAction({ code: 'KeyF', key: 'f' }, custom)).toEqual({ type: 'confirm' });
    expect(mapKeyToAction({ code: 'KeyEsc', key: 'Escape' }, custom)).toEqual({ type: 'pause' });
  });

  it('still maps the default key for an action nobody has rebound', () => {
    const custom = { up: 'KeyJ' }; // only 'up' rebound
    expect(mapKeyToAction({ code: 'ArrowDown', key: 'ArrowDown' }, custom)).toEqual({
      type: 'hop',
      dir: 'down',
    });
  });

  it('keeps the original default key working too after a remap (adds, does not replace)', () => {
    const custom = { up: 'KeyJ' };
    expect(mapKeyToAction({ code: 'ArrowUp', key: 'ArrowUp' }, custom)).toEqual({
      type: 'hop',
      dir: 'up',
    });
  });

  it('Enter always confirms even when confirm has been rebound elsewhere - the acceptance-pinned escape hatch', () => {
    const custom = { confirm: 'KeyF' };
    expect(mapKeyToAction({ code: 'Enter', key: 'Enter' }, custom)).toEqual({ type: 'confirm' });
    expect(mapKeyToAction({ code: 'Space', key: ' ' }, custom)).toEqual({ type: 'confirm' });
  });

  it('an empty custom-bindings object reproduces the exact pre-M8 default behaviour', () => {
    expect(mapKeyToAction({ code: 'ArrowUp', key: 'ArrowUp' }, {})).toEqual({
      type: 'hop',
      dir: 'up',
    });
    expect(mapKeyToAction({ code: 'Unidentified', key: 'ArrowUp' }, {})).toBeNull();
  });

  it('DEFAULT_KEY_BINDINGS matches the legacy defaults above', () => {
    expect(DEFAULT_KEY_BINDINGS).toEqual({
      up: 'ArrowUp',
      down: 'ArrowDown',
      left: 'ArrowLeft',
      right: 'ArrowRight',
      confirm: 'Enter',
      pause: 'Escape',
    });
  });
});

// M10 quality pass: the small pure pieces of core/input.ts besides `mapKeyToAction` (last-input
// device tracking, the key-remap store, and the input-owner stack - docs/specs/M8-report.md
// "Deviations" #5) had no direct tests. `attachInput`/`onKeyDown`/`onTouchStart`/`pollGamepad`
// stay untested here on purpose (ARCHITECTURE.md section 13: "No canvas or audio in tests" - these
// need a real DOM/Gamepad to exercise meaningfully).
describe('isTouchCapable', () => {
  it('is false when navigator is unavailable (this Vitest environment)', () => {
    expect(isTouchCapable()).toBe(false);
  });

  it('reflects navigator.maxTouchPoints when present, never throwing', () => {
    const original = (globalThis as { navigator?: unknown }).navigator;
    Object.defineProperty(globalThis, 'navigator', {
      value: { maxTouchPoints: 5 },
      configurable: true,
    });
    expect(isTouchCapable()).toBe(true);
    Object.defineProperty(globalThis, 'navigator', {
      value: { maxTouchPoints: 0 },
      configurable: true,
    });
    expect(isTouchCapable()).toBe(false);
    Object.defineProperty(globalThis, 'navigator', { value: original, configurable: true });
  });
});

describe('getLastInputDevice / noteInputDevice', () => {
  it('tracks whichever device last reported in', () => {
    noteInputDevice('gamepad');
    expect(getLastInputDevice()).toBe('gamepad');
    noteInputDevice('touch');
    expect(getLastInputDevice()).toBe('touch');
    noteInputDevice('keyboard');
    expect(getLastInputDevice()).toBe('keyboard');
  });
});

describe('setKeyBindings / getKeyBindings', () => {
  it('layers a partial custom binding on top of the defaults (never replaces the whole set)', () => {
    setKeyBindings({ up: 'KeyJ' });
    expect(getKeyBindings()).toEqual({
      up: 'KeyJ',
      down: 'ArrowDown',
      left: 'ArrowLeft',
      right: 'ArrowRight',
      confirm: 'Enter',
      pause: 'Escape',
    });
  });

  it('an empty binding set reproduces the plain defaults', () => {
    setKeyBindings({});
    expect(getKeyBindings()).toEqual(DEFAULT_KEY_BINDINGS);
  });
});

describe('input-owner stack (M8 "Deviations" #5: a covered menu must not react to raw pointer events)', () => {
  it('only the top of the stack is ever the active owner', () => {
    const a = {};
    const b = {};
    expect(isTopInputOwner(a)).toBe(false);

    pushInputOwner(a);
    expect(isTopInputOwner(a)).toBe(true);
    expect(isTopInputOwner(b)).toBe(false);

    pushInputOwner(b);
    expect(isTopInputOwner(a)).toBe(false);
    expect(isTopInputOwner(b)).toBe(true);

    popInputOwner(b);
    expect(isTopInputOwner(a)).toBe(true);

    popInputOwner(a);
    expect(isTopInputOwner(a)).toBe(false);
  });

  it('popping an owner that is not on the stack is a harmless no-op', () => {
    const a = {};
    const ghost = {};
    pushInputOwner(a);
    expect(() => popInputOwner(ghost)).not.toThrow();
    expect(isTopInputOwner(a)).toBe(true);
    popInputOwner(a);
  });

  it('pushing the same token twice keeps it on top until both are popped', () => {
    const a = {};
    pushInputOwner(a);
    pushInputOwner(a);
    expect(isTopInputOwner(a)).toBe(true);
    popInputOwner(a);
    expect(isTopInputOwner(a)).toBe(true); // one copy of `a` remains
    popInputOwner(a);
    expect(isTopInputOwner(a)).toBe(false);
  });
});
