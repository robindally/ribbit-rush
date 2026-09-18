// Frog skins: the unlock table (docs/specs/M9-endless-skins.md section 2), pure unlock-rule
// checks, and the SVG palette-recolour function. Pure and unit-tested - no DOM/canvas here; the
// rasterisation side lives in `render/skinSprites.ts` (`game/` never touches the DOM, per
// ARCHITECTURE.md's own layering).
//
// Recolouring: string-replace the frog sprites' own fill hex values (ART_BIBLE.md section 3's
// `frogBody`/`frogDark`/`frogLight`, plus two derived tones `frog-idle.svg`/`frog-jump.svg` also
// use - a body/haunch "shade rim" and the eye-ring/mouth ink) before rasterising, exactly the
// approach `assets/sprites/lady-frog.svg`'s own doc comment already used by hand for the M7 lady
// frog: body/dark/light come straight from the skin table, and the two extra tones are *derived*
// from them (darkened) rather than given their own table entry - lady-frog.svg's own eyeRing
// (#2F7A3A -> #C2447A, a shade of its dark #E0699C) and shade rim (#4BB650 -> #E56FA0, a shade of
// its body #F48FB1) both follow the same darken-from-body/dark pattern this file automates.

import type { SaveData } from '../core/save';

export type HatKind = 'headband' | 'crown' | 'beanie' | null;

export type SkinUnlock =
  | { kind: 'default' }
  | { kind: 'homes'; count: number }
  | { kind: 'world'; world: number }
  | { kind: 'score'; score: number }
  | { kind: 'nearMiss'; count: number };

export interface SkinDef {
  id: string;
  name: string;
  body: string;
  dark: string;
  light: string;
  hat: HatKind;
  /** Ghost (docs/specs/M9-endless-skins.md section 2: "drawn at 70% alpha") - baked into the
   * rasterised sprite by `render/skinSprites.ts` rather than threaded through every draw call. */
  ghost?: boolean;
  unlock: SkinUnlock;
  /** Shown under the greyed-out swatch on the Title's skin picker while locked. */
  hint: string;
}

export const SKINS: readonly SkinDef[] = [
  {
    id: 'classic',
    name: 'Classic',
    body: '#58D65E',
    dark: '#3FA84A',
    light: '#8BEA7B',
    hat: null,
    unlock: { kind: 'default' },
    hint: 'Default',
  },
  {
    id: 'toad',
    name: 'Toad',
    body: '#C98A4B',
    dark: '#8F5E2E',
    light: '#E9B77A',
    hat: null,
    unlock: { kind: 'homes', count: 25 },
    hint: 'Fill 25 homes',
  },
  {
    id: 'treefrog',
    name: 'Tree Frog',
    body: '#9BE85A',
    dark: '#5FA832',
    light: '#FFB640',
    hat: null,
    unlock: { kind: 'world', world: 1 },
    hint: 'Clear World 1',
  },
  {
    id: 'poisondart',
    name: 'Poison Dart',
    body: '#3E9CE6',
    dark: '#1B2A1D',
    light: '#7CC7FF',
    hat: null,
    unlock: { kind: 'world', world: 2 },
    hint: 'Clear World 2',
  },
  {
    id: 'ninja',
    name: 'Ninja',
    body: '#2B2B2B',
    dark: '#111111',
    light: '#E8474B',
    hat: 'headband',
    unlock: { kind: 'world', world: 3 },
    hint: 'Clear World 3',
  },
  {
    id: 'swampking',
    name: 'Swamp King',
    body: '#4F7F3A',
    dark: '#2F5A25',
    light: '#C9F5A6',
    hat: 'crown',
    unlock: { kind: 'world', world: 4 },
    hint: 'Clear World 4',
  },
  {
    id: 'frost',
    name: 'Frost',
    body: '#F3F7FB',
    dark: '#BFE3FA',
    light: '#7CC7FF',
    hat: 'beanie',
    unlock: { kind: 'world', world: 5 },
    hint: 'Clear World 5',
  },
  {
    id: 'golden',
    name: 'Golden',
    body: '#FFC83D',
    dark: '#C98A0B',
    light: '#FFF1A8',
    hat: null,
    unlock: { kind: 'score', score: 50000 },
    hint: 'Score 50,000 in one run',
  },
  {
    id: 'ghost',
    name: 'Ghost',
    body: '#FFFFFF',
    dark: '#D9E3EC',
    light: '#FFFFFF',
    hat: null,
    ghost: true,
    unlock: { kind: 'nearMiss', count: 15 },
    hint: '15 near-misses in one run',
  },
];

export const DEFAULT_SKIN_ID = 'classic';

export function getSkin(id: string): SkinDef {
  return SKINS.find((s) => s.id === id) ?? SKINS[0];
}

// --- Unlock rules (pure, so directly testable without a save/UI) ---

export interface SkinUnlockStats {
  bestLevel: number;
  hiScore: number;
  lifetimeHomesFilled: number;
  bestNearMissesInRun: number;
}

export function unlockStatsFromSave(save: SaveData): SkinUnlockStats {
  return {
    bestLevel: save.bestLevel,
    hiScore: save.hiScore,
    lifetimeHomesFilled: save.lifetimeHomesFilled,
    bestNearMissesInRun: save.bestNearMissesInRun,
  };
}

/** "Clear world W" - reaching the first level of the *next* world (bestLevel > W*3); world 5 has
 * no "next" campaign level, so its own clear is reaching level 15 itself (matches
 * `ENDLESS_UNLOCK_LEVEL`/`isEndlessUnlocked` in `core/save.ts` - both unlock together). */
function worldCleared(world: number, bestLevel: number): boolean {
  return world < 5 ? bestLevel > world * 3 : bestLevel >= 15;
}

export function isSkinUnlocked(skin: SkinDef, stats: SkinUnlockStats): boolean {
  switch (skin.unlock.kind) {
    case 'default':
      return true;
    case 'homes':
      return stats.lifetimeHomesFilled >= skin.unlock.count;
    case 'world':
      return worldCleared(skin.unlock.world, stats.bestLevel);
    case 'score':
      return stats.hiScore >= skin.unlock.score;
    case 'nearMiss':
      return stats.bestNearMissesInRun >= skin.unlock.count;
  }
}

export function unlockedSkinIds(stats: SkinUnlockStats): string[] {
  return SKINS.filter((s) => isSkinUnlocked(s, stats)).map((s) => s.id);
}

// --- SVG recolouring (docs/specs/M9-endless-skins.md section 2: "replacing the palette hex values
// in the SVG text before rasterising") ---

type RecolorRole = 'body' | 'shade' | 'dark' | 'light' | 'eyeRing';

/** The five distinct fill colours `frog-idle.svg`/`frog-jump.svg` actually use, in the order
 * lady-frog.svg's own recolour happened to introduce them - eyeWhite (#FFFFFF) and pupil
 * (#1B2A1D) are deliberately left out (every skin keeps plain white/ink eyes, same as
 * lady-frog.svg's own precedent). Exported so `tests/skins.test.ts` can assert none of them survive
 * a recolour. */
export const FROG_ORIGINAL_HEX: readonly string[] = [
  '#58D65E', // body
  '#4BB650', // shade (body/haunch shade rim)
  '#3FA84A', // dark (haunches, spots)
  '#8BEA7B', // light (feet)
  '#2F7A3A', // eyeRing (eye ring, mouth, nostrils)
];

const RECOLOR_TOKENS: { token: string; role: RecolorRole }[] = [
  { token: '#58D65E', role: 'body' },
  { token: '#4BB650', role: 'shade' },
  { token: '#3FA84A', role: 'dark' },
  { token: '#8BEA7B', role: 'light' },
  { token: '#2F7A3A', role: 'eyeRing' },
];

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`.toUpperCase();
}

/** Darkens `hex` toward black by `amount` (0..1) - same helper shape as `render/ui.ts`'s own
 * `darken`, duplicated here rather than imported since `game/` never depends on `render/`. */
export function darkenHex(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const f = 1 - amount;
  return rgbToHex(r * f, g * f, b * f);
}

/**
 * Replaces every occurrence of the frog sprites' five original fill colours with `skin`'s own -
 * body/dark/light straight from the skin table, `shade` and `eyeRing` derived by darkening body/
 * dark respectively (see the module doc comment). Pure string manipulation, safe to run in Node
 * (no DOM) so it can rasterise identically wherever it's called from.
 *
 * Classic's own table values are identical to the hand-authored artwork's body/dark/light, so it
 * short-circuits to the source unchanged - the *derived* shade/eyeRing tones are a mathematical
 * darken of body/dark, which doesn't reproduce Fable's hand-picked #4BB650/#2F7A3A byte-for-byte,
 * and the default skin must render pixel-identical to the reference sprites, not a near-miss.
 */
export function recolorFrogSvg(svgSource: string, skin: SkinDef): string {
  if (skin.body === '#58D65E' && skin.dark === '#3FA84A' && skin.light === '#8BEA7B') {
    return svgSource;
  }
  const shade = darkenHex(skin.body, 0.14);
  const eyeRing = darkenHex(skin.dark, 0.12);
  const colorFor: Record<RecolorRole, string> = {
    body: skin.body,
    shade,
    dark: skin.dark,
    light: skin.light,
    eyeRing,
  };
  let out = svgSource;
  for (const { token, role } of RECOLOR_TOKENS) {
    out = out.split(token).join(colorFor[role]);
  }
  return out;
}
