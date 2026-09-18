// M10 quality pass: `game/themes.ts` (world palettes/weather data plus the pure `blendWorldTheme`
// crossfade helper M9 added) had no direct tests - only exercised indirectly through other
// modules. Closes that gap per docs/specs/M10-release.md section 1.

import { describe, expect, it } from 'vitest';
import { blendWorldTheme, getWorldTheme, WORLD_THEMES } from '../src/game/themes';

describe('getWorldTheme', () => {
  it('returns each world exactly as tabled in ART_BIBLE.md section 3', () => {
    expect(getWorldTheme(1)).toMatchObject({ name: 'Sunny Suburb', timeOfDay: 'day', weather: 'clear' });
    expect(getWorldTheme(2)).toMatchObject({ name: 'Coastal Highway', timeOfDay: 'dusk', weather: 'clear' });
    expect(getWorldTheme(3)).toMatchObject({ name: 'Neon City', timeOfDay: 'night', weather: 'rain' });
    expect(getWorldTheme(4)).toMatchObject({ name: 'Misty Marsh', timeOfDay: 'dawn', weather: 'fog' });
    expect(getWorldTheme(5)).toMatchObject({ name: 'Frozen Fjord', timeOfDay: 'day', weather: 'snow' });
  });

  it('world 1 (the only day/clear/no-tint world) carries no tint', () => {
    expect(getWorldTheme(1).tint).toBeUndefined();
  });

  it('every other world carries a tint', () => {
    for (const id of [2, 3, 4, 5] as const) {
      expect(getWorldTheme(id).tint).toMatch(/^rgba\(/);
    }
  });

  it('is a live lookup into WORLD_THEMES, not a copy', () => {
    expect(getWorldTheme(3)).toBe(WORLD_THEMES[3]);
  });
});

describe('blendWorldTheme', () => {
  it('at t=0 reproduces palette a exactly', () => {
    const a = getWorldTheme(1);
    const b = getWorldTheme(3);
    const blended = blendWorldTheme(a, b, 0);
    expect(blended.palette).toEqual(a.palette);
  });

  it('at t=1 reproduces palette b exactly', () => {
    const a = getWorldTheme(1);
    const b = getWorldTheme(3);
    const blended = blendWorldTheme(a, b, 1);
    expect(blended.palette).toEqual(b.palette);
  });

  it('at t=0.5 lands each channel halfway between a and b', () => {
    const a = getWorldTheme(1);
    const b = getWorldTheme(3);
    const blended = blendWorldTheme(a, b, 0.5);
    // The blended channel value sits strictly within [min(a,b), max(a,b)] for every RGB channel -
    // proves real interpolation happened without pinning to a brittle exact hex.
    const hex = (s: string): [number, number, number] => [
      parseInt(s.slice(1, 3), 16),
      parseInt(s.slice(3, 5), 16),
      parseInt(s.slice(5, 7), 16),
    ];
    const [ar, ag, ab] = hex(a.palette.grassA);
    const [br, bg, bb] = hex(b.palette.grassA);
    const [mr, mg, mb] = hex(blended.palette.grassA);
    expect(mr).toBeGreaterThanOrEqual(Math.min(ar, br));
    expect(mr).toBeLessThanOrEqual(Math.max(ar, br));
    expect(mg).toBeGreaterThanOrEqual(Math.min(ag, bg));
    expect(mg).toBeLessThanOrEqual(Math.max(ag, bg));
    expect(mb).toBeGreaterThanOrEqual(Math.min(ab, bb));
    expect(mb).toBeLessThanOrEqual(Math.max(ab, bb));
  });

  it('clamps t outside [0,1]', () => {
    const a = getWorldTheme(1);
    const b = getWorldTheme(3);
    expect(blendWorldTheme(a, b, -1).palette).toEqual(a.palette);
    expect(blendWorldTheme(a, b, 2).palette).toEqual(b.palette);
  });

  it('snaps timeOfDay/weather/tint straight to b, never interpolated', () => {
    const a = getWorldTheme(1); // day, clear, no tint
    const b = getWorldTheme(3); // night, rain, a tint
    const blended = blendWorldTheme(a, b, 0.01); // barely started
    expect(blended.timeOfDay).toBe(b.timeOfDay);
    expect(blended.weather).toBe(b.weather);
    expect(blended.tint).toBe(b.tint);
    expect(blended.id).toBe(b.id);
    expect(blended.name).toBe(b.name);
  });
});
