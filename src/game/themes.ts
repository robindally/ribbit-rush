// World palettes and weather. See docs/ART_BIBLE.md section 3 ("Per world") and section 7
// ("Lighting and weather"), and docs/specs/M3-art-pass.md section 3.
//
// Data-driven for all five worlds per the M3 spec ("Other worlds come in M6, but the structure
// must be data-driven now"). Only world 1 (Sunny Suburb, day, clear) is exercised by gameplay in
// M3 - `makeClassicLevel` always produces `world: 1` levels. Worlds 2-5's dusk/night/rain/fog/snow
// *rendering* (tint layers, headlight cones, rain streaks, fog bands, snow) is out of scope for
// this milestone and lands with the M6 world tables - see docs/specs/M3-report.md.

export interface WorldPalette {
  grassA: string;
  grassB: string;
  road: string;
  laneLine: string;
  median: string;
  water: string;
  waterLight: string;
  waterDeep: string;
  accentA: string;
  accentB: string;
}

export type TimeOfDay = 'day' | 'dusk' | 'night' | 'dawn';
export type Weather = 'clear' | 'rain' | 'fog' | 'snow';

export interface WorldTheme {
  id: 1 | 2 | 3 | 4 | 5;
  name: string;
  palette: WorldPalette;
  timeOfDay: TimeOfDay;
  weather: Weather;
  /** rgba(...) tint applied over the scene; absent for 'day' worlds with no tint. */
  tint?: string;
}

export const WORLD_THEMES: Record<1 | 2 | 3 | 4 | 5, WorldTheme> = {
  1: {
    id: 1,
    name: 'Sunny Suburb',
    timeOfDay: 'day',
    weather: 'clear',
    palette: {
      grassA: '#74D06B',
      grassB: '#66C25E',
      road: '#4B505A',
      laneLine: '#EDE8DA',
      median: '#CFC8B5',
      water: '#3E9CE6',
      waterLight: '#86CFF7',
      waterDeep: '#2C7BC4',
      accentA: '#FFB640',
      accentB: '#FF6B6B',
    },
  },
  2: {
    id: 2,
    name: 'Coastal Highway',
    timeOfDay: 'dusk',
    weather: 'clear',
    tint: 'rgba(255,120,60,0.14)',
    palette: {
      grassA: '#DDC58A',
      grassB: '#D1B87A',
      road: '#3E3B49',
      laneLine: '#E0D2B0',
      median: '#BFA77C',
      water: '#2F6FB3',
      waterLight: '#FFB07A',
      waterDeep: '#244F86',
      accentA: '#FF7A45',
      accentB: '#9C5BC7',
    },
  },
  3: {
    id: 3,
    name: 'Neon City',
    timeOfDay: 'night',
    weather: 'rain',
    tint: 'rgba(8,10,40,0.42)',
    palette: {
      grassA: '#23253C',
      grassB: '#1D1F33',
      road: '#1E2033',
      laneLine: '#3B3F63',
      median: '#2C2F4A',
      water: '#182A55',
      waterLight: '#3EF2FF',
      waterDeep: '#0F1A38',
      accentA: '#FF3EA5',
      accentB: '#3EF2FF',
    },
  },
  4: {
    id: 4,
    name: 'Misty Marsh',
    timeOfDay: 'dawn',
    weather: 'fog',
    tint: 'rgba(222,236,226,0.32)',
    palette: {
      grassA: '#7FAF80',
      grassB: '#73A274',
      road: '#575C55',
      laneLine: '#A9AF9E',
      median: '#8C9682',
      water: '#4A8A7C',
      waterLight: '#9AD2C2',
      waterDeep: '#35665C',
      accentA: '#FFF176',
      accentB: '#C77DFF',
    },
  },
  5: {
    id: 5,
    name: 'Frozen Fjord',
    timeOfDay: 'day',
    weather: 'snow',
    tint: 'rgba(200,220,255,0.15)',
    palette: {
      grassA: '#F3F7FB',
      grassB: '#E2EBF3',
      road: '#5B6470',
      laneLine: '#D9E3EC',
      median: '#C5D3DF',
      water: '#3B6FA6',
      waterLight: '#BFE3FA',
      waterDeep: '#2A5280',
      accentA: '#7CC7FF',
      accentB: '#FF8FA3',
    },
  },
};

export function getWorldTheme(id: 1 | 2 | 3 | 4 | 5): WorldTheme {
  return WORLD_THEMES[id];
}

// --- Palette crossfade (M9: docs/specs/M9-endless-skins.md section 1 - "Theme cycles 1 to 5 every
// 5 crossings with a 1 s palette crossfade") ---

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function lerpHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(ar + (br - ar) * t)}${c(ag + (bg - ag) * t)}${c(ab + (bb - ab) * t)}`.toUpperCase();
}

/** Blends every hex field of two palettes by `t` (0 = `a`, 1 = `b`) - `timeOfDay`/`weather`/`tint`
 * snap to `b` immediately rather than interpolate (a rgba string tint and a discrete weather/
 * time-of-day don't have a meaningful "halfway" value the way a colour channel does), so only the
 * dominant, always-hex palette actually crossfades. */
export function blendWorldTheme(a: WorldTheme, b: WorldTheme, t: number): WorldTheme {
  const clamped = Math.max(0, Math.min(1, t));
  const keys = Object.keys(a.palette) as (keyof WorldPalette)[];
  const palette = {} as WorldPalette;
  for (const k of keys) palette[k] = lerpHex(a.palette[k], b.palette[k], clamped);
  return { ...b, palette };
}
