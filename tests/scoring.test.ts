import { describe, expect, it } from 'vitest';
import {
  extraLivesEarned,
  flyScore,
  forwardHopScore,
  homeScore,
  isGameOver,
  levelClearScore,
  START_LIVES,
} from '../src/game/scoring';

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
