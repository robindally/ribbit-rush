// Versioned localStorage save. See docs/ARCHITECTURE.md section 12.
// Reads are guarded with try/catch and defaults so a corrupt blob or a disabled/unavailable
// localStorage (private browsing, SSR-ish test runs, etc.) never throws.

import { ENDLESS_UNLOCK_LEVEL } from '../game/constants';

export interface LeaderboardEntry {
  name: string;
  score: number;
  world: number;
  level: number;
  /** ISO date string (`YYYY-MM-DD`), M7: docs/specs/M7-powerups-scoring.md section 4. */
  date: string;
}

/** M9: Endless's own leaderboard (docs/specs/M9-endless-skins.md section 1: "Separate Endless
 * leaderboard (top 10 by crossings, then score)"). */
export interface EndlessLeaderboardEntry {
  name: string;
  crossings: number;
  score: number;
  date: string;
}

/** Top 10 by score (M7 spec section 4); Endless's own board reuses the same cap. */
export const LEADERBOARD_MAX = 10;

export interface SaveSettings {
  /** 0 to 100 (docs/specs/M5-audio.md section 1). */
  master: number;
  /** 0 to 100. */
  music: number;
  /** 0 to 100. */
  sfx: number;
  /** `M` toggles this at runtime (docs/specs/M5-audio.md); persisted like the volumes. */
  muted: boolean;
  reduceMotion: boolean;
  /** `press the key to bind` remap for the four hop directions plus confirm/pause (M8 spec section
   * 2). Keys are action names (`'up' | 'down' | 'left' | 'right' | 'confirm' | 'pause'`), values
   * are `KeyboardEvent.code` strings. Only the actions the player has actually rebound are present
   * here - `core/input.ts`'s own defaults still work for anything absent (see `core/input.ts`'s
   * `mapKeyToAction`: a custom binding is layered on top of, not a replacement for, the built-in
   * arrow/WASD/Enter/Space/Escape mapping, so a remap can never brick the keyboard, and the
   * reviewer's Enter-on-Title harness keeps working no matter what's been rebound). */
  keys: Record<string, string>;
  /** On-screen d-pad toggle (M8 spec section 3). Defaults to on for touch-capable devices, off
   * otherwise - see `detectTouchDefault` below. */
  onScreenDpad: boolean;
}

export interface SaveData {
  hiScore: number;
  /** Highest campaign level number ever reached, across every run (M8: gates Endless's lock -
   * `isEndlessUnlocked` below). Not reset between runs, unlike `World.levelNumber`. */
  bestLevel: number;
  leaderboard: LeaderboardEntry[];
  /** M9: Endless's own top-10 board (crossings then score), separate from the campaign one. */
  endlessLeaderboard: EndlessLeaderboardEntry[];
  settings: SaveSettings;
  unlocks: string[];
  /** Last name typed into the arcade-style leaderboard entry (M7 spec section 4: "Default the
   * name to the last one used"). Empty string until the player has entered one. */
  lastName: string;
  /** M9: the currently-selected frog skin id (`game/skins.ts`'s `SkinDef.id`); persists across
   * sessions (docs/specs/M9-endless-skins.md section 2: "selection persists in save"). */
  selectedSkin: string;
  /** M9: cumulative home landings across every run ever (not reset per-run, unlike
   * `RunStats.homesFilled`) - drives the Toad skin's "fill 25 homes total" unlock. */
  lifetimeHomesFilled: number;
  /** M9: the highest near-miss count reached in any single run ever - drives the Ghost skin's "15
   * near-misses in one run" unlock (a *best*, unlike `lifetimeHomesFilled`'s running total). */
  bestNearMissesInRun: number;
}

const SAVE_KEY = 'ribbit-rush.v1';

/** Best-effort touch-device detection for `onScreenDpad`'s default. Guarded so it's always safe to
 * call from a plain Node/Vitest environment (no `navigator`) as well as the browser. */
function detectTouchDefault(): boolean {
  try {
    if (typeof navigator === 'undefined') return false;
    return (navigator.maxTouchPoints ?? 0) > 0;
  } catch {
    return false;
  }
}

function defaultSave(): SaveData {
  return {
    hiScore: 0,
    bestLevel: 1,
    leaderboard: [],
    endlessLeaderboard: [],
    settings: {
      master: 80,
      music: 70,
      sfx: 100,
      muted: false,
      reduceMotion: false,
      keys: {},
      onScreenDpad: detectTouchDefault(),
    },
    unlocks: [],
    lastName: '',
    selectedSkin: 'classic',
    lifetimeHomesFilled: 0,
    bestNearMissesInRun: 0,
  };
}

export function loadSave(): SaveData {
  const fallback = defaultSave();
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    const parsedSettings = (parsed.settings ?? {}) as Partial<SaveSettings>;
    return {
      hiScore: typeof parsed.hiScore === 'number' ? parsed.hiScore : fallback.hiScore,
      bestLevel: typeof parsed.bestLevel === 'number' ? parsed.bestLevel : fallback.bestLevel,
      leaderboard: Array.isArray(parsed.leaderboard) ? parsed.leaderboard : fallback.leaderboard,
      endlessLeaderboard: Array.isArray(parsed.endlessLeaderboard)
        ? parsed.endlessLeaderboard
        : fallback.endlessLeaderboard,
      settings: {
        ...fallback.settings,
        ...parsedSettings,
        onScreenDpad:
          typeof parsedSettings.onScreenDpad === 'boolean'
            ? parsedSettings.onScreenDpad
            : fallback.settings.onScreenDpad,
      },
      unlocks: Array.isArray(parsed.unlocks) ? parsed.unlocks : fallback.unlocks,
      lastName: typeof parsed.lastName === 'string' ? parsed.lastName : fallback.lastName,
      selectedSkin:
        typeof parsed.selectedSkin === 'string' ? parsed.selectedSkin : fallback.selectedSkin,
      lifetimeHomesFilled:
        typeof parsed.lifetimeHomesFilled === 'number'
          ? parsed.lifetimeHomesFilled
          : fallback.lifetimeHomesFilled,
      bestNearMissesInRun:
        typeof parsed.bestNearMissesInRun === 'number'
          ? parsed.bestNearMissesInRun
          : fallback.bestNearMissesInRun,
    };
  } catch {
    return fallback;
  }
}

/** Whether Endless mode's lock (M8 spec section 1) is open - the player has ever reached
 * `ENDLESS_UNLOCK_LEVEL`. Pure, so the unlock boundary is directly unit-testable. */
export function isEndlessUnlocked(bestLevel: number): boolean {
  return bestLevel >= ENDLESS_UNLOCK_LEVEL;
}

/** Records a newly-reached campaign level as this save's best-ever, if higher than what's already
 * stored. Pure - callers still need to `writeSave` themselves (matching every other save mutation
 * in this codebase, e.g. `GameOverScene`'s `hiScore` update). */
export function recordBestLevel(save: SaveData, levelReached: number): void {
  if (levelReached > save.bestLevel) save.bestLevel = levelReached;
}

// --- Leaderboard (M7: docs/specs/M7-powerups-scoring.md section 4) ---
//
// Pure so insert/sort/cap behaviour is directly unit-testable (spec section 6: "leaderboard
// insert, sort, and cap at 10").

/** Whether `score` would make the top 10 - i.e. whether a qualifying Game Over should show the
 * arcade-style name entry. True whenever the board isn't full yet, or `score` beats the current
 * lowest entry. */
export function qualifiesForLeaderboard(
  entries: readonly LeaderboardEntry[],
  score: number,
  max = LEADERBOARD_MAX,
): boolean {
  if (entries.length < max) return true;
  const lowest = entries.reduce((min, e) => Math.min(min, e.score), Infinity);
  return score > lowest;
}

/** Returns a new array with `entry` inserted, sorted by score descending, capped at `max`. Ties
 * keep the existing entries' relative order (stable sort) with the new entry after equal scores,
 * matching `Array.prototype.sort`'s stability guarantee. */
export function insertLeaderboardEntry(
  entries: readonly LeaderboardEntry[],
  entry: LeaderboardEntry,
  max = LEADERBOARD_MAX,
): LeaderboardEntry[] {
  return [...entries, entry].sort((a, b) => b.score - a.score).slice(0, max);
}

// --- Endless leaderboard (M9: docs/specs/M9-endless-skins.md section 1) ---
//
// Mirrors the campaign leaderboard's own insert/qualify pair above, sorted by crossings first,
// score as the tiebreaker (the spec's own "top 10 by crossings, then score").

export function qualifiesForEndlessLeaderboard(
  entries: readonly EndlessLeaderboardEntry[],
  crossings: number,
  score: number,
  max = LEADERBOARD_MAX,
): boolean {
  if (entries.length < max) return true;
  const lowest = entries.reduce(
    (min, e) => (e.crossings < min.crossings || (e.crossings === min.crossings && e.score < min.score) ? e : min),
    entries[0],
  );
  return crossings > lowest.crossings || (crossings === lowest.crossings && score > lowest.score);
}

export function insertEndlessLeaderboardEntry(
  entries: readonly EndlessLeaderboardEntry[],
  entry: EndlessLeaderboardEntry,
  max = LEADERBOARD_MAX,
): EndlessLeaderboardEntry[] {
  return [...entries, entry]
    .sort((a, b) => b.crossings - a.crossings || b.score - a.score)
    .slice(0, max);
}

export function writeSave(data: SaveData): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    // Quota exceeded, storage disabled, or private-mode security error: ignore, save is
    // best-effort.
  }
}
