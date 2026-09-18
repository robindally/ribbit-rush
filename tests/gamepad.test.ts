// M8 spec section 4: "D-pad and left stick with 0.5 deadzone and edge detection; A confirms, B
// backs, Start pauses." No physical or emulated gamepad was available in this environment (see
// docs/specs/M8-report.md), so per the spec's own acceptance fallback ("unit test the mapping and
// say so") this exercises the pure mapping core/input.ts's `pollGamepad` is built on directly:
// `stickDir` (deadzone), `readGamepadFrame` (buttons+stick -> one frame's held state), and
// `diffGamepadFrames` (rising-edge detection -> the InputActions a poll emits).

import { describe, expect, it } from 'vitest';
import {
  diffGamepadFrames,
  readGamepadFrame,
  stickDir,
  type GamepadFrame,
  type GamepadLike,
} from '../src/core/input';

function pad(buttonsPressed: number[], axes: [number, number] = [0, 0]): GamepadLike {
  const buttons = Array.from({ length: 17 }, (_, i) => ({ pressed: buttonsPressed.includes(i) }));
  return { buttons, axes };
}

describe('stickDir: 0.5 deadzone', () => {
  it('is null inside the deadzone on both axes', () => {
    expect(stickDir(0, 0)).toBeNull();
    expect(stickDir(0.49, 0)).toBeNull();
    expect(stickDir(0, -0.49)).toBeNull();
    expect(stickDir(0.4, 0.4)).toBeNull();
  });

  it('fires right past the deadzone on the positive x axis', () => {
    expect(stickDir(0.5, 0)).toBe('right');
    expect(stickDir(1, 0.1)).toBe('right');
  });

  it('fires left/up/down for the other three cardinal directions', () => {
    expect(stickDir(-0.6, 0)).toBe('left');
    expect(stickDir(0, -0.6)).toBe('up');
    expect(stickDir(0, 0.6)).toBe('down');
  });

  it('picks the axis with the larger magnitude on a diagonal push', () => {
    expect(stickDir(0.8, 0.2)).toBe('right');
    expect(stickDir(0.2, 0.8)).toBe('down');
  });
});

describe('readGamepadFrame: d-pad buttons (12-15) + stick merged, A/B/Start', () => {
  it('reads each d-pad button to its own direction (standard mapping indices)', () => {
    expect(readGamepadFrame(pad([12])).dirs).toEqual(new Set(['up']));
    expect(readGamepadFrame(pad([13])).dirs).toEqual(new Set(['down']));
    expect(readGamepadFrame(pad([14])).dirs).toEqual(new Set(['left']));
    expect(readGamepadFrame(pad([15])).dirs).toEqual(new Set(['right']));
  });

  it('merges a held stick direction into the same set as the d-pad', () => {
    const f = readGamepadFrame(pad([], [1, 0]));
    expect(f.dirs).toEqual(new Set(['right']));
  });

  it('can report both a d-pad direction and a different stick direction at once', () => {
    const f = readGamepadFrame(pad([12], [1, 0])); // d-pad up + stick right
    expect(f.dirs).toEqual(new Set(['up', 'right']));
  });

  it('maps button 0 to confirm (A) and button 1 to back (B)', () => {
    expect(readGamepadFrame(pad([0]))).toMatchObject({ confirm: true, back: false });
    expect(readGamepadFrame(pad([1]))).toMatchObject({ confirm: false, back: true });
  });

  it('maps either button 8 or 9 to pause (Start/Select - controllers vary)', () => {
    expect(readGamepadFrame(pad([8]))).toMatchObject({ pause: true });
    expect(readGamepadFrame(pad([9]))).toMatchObject({ pause: true });
  });

  it('reports nothing held for an all-released pad', () => {
    const f = readGamepadFrame(pad([]));
    expect(f).toEqual({ dirs: new Set(), confirm: false, back: false, pause: false });
  });
});

describe('diffGamepadFrames: edge detection (docs/specs/M8-ui-input.md section 4)', () => {
  const idle: GamepadFrame = { dirs: new Set(), confirm: false, back: false, pause: false };

  it('emits one hop the instant a direction transitions from released to pressed', () => {
    const current: GamepadFrame = { ...idle, dirs: new Set(['up']) };
    expect(diffGamepadFrames(idle, current)).toEqual([{ type: 'hop', dir: 'up' }]);
  });

  it('emits nothing while a direction is held across two identical frames (no OS-repeat hops)', () => {
    const held: GamepadFrame = { ...idle, dirs: new Set(['up']) };
    expect(diffGamepadFrames(held, held)).toEqual([]);
  });

  it('treats the first-ever frame (prev = null) as a rising edge too', () => {
    const current: GamepadFrame = { ...idle, dirs: new Set(['left']) };
    expect(diffGamepadFrames(null, current)).toEqual([{ type: 'hop', dir: 'left' }]);
  });

  it('does not re-fire when releasing a direction (only pressed transitions hop)', () => {
    const held: GamepadFrame = { ...idle, dirs: new Set(['up']) };
    expect(diffGamepadFrames(held, idle)).toEqual([]);
  });

  it('emits confirm/back/pause on their own rising edges, in that order, alongside a hop', () => {
    const current: GamepadFrame = { dirs: new Set(['down']), confirm: true, back: true, pause: true };
    expect(diffGamepadFrames(idle, current)).toEqual([
      { type: 'hop', dir: 'down' },
      { type: 'confirm' },
      { type: 'back' },
      { type: 'pause' },
    ]);
  });

  it('reports multiple simultaneous new directions in a fixed (up/down/left/right) order', () => {
    const current: GamepadFrame = { ...idle, dirs: new Set(['right', 'up']) };
    expect(diffGamepadFrames(idle, current)).toEqual([
      { type: 'hop', dir: 'up' },
      { type: 'hop', dir: 'right' },
    ]);
  });

  it('a full press-and-release cycle over three frames hops exactly once', () => {
    const f1 = readGamepadFrame(pad([12])); // pressed
    const f2 = readGamepadFrame(pad([12])); // still held
    const f3 = readGamepadFrame(pad([])); // released
    const actions = [
      ...diffGamepadFrames(null, f1),
      ...diffGamepadFrames(f1, f2),
      ...diffGamepadFrames(f2, f3),
    ];
    expect(actions).toEqual([{ type: 'hop', dir: 'up' }]);
  });
});
