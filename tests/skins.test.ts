import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SKIN_ID,
  FROG_ORIGINAL_HEX,
  getSkin,
  isSkinUnlocked,
  recolorFrogSvg,
  SKINS,
  unlockedSkinIds,
  type SkinUnlockStats,
} from '../src/game/skins';

// Representative snippets of the real assets/sprites/frog-idle.svg and frog-jump.svg - every one
// of the five recolourable fill tokens (`FROG_ORIGINAL_HEX`) plus the two that must survive any
// skin untouched (eyeWhite #FFFFFF, pupil #1B2A1D), inlined here rather than read from disk so
// this test doesn't need Node's `fs`/`path` types (not installed - this project's tsconfig only
// pulls in `vite/client`, matching every other test file's DOM-only, no-fs style).
const FROG_IDLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
  <g fill="#8BEA7B"><circle cx="4" cy="44" r="1"/></g>
  <g fill="#3FA84A"><ellipse cx="12" cy="33" rx="8" ry="9.5"/></g>
  <g fill="#4BB650"><ellipse cx="24.8" cy="29.2" rx="13" ry="14"/></g>
  <g fill="#58D65E"><ellipse cx="24" cy="28" rx="13" ry="14"/></g>
  <circle cx="15.5" cy="8.5" r="6.2" fill="#2F7A3A"/>
  <circle cx="15.5" cy="8.5" r="4.9" fill="#FFFFFF"/>
  <circle cx="16" cy="9" r="2.7" fill="#1B2A1D"/>
</svg>`;
const FROG_JUMP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
  <g fill="#3FA84A"><ellipse cx="11.5" cy="38" rx="4.2" ry="9.5"/></g>
  <g fill="#8BEA7B"><ellipse cx="6.5" cy="45" rx="3.6" ry="2.6"/></g>
  <g fill="#58D65E"><ellipse cx="11" cy="17" rx="3.4" ry="7.5"/></g>
  <g fill="#4BB650"><ellipse cx="24.8" cy="29" rx="11" ry="15.5"/></g>
  <circle cx="15" cy="7.5" r="6" fill="#2F7A3A"/>
  <circle cx="15" cy="7.5" r="4.7" fill="#FFFFFF"/>
  <circle cx="15.3" cy="6.6" r="2.6" fill="#1B2A1D"/>
</svg>`;

const NO_STATS: SkinUnlockStats = {
  bestLevel: 1,
  hiScore: 0,
  lifetimeHomesFilled: 0,
  bestNearMissesInRun: 0,
};

describe('SKINS table', () => {
  it('has exactly the nine skins from the spec, classic as the default', () => {
    expect(SKINS.map((s) => s.id)).toEqual([
      'classic',
      'toad',
      'treefrog',
      'poisondart',
      'ninja',
      'swampking',
      'frost',
      'golden',
      'ghost',
    ]);
    expect(DEFAULT_SKIN_ID).toBe('classic');
    expect(getSkin('classic').unlock).toEqual({ kind: 'default' });
  });

  it('getSkin falls back to classic for an unknown id', () => {
    expect(getSkin('nonexistent').id).toBe('classic');
  });
});

describe('isSkinUnlocked', () => {
  it('classic is always unlocked', () => {
    expect(isSkinUnlocked(getSkin('classic'), NO_STATS)).toBe(true);
  });

  it('toad unlocks at exactly 25 lifetime homes filled', () => {
    const toad = getSkin('toad');
    expect(isSkinUnlocked(toad, { ...NO_STATS, lifetimeHomesFilled: 24 })).toBe(false);
    expect(isSkinUnlocked(toad, { ...NO_STATS, lifetimeHomesFilled: 25 })).toBe(true);
  });

  it('world-clear skins unlock at bestLevel > world*3, except world 5 at bestLevel >= 15', () => {
    expect(isSkinUnlocked(getSkin('treefrog'), { ...NO_STATS, bestLevel: 3 })).toBe(false);
    expect(isSkinUnlocked(getSkin('treefrog'), { ...NO_STATS, bestLevel: 4 })).toBe(true);
    expect(isSkinUnlocked(getSkin('poisondart'), { ...NO_STATS, bestLevel: 6 })).toBe(false);
    expect(isSkinUnlocked(getSkin('poisondart'), { ...NO_STATS, bestLevel: 7 })).toBe(true);
    expect(isSkinUnlocked(getSkin('ninja'), { ...NO_STATS, bestLevel: 9 })).toBe(false);
    expect(isSkinUnlocked(getSkin('ninja'), { ...NO_STATS, bestLevel: 10 })).toBe(true);
    expect(isSkinUnlocked(getSkin('swampking'), { ...NO_STATS, bestLevel: 12 })).toBe(false);
    expect(isSkinUnlocked(getSkin('swampking'), { ...NO_STATS, bestLevel: 13 })).toBe(true);
    expect(isSkinUnlocked(getSkin('frost'), { ...NO_STATS, bestLevel: 14 })).toBe(false);
    expect(isSkinUnlocked(getSkin('frost'), { ...NO_STATS, bestLevel: 15 })).toBe(true);
  });

  it('golden unlocks at exactly 50,000 score in one run (hiScore)', () => {
    const golden = getSkin('golden');
    expect(isSkinUnlocked(golden, { ...NO_STATS, hiScore: 49_999 })).toBe(false);
    expect(isSkinUnlocked(golden, { ...NO_STATS, hiScore: 50_000 })).toBe(true);
  });

  it('ghost unlocks at exactly 15 near-misses in one run', () => {
    const ghost = getSkin('ghost');
    expect(isSkinUnlocked(ghost, { ...NO_STATS, bestNearMissesInRun: 14 })).toBe(false);
    expect(isSkinUnlocked(ghost, { ...NO_STATS, bestNearMissesInRun: 15 })).toBe(true);
  });

  it('unlockedSkinIds returns only classic with no stats', () => {
    expect(unlockedSkinIds(NO_STATS)).toEqual(['classic']);
  });

  it('unlockedSkinIds returns every skin once every stat is maxed out', () => {
    const everything: SkinUnlockStats = {
      bestLevel: 15,
      hiScore: 50_000,
      lifetimeHomesFilled: 25,
      bestNearMissesInRun: 15,
    };
    expect(unlockedSkinIds(everything)).toEqual(SKINS.map((s) => s.id));
  });
});

describe('recolorFrogSvg', () => {
  const nonClassicSkins = SKINS.filter((s) => s.id !== 'classic');

  for (const skin of nonClassicSkins) {
    it(`${skin.id}: leaves none of the original green hex values in frog-idle.svg`, () => {
      const out = recolorFrogSvg(FROG_IDLE_SVG, skin);
      for (const hex of FROG_ORIGINAL_HEX) {
        expect(out.toUpperCase()).not.toContain(hex.toUpperCase());
      }
    });

    it(`${skin.id}: leaves none of the original green hex values in frog-jump.svg`, () => {
      const out = recolorFrogSvg(FROG_JUMP_SVG, skin);
      for (const hex of FROG_ORIGINAL_HEX) {
        expect(out.toUpperCase()).not.toContain(hex.toUpperCase());
      }
    });
  }

  it('replaces body/dark/light with the skin`s own table values', () => {
    const toad = getSkin('toad');
    const out = recolorFrogSvg(FROG_IDLE_SVG, toad);
    expect(out).toContain(toad.body);
    expect(out).toContain(toad.dark);
    expect(out).toContain(toad.light);
  });

  it('leaves eye-white and pupil untouched (not in the recolor map)', () => {
    const out = recolorFrogSvg(FROG_IDLE_SVG, getSkin('ninja'));
    expect(out).toContain('#FFFFFF');
    expect(out).toContain('#1B2A1D');
  });

  it('classic is a no-op (its table values equal the originals)', () => {
    const out = recolorFrogSvg(FROG_IDLE_SVG, getSkin('classic'));
    expect(out).toBe(FROG_IDLE_SVG);
  });
});
