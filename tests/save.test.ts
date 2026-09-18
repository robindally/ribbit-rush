import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  insertEndlessLeaderboardEntry,
  insertLeaderboardEntry,
  isEndlessUnlocked,
  LEADERBOARD_MAX,
  loadSave,
  qualifiesForEndlessLeaderboard,
  qualifiesForLeaderboard,
  recordBestLevel,
  writeSave,
  type EndlessLeaderboardEntry,
  type LeaderboardEntry,
  type SaveData,
} from '../src/core/save';

function entry(name: string, score: number): LeaderboardEntry {
  return { name, score, world: 1, level: 1, date: '2026-09-18' };
}

function endlessEntry(name: string, crossings: number, score: number): EndlessLeaderboardEntry {
  return { name, crossings, score, date: '2026-09-18' };
}

describe('insertLeaderboardEntry', () => {
  it('inserts into an empty board', () => {
    const result = insertLeaderboardEntry([], entry('AAA', 500));
    expect(result).toEqual([entry('AAA', 500)]);
  });

  it('sorts by score descending', () => {
    const board = [entry('BBB', 300), entry('CCC', 100)];
    const result = insertLeaderboardEntry(board, entry('AAA', 200));
    expect(result.map((e) => e.name)).toEqual(['BBB', 'AAA', 'CCC']);
  });

  it('caps at 10, dropping the lowest score', () => {
    let board: LeaderboardEntry[] = [];
    for (let i = 0; i < LEADERBOARD_MAX; i++) {
      board = insertLeaderboardEntry(board, entry(`P${i}`, (i + 1) * 100));
    }
    expect(board).toHaveLength(LEADERBOARD_MAX);
    // Lowest current score is 100 (P0); a new entry beating it should replace it.
    board = insertLeaderboardEntry(board, entry('NEW', 150));
    expect(board).toHaveLength(LEADERBOARD_MAX);
    expect(board.some((e) => e.name === 'P0')).toBe(false);
    expect(board.some((e) => e.name === 'NEW')).toBe(true);
  });

  it('does not mutate the input array', () => {
    const board = [entry('AAA', 100)];
    const before = [...board];
    insertLeaderboardEntry(board, entry('BBB', 200));
    expect(board).toEqual(before);
  });
});

describe('qualifiesForLeaderboard', () => {
  it('always qualifies while the board has fewer than 10 entries', () => {
    const board = [entry('AAA', 999_999)];
    expect(qualifiesForLeaderboard(board, 1)).toBe(true);
  });

  it('qualifies only by beating the lowest score once the board is full', () => {
    const board: LeaderboardEntry[] = [];
    for (let i = 0; i < LEADERBOARD_MAX; i++) board.push(entry(`P${i}`, (i + 1) * 100));
    // lowest score is 100
    expect(qualifiesForLeaderboard(board, 100)).toBe(false); // ties don't bump the lowest
    expect(qualifiesForLeaderboard(board, 101)).toBe(true);
    expect(qualifiesForLeaderboard(board, 50)).toBe(false);
  });
});

// M8 spec section 1: Endless is "locked until level 15 has been reached."
describe('isEndlessUnlocked', () => {
  it('is locked below level 15', () => {
    expect(isEndlessUnlocked(1)).toBe(false);
    expect(isEndlessUnlocked(14)).toBe(false);
  });

  it('unlocks at exactly level 15 and stays unlocked beyond it', () => {
    expect(isEndlessUnlocked(15)).toBe(true);
    expect(isEndlessUnlocked(20)).toBe(true);
  });
});

describe('recordBestLevel', () => {
  function save(bestLevel: number): SaveData {
    return {
      hiScore: 0,
      bestLevel,
      leaderboard: [],
      endlessLeaderboard: [],
      settings: {
        master: 80,
        music: 70,
        sfx: 100,
        muted: false,
        reduceMotion: false,
        keys: {},
        onScreenDpad: false,
      },
      unlocks: [],
      lastName: '',
      selectedSkin: 'classic',
      lifetimeHomesFilled: 0,
      bestNearMissesInRun: 0,
    };
  }

  it('raises bestLevel when a higher level is reached', () => {
    const s = save(3);
    recordBestLevel(s, 7);
    expect(s.bestLevel).toBe(7);
  });

  it('never lowers bestLevel', () => {
    const s = save(10);
    recordBestLevel(s, 4);
    expect(s.bestLevel).toBe(10);
  });

  it('leaves bestLevel unchanged on a tie', () => {
    const s = save(5);
    recordBestLevel(s, 5);
    expect(s.bestLevel).toBe(5);
  });
});

// M9 spec section 1: "Separate Endless leaderboard (top 10 by crossings, then score)".
describe('insertEndlessLeaderboardEntry', () => {
  it('sorts by crossings descending, score as the tiebreaker', () => {
    const board = [endlessEntry('AAA', 5, 900), endlessEntry('BBB', 8, 100)];
    const result = insertEndlessLeaderboardEntry(board, endlessEntry('CCC', 8, 500));
    // CCC and BBB tie on crossings (8); CCC's higher score (500 > 100) puts it first.
    expect(result.map((e) => e.name)).toEqual(['CCC', 'BBB', 'AAA']);
  });

  it('caps at 10, dropping the worst entry', () => {
    let board: EndlessLeaderboardEntry[] = [];
    for (let i = 0; i < LEADERBOARD_MAX; i++) {
      board = insertEndlessLeaderboardEntry(board, endlessEntry(`P${i}`, i + 1, 100));
    }
    expect(board).toHaveLength(LEADERBOARD_MAX);
    board = insertEndlessLeaderboardEntry(board, endlessEntry('NEW', 5, 100));
    expect(board).toHaveLength(LEADERBOARD_MAX);
    // Lowest crossings (1, "P0") is dropped for the new 5-crossing run.
    expect(board.some((e) => e.name === 'P0')).toBe(false);
    expect(board.some((e) => e.name === 'NEW')).toBe(true);
  });
});

describe('qualifiesForEndlessLeaderboard', () => {
  it('always qualifies while the board has fewer than 10 entries', () => {
    expect(qualifiesForEndlessLeaderboard([endlessEntry('AAA', 99, 999_999)], 1, 1)).toBe(true);
  });

  it('qualifies by beating the lowest crossings, or matching crossings with a higher score', () => {
    let board: EndlessLeaderboardEntry[] = [];
    for (let i = 0; i < LEADERBOARD_MAX; i++) {
      board = insertEndlessLeaderboardEntry(board, endlessEntry(`P${i}`, i + 1, 100));
    }
    // lowest is crossings=1, score=100
    expect(qualifiesForEndlessLeaderboard(board, 1, 100)).toBe(false); // exact tie doesn't qualify
    expect(qualifiesForEndlessLeaderboard(board, 1, 101)).toBe(true); // same crossings, better score
    expect(qualifiesForEndlessLeaderboard(board, 2, 1)).toBe(true); // more crossings beats any score
    expect(qualifiesForEndlessLeaderboard(board, 0, 999_999)).toBe(false); // fewer crossings loses
  });
});

// M10 quality pass: `loadSave`/`writeSave` themselves (the versioned-blob read/write, upgrade
// guards, and corrupt-data fallback docs/ARCHITECTURE.md section 12 describes) had no direct
// tests - only the pure helpers above did. `localStorage` isn't part of Vitest's default `node`
// environment, so this installs a tiny in-memory stand-in (plain object key/value store, not a
// DOM/canvas dependency) for the duration of this block only, matching the same "guarded, so a
// disabled/unavailable localStorage never throws" contract the module's own header comment
// documents - see below for the case where it's absent entirely.
describe('loadSave / writeSave', () => {
  let store: Map<string, string>;
  const KEY = 'ribbit-rush.v1';

  beforeEach(() => {
    store = new Map();
    const fakeStorage: Storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
      clear: () => store.clear(),
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      get length() {
        return store.size;
      },
    };
    Object.defineProperty(globalThis, 'localStorage', { value: fakeStorage, configurable: true });
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'localStorage');
  });

  it('returns sensible defaults when nothing has been saved yet', () => {
    const save = loadSave();
    expect(save.hiScore).toBe(0);
    expect(save.bestLevel).toBe(1);
    expect(save.leaderboard).toEqual([]);
    expect(save.endlessLeaderboard).toEqual([]);
    expect(save.selectedSkin).toBe('classic');
    expect(save.lifetimeHomesFilled).toBe(0);
    expect(save.bestNearMissesInRun).toBe(0);
    expect(save.settings.master).toBe(80);
  });

  it('round-trips a full save through writeSave -> loadSave', () => {
    const save = loadSave();
    save.hiScore = 4200;
    save.bestLevel = 9;
    save.selectedSkin = 'ninja';
    save.leaderboard = [{ name: 'AAA', score: 4200, world: 2, level: 5, date: '2026-09-18' }];
    writeSave(save);

    const reloaded = loadSave();
    expect(reloaded.hiScore).toBe(4200);
    expect(reloaded.bestLevel).toBe(9);
    expect(reloaded.selectedSkin).toBe('ninja');
    expect(reloaded.leaderboard).toEqual(save.leaderboard);
  });

  it('falls back to defaults on a corrupt (non-JSON) blob rather than throwing', () => {
    store.set(KEY, '{not valid json');
    expect(() => loadSave()).not.toThrow();
    expect(loadSave().hiScore).toBe(0);
  });

  it('upgrades an old save blob missing every M9 field, defaulting each one', () => {
    // Simulates a pre-M9 save (docs/specs/M9-report.md: "an M8 session's localStorage upgrades
    // cleanly") - only the fields that existed before M9 are present.
    store.set(
      KEY,
      JSON.stringify({
        hiScore: 1500,
        bestLevel: 4,
        leaderboard: [{ name: 'BBB', score: 1500, world: 1, level: 3, date: '2026-01-01' }],
        settings: { master: 60, music: 50, sfx: 90, muted: true, reduceMotion: true, keys: {} },
        unlocks: [],
        lastName: 'BBB',
      }),
    );
    const save = loadSave();
    // Carried over correctly from the old blob:
    expect(save.hiScore).toBe(1500);
    expect(save.bestLevel).toBe(4);
    expect(save.settings.muted).toBe(true);
    expect(save.settings.reduceMotion).toBe(true);
    // Newly defaulted (absent from the old blob):
    expect(save.endlessLeaderboard).toEqual([]);
    expect(save.selectedSkin).toBe('classic');
    expect(save.lifetimeHomesFilled).toBe(0);
    expect(save.bestNearMissesInRun).toBe(0);
    expect(typeof save.settings.onScreenDpad).toBe('boolean');
  });

  it('never throws when localStorage itself is unavailable (private browsing, SSR-ish runs)', () => {
    Reflect.deleteProperty(globalThis, 'localStorage');
    expect(() => loadSave()).not.toThrow();
    expect(loadSave().hiScore).toBe(0);
    expect(() => writeSave(loadSave())).not.toThrow();
  });

  it('writeSave swallows a quota-exceeded (or any setItem) error rather than throwing', () => {
    const throwingStorage: Storage = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException('quota exceeded', 'QuotaExceededError');
      },
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0,
    };
    Object.defineProperty(globalThis, 'localStorage', { value: throwingStorage, configurable: true });
    expect(() => writeSave(loadSave())).not.toThrow();
  });
});
