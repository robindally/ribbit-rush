// M10 quality pass: `render/anim.ts` is pure animation-timing math with zero DOM/canvas dependency
// (its own header comment: "so the timing math itself stays easy to read and (if ever wanted) unit
// test without a canvas") - it just had no tests yet. Closes that gap per docs/specs/M10-release.md
// section 1 ("add tests where a pure module is under 70% lines").

import { describe, expect, it } from 'vitest';
import {
  busBounceTiles,
  clamp,
  createBlinkState,
  frogDeathVisual,
  frogHopArc,
  frogHopScale,
  frogIdleBreath,
  frogLandingSquash,
  frogShadowScale,
  homeLandingScale,
  homeRingVisual,
  isLandingSquashActive,
  lerp,
  motorbikeLeanRad,
  tickBlink,
  turtleVisual,
  wrap,
} from '../src/render/anim';

describe('lerp / clamp / wrap', () => {
  it('lerp interpolates linearly', () => {
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerp(0, 10, 1)).toBe(10);
    expect(lerp(0, 10, 0.5)).toBe(5);
  });

  it('clamp bounds a value into [min, max]', () => {
    expect(clamp(-1, 0, 1)).toBe(0);
    expect(clamp(2, 0, 1)).toBe(1);
    expect(clamp(0.5, 0, 1)).toBe(0.5);
  });

  it('wrap floor-mods into [0, period)', () => {
    expect(wrap(5, 3)).toBeCloseTo(2);
    expect(wrap(-1, 3)).toBeCloseTo(2);
  });
});

describe('frogHopScale', () => {
  it('stretches up to 1.25 at t=0.4, then eases to 0.8 by landing', () => {
    expect(frogHopScale(0)).toEqual({ scaleX: 1, scaleY: 1 });
    expect(frogHopScale(0.4).scaleY).toBeCloseTo(1.25);
    expect(frogHopScale(1).scaleY).toBeCloseTo(0.8);
  });

  it('clamps hopT outside [0,1]', () => {
    expect(frogHopScale(-1)).toEqual(frogHopScale(0));
    expect(frogHopScale(2)).toEqual(frogHopScale(1));
  });
});

describe('frogHopArc', () => {
  it('peaks at 0.4 tile at the midpoint of a normal hop', () => {
    expect(frogHopArc(0)).toBeCloseTo(0);
    expect(frogHopArc(0.5)).toBeCloseTo(0.4);
    expect(frogHopArc(1)).toBeCloseTo(0, 5);
  });

  it('takes a taller custom peak for Mega Hop', () => {
    expect(frogHopArc(0.5, 0.7)).toBeCloseTo(0.7);
  });
});

describe('frogShadowScale', () => {
  it('shrinks to 70% at the hop apex, full size on the ground', () => {
    expect(frogShadowScale(0)).toBeCloseTo(1);
    expect(frogShadowScale(1)).toBeCloseTo(1, 5);
    expect(frogShadowScale(0.5)).toBeCloseTo(0.7);
  });
});

describe('frogLandingSquash / isLandingSquashActive', () => {
  it('recovers scale over the 90ms landing window', () => {
    expect(frogLandingSquash(0)).toEqual({ scaleX: 1.3, scaleY: 0.8 });
    expect(frogLandingSquash(0.09)).toEqual({ scaleX: 1, scaleY: 1 });
  });

  it('is active only inside the 90ms window', () => {
    expect(isLandingSquashActive(0)).toBe(true);
    expect(isLandingSquashActive(0.05)).toBe(true);
    expect(isLandingSquashActive(0.09)).toBe(false);
    expect(isLandingSquashActive(0.5)).toBe(false);
  });
});

describe('frogIdleBreath', () => {
  it('oscillates +/-2% at 1Hz', () => {
    expect(frogIdleBreath(0)).toBeCloseTo(1);
    expect(frogIdleBreath(0.25)).toBeCloseTo(1.02);
    expect(frogIdleBreath(0.75)).toBeCloseTo(0.98);
  });
});

describe('createBlinkState / tickBlink', () => {
  it('rolls an initial timer in [3, 5)s from the given rng', () => {
    const state = createBlinkState(() => 0); // rng()=0 -> BLINK_MIN_S exactly
    expect(state.timer).toBeCloseTo(3);
    expect(state.blinking).toBe(false);
  });

  it('starts blinking once the timer elapses, then clears after 100ms and re-rolls', () => {
    const state = createBlinkState(() => 0); // timer = 3s
    tickBlink(state, 3, () => 0);
    expect(state.blinking).toBe(true);
    expect(state.blinkT).toBe(0);

    tickBlink(state, 0.05, () => 0);
    expect(state.blinking).toBe(true); // still mid-blink at 50ms

    tickBlink(state, 0.05, () => 1); // crosses the 100ms blink duration; rng()=1 -> BLINK_MAX_S
    expect(state.blinking).toBe(false);
    expect(state.blinkT).toBe(0);
    expect(state.timer).toBeCloseTo(5);
  });
});

describe('frogDeathVisual', () => {
  it('squish: compresses to scaleY 0.15/scaleX 1.6 and shows tyre marks once fully compressed', () => {
    const start = frogDeathVisual('squish', 0);
    expect(start).toMatchObject({ scaleX: 1, scaleY: 1, alpha: 1, tireMarks: false });
    const compressed = frogDeathVisual('squish', 0.12);
    expect(compressed.scaleX).toBeCloseTo(1.6);
    expect(compressed.scaleY).toBeCloseTo(0.15);
    expect(compressed.tireMarks).toBe(true);
    const faded = frogDeathVisual('squish', 0.89);
    expect(faded.alpha).toBeLessThan(1);
  });

  it('every unspecified engine cause (croc/hedge/occupied/snake) falls back to the squish tween', () => {
    for (const cause of ['croc', 'hedge', 'occupied', 'snake'] as const) {
      expect(frogDeathVisual(cause, 0.12).tireMarks).toBe(true);
    }
  });

  it('drown/offscreen: sinks and fades over 400ms, no tyre marks', () => {
    const mid = frogDeathVisual('drown', 0.2);
    expect(mid.sinkY).toBeGreaterThan(0);
    expect(mid.alpha).toBeLessThan(1);
    expect(mid.tireMarks).toBe(false);
    expect(frogDeathVisual('offscreen', 0.2)).toEqual(mid);
    const end = frogDeathVisual('drown', 0.4);
    expect(end.alpha).toBeCloseTo(0, 5);
  });

  it('timeout: three red blinks then the squish tween', () => {
    expect(frogDeathVisual('timeout', 0.02).redFlash).toBe(true);
    expect(frogDeathVisual('timeout', 0.07).redFlash).toBe(false);
    const afterBlinks = frogDeathVisual('timeout', 0.3 + 0.12);
    expect(afterBlinks.tireMarks).toBe(true);
    expect(afterBlinks.redFlash).toBe(false);
  });
});

describe('homeLandingScale', () => {
  it('pulses 1 -> 1.2 -> 1 over 200ms, 1 outside the window', () => {
    expect(homeLandingScale(-0.1)).toBe(1);
    expect(homeLandingScale(0.2)).toBe(1);
    expect(homeLandingScale(0.1)).toBeCloseTo(1.2);
  });
});

describe('homeRingVisual', () => {
  it('grows and fades over its window, null outside it', () => {
    expect(homeRingVisual(-0.1)).toBeNull();
    expect(homeRingVisual(10)).toBeNull();
    const mid = homeRingVisual(0.225); // half of the 0.45s ring duration
    expect(mid).not.toBeNull();
    expect(mid?.radiusTiles).toBeGreaterThan(0.25);
    expect(mid?.alpha).toBeLessThan(0.6);
  });
});

describe('turtleVisual', () => {
  // Same phase constants as game/lanes.ts's DiveDef cycle: up -> sinking (0.5s) -> down -> rising
  // (0.5s), mirrored (not imported) here deliberately - see this file's own doc comment on why
  // render/anim.ts stays independent of game/lanes.ts.
  const dive = { up: 1, down: 1, phase: 0 };

  it('is fully visible during the up phase', () => {
    expect(turtleVisual(dive, 0.2)).toMatchObject({ visible: true, scale: 1, alpha: 1 });
  });

  it('shrinks and fades through the 0.5s sinking phase', () => {
    const mid = turtleVisual(dive, 1.25); // 0.25s into sinking
    expect(mid.visible).toBe(true);
    expect(mid.scale).toBeLessThan(1);
    expect(mid.alpha).toBeLessThan(1);
  });

  it('is invisible during the down phase', () => {
    expect(turtleVisual(dive, 1.7).visible).toBe(false);
  });

  it('fades back in through the 0.5s rising phase', () => {
    const mid = turtleVisual(dive, 2.75); // 0.25s into rising (up 1 + sink 0.5 + down 1 = 2.5 start)
    expect(mid.visible).toBe(true);
    expect(mid.scale).toBeGreaterThan(0.85);
    expect(mid.scale).toBeLessThan(1);
  });

  it('blinks (dips alpha) in the last 0.6s before sinking starts', () => {
    // up=1: the pre-dive blink window is [0.4, 1.0). Sample a couple of sub-windows.
    const samples = [0.45, 0.55, 0.75, 0.95].map((t) => turtleVisual(dive, t).alpha);
    expect(samples.some((a) => a < 1)).toBe(true);
    expect(samples.some((a) => a === 1)).toBe(true);
  });
});

describe('motorbikeLeanRad / busBounceTiles', () => {
  it('leans 4 degrees toward the direction of travel', () => {
    expect(motorbikeLeanRad(1)).toBeCloseTo((4 * Math.PI) / 180);
    expect(motorbikeLeanRad(-1)).toBeCloseTo((-4 * Math.PI) / 180);
  });

  it('bounces 1px (in tiles) at 4Hz', () => {
    expect(busBounceTiles(0)).toBeCloseTo(0);
    // Peak at t such that sin(2*pi*4*t) = 1 -> t = 1/16.
    expect(busBounceTiles(1 / 16)).toBeCloseTo(1 / 48);
  });
});
