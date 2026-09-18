// Score, lives, and multiplier helpers. Pure and unit-tested. See ARCHITECTURE.md and
// docs/specs/M0-M2-classic-core.md "Scoring".

import {
  EXTRA_LIFE_SCORE,
  FLY_SCORE,
  FORWARD_HOP_SCORE,
  HOME_SCORE,
  HOME_TIME_BONUS_PER_S,
  LEVEL_CLEAR_SCORE,
  START_LIVES,
} from './constants';

export { START_LIVES };

/** 10 per hop that reaches a new furthest row (maxRow), 0 otherwise. */
export function forwardHopScore(isNewMaxRow: boolean): number {
  return isNewMaxRow ? FORWARD_HOP_SCORE : 0;
}

/** 50 per home plus 10 per second remaining on the attempt timer. */
export function homeScore(timeLeftS: number): number {
  return HOME_SCORE + Math.max(0, Math.floor(timeLeftS)) * HOME_TIME_BONUS_PER_S;
}

/** 1,000 for clearing all five homes. */
export function levelClearScore(): number {
  return LEVEL_CLEAR_SCORE;
}

/** +200 for landing on a fly-occupied home slot. */
export function flyScore(): number {
  return FLY_SCORE;
}

/** How many extra lives were crossed going from `prevScore` to `nextScore` (every 20,000 pts). */
export function extraLivesEarned(prevScore: number, nextScore: number): number {
  return Math.floor(nextScore / EXTRA_LIFE_SCORE) - Math.floor(prevScore / EXTRA_LIFE_SCORE);
}

export function isGameOver(lives: number): boolean {
  return lives <= 0;
}
