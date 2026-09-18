// Versioned localStorage save. See docs/ARCHITECTURE.md section 12.
// Reads are guarded with try/catch and defaults so a corrupt blob or a disabled/unavailable
// localStorage (private browsing, SSR-ish test runs, etc.) never throws.

export interface LeaderboardEntry {
  name: string;
  score: number;
  world: number;
  level: number;
}

export interface SaveSettings {
  master: number;
  music: number;
  sfx: number;
  reduceMotion: boolean;
  keys: Record<string, string>;
}

export interface SaveData {
  hiScore: number;
  leaderboard: LeaderboardEntry[];
  settings: SaveSettings;
  unlocks: string[];
}

const SAVE_KEY = 'ribbit-rush.v1';

function defaultSave(): SaveData {
  return {
    hiScore: 0,
    leaderboard: [],
    settings: { master: 1, music: 1, sfx: 1, reduceMotion: false, keys: {} },
    unlocks: [],
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
    };
  } catch {
    return fallback;
  }
}

export function writeSave(data: SaveData): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    // Quota exceeded, storage disabled, or private-mode security error: ignore, save is
    // best-effort.
  }
}
