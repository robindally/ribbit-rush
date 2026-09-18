// Versioned localStorage save. See docs/ARCHITECTURE.md section 12.
// Reads are guarded with try/catch and defaults so a corrupt blob or a disabled/unavailable
// localStorage (private browsing, SSR-ish test runs, etc.) never throws.

export interface LeaderboardEntry {
  name: string;
  score: number;
  world: number;
  level: number;
  /** ISO date string (`YYYY-MM-DD`), M7: docs/specs/M7-powerups-scoring.md section 4. */
  date: string;
}

/** Top 10 by score (M7 spec section 4). */
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
  keys: Record<string, string>;
}

export interface SaveData {
  hiScore: number;
  leaderboard: LeaderboardEntry[];
  settings: SaveSettings;
  unlocks: string[];
  /** Last name typed into the arcade-style leaderboard entry (M7 spec section 4: "Default the
   * name to the last one used"). Empty string until the player has entered one. */
  lastName: string;
}

const SAVE_KEY = 'ribbit-rush.v1';

function defaultSave(): SaveData {
  return {
    hiScore: 0,
    leaderboard: [],
    settings: { master: 80, music: 70, sfx: 100, muted: false, reduceMotion: false, keys: {} },
    unlocks: [],
    lastName: '',
  };
}

export function loadSave(): SaveData {
  const fallback = defaultSave();
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    return {
      hiScore: typeof parsed.hiScore === 'number' ? parsed.hiScore : fallback.hiScore,
      leaderboard: Array.isArray(parsed.leaderboard) ? parsed.leaderboard : fallback.leaderboard,
      settings: { ...fallback.settings, ...(parsed.settings ?? {}) },
      unlocks: Array.isArray(parsed.unlocks) ? parsed.unlocks : fallback.unlocks,
      lastName: typeof parsed.lastName === 'string' ? parsed.lastName : fallback.lastName,
    };
  } catch {
    return fallback;
  }
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

export function writeSave(data: SaveData): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    // Quota exceeded, storage disabled, or private-mode security error: ignore, save is
    // best-effort.
  }
}
