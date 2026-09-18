import { describe, expect, it } from 'vitest';
import {
  insertLeaderboardEntry,
  isEndlessUnlocked,
  LEADERBOARD_MAX,
  qualifiesForLeaderboard,
  recordBestLevel,
  type LeaderboardEntry,
  type SaveData,
} from '../src/core/save';

function entry(name: string, score: number): LeaderboardEntry {
  return { name, score, world: 1, level: 1, date: '2026-09-18' };
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
