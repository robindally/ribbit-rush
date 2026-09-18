import { describe, expect, it } from 'vitest';
import {
  insertEndlessLeaderboardEntry,
  insertLeaderboardEntry,
  isEndlessUnlocked,
  LEADERBOARD_MAX,
  qualifiesForEndlessLeaderboard,
  qualifiesForLeaderboard,
  recordBestLevel,
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
