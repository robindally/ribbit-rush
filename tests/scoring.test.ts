import { describe, expect, it } from 'vitest';
import {
  advanceStreak,
  createStreakState,
  extraLivesEarned,
  flyScore,
  forwardHopScore,
  homeScore,
  isGameOver,
  levelClearScore,
  START_LIVES,
  streakMultiplier,
} from '../src/game/scoring';
import type { StreakState } from '../src/game/scoring';

describe('forwardHopScore', () => {
  it('scores 10 only when a new maxRow is reached', () => {
    expect(forwardHopScore(true)).toBe(10);
    expect(forwardHopScore(false)).toBe(0);
  });
});

describe('homeScore', () => {
  it('is 50 plus 10 per whole second remaining', () => {
    expect(homeScore(0)).toBe(50);
    expect(homeScore(12)).toBe(50 + 120);
    expect(homeScore(12.9)).toBe(50 + 120); // floors partial seconds
  });

  it('never goes negative on a near-zero timer', () => {
    expect(homeScore(-0.5)).toBe(50);
  });
});

describe('levelClearScore / flyScore', () => {
  it('level clear is worth 1000', () => {
    expect(levelClearScore()).toBe(1000);
  });

  it('a fly bonus is worth 200', () => {
    expect(flyScore()).toBe(200);
  });
});

describe('extraLivesEarned', () => {
  it('grants one life crossing a 20,000 point threshold', () => {
    expect(extraLivesEarned(19_990, 20_010)).toBe(1);
  });

  it('grants zero when staying under a threshold', () => {
    expect(extraLivesEarned(100, 19_999)).toBe(0);
  });

  it('grants multiple lives when a big score jump crosses several thresholds', () => {
    expect(extraLivesEarned(0, 45_000)).toBe(2);
  });

  it('grants zero for landing exactly back on the same threshold multiple twice', () => {
    expect(extraLivesEarned(20_000, 20_000)).toBe(0);
  });
});

describe('isGameOver / START_LIVES', () => {
  it('starts with 3 lives', () => {
    expect(START_LIVES).toBe(3);
  });

  it('is game over at zero or fewer lives', () => {
    expect(isGameOver(1)).toBe(false);
    expect(isGameOver(0)).toBe(true);
    expect(isGameOver(-1)).toBe(true);
  });
});

// --- Streak multiplier (docs/specs/M4-juice.md section 6) ---

describe('streakMultiplier', () => {
  it('is 1 below three consecutive forward hops', () => {
    expect(streakMultiplier(0)).toBe(1);
    expect(streakMultiplier(1)).toBe(1);
    expect(streakMultiplier(2)).toBe(1);
  });

  it('rises by one every three consecutive forward hops', () => {
    expect(streakMultiplier(3)).toBe(2);
    expect(streakMultiplier(5)).toBe(2);
    expect(streakMultiplier(6)).toBe(3);
    expect(streakMultiplier(8)).toBe(3);
  });

  it('caps at x4', () => {
    expect(streakMultiplier(9)).toBe(4);
    expect(streakMultiplier(999)).toBe(4);
  });
});

describe('advanceStreak', () => {
  it('builds the streak on consecutive forward hops landed under 350ms apart', () => {
    let s: StreakState = createStreakState();
    s = advanceStreak(s, 'forward', 0);
    expect(s).toMatchObject({ streak: 1, multiplier: 1 });
    s = advanceStreak(s, 'forward', 0.2);
    expect(s).toMatchObject({ streak: 2, multiplier: 1 });
    s = advanceStreak(s, 'forward', 0.4); // 0.2s gap, still under 350ms
    expect(s).toMatchObject({ streak: 3, multiplier: 2 }); // 3rd consecutive hop raises to x2
    s = advanceStreak(s, 'forward', 0.6);
    s = advanceStreak(s, 'forward', 0.8);
    s = advanceStreak(s, 'forward', 1.0);
    expect(s).toMatchObject({ streak: 6, multiplier: 3 });
  });

  it('does not chain when a forward hop lands 350ms or more after the previous one', () => {
    let s: StreakState = createStreakState();
    s = advanceStreak(s, 'forward', 0);
    s = advanceStreak(s, 'forward', 0.2);
    expect(s.streak).toBe(2);
    s = advanceStreak(s, 'forward', 0.2 + 0.35); // exactly 350ms later - not "less than"
    expect(s).toMatchObject({ streak: 1, multiplier: 1 });
  });

  it('a backward hop resets the streak immediately', () => {
    let s: StreakState = createStreakState();
    s = advanceStreak(s, 'forward', 0);
    s = advanceStreak(s, 'forward', 0.1);
    s = advanceStreak(s, 'forward', 0.2);
    expect(s.streak).toBe(3);
    s = advanceStreak(s, 'backward', 0.3);
    expect(s).toMatchObject({ streak: 0, multiplier: 1 });
  });

  it('an idle gap over 600ms resets the streak on the next hop', () => {
    let s: StreakState = createStreakState();
    s = advanceStreak(s, 'forward', 0);
    s = advanceStreak(s, 'forward', 0.1);
    expect(s.streak).toBe(2);
    s = advanceStreak(s, 'forward', 0.1 + 0.61); // > 600ms idle gap
    expect(s).toMatchObject({ streak: 1, multiplier: 1 });
  });

  it('a side hop followed by a forward hop within 350ms keeps the streak alive', () => {
    let s: StreakState = createStreakState();
    s = advanceStreak(s, 'forward', 0);
    s = advanceStreak(s, 'forward', 0.1);
    s = advanceStreak(s, 'forward', 0.2);
    expect(s.streak).toBe(3);
    s = advanceStreak(s, 'side', 0.3); // doesn't build or break the streak by itself
    expect(s.streak).toBe(3);
    s = advanceStreak(s, 'forward', 0.3 + 0.3); // rescued within 350ms of the side hop
    expect(s.streak).toBe(4);
  });

  it('a side hop not followed by a forward hop within 350ms resets it', () => {
    let s: StreakState = createStreakState();
    s = advanceStreak(s, 'forward', 0);
    s = advanceStreak(s, 'forward', 0.1);
    s = advanceStreak(s, 'forward', 0.2);
    expect(s.streak).toBe(3);
    s = advanceStreak(s, 'side', 0.3);
    s = advanceStreak(s, 'forward', 0.3 + 0.4); // 400ms after the side hop - too late
    expect(s).toMatchObject({ streak: 1, multiplier: 1 });
  });
});
